import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import {
  DeviceStorageStatus,
  MaintenanceStatus,
  MovementType,
} from '../types/inventory';
import { sanitizeBarcodeIndexKey } from './barcodeService';
import { DeviceRecord, TECHNICAL_STATUS_OPTIONS } from './devicesService';

export interface VoucherLineSummary {
  kind: 'DEVICE' | 'CONSUMABLE';
  code: string;
  name: string;
  quantity: number;
  unit: string;
  note?: string;
}

export interface PrintableVoucherData {
  voucherNumber: string;
  voucherType: 'ENTRY' | 'ISSUE' | 'RETURN' | 'TRANSFER';
  title: string;
  date: string;
  officialDocRef?: string;
  departmentName?: string;
  unitName?: string;
  fromLocation?: string;
  toLocation?: string;
  recipientName?: string;
  executedByName: string;
  notes?: string;
  lines: VoucherLineSummary[];
}

export interface StockEntryVoucherRecord {
  id: string;
  voucherNumber: string;
  entryDate: string;
  source: string;
  officialDocRef?: string;
  attachmentUrl?: string;
  recordedByUid: string;
  recordedByName: string;
  notes?: string;
  lines: VoucherLineSummary[];
  createdAt?: unknown;
}

export interface StockIssueVoucherRecord {
  id: string;
  voucherNumber: string;
  issueDate: string;
  departmentId: string;
  departmentName: string;
  unitId?: string;
  unitName?: string;
  recipientName: string;
  officialDocRef?: string;
  issuedByUid: string;
  issuedByName: string;
  notes?: string;
  lines: VoucherLineSummary[];
  createdAt?: unknown;
}

export interface StockReturnVoucherRecord {
  id: string;
  voucherNumber: string;
  returnDate: string;
  returnedByName: string;
  receivedByUid: string;
  receivedByName: string;
  inspectionOutcome: 'WORKING' | 'NEEDS_MAINTENANCE' | 'DAMAGED';
  notes?: string;
  lines: VoucherLineSummary[];
  createdAt?: unknown;
}

