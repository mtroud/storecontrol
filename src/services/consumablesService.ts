import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';

export interface ConsumableRecord {
  id: string;
  itemCode: string;
  name: string;
  categoryId: string;
  unitOfMeasure: string;
  currentQuantity: number;
  minStock: number;
  reorderPoint: number;
  reserveStock: number;
  storageLocation?: string;
  barcode?: string;
  imageUrl?: string;
  notes?: string;
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConsumableInput {
  itemCode: string;
  name: string;
  categoryId: string;
  unitOfMeasure: string;
  initialQuantity?: number;
  minStock: number;
  reorderPoint: number;
  reserveStock: number;
  storageLocation?: string;
  barcode?: string;
  imageUrl?: string;
  notes?: string;
}

export const UNIT_OF_MEASURE_OPTIONS = [
  'قطعة',
  'متر',
  'لفة',
  'علبة',
  'كرتون',
  'حزمة',
  'زوج',
  'وحدة',
];

function sanitizeBarcodeId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

export function generateNextItemCode(
  categoryPrefix: string,
  existingItems: ConsumableRecord[]
): string {
  const cleanPrefix = (categoryPrefix || 'CON')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'CON';
  const pattern = new RegExp(`^CON-${cleanPrefix}-(\\d+)$`, 'i');
  let maxSeq = 0;
  existingItems.forEach((item) => {
    const match = item.itemCode.match(pattern);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });
  return `CON-${cleanPrefix}-${String(maxSeq + 1).padStart(3, '0')}`;
}

async function writeConsumableAudit(action: string, itemId: string, details: string) {
  const user = auth.currentUser;
  if (!user) return;
  const logId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      id: logId,
      actorUid: user.uid,
      actorEmail: user.email || '',
      action,
      targetCollection: 'items',
      targetId: itemId,
      details: details.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Consumable audit skipped:', err);
  }
}

