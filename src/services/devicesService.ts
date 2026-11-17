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
  where,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import {
  DeviceStorageStatus,
  MaintenanceStatus,
  MovementType,
} from '../types/inventory';
import { uploadAssetAttachment } from './storageService';

export interface DeviceRecord {
  id: string;
  inventoryNumber: string;
  name: string;
  categoryId: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  receivedDate?: string;
  acquisitionSource?: string;
  technicalStatus?: string;
  storageStatus: DeviceStorageStatus;
  currentLocation?: string;
  departmentId?: string;
  unitId?: string;
  recipientName?: string;
  issuedDate?: string;
  returnedDate?: string;
  warrantyPeriod?: string;
  barcode?: string;
  qrCodeValue?: string;
  imageUrl?: string;
  notes?: string;
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeviceInput {
  inventoryNumber: string;
  name: string;
  categoryId: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  receivedDate?: string;
  acquisitionSource?: string;
  technicalStatus?: string;
  storageStatus: DeviceStorageStatus;
  currentLocation?: string;
  departmentId?: string;
  unitId?: string;
  recipientName?: string;
  issuedDate?: string;
  returnedDate?: string;
  warrantyPeriod?: string;
  barcode?: string;
  imageUrl?: string;
  notes?: string;
}

export interface DeviceHistoryRecord {
  id: string;
  deviceId: string;
  actorUid: string;
  actorName: string;
  summary: string;
  createdAt?: unknown;
}

export interface DeviceAttachmentRecord {
  id: string;
  deviceId: string;
  fileName: string;
  downloadUrl: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUid: string;
  uploadedByName: string;
  createdAt?: string;
}

export interface DeviceMovementSummary {
  id: string;
  movementNumber: string;
  type: MovementType;
  previousLocation?: string;
  newLocation?: string;
  recipientName?: string;
  voucherNumber?: string;
  performedByName?: string;
  notes?: string;
  createdAt?: unknown;
}

export interface DeviceMaintenanceSummary {
  id: string;
  faultType: string;
  problemDescription?: string;
  sentDate?: string;
  completedDate?: string;
  assignedUnit?: string;
  status: MaintenanceStatus;
  cost?: number;
  notes?: string;
}

export const TECHNICAL_STATUS_OPTIONS = [
  'ممتازة / يعمل بكفاءة',
  'جيدة',
  'يحتاج إلى صيانة',
  'عاطل / تالف',
];

export const STORAGE_STATUS_LABELS: Record<DeviceStorageStatus, string> = {
  [DeviceStorageStatus.IN_WAREHOUSE]: 'متوفر في المخزن',
  [DeviceStorageStatus.ISSUED]: 'مصروف (بعهدة جهة)',
  [DeviceStorageStatus.IN_MAINTENANCE]: 'قيد الصيانة',
  [DeviceStorageStatus.DAMAGED]: 'تالف / خارج الخدمة',
  [DeviceStorageStatus.ARCHIVED]: 'مؤرشف',
};

function sanitizeBarcodeId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

export function generateNextInventoryNumber(
  categoryPrefix: string,
  existingDevices: DeviceRecord[]
): string {
  const cleanPrefix = (categoryPrefix || 'DEV')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'DEV';
  const pattern = new RegExp(`^SM-${cleanPrefix}-(\\d+)$`, 'i');
  let maxSeq = 0;
  existingDevices.forEach((d) => {
    const match = d.inventoryNumber.match(pattern);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });
  return `SM-${cleanPrefix}-${String(maxSeq + 1).padStart(4, '0')}`;
}

export function subscribeToDevices(
  onData: (devices: DeviceRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(collection(db, 'devices'), orderBy('inventoryNumber', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DeviceRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'devices');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

async function writeDeviceAudit(action: string, deviceId: string, details: string) {
  const user = auth.currentUser;
  if (!user) return;
  const logId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      id: logId,
      actorUid: user.uid,
      actorEmail: user.email || '',
      action,
      targetCollection: 'devices',
      targetId: deviceId,
      details: details.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Device audit skipped:', err);
  }
}

export async function createDevice(
  input: DeviceInput,
  actorName: string,
  existingDevices: DeviceRecord[]
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لإضافة جهاز.');

  const inv = input.inventoryNumber.trim().toUpperCase();
  const name = input.name.trim();
  const barcode = (input.barcode || inv).trim().toUpperCase();

  if (inv.length < 3 || inv.length > 50) {
    throw new Error('رقم الجرد يجب أن يكون بين 3 و50 حرفاً.');
  }
  if (name.length < 2 || name.length > 150) {
    throw new Error('اسم الجهاز يجب أن يكون بين حرفين و150 حرفاً.');
  }
  if (!input.categoryId) {
    throw new Error('يرجى اختيار تصنيف الجهاز.');
  }

  const dupLocal = existingDevices.some(
    (d) => d.inventoryNumber.trim().toUpperCase() === inv
  );
  if (dupLocal) {
    throw new Error(`رقم الجرد "${inv}" مسجل لجهاز آخر مسبقاً.`);
  }

  const deviceId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const invIndexKey = sanitizeBarcodeId(inv);
  const barcodeIndexKey = sanitizeBarcodeId(barcode);
  const nowIso = new Date().toISOString();

  const payload: DeviceRecord = {
    id: deviceId,
    inventoryNumber: inv,
    name,
    categoryId: input.categoryId,
    manufacturer: (input.manufacturer || '').trim().slice(0, 100),
    model: (input.model || '').trim().slice(0, 100),
    serialNumber: (input.serialNumber || '').trim().slice(0, 100),
    purchaseDate: (input.purchaseDate || '').trim().slice(0, 30),
    receivedDate: (input.receivedDate || nowIso.slice(0, 10)).trim().slice(0, 30),
    acquisitionSource: (input.acquisitionSource || '').trim().slice(0, 160),
    technicalStatus: (input.technicalStatus || TECHNICAL_STATUS_OPTIONS[0]).slice(0, 50),
    storageStatus: input.storageStatus || DeviceStorageStatus.IN_WAREHOUSE,
    currentLocation: (input.currentLocation || 'المخزن الرئيسي').trim().slice(0, 150),
    departmentId: (input.departmentId || '').trim().slice(0, 128),
    unitId: (input.unitId || '').trim().slice(0, 128),
    recipientName: (input.recipientName || '').trim().slice(0, 120),
    issuedDate: (input.issuedDate || '').trim().slice(0, 30),
    returnedDate: (input.returnedDate || '').trim().slice(0, 30),
    warrantyPeriod: (input.warrantyPeriod || '').trim().slice(0, 80),
    barcode: barcode.slice(0, 64),
    qrCodeValue: `SAYEDMART:DEV:${deviceId}`,
    imageUrl: (input.imageUrl || '').trim().slice(0, 500),
    notes: (input.notes || '').trim().slice(0, 800),
    isArchived: input.storageStatus === DeviceStorageStatus.ARCHIVED,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    await runTransaction(db, async (tx) => {
      const invRef = doc(db, 'barcodeIndex', invIndexKey);
      const invSnap = await tx.get(invRef);
      if (invSnap.exists()) {
        throw new Error(`رقم الجرد "${inv}" محجوز مسبقاً في فهرس الرموز.`);
      }

      if (barcodeIndexKey && barcodeIndexKey !== invIndexKey) {
        const bcRef = doc(db, 'barcodeIndex', barcodeIndexKey);
        const bcSnap = await tx.get(bcRef);
        if (bcSnap.exists()) {
          throw new Error(`رمز الباركود "${barcode}" مستخدم مسبقاً.`);
        }
        tx.set(bcRef, {
          code: barcodeIndexKey,
          targetType: 'DEVICE',
          targetId: deviceId,
        });
      }

      tx.set(invRef, {
        code: invIndexKey,
        targetType: 'DEVICE',
        targetId: deviceId,
      });

      tx.set(doc(db, 'devices', deviceId), payload);
    });

    const histId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await setDoc(doc(db, 'devices', deviceId, 'history', histId), {
      id: histId,
      deviceId,
      actorUid: user.uid,
      actorName,
      summary: `إنشاء بطاقة الجهاز لأول مرة برقم جرد ${inv}`,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('محجوز') || err.message.includes('مستخدم'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.CREATE, `devices/${deviceId}`);
  }

  await writeDeviceAudit('CREATE_DEVICE', deviceId, `تسجيل جهاز جديد: ${name} (${inv})`);
  return deviceId;
}

export async function updateDevice(
  deviceId: string,
  input: DeviceInput,
  prevDevice: DeviceRecord,
  actorName: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لتعديل بيانات الجهاز.');

  const name = input.name.trim();
  if (name.length < 2 || name.length > 150) {
    throw new Error('اسم الجهاز يجب أن يكون بين حرفين و150 حرفاً.');
  }

  const nowIso = new Date().toISOString();
  const updateData = {
    id: deviceId,
    inventoryNumber: prevDevice.inventoryNumber,
    name,
    categoryId: input.categoryId,
    manufacturer: (input.manufacturer || '').trim().slice(0, 100),
    model: (input.model || '').trim().slice(0, 100),
    serialNumber: (input.serialNumber || '').trim().slice(0, 100),
    purchaseDate: (input.purchaseDate || '').trim().slice(0, 30),
    receivedDate: (input.receivedDate || '').trim().slice(0, 30),
    acquisitionSource: (input.acquisitionSource || '').trim().slice(0, 160),
    technicalStatus: (input.technicalStatus || '').trim().slice(0, 50),
    storageStatus: input.storageStatus,
    currentLocation: (input.currentLocation || '').trim().slice(0, 150),
    departmentId: (input.departmentId || '').trim().slice(0, 128),
    unitId: (input.unitId || '').trim().slice(0, 128),
    recipientName: (input.recipientName || '').trim().slice(0, 120),
    issuedDate: (input.issuedDate || '').trim().slice(0, 30),
    returnedDate: (input.returnedDate || '').trim().slice(0, 30),
    warrantyPeriod: (input.warrantyPeriod || '').trim().slice(0, 80),
    barcode: (input.barcode || prevDevice.barcode || prevDevice.inventoryNumber)
      .trim()
      .toUpperCase()
      .slice(0, 64),
    qrCodeValue: prevDevice.qrCodeValue || `SAYEDMART:DEV:${deviceId}`,
    imageUrl: (input.imageUrl ?? prevDevice.imageUrl ?? '').trim().slice(0, 500),
    notes: (input.notes || '').trim().slice(0, 800),
    isArchived: input.storageStatus === DeviceStorageStatus.ARCHIVED,
    updatedAt: nowIso,
  };

  const changedFields: string[] = [];
  if (prevDevice.name !== updateData.name) changedFields.push('الاسم');
  if (prevDevice.categoryId !== updateData.categoryId) changedFields.push('التصنيف');
  if (prevDevice.technicalStatus !== updateData.technicalStatus) changedFields.push('الحالة الفنية');
  if (prevDevice.storageStatus !== updateData.storageStatus) changedFields.push('الحالة المخزنية');
  if (prevDevice.currentLocation !== updateData.currentLocation) changedFields.push('الموقع');
  if (prevDevice.recipientName !== updateData.recipientName) changedFields.push('المستلم');
  if (prevDevice.serialNumber !== updateData.serialNumber) changedFields.push('الرقم التسلسلي');

  const summary =
    changedFields.length > 0
      ? `تحديث الحقول: ${changedFields.join('، ')}`
      : 'تحديث بيانات بطاقة الجهاز';

  try {
    await updateDoc(doc(db, 'devices', deviceId), updateData);

    const histId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await setDoc(doc(db, 'devices', deviceId, 'history', histId), {
      id: histId,
      deviceId,
      actorUid: user.uid,
      actorName,
      summary: summary.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `devices/${deviceId}`);
  }

  await writeDeviceAudit('UPDATE_DEVICE', deviceId, `${prevDevice.inventoryNumber}: ${summary}`);
}

export async function toggleArchiveDevice(
  device: DeviceRecord,
  actorName: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول.');

  const nextArchived = !device.isArchived;
  const nextStorageStatus = nextArchived
    ? DeviceStorageStatus.ARCHIVED
    : DeviceStorageStatus.IN_WAREHOUSE;
  const nowIso = new Date().toISOString();

  try {
    await updateDoc(doc(db, 'devices', device.id), {
      isArchived: nextArchived,
      storageStatus: nextStorageStatus,
      updatedAt: nowIso,
    });

    const histId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await setDoc(doc(db, 'devices', device.id, 'history', histId), {
      id: histId,
      deviceId: device.id,
      actorUid: user.uid,
      actorName,
      summary: nextArchived
        ? 'أرشفة الجهاز (مع الاحتفاظ بسجل الحركات التاريخية)'
        : 'إلغاء أرشفة الجهاز وإعادته للمخزن',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `devices/${device.id}`);
  }

  await writeDeviceAudit(
    nextArchived ? 'ARCHIVE_DEVICE' : 'RESTORE_DEVICE',
    device.id,
    `${nextArchived ? 'أرشفة' : 'استعادة'} الجهاز: ${device.name} (${device.inventoryNumber})`
  );
}

export async function uploadDeviceAttachment(
  device: DeviceRecord,
  file: File,
  actorName: string,
  setAsPrimaryImage = false
): Promise<DeviceAttachmentRecord> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لرفع المرفقات.');

  const uploaded = await uploadAssetAttachment('devices', device.id, file);
  const attId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const nowIso = new Date().toISOString();

  const record: DeviceAttachmentRecord = {
    id: attId,
    deviceId: device.id,
    fileName: uploaded.fileName,
    downloadUrl: uploaded.downloadUrl,
    storagePath: uploaded.storagePath,
    contentType: uploaded.contentType,
    sizeBytes: uploaded.sizeBytes,
    uploadedByUid: user.uid,
    uploadedByName: actorName,
    createdAt: nowIso,
  };

  try {
    await setDoc(doc(db, 'devices', device.id, 'attachments', attId), record);

    if (setAsPrimaryImage && uploaded.contentType.startsWith('image/')) {
      await updateDoc(doc(db, 'devices', device.id), {
        imageUrl: uploaded.downloadUrl,
        updatedAt: nowIso,
      });
    }

    const histId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await setDoc(doc(db, 'devices', device.id, 'history', histId), {
      id: histId,
      deviceId: device.id,
      actorUid: user.uid,
      actorName,
      summary: `إرفاق ملف جديد: ${uploaded.fileName}`,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `devices/${device.id}/attachments/${attId}`);
  }

  return record;
}

export function subscribeToDeviceCardDetails(
  deviceId: string,
  inventoryNumber: string,
  callbacks: {
    onHistory: (items: DeviceHistoryRecord[]) => void;
    onAttachments: (items: DeviceAttachmentRecord[]) => void;
    onMovements: (items: DeviceMovementSummary[]) => void;
    onMaintenance: (items: DeviceMaintenanceSummary[]) => void;
  }
): () => void {
  const unsubHistory = onSnapshot(
    query(
      collection(db, 'devices', deviceId, 'history'),
      orderBy('createdAt', 'desc')
    ),
    (snap) => {
      callbacks.onHistory(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DeviceHistoryRecord, 'id'>),
        }))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `devices/${deviceId}/history`)
  );

  const unsubAttachments = onSnapshot(
    collection(db, 'devices', deviceId, 'attachments'),
    (snap) => {
      callbacks.onAttachments(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DeviceAttachmentRecord, 'id'>),
        }))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `devices/${deviceId}/attachments`)
  );

  const unsubMovements = onSnapshot(
    query(
      collection(db, 'stockMovements'),
      where('inventoryCode', '==', inventoryNumber)
    ),
    (snap) => {
      callbacks.onMovements(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DeviceMovementSummary, 'id'>),
        }))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'stockMovements')
  );

  const unsubMaintenance = onSnapshot(
    query(
      collection(db, 'maintenanceRecords'),
      where('deviceId', '==', deviceId)
    ),
    (snap) => {
      callbacks.onMaintenance(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DeviceMaintenanceSummary, 'id'>),
        }))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'maintenanceRecords')
  );

  return () => {
    unsubHistory();
    unsubAttachments();
    unsubMovements();
    unsubMaintenance();
  };
}