export interface AssetTransferVoucherRecord {
  id: string;
  voucherNumber: string;
  transferDate: string;
  deviceId: string;
  inventoryNumber: string;
  deviceName: string;
  fromDepartmentId?: string;
  fromDepartmentName: string;
  fromUnitId?: string;
  fromUnitName?: string;
  fromRecipientName?: string;
  toDepartmentId: string;
  toDepartmentName: string;
  toUnitId?: string;
  toUnitName?: string;
  toRecipientName: string;
  reason: string;
  officialDocRef?: string;
  executedByUid: string;
  executedByName: string;
  notes?: string;
  createdAt?: unknown;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateVoucherNumber(prefix: 'ENT' | 'ISS' | 'RET' | 'TRN'): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
  const seq = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}-${ymd}-${seq}`;
}

async function writeOpAudit(
  action: string,
  targetCollection: string,
  targetId: string,
  details: string
) {
  const user = auth.currentUser;
  if (!user) return;
  const logId = genId('aud');
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      id: logId,
      actorUid: user.uid,
      actorEmail: user.email || '',
      action,
      targetCollection,
      targetId,
      details: details.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Operation audit skipped:', err);
  }
}

export function subscribeToStockEntries(
  onData: (rows: StockEntryVoucherRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'stockEntries'),
    orderBy('createdAt', 'desc'),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StockEntryVoucherRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'stockEntries');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeToStockIssues(
  onData: (rows: StockIssueVoucherRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'stockIssues'),
    orderBy('createdAt', 'desc'),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StockIssueVoucherRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'stockIssues');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeToStockReturns(
  onData: (rows: StockReturnVoucherRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'stockReturns'),
    orderBy('createdAt', 'desc'),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StockReturnVoucherRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'stockReturns');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeToAssetTransfers(
  onData: (rows: AssetTransferVoucherRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'assetTransfers'),
    orderBy('createdAt', 'desc'),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AssetTransferVoucherRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'assetTransfers');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export interface NewDeviceEntryLine {
  inventoryNumber: string;
  name: string;
  categoryId: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  warrantyPeriod?: string;
  storageLocation?: string;
}

export interface ConsumableReplenishLine {
  itemId: string;
  itemCode: string;
  itemName: string;
  unitOfMeasure: string;
  quantity: number;
}

export async function executeStockEntry(params: {
  voucherNumber: string;
  entryDate: string;
  source: string;
  officialDocRef?: string;
  attachmentUrl?: string;
  notes?: string;
  actorName: string;
  newDevices: NewDeviceEntryLine[];
  consumableLines: ConsumableReplenishLine[];
}): Promise<StockEntryVoucherRecord> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لتنفيذ سند الإدخال.');

  if (params.newDevices.length === 0 && params.consumableLines.length === 0) {
    throw new Error('يرجى إضافة جهاز واحد أو مادة كمية واحدة على الأقل إلى السند.');
  }

  const entryId = genId('ent');
  const nowIso = new Date().toISOString();
  const voucherNumber = params.voucherNumber.trim().toUpperCase();

  // Validate local device entries
  const seenInv = new Set<string>();
  const preparedDevices = params.newDevices.map((d) => {
    const inv = d.inventoryNumber.trim().toUpperCase();
    const name = d.name.trim();
    if (inv.length < 3 || inv.length > 50) {
      throw new Error(`رقم الجرد "${inv}" غير صالح (3-50 حرفاً).`);
    }
    if (name.length < 2 || name.length > 150) {
      throw new Error(`اسم الجهاز "${name}" غير صالح.`);
    }
    if (!d.categoryId) {
      throw new Error(`يرجى تحديد تصنيف الجهاز (${name}).`);
    }
    if (seenInv.has(inv)) {
      throw new Error(`رقم الجرد "${inv}" مكرر داخل نفس السند.`);
    }
    seenInv.add(inv);
    return {
      ...d,
      inv,
      name,
      deviceId: genId('dev'),
      indexKey: sanitizeBarcodeIndexKey(inv),
    };
  });

  const voucherLines: VoucherLineSummary[] = [
    ...preparedDevices.map((d) => ({
      kind: 'DEVICE' as const,
      code: d.inv,
      name: d.name,
      quantity: 1,
      unit: 'جهاز',
      note: d.serialNumber ? `S/N: ${d.serialNumber}` : undefined,
    })),
    ...params.consumableLines.map((c) => ({
      kind: 'CONSUMABLE' as const,
      code: c.itemCode,
      name: c.itemName,
      quantity: c.quantity,
      unit: c.unitOfMeasure,
    })),
  ];

  const entryRecord: StockEntryVoucherRecord = {
    id: entryId,
    voucherNumber,
    entryDate: params.entryDate,
    source: params.source.trim() || 'تجهيز داخلي',
    officialDocRef: (params.officialDocRef || '').trim().slice(0, 80),
    attachmentUrl: params.attachmentUrl || '',
    recordedByUid: user.uid,
    recordedByName: params.actorName,
    notes: (params.notes || '').trim().slice(0, 500),
    lines: voucherLines,
    createdAt: serverTimestamp(),
  };

  try {
    await runTransaction(db, async (tx) => {
      // 1. READS FIRST
      for (const dev of preparedDevices) {
        const idxSnap = await tx.get(doc(db, 'barcodeIndex', dev.indexKey));
        if (idxSnap.exists()) {
          throw new Error(`رقم الجرد "${dev.inv}" محجوز مسبقاً في قاعدة البيانات.`);
        }
      }

      const balanceSnaps = new Map<string, number>();
      for (const line of params.consumableLines) {
        if (line.quantity <= 0) {
          throw new Error(`الكمية المدخلة للمادة "${line.itemName}" يجب أن تكون أكبر من صفر.`);
        }
        const bSnap = await tx.get(doc(db, 'stockBalances', line.itemId));
        const curr = bSnap.exists()
          ? Number((bSnap.data() as { currentQuantity?: number }).currentQuantity || 0)
          : 0;
        balanceSnaps.set(line.itemId, curr);
      }

      // 2. WRITES
      tx.set(doc(db, 'stockEntries', entryId), entryRecord);

      for (const dev of preparedDevices) {
        const deviceDoc: DeviceRecord = {
          id: dev.deviceId,
          inventoryNumber: dev.inv,
          name: dev.name,
          categoryId: dev.categoryId,
          manufacturer: (dev.manufacturer || '').trim().slice(0, 100),
          model: (dev.model || '').trim().slice(0, 100),
          serialNumber: (dev.serialNumber || '').trim().slice(0, 100),
          purchaseDate: '',
          receivedDate: params.entryDate,
          acquisitionSource: params.source.trim().slice(0, 160),
          technicalStatus: TECHNICAL_STATUS_OPTIONS[0],
          storageStatus: DeviceStorageStatus.IN_WAREHOUSE,
          currentLocation: (dev.storageLocation || 'المخزن الرئيسي').trim().slice(0, 150),
          departmentId: '',
          unitId: '',
          recipientName: '',
          issuedDate: '',
          returnedDate: '',
          warrantyPeriod: (dev.warrantyPeriod || '').trim().slice(0, 80),
          barcode: dev.inv,
          qrCodeValue: `SAYEDMART:DEV:${dev.deviceId}`,
          imageUrl: '',
          notes: (params.notes || '').trim().slice(0, 800),
          isArchived: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        tx.set(doc(db, 'barcodeIndex', dev.indexKey), {
          code: dev.indexKey,
          targetType: 'DEVICE',
          targetId: dev.deviceId,
        });
        tx.set(doc(db, 'devices', dev.deviceId), deviceDoc);

        const histId = genId('hist');
        tx.set(doc(db, 'devices', dev.deviceId, 'history', histId), {
          id: histId,
          deviceId: dev.deviceId,
          actorUid: user.uid,
          actorName: params.actorName,
          summary: `إدخال للمخزن بموجب سند رقم ${voucherNumber}`,
          createdAt: serverTimestamp(),
        });

        const mvId = genId('mv');
        tx.set(doc(db, 'stockMovements', mvId), {
          id: mvId,
          movementNumber: `MV-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`,
          type: MovementType.ENTRY,
          inventoryCode: dev.inv,
          assetName: dev.name,
          previousLocation: params.source.trim().slice(0, 150) || 'جهة التجهيز',
          newLocation: deviceDoc.currentLocation || 'المخزن الرئيسي',
          recipientName: params.actorName.slice(0, 120),
          voucherNumber,
          performedByUid: user.uid,
          performedByName: params.actorName.slice(0, 120),
          notes: (params.notes || '').trim().slice(0, 500),
          createdAt: serverTimestamp(),
        });
      }

      for (const line of params.consumableLines) {
        const prevQty = balanceSnaps.get(line.itemId) || 0;
        const nextQty = prevQty + line.quantity;

        tx.set(doc(db, 'stockBalances', line.itemId), {
          itemId: line.itemId,
          currentQuantity: nextQty,
          reservedQuantity: 0,
          updatedAt: nowIso,
        });

        const mvId = genId('mv');
        tx.set(doc(db, 'stockMovements', mvId), {
          id: mvId,
          movementNumber: `MV-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`,
          type: MovementType.ENTRY,
          inventoryCode: line.itemCode.slice(0, 50),
          assetName: `${line.itemName} (+${line.quantity} ${line.unitOfMeasure})`.slice(0, 150),
          previousLocation: params.source.trim().slice(0, 150) || 'تجهيز مخزني',
          newLocation: 'المخزن الرئيسي',
          recipientName: params.actorName.slice(0, 120),
          voucherNumber,
          performedByUid: user.uid,
          performedByName: params.actorName.slice(0, 120),
          notes: (params.notes || '').trim().slice(0, 500),
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('محجوز') ||
        err.message.includes('أكبر من صفر') ||
        err.message.includes('غير صالح'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `stockEntries/${entryId}`);
  }

  await writeOpAudit(
    'STOCK_ENTRY',
    'stockEntries',
    entryId,
    `سند إدخال ${voucherNumber}: ${preparedDevices.length} جهاز، ${params.consumableLines.length} مادة كمية.`
  );

  return entryRecord;
}

export interface IssueConsumableLine {
  itemId: string;
  itemCode: string;
  itemName: string;
  unitOfMeasure: string;
  quantity: number;
  minStock: number;
  reorderPoint: number;
}

export async function executeStockIssue(params: {
  voucherNumber: string;
  issueDate: string;
  departmentId: string;
  departmentName: string;
  unitId?: string;
  unitName?: string;
  recipientName: string;
  officialDocRef?: string;
  notes?: string;
  actorName: string;
  deviceIds: string[];
  consumableLines: IssueConsumableLine[];
}): Promise<StockIssueVoucherRecord> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لتنفيذ عملية الصرف.');

  if (!params.departmentId) {
    throw new Error('يرجى اختيار الشعبة المستفيدة.');
  }
  if (!params.recipientName.trim()) {
    throw new Error('يرجى إدخال اسم الشخص المستلم.');
  }
  if (params.deviceIds.length === 0 && params.consumableLines.length === 0) {
    throw new Error('يرجى تحديد جهاز واحد أو مادة واحدة على الأقل للصرف.');
  }

  const issueId = genId('iss');
  const nowIso = new Date().toISOString();
  const voucherNumber = params.voucherNumber.trim().toUpperCase();
  const targetLocation = [params.departmentName, params.unitName].filter(Boolean).join(' / ');

  const voucherLines: VoucherLineSummary[] = [];

  try {
    await runTransaction(db, async (tx) => {
      // 1. READS FIRST
      const loadedDevices: DeviceRecord[] = [];
      for (const devId of params.deviceIds) {
        const dSnap = await tx.get(doc(db, 'devices', devId));
        if (!dSnap.exists()) {
          throw new Error('أحد الأجهزة المحددة غير موجود في السجلات.');
        }
        const dev = { id: dSnap.id, ...(dSnap.data() as Omit<DeviceRecord, 'id'>) };
        if (dev.isArchived || dev.storageStatus !== DeviceStorageStatus.IN_WAREHOUSE) {
          throw new Error(
            `لا يمكن صرف الجهاز "${dev.name}" (${dev.inventoryNumber}) لأن حالته الحالية ليست متوفراً في المخزن.`
          );
        }
        loadedDevices.push(dev);
      }

      const loadedBalances = new Map<string, number>();
      for (const line of params.consumableLines) {
        if (line.quantity <= 0) {
          throw new Error(`الكمية المصروفة من "${line.itemName}" يجب أن تكون أكبر من صفر.`);
        }
        const bSnap = await tx.get(doc(db, 'stockBalances', line.itemId));
        const curr = bSnap.exists()
          ? Number((bSnap.data() as { currentQuantity?: number }).currentQuantity || 0)
          : 0;
        if (curr < line.quantity) {
          throw new Error(
            `الرصيد المتوفر من "${line.itemName}" (${curr} ${line.unitOfMeasure}) أقل من الكمية المطلوبة (${line.quantity}).`
          );
        }
        loadedBalances.set(line.itemId, curr);
      }

      loadedDevices.forEach((dev) => {
        voucherLines.push({
          kind: 'DEVICE',
          code: dev.inventoryNumber,
          name: dev.name,
          quantity: 1,
          unit: 'جهاز',
          note: dev.serialNumber ? `S/N: ${dev.serialNumber}` : undefined,
        });
      });
      params.consumableLines.forEach((c) => {
        voucherLines.push({
          kind: 'CONSUMABLE',
          code: c.itemCode,
          name: c.itemName,
          quantity: c.quantity,
          unit: c.unitOfMeasure,
        });
      });

      const issueDoc: StockIssueVoucherRecord = {
        id: issueId,
        voucherNumber,
        issueDate: params.issueDate,
        departmentId: params.departmentId,
        departmentName: params.departmentName,
        unitId: params.unitId || '',
        unitName: params.unitName || '',
        recipientName: params.recipientName.trim(),
        officialDocRef: (params.officialDocRef || '').trim().slice(0, 80),
        issuedByUid: user.uid,
        issuedByName: params.actorName,
        notes: (params.notes || '').trim().slice(0, 500),
        lines: voucherLines,
        createdAt: serverTimestamp(),
      };

      // 2. WRITES
      tx.set(doc(db, 'stockIssues', issueId), issueDoc);

      for (const dev of loadedDevices) {
        const prevLoc = dev.currentLocation || 'المخزن الرئيسي';
        tx.update(doc(db, 'devices', dev.id), {
          storageStatus: DeviceStorageStatus.ISSUED,
          currentLocation: targetLocation.slice(0, 150),
          departmentId: params.departmentId,
          unitId: params.unitId || '',
          recipientName: params.recipientName.trim().slice(0, 120),
          issuedDate: params.issueDate,
          updatedAt: nowIso,
        });

        const histId = genId('hist');
        tx.set(doc(db, 'devices', dev.id, 'history', histId), {
          id: histId,
          deviceId: dev.id,
          actorUid: user.uid,
          actorName: params.actorName,
          summary: `صرف إلى ${targetLocation} — المستلم: ${params.recipientName.trim()} (سند ${voucherNumber})`,
          createdAt: serverTimestamp(),
        });

        const mvId = genId('mv');
        tx.set(doc(db, 'stockMovements', mvId), {
          id: mvId,
          movementNumber: `MV-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`,
          type: MovementType.ISSUE,
          inventoryCode: dev.inventoryNumber,
          assetName: dev.name,
          previousLocation: prevLoc.slice(0, 150),
          newLocation: targetLocation.slice(0, 150),
          recipientName: params.recipientName.trim().slice(0, 120),
          voucherNumber,
          performedByUid: user.uid,
          performedByName: params.actorName.slice(0, 120),
          notes: (params.notes || '').trim().slice(0, 500),
          createdAt: serverTimestamp(),
        });
      }

      for (const line of params.consumableLines) {
        const curr = loadedBalances.get(line.itemId) || 0;
        const nextQty = curr - line.quantity;

        tx.set(doc(db, 'stockBalances', line.itemId), {
          itemId: line.itemId,
          currentQuantity: nextQty,
          reservedQuantity: 0,
          updatedAt: nowIso,
        });

        const mvId = genId('mv');
        tx.set(doc(db, 'stockMovements', mvId), {
          id: mvId,
          movementNumber: `MV-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`,
          type: MovementType.ISSUE,
          inventoryCode: line.itemCode.slice(0, 50),
          assetName: `${line.itemName} (-${line.quantity} ${line.unitOfMeasure})`.slice(0, 150),
          previousLocation: 'المخزن الرئيسي',
          newLocation: targetLocation.slice(0, 150),
          recipientName: params.recipientName.trim().slice(0, 120),
          voucherNumber,
          performedByUid: user.uid,
          performedByName: params.actorName.slice(0, 120),
          notes: (params.notes || '').trim().slice(0, 500),
          createdAt: serverTimestamp(),
        });

        if (nextQty <= line.reorderPoint) {
          const notifId = genId('ntf');
          const severity = nextQty <= line.minStock ? 'critical' : 'warning';
          tx.set(doc(db, 'notifications', notifId), {
            id: notifId,
            title:
              nextQty === 0
                ? `نفاد رصيد المادة: ${line.itemName}`
                : `انخفاض مخزون: ${line.itemName}`,
            description: `الرصيد المتبقي (${nextQty} ${line.unitOfMeasure}) وصل دون حد إعادة الطلب (${line.reorderPoint}).`,
            severity,
            read: false,
            targetRoute: 'consumables',
            createdAt: serverTimestamp(),
          });
        }
      }
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('لا يمكن صرف') ||
        err.message.includes('الرصيد المتوفر') ||
        err.message.includes('أكبر من صفر') ||
        err.message.includes('غير موجود'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `stockIssues/${issueId}`);
  }

  await writeOpAudit(
    'STOCK_ISSUE',
    'stockIssues',
    issueId,
    `سند صرف ${voucherNumber} إلى ${targetLocation} (المستلم: ${params.recipientName.trim()})`
  );

  return {
    id: issueId,
    voucherNumber,
    issueDate: params.issueDate,
    departmentId: params.departmentId,
    departmentName: params.departmentName,
    unitId: params.unitId || '',
    unitName: params.unitName || '',
    recipientName: params.recipientName.trim(),
    officialDocRef: params.officialDocRef || '',
    issuedByUid: user.uid,
    issuedByName: params.actorName,
    notes: params.notes || '',
    lines: voucherLines,
  };
}

export async function executeStockReturn(params: {
  voucherNumber: string;
  returnDate: string;
  returnedByName: string;
  inspectionOutcome: 'WORKING' | 'NEEDS_MAINTENANCE' | 'DAMAGED';
  faultDescription?: string;
  notes?: string;
  actorName: string;
  deviceIds: string[];
  consumableLines: ConsumableReplenishLine[];
}): Promise<StockReturnVoucherRecord> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لتنفيذ عملية الإرجاع.');

  if (!params.returnedByName.trim()) {
    throw new Error('يرجى تحديد اسم الشخص المُرجِع للأصل.');
  }
  if (params.deviceIds.length === 0 && params.consumableLines.length === 0) {
    throw new Error('يرجى تحديد جهاز واحد أو مادة واحدة على الأقل للإرجاع.');
  }

  const returnId = genId('ret');
  const nowIso = new Date().toISOString();
  const voucherNumber = params.voucherNumber.trim().toUpperCase();
  const voucherLines: VoucherLineSummary[] = [];

  try {
    await runTransaction(db, async (tx) => {
      // 1. READS FIRST
      const loadedDevices: DeviceRecord[] = [];
      for (const devId of params.deviceIds) {
        const dSnap = await tx.get(doc(db, 'devices', devId));
        if (!dSnap.exists()) {
          throw new Error('أحد الأجهزة المحددة غير موجود.');
        }
        const dev = { id: dSnap.id, ...(dSnap.data() as Omit<DeviceRecord, 'id'>) };
        if (dev.isArchived || dev.storageStatus !== DeviceStorageStatus.ISSUED) {
          throw new Error(
            `الجهاز "${dev.name}" (${dev.inventoryNumber}) ليس مصروفاً حالياً لإتمام إرجاعه.`
          );
        }
        loadedDevices.push(dev);
      }

      const loadedBalances = new Map<string, number>();
      for (const line of params.consumableLines) {
        if (line.quantity <= 0) {
          throw new Error(`الكمية المرجعة من "${line.itemName}" يجب أن تكون أكبر من صفر.`);
        }
        const bSnap = await tx.get(doc(db, 'stockBalances', line.itemId));
        const curr = bSnap.exists()
          ? Number((bSnap.data() as { currentQuantity?: number }).currentQuantity || 0)
          : 0;
        loadedBalances.set(line.itemId, curr);
      }

      loadedDevices.forEach((dev) => {
        voucherLines.push({
          kind: 'DEVICE',
          code: dev.inventoryNumber,
          name: dev.name,
          quantity: 1,
          unit: 'جهاز',
        });
      });
      params.consumableLines.forEach((c) => {
        voucherLines.push({
          kind: 'CONSUMABLE',
          code: c.itemCode,
          name: c.itemName,
          quantity: c.quantity,
          unit: c.unitOfMeasure,
        });
      });

      const returnDoc: StockReturnVoucherRecord = {
        id: returnId,
        voucherNumber,
        returnDate: params.returnDate,
        returnedByName: params.returnedByName.trim(),
        receivedByUid: user.uid,
        receivedByName: params.actorName,
        inspectionOutcome: params.inspectionOutcome,
        notes: (params.notes || '').trim().slice(0, 500),
        lines: voucherLines,
        createdAt: serverTimestamp(),
      };

      // 2. WRITES
      tx.set(doc(db, 'stockReturns', returnId), returnDoc);

      const nextStorageStatus =
        params.inspectionOutcome === 'WORKING'
          ? DeviceStorageStatus.IN_WAREHOUSE
          : params.inspectionOutcome === 'NEEDS_MAINTENANCE'
            ? DeviceStorageStatus.IN_MAINTENANCE
            : DeviceStorageStatus.DAMAGED;

      const nextTechnicalStatus =
        params.inspectionOutcome === 'WORKING'
          ? TECHNICAL_STATUS_OPTIONS[0]
          : params.inspectionOutcome === 'NEEDS_MAINTENANCE'
            ? TECHNICAL_STATUS_OPTIONS[2]
            : TECHNICAL_STATUS_OPTIONS[3];

      const nextLocation =
        params.inspectionOutcome === 'WORKING'
          ? 'المخزن الرئيسي'
          : params.inspectionOutcome === 'NEEDS_MAINTENANCE'
            ? 'ورشة الصيانة — شعبة السيطرة والإنترنت'
            : 'مخزن الأجهزة التالفة';

      for (const dev of loadedDevices) {
        const prevLoc = dev.currentLocation || 'جهة مستفيدة';
        tx.update(doc(db, 'devices', dev.id), {
          storageStatus: nextStorageStatus,
          technicalStatus: nextTechnicalStatus,
          currentLocation: nextLocation,
          departmentId: '',
          unitId: '',
          recipientName: '',
          returnedDate: params.returnDate,
          updatedAt: nowIso,
        });

        const histId = genId('hist');
        tx.set(doc(db, 'devices', dev.id, 'history', histId), {
          id: histId,
          deviceId: dev.id,
          actorUid: user.uid,
          actorName: params.actorName,
          summary: `إرجاع من ${prevLoc} (${nextTechnicalStatus}) بموجب سند ${voucherNumber}`,
          createdAt: serverTimestamp(),
        });

        const mvId = genId('mv');
        tx.set(doc(db, 'stockMovements', mvId), {
          id: mvId,
          movementNumber: `MV-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`,
          type: MovementType.RETURN,
          inventoryCode: dev.inventoryNumber,
          assetName: dev.name,
          previousLocation: prevLoc.slice(0, 150),
          newLocation: nextLocation,
          recipientName: params.returnedByName.trim().slice(0, 120),
          voucherNumber,
          performedByUid: user.uid,
          performedByName: params.actorName.slice(0, 120),
          notes: (params.notes || '').trim().slice(0, 500),
          createdAt: serverTimestamp(),
        });

        if (params.inspectionOutcome === 'NEEDS_MAINTENANCE') {
          const maintId = genId('mnt');
          tx.set(doc(db, 'maintenanceRecords', maintId), {
            id: maintId,
            deviceId: dev.id,
            inventoryCode: dev.inventoryNumber,
            deviceName: dev.name,
            faultType: (params.faultDescription || 'فحص صيانة عند الإرجاع').trim().slice(0, 120),
            problemDescription: (params.notes || params.faultDescription || '').trim().slice(0, 600),
            sentDate: params.returnDate,
            assignedUnit: 'وحدة الصيانة الفنية — شعبة السيطرة والإنترنت',
            status: MaintenanceStatus.NEEDS_MAINTENANCE,
            notes: `تم التحويل تلقائياً من سند الإرجاع ${voucherNumber}`,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }
      }

      for (const line of params.consumableLines) {
        const curr = loadedBalances.get(line.itemId) || 0;
        const nextQty = curr + line.quantity;

        tx.set(doc(db, 'stockBalances', line.itemId), {
          itemId: line.itemId,
          currentQuantity: nextQty,
          reservedQuantity: 0,
          updatedAt: nowIso,
        });

        const mvId = genId('mv');
        tx.set(doc(db, 'stockMovements', mvId), {
          id: mvId,
          movementNumber: `MV-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`,
          type: MovementType.RETURN,
          inventoryCode: line.itemCode.slice(0, 50),
          assetName: `${line.itemName} (+${line.quantity} ${line.unitOfMeasure})`.slice(0, 150),
          previousLocation: 'جهة مستفيدة',
          newLocation: 'المخزن الرئيسي',
          recipientName: params.returnedByName.trim().slice(0, 120),
          voucherNumber,
          performedByUid: user.uid,
          performedByName: params.actorName.slice(0, 120),
          notes: (params.notes || '').trim().slice(0, 500),
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('ليس مصروفاً') ||
        err.message.includes('أكبر من صفر') ||
        err.message.includes('غير موجود'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `stockReturns/${returnId}`);
  }

  await writeOpAudit(
    'STOCK_RETURN',
    'stockReturns',
    returnId,
    `سند إرجاع ${voucherNumber} (${params.inspectionOutcome}): ${voucherLines.length} بند.`
  );

  return {
    id: returnId,
    voucherNumber,
    returnDate: params.returnDate,
    returnedByName: params.returnedByName.trim(),
    receivedByUid: user.uid,
    receivedByName: params.actorName,
    inspectionOutcome: params.inspectionOutcome,
    notes: params.notes || '',
    lines: voucherLines,
  };
}

export async function executeAssetTransfer(params: {
  voucherNumber: string;
  transferDate: string;
  deviceId: string;
  fromDepartmentName: string;
  fromUnitName?: string;
  toDepartmentId: string;
  toDepartmentName: string;
  toUnitId?: string;
  toUnitName?: string;
  toRecipientName: string;
  reason: string;
  officialDocRef?: string;
  notes?: string;
  actorName: string;
}): Promise<AssetTransferVoucherRecord> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لتنفيذ عملية النقل.');

  if (!params.toDepartmentId || !params.toRecipientName.trim()) {
    throw new Error('يرجى تحديد الشعبة الجديدة واسم المستلم الجديد.');
  }

  const transferId = genId('trn');
  const nowIso = new Date().toISOString();
  const voucherNumber = params.voucherNumber.trim().toUpperCase();
  const newLocation = [params.toDepartmentName, params.toUnitName].filter(Boolean).join(' / ');

  let createdRecord: AssetTransferVoucherRecord | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const devRef = doc(db, 'devices', params.deviceId);
      const devSnap = await tx.get(devRef);
      if (!devSnap.exists()) {
        throw new Error('الجهاز المحدد غير موجود.');
      }

      const dev = { id: devSnap.id, ...(devSnap.data() as Omit<DeviceRecord, 'id'>) };
      if (dev.isArchived || dev.storageStatus !== DeviceStorageStatus.ISSUED) {
        throw new Error(
          `لا يمكن نقل الجهاز "${dev.name}" (${dev.inventoryNumber}) لأنه يجب أن يكون في حالة "مصروف بعهدة جهة".`
        );
      }

      const prevLoc =
        [params.fromDepartmentName, params.fromUnitName].filter(Boolean).join(' / ') ||
        dev.currentLocation ||
        'الجهة السابقة';

      const transferDoc: AssetTransferVoucherRecord = {
        id: transferId,
        voucherNumber,
        transferDate: params.transferDate,
        deviceId: dev.id,
        inventoryNumber: dev.inventoryNumber,
        deviceName: dev.name,
        fromDepartmentId: dev.departmentId || '',
        fromDepartmentName: params.fromDepartmentName || 'الجهة السابقة',
        fromUnitId: dev.unitId || '',
        fromUnitName: params.fromUnitName || '',
        fromRecipientName: dev.recipientName || '',
        toDepartmentId: params.toDepartmentId,
        toDepartmentName: params.toDepartmentName,
        toUnitId: params.toUnitId || '',
        toUnitName: params.toUnitName || '',
        toRecipientName: params.toRecipientName.trim(),
        reason: params.reason.trim() || 'إعادة توزيع العهدة',
        officialDocRef: (params.officialDocRef || '').trim().slice(0, 80),
        executedByUid: user.uid,
        executedByName: params.actorName,
        notes: (params.notes || '').trim().slice(0, 500),
        createdAt: serverTimestamp(),
      };
      createdRecord = transferDoc;

      tx.set(doc(db, 'assetTransfers', transferId), transferDoc);

      tx.update(devRef, {
        departmentId: params.toDepartmentId,
        unitId: params.toUnitId || '',
        recipientName: params.toRecipientName.trim().slice(0, 120),
        currentLocation: newLocation.slice(0, 150),
        issuedDate: params.transferDate,
        updatedAt: nowIso,
      });

      const histId = genId('hist');
      tx.set(doc(db, 'devices', dev.id, 'history', histId), {
        id: histId,
        deviceId: dev.id,
        actorUid: user.uid,
        actorName: params.actorName,
        summary: `نقل عهدة من (${prevLoc}) إلى (${newLocation}) — المستلم الجديد: ${params.toRecipientName.trim()} (سند ${voucherNumber})`,
        createdAt: serverTimestamp(),
      });

      const mvId = genId('mv');
      tx.set(doc(db, 'stockMovements', mvId), {
        id: mvId,
        movementNumber: `MV-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`,
        type: MovementType.TRANSFER,
        inventoryCode: dev.inventoryNumber,
        assetName: dev.name,
        previousLocation: prevLoc.slice(0, 150),
        newLocation: newLocation.slice(0, 150),
        recipientName: params.toRecipientName.trim().slice(0, 120),
        voucherNumber,
        performedByUid: user.uid,
        performedByName: params.actorName.slice(0, 120),
        notes: `${params.reason.trim()}${params.notes ? ` · ${params.notes.trim()}` : ''}`.slice(
          0,
          500
        ),
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('لا يمكن نقل') || err.message.includes('غير موجود'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `assetTransfers/${transferId}`);
  }

  await writeOpAudit(
    'ASSET_TRANSFER',
    'assetTransfers',
    transferId,
    `نقل عهدة جهاز بسند ${voucherNumber} إلى ${newLocation} (المستلم: ${params.toRecipientName.trim()})`
  );

  if (!createdRecord) {
    throw new Error('تعذر حفظ مستند النقل.');
  }
  return createdRecord;
}