export function subscribeToConsumablesWithBalances(
  onData: (items: ConsumableRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  let rawItems: Array<Omit<ConsumableRecord, 'currentQuantity'>> = [];
  const balanceMap = new Map<string, number>();

  const emitMerged = () => {
    const merged: ConsumableRecord[] = rawItems.map((item) => ({
      ...item,
      currentQuantity: balanceMap.get(item.id) ?? 0,
    }));
    onData(merged);
  };

  const unsubItems = onSnapshot(
    query(collection(db, 'items'), orderBy('name', 'asc')),
    (snap) => {
      rawItems = snap.docs.map((d) => {
        const data = d.data() as Partial<ConsumableRecord>;
        return {
          id: d.id,
          itemCode: data.itemCode || d.id,
          name: data.name || '',
          categoryId: data.categoryId || '',
          unitOfMeasure: data.unitOfMeasure || 'قطعة',
          minStock: Number(data.minStock || 0),
          reorderPoint: Number(data.reorderPoint || 0),
          reserveStock: Number(data.reserveStock || 0),
          storageLocation: data.storageLocation || '',
          barcode: data.barcode || '',
          imageUrl: data.imageUrl || '',
          notes: data.notes || '',
          isArchived: Boolean(data.isArchived),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      emitMerged();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'items');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const unsubBalances = onSnapshot(
    collection(db, 'stockBalances'),
    (snap) => {
      balanceMap.clear();
      snap.docs.forEach((d) => {
        const data = d.data() as { currentQuantity?: number };
        balanceMap.set(d.id, Number(data.currentQuantity || 0));
      });
      emitMerged();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'stockBalances');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubItems();
    unsubBalances();
  };
}

export async function createConsumable(
  input: ConsumableInput,
  existingItems: ConsumableRecord[]
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لإضافة مادة.');

  const code = input.itemCode.trim().toUpperCase();
  const name = input.name.trim();
  const barcode = (input.barcode || code).trim().toUpperCase();
  const qty = Math.max(0, Number(input.initialQuantity || 0));

  if (code.length < 2 || code.length > 40) {
    throw new Error('رمز المادة يجب أن يكون بين حرفين و40 حرفاً.');
  }
  if (name.length < 2 || name.length > 140) {
    throw new Error('اسم المادة يجب أن يكون بين حرفين و140 حرفاً.');
  }
  if (!input.categoryId) {
    throw new Error('يرجى اختيار التصنيف.');
  }

  const dupCode = existingItems.some(
    (item) => item.itemCode.trim().toUpperCase() === code
  );
  if (dupCode) {
    throw new Error(`رمز المادة "${code}" مسجل لمادة أخرى مسبقاً.`);
  }

  const itemId = `itm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const codeIndexKey = sanitizeBarcodeId(code);
  const barcodeIndexKey = sanitizeBarcodeId(barcode);
  const nowIso = new Date().toISOString();

  const itemPayload = {
    id: itemId,
    itemCode: code,
    name,
    categoryId: input.categoryId,
    unitOfMeasure: input.unitOfMeasure.trim() || 'قطعة',
    minStock: Math.max(0, Number(input.minStock || 0)),
    reorderPoint: Math.max(0, Number(input.reorderPoint || 0)),
    reserveStock: Math.max(0, Number(input.reserveStock || 0)),
    storageLocation: (input.storageLocation || '').trim().slice(0, 120),
    barcode: barcode.slice(0, 64),
    imageUrl: (input.imageUrl || '').trim().slice(0, 500),
    notes: (input.notes || '').trim().slice(0, 500),
    isArchived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    await runTransaction(db, async (tx) => {
      const codeRef = doc(db, 'barcodeIndex', codeIndexKey);
      const codeSnap = await tx.get(codeRef);
      if (codeSnap.exists()) {
        throw new Error(`رمز المادة "${code}" محجوز مسبقاً في فهرس الرموز.`);
      }

      if (barcodeIndexKey && barcodeIndexKey !== codeIndexKey) {
        const bcRef = doc(db, 'barcodeIndex', barcodeIndexKey);
        const bcSnap = await tx.get(bcRef);
        if (bcSnap.exists()) {
          throw new Error(`رمز الباركود "${barcode}" مستخدم مسبقاً.`);
        }
        tx.set(bcRef, {
          code: barcodeIndexKey,
          targetType: 'CONSUMABLE',
          targetId: itemId,
        });
      }

      tx.set(codeRef, {
        code: codeIndexKey,
        targetType: 'CONSUMABLE',
        targetId: itemId,
      });

      tx.set(doc(db, 'items', itemId), itemPayload);
      tx.set(doc(db, 'stockBalances', itemId), {
        itemId,
        currentQuantity: qty,
        reservedQuantity: 0,
        updatedAt: nowIso,
      });
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('محجوز') || err.message.includes('مستخدم'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.CREATE, `items/${itemId}`);
  }

  await writeConsumableAudit(
    'CREATE_CONSUMABLE',
    itemId,
    `تسجيل مادة كمية: ${name} (${code}) برصيد افتتاحي ${qty} ${itemPayload.unitOfMeasure}`
  );
  return itemId;
}

export async function updateConsumable(
  itemId: string,
  input: ConsumableInput,
  prevItem: ConsumableRecord
): Promise<void> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 140) {
    throw new Error('اسم المادة يجب أن يكون بين حرفين و140 حرفاً.');
  }

  const nowIso = new Date().toISOString();
  const payload = {
    id: itemId,
    itemCode: prevItem.itemCode,
    name,
    categoryId: input.categoryId,
    unitOfMeasure: input.unitOfMeasure.trim() || prevItem.unitOfMeasure,
    minStock: Math.max(0, Number(input.minStock || 0)),
    reorderPoint: Math.max(0, Number(input.reorderPoint || 0)),
    reserveStock: Math.max(0, Number(input.reserveStock || 0)),
    storageLocation: (input.storageLocation || '').trim().slice(0, 120),
    barcode: (input.barcode || prevItem.barcode || prevItem.itemCode)
      .trim()
      .toUpperCase()
      .slice(0, 64),
    imageUrl: (input.imageUrl ?? prevItem.imageUrl ?? '').trim().slice(0, 500),
    notes: (input.notes || '').trim().slice(0, 500),
    isArchived: prevItem.isArchived,
    updatedAt: nowIso,
  };

  try {
    await updateDoc(doc(db, 'items', itemId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `items/${itemId}`);
  }

  await writeConsumableAudit(
    'UPDATE_CONSUMABLE',
    itemId,
    `تعديل بيانات المادة الكمية: ${name} (${prevItem.itemCode})`
  );
}

export async function toggleArchiveConsumable(item: ConsumableRecord): Promise<void> {
  const nextArchived = !item.isArchived;
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'items', item.id), {
      isArchived: nextArchived,
      updatedAt: nowIso,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `items/${item.id}`);
  }

  await writeConsumableAudit(
    nextArchived ? 'ARCHIVE_CONSUMABLE' : 'RESTORE_CONSUMABLE',
    item.id,
    `${nextArchived ? 'أرشفة' : 'استعادة'} المادة الكمية: ${item.name} (${item.itemCode})`
  );
}
