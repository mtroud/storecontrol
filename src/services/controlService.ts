import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import {
  DeviceStorageStatus,
  MaintenanceStatus,
  MovementType,
} from '../types/inventory';
import { resolveAssetByScannedCode, sanitizeBarcodeIndexKey } from './barcodeService';
import { DeviceRecord, TECHNICAL_STATUS_OPTIONS } from './devicesService';

export interface InventorySessionRecord {
  id: string;
  sessionCode: string;
  title: string;
  scopeType: 'FULL' | 'CATEGORY' | 'DEPARTMENT';
  scopeTargetId?: string;
  scopeTargetName: string;
  expectedCount: number;
  scannedCount: number;
  matchedCount: number;
  mismatchCount: number;
  missingCount: number;
  unregisteredCount: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';
  createdByUid: string;
  createdByName: string;
  approvedByUid?: string;
  approvedByName?: string;
  approvedAt?: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AuditMatchStatus =
  | 'MATCHED'
  | 'WRONG_LOCATION'
  | 'MISSING'
  | 'UNREGISTERED';

export interface InventoryResultRecord {
  id: string;
  sessionId: string;
  scannedCode: string;
  deviceId?: string;
  assetName: string;
  expectedLocation?: string;
  actualLocation?: string;
  matchStatus: AuditMatchStatus;
  scannedByUid: string;
  scannedByName: string;
  scannedAt?: string;
  notes?: string;
}

export interface MaintenanceTicketRecord {
  id: string;
  deviceId: string;
  inventoryCode: string;
  deviceName: string;
  faultType: string;
  problemDescription?: string;
  sentDate?: string;
  assignedUnit?: string;
  status: MaintenanceStatus;
  completedDate?: string;
  cost?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CentralMovementRecord {
  id: string;
  movementNumber: string;
  type: MovementType;
  inventoryCode: string;
  assetName: string;
  previousLocation?: string;
  newLocation?: string;
  recipientName?: string;
  voucherNumber?: string;
  performedByUid: string;
  performedByName?: string;
  notes?: string;
  createdAt?: unknown;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function writeControlAudit(
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
    console.warn('Control audit skipped:', err);
  }
}

// ==========================================
// 1. Electronic Inventory Audits
// ==========================================

export function subscribeToInventorySessions(
  onData: (sessions: InventorySessionRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'inventorySessions'),
    orderBy('createdAt', 'desc'),
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<InventorySessionRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'inventorySessions');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeToInventoryResults(
  sessionId: string,
  onData: (results: InventoryResultRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'inventoryResults'),
    where('sessionId', '==', sessionId)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<InventoryResultRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'inventoryResults');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createInventorySession(params: {
  title: string;
  scopeType: 'FULL' | 'CATEGORY' | 'DEPARTMENT';
  scopeTargetId?: string;
  scopeTargetName: string;
  expectedCount: number;
  notes?: string;
  actorName: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لبدء جلسة جرد.');
  if (!params.title.trim()) throw new Error('يرجى إدخال عنوان جلسة الجرد.');

  const sessionId = genId('inv');
  const d = new Date();
  const sessionCode = `AUD-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${Math.floor(
    100 + Math.random() * 900
  )}`;

  try {
    await setDoc(doc(db, 'inventorySessions', sessionId), {
      id: sessionId,
      sessionCode,
      title: params.title.trim(),
      scopeType: params.scopeType,
      scopeTargetId: params.scopeTargetId || '',
      scopeTargetName: params.scopeTargetName,
      expectedCount: params.expectedCount,
      scannedCount: 0,
      matchedCount: 0,
      mismatchCount: 0,
      missingCount: 0,
      unregisteredCount: 0,
      status: 'IN_PROGRESS',
      createdByUid: user.uid,
      createdByName: params.actorName,
      notes: (params.notes || '').trim().slice(0, 500),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `inventorySessions/${sessionId}`);
  }

  await writeControlAudit(
    'CREATE_INVENTORY_SESSION',
    'inventorySessions',
    sessionId,
    `بدء جلسة جرد ${sessionCode}: ${params.title.trim()} (${params.scopeTargetName})`
  );
  return sessionId;
}

export async function recordInventoryScan(params: {
  session: InventorySessionRecord;
  rawCode: string;
  actorName: string;
  existingResults: InventoryResultRecord[];
}): Promise<InventoryResultRecord> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لتسجيل المسح.');
  if (params.session.status === 'APPROVED') {
    throw new Error('لا يمكن التعديل على جلسة جرد معتمدة.');
  }

  const code = params.rawCode.trim();
  if (!code) throw new Error('يرجى إدخال أو مسح رمز صالح.');

  const resolved = await resolveAssetByScannedCode(code);
  const nowIso = new Date().toISOString();

  let resultRecord: InventoryResultRecord;
  if (!resolved || resolved.kind !== 'DEVICE') {
    const key = sanitizeBarcodeIndexKey(code) || `UNREG_${Date.now()}`;
    const resultId = `${params.session.id}_${key}`;
    resultRecord = {
      id: resultId,
      sessionId: params.session.id,
      scannedCode: code.toUpperCase(),
      assetName: resolved?.kind === 'CONSUMABLE' ? `${resolved.item.name} (مادة كمية)` : 'أصل غير مسجل في الدليل',
      expectedLocation: '—',
      actualLocation: params.session.scopeTargetName,
      matchStatus: 'UNREGISTERED',
      scannedByUid: user.uid,
      scannedByName: params.actorName,
      scannedAt: nowIso,
      notes: 'لم يُعثر على جهاز مسجل بهذا الرمز في دليل الأجهزة.',
    };
  } else {
    const dev = resolved.device;
    const resultId = `${params.session.id}_${dev.id}`;
    let matchStatus: AuditMatchStatus = 'MATCHED';
    let note = 'مطابق لبيانات السجل.';

    if (params.session.scopeType === 'CATEGORY' && dev.categoryId !== params.session.scopeTargetId) {
      matchStatus = 'WRONG_LOCATION';
      note = `الجهاز يتبع تصنيفاً آخر (${resolved.categoryName})`;
    } else if (
      params.session.scopeType === 'DEPARTMENT' &&
      dev.departmentId !== params.session.scopeTargetId
    ) {
      matchStatus = 'WRONG_LOCATION';
      note = `المسجل في النظام: ${dev.currentLocation || resolved.departmentName}`;
    } else if (
      params.session.scopeType === 'FULL' &&
      dev.isArchived
    ) {
      matchStatus = 'WRONG_LOCATION';
      note = 'الجهاز مؤرشف في النظام ولكنه ظهر في الجرد الفعلي.';
    }

    resultRecord = {
      id: resultId,
      sessionId: params.session.id,
      scannedCode: dev.inventoryNumber,
      deviceId: dev.id,
      assetName: dev.name,
      expectedLocation: dev.currentLocation || resolved.departmentName,
      actualLocation: params.session.scopeTargetName,
      matchStatus,
      scannedByUid: user.uid,
      scannedByName: params.actorName,
      scannedAt: nowIso,
      notes: note,
    };
  }

  try {
    await setDoc(doc(db, 'inventoryResults', resultRecord.id), resultRecord);

    // Recompute summary counts
    const updatedList = [
      ...params.existingResults.filter((r) => r.id !== resultRecord.id),
      resultRecord,
    ];
    await updateDoc(doc(db, 'inventorySessions', params.session.id), {
      scannedCount: updatedList.filter((r) => r.matchStatus !== 'MISSING').length,
      matchedCount: updatedList.filter((r) => r.matchStatus === 'MATCHED').length,
      mismatchCount: updatedList.filter((r) => r.matchStatus === 'WRONG_LOCATION').length,
      missingCount: updatedList.filter((r) => r.matchStatus === 'MISSING').length,
      unregisteredCount: updatedList.filter((r) => r.matchStatus === 'UNREGISTERED').length,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `inventoryResults/${resultRecord.id}`);
  }

  return resultRecord;
}

export async function finalizeInventoryMissingDevices(params: {
  session: InventorySessionRecord;
  expectedDevices: DeviceRecord[];
  existingResults: InventoryResultRecord[];
  actorName: string;
}): Promise<number> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول.');

  const scannedDeviceIds = new Set(
    params.existingResults.map((r) => r.deviceId).filter(Boolean)
  );
  const missingDevices = params.expectedDevices.filter((d) => !scannedDeviceIds.has(d.id));
  const nowIso = new Date().toISOString();

  try {
    const batch = writeBatch(db);
    missingDevices.forEach((dev) => {
      const resId = `${params.session.id}_${dev.id}`;
      batch.set(doc(db, 'inventoryResults', resId), {
        id: resId,
        sessionId: params.session.id,
        scannedCode: dev.inventoryNumber,
        deviceId: dev.id,
        assetName: dev.name,
        expectedLocation: dev.currentLocation || 'المخزن الرئيسي',
        actualLocation: 'لم يتم المسح',
        matchStatus: 'MISSING',
        scannedByUid: user.uid,
        scannedByName: params.actorName,
        scannedAt: nowIso,
        notes: 'لم يُمسح أثناء جلسة الجرد.',
      });
    });

    const totalMatched = params.existingResults.filter(
      (r) => r.matchStatus === 'MATCHED'
    ).length;
    const totalWrong = params.existingResults.filter(
      (r) => r.matchStatus === 'WRONG_LOCATION'
    ).length;
    const totalUnreg = params.existingResults.filter(
      (r) => r.matchStatus === 'UNREGISTERED'
    ).length;

    batch.update(doc(db, 'inventorySessions', params.session.id), {
      status: 'COMPLETED',
      expectedCount: params.expectedDevices.length,
      scannedCount: params.existingResults.filter((r) => r.matchStatus !== 'MISSING').length,
      matchedCount: totalMatched,
      mismatchCount: totalWrong,
      missingCount: missingDevices.length,
      unregisteredCount: totalUnreg,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `inventorySessions/${params.session.id}`);
  }

  await writeControlAudit(
    'COMPLETE_INVENTORY_AUDIT',
    'inventorySessions',
    params.session.id,
    `إنهاء الجرد ${params.session.sessionCode}: مفقود ${missingDevices.length}، مطابق ${params.existingResults.filter((r) => r.matchStatus === 'MATCHED').length}`
  );
  return missingDevices.length;
}

export async function approveInventorySession(
  session: InventorySessionRecord,
  actorName: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول.');

  try {
    await updateDoc(doc(db, 'inventorySessions', session.id), {
      status: 'APPROVED',
      approvedByUid: user.uid,
      approvedByName: actorName,
      approvedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `inventorySessions/${session.id}`);
  }

  await writeControlAudit(
    'APPROVE_INVENTORY_AUDIT',
    'inventorySessions',
    session.id,
    `اعتماد نتائج الجرد ${session.sessionCode} بواسطة ${actorName}`
  );
}

// ==========================================
// 2. Maintenance Records Management
// ==========================================

export function subscribeToMaintenanceRecords(
  onData: (records: MaintenanceTicketRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'maintenanceRecords'),
    orderBy('sentDate', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MaintenanceTicketRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'maintenanceRecords');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createMaintenanceTicket(params: {
  device: DeviceRecord;
  faultType: string;
  problemDescription?: string;
  sentDate: string;
  assignedUnit: string;
  initialStatus: MaintenanceStatus;
  notes?: string;
  actorName: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول.');

  const ticketId = genId('mnt');
  const nowIso = new Date().toISOString();

  const payload: MaintenanceTicketRecord = {
    id: ticketId,
    deviceId: params.device.id,
    inventoryCode: params.device.inventoryNumber,
    deviceName: params.device.name,
    faultType: params.faultType.trim().slice(0, 120),
    problemDescription: (params.problemDescription || '').trim().slice(0, 600),
    sentDate: params.sentDate,
    assignedUnit: params.assignedUnit.trim().slice(0, 150),
    status: params.initialStatus,
    notes: (params.notes || '').trim().slice(0, 500),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    await runTransaction(db, async (tx) => {
      const devRef = doc(db, 'devices', params.device.id);
      const devSnap = await tx.get(devRef);
      if (!devSnap.exists()) throw new Error('الجهاز المحدد غير موجود.');
      const devData = devSnap.data() as DeviceRecord;

      tx.set(doc(db, 'maintenanceRecords', ticketId), payload);

      const nextDeviceStorage =
        params.initialStatus === MaintenanceStatus.UNREPAIRABLE
          ? DeviceStorageStatus.DAMAGED
          : DeviceStorageStatus.IN_MAINTENANCE;

      const nextTechStatus =
        params.initialStatus === MaintenanceStatus.UNREPAIRABLE
          ? TECHNICAL_STATUS_OPTIONS[3]
          : TECHNICAL_STATUS_OPTIONS[2];

      tx.update(devRef, {
        storageStatus: nextDeviceStorage,
        technicalStatus: nextTechStatus,
        currentLocation: params.assignedUnit.trim().slice(0, 150),
        updatedAt: nowIso,
      });

      const histId = genId('hist');
      tx.set(doc(db, 'devices', params.device.id, 'history', histId), {
        id: histId,
        deviceId: params.device.id,
        actorUid: user.uid,
        actorName: params.actorName,
        summary: `فتح تذكرة صيانة: ${params.faultType.trim()} (${params.assignedUnit.trim()})`,
        createdAt: serverTimestamp(),
      });

      const mvId = genId('mv');
      tx.set(doc(db, 'stockMovements', mvId), {
        id: mvId,
        movementNumber: `MV-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`,
        type: MovementType.SEND_TO_MAINTENANCE,
        inventoryCode: params.device.inventoryNumber,
        assetName: params.device.name,
        previousLocation: (devData.currentLocation || 'المخزن الرئيسي').slice(0, 150),
        newLocation: params.assignedUnit.trim().slice(0, 150),
        recipientName: params.actorName.slice(0, 120),
        voucherNumber: ticketId,
        performedByUid: user.uid,
        performedByName: params.actorName.slice(0, 120),
        notes: params.faultType.trim().slice(0, 500),
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('غير موجود')) throw err;
    handleFirestoreError(err, OperationType.WRITE, `maintenanceRecords/${ticketId}`);
  }

  await writeControlAudit(
    'CREATE_MAINTENANCE_TICKET',
    'maintenanceRecords',
    ticketId,
    `إرسال الجهاز ${params.device.inventoryNumber} للصيانة: ${params.faultType}`
  );
  return ticketId;
}

export async function updateMaintenanceTicket(params: {
  ticket: MaintenanceTicketRecord;
  nextStatus: MaintenanceStatus;
  completedDate?: string;
  cost?: number;
  notes?: string;
  returnToDepartment?: boolean;
  actorName: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول.');

  const nowIso = new Date().toISOString();

  try {
    await runTransaction(db, async (tx) => {
      const ticketRef = doc(db, 'maintenanceRecords', params.ticket.id);
      const devRef = doc(db, 'devices', params.ticket.deviceId);
      const devSnap = await tx.get(devRef);
      const devData = devSnap.exists() ? (devSnap.data() as DeviceRecord) : null;

      const updatedTicket: MaintenanceTicketRecord = {
        id: params.ticket.id,
        deviceId: params.ticket.deviceId,
        inventoryCode: params.ticket.inventoryCode,
        deviceName: params.ticket.deviceName,
        faultType: params.ticket.faultType,
        problemDescription: params.ticket.problemDescription || '',
        sentDate: params.ticket.sentDate || '',
        assignedUnit: params.ticket.assignedUnit || '',
        status: params.nextStatus,
        completedDate: (params.completedDate || (params.nextStatus === MaintenanceStatus.COMPLETED ? nowIso.slice(0, 10) : params.ticket.completedDate || '')).slice(0, 30),
        cost: typeof params.cost === 'number' && !Number.isNaN(params.cost) && params.cost >= 0
          ? params.cost
          : params.ticket.cost ?? 0,
        notes: (params.notes ?? params.ticket.notes ?? '').trim().slice(0, 500),
        createdAt: params.ticket.createdAt || nowIso,
        updatedAt: nowIso,
      };

      tx.update(ticketRef, updatedTicket as unknown as Record<string, unknown>);

      if (devData) {
        if (params.nextStatus === MaintenanceStatus.COMPLETED) {
          const hasDept = Boolean(devData.departmentId) && params.returnToDepartment;
          const nextStorage = hasDept
            ? DeviceStorageStatus.ISSUED
            : DeviceStorageStatus.IN_WAREHOUSE;
          const nextLoc = hasDept
            ? devData.currentLocation || 'الجهة المستفيدة'
            : 'المخزن الرئيسي';

          tx.update(devRef, {
            storageStatus: nextStorage,
            technicalStatus: TECHNICAL_STATUS_OPTIONS[0],
            currentLocation: nextLoc,
            departmentId: hasDept ? devData.departmentId || '' : '',
            unitId: hasDept ? devData.unitId || '' : '',
            recipientName: hasDept ? devData.recipientName || '' : '',
            updatedAt: nowIso,
          });

          const mvId = genId('mv');
          tx.set(doc(db, 'stockMovements', mvId), {
            id: mvId,
            movementNumber: `MV-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`,
            type: MovementType.RECEIVE_FROM_MAINTENANCE,
            inventoryCode: params.ticket.inventoryCode,
            assetName: params.ticket.deviceName,
            previousLocation: (params.ticket.assignedUnit || 'ورشة الصيانة').slice(0, 150),
            newLocation: nextLoc.slice(0, 150),
            recipientName: params.actorName.slice(0, 120),
            voucherNumber: params.ticket.id,
            performedByUid: user.uid,
            performedByName: params.actorName.slice(0, 120),
            notes: `إتمام الصيانة: ${(params.notes || '').slice(0, 400)}`,
            createdAt: serverTimestamp(),
          });
        } else if (params.nextStatus === MaintenanceStatus.UNREPAIRABLE) {
          tx.update(devRef, {
            storageStatus: DeviceStorageStatus.DAMAGED,
            technicalStatus: TECHNICAL_STATUS_OPTIONS[3],
            currentLocation: 'مخزن الأجهزة التالفة',
            updatedAt: nowIso,
          });
        } else {
          tx.update(devRef, {
            storageStatus: DeviceStorageStatus.IN_MAINTENANCE,
            technicalStatus: TECHNICAL_STATUS_OPTIONS[2],
            updatedAt: nowIso,
          });
        }

        const histId = genId('hist');
        tx.set(doc(db, 'devices', params.ticket.deviceId, 'history', histId), {
          id: histId,
          deviceId: params.ticket.deviceId,
          actorUid: user.uid,
          actorName: params.actorName,
          summary: `تحديث حالة الصيانة إلى: ${params.nextStatus}`,
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `maintenanceRecords/${params.ticket.id}`);
  }

  await writeControlAudit(
    'UPDATE_MAINTENANCE_TICKET',
    'maintenanceRecords',
    params.ticket.id,
    `تحديث تذكرة صيانة ${params.ticket.inventoryCode} إلى ${params.nextStatus}`
  );
}

// ==========================================
// 3. Central Immutable Stock Movements Log
// ==========================================

export function subscribeToCentralMovements(
  limitCount: number,
  onData: (rows: CentralMovementRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'stockMovements'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CentralMovementRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'stockMovements');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function verifyAuditSessionCount(sessionId: string): Promise<number> {
  try {
    const snap = await getDocs(
      query(collection(db, 'inventoryResults'), where('sessionId', '==', sessionId))
    );
    return snap.size;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'inventoryResults');
    return 0;
  }
}
