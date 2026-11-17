import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';

export interface DepartmentRecord {
  id: string;
  name: string;
  managerName?: string;
  phone?: string;
  location?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UnitRecord {
  id: string;
  departmentId: string;
  name: string;
  supervisorName?: string;
  phone?: string;
  location?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DepartmentInput {
  name: string;
  managerName?: string;
  phone?: string;
  location?: string;
  notes?: string;
  isActive: boolean;
}

export interface UnitInput {
  departmentId: string;
  name: string;
  supervisorName?: string;
  phone?: string;
  location?: string;
  notes?: string;
  isActive: boolean;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function logOrgAudit(
  action: string,
  targetCollection: 'departments' | 'units',
  targetId: string,
  details: string
) {
  const user = auth.currentUser;
  if (!user) return;
  const logId = generateId('aud');
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
    console.warn('Org audit log skipped:', err);
  }
}

export function subscribeToDepartments(
  onData: (departments: DepartmentRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(collection(db, 'departments'), orderBy('name', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DepartmentRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'departments');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeToUnits(
  onData: (units: UnitRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(collection(db, 'units'), orderBy('name', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<UnitRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'units');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createDepartment(
  input: DepartmentInput,
  existingDepartments: DepartmentRecord[]
): Promise<string> {
  const cleanName = input.name.trim();
  if (cleanName.length < 2 || cleanName.length > 120) {
    throw new Error('يجب أن يكون اسم الشعبة بين حرفين و120 حرفاً.');
  }

  const duplicate = existingDepartments.some(
    (d) => d.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    throw new Error('توجد شعبة مسجلة بهذا الاسم مسبقاً.');
  }

  const id = generateId('dept');
  const nowIso = new Date().toISOString();
  const payload: DepartmentRecord = {
    id,
    name: cleanName,
    managerName: (input.managerName || '').trim().slice(0, 120),
    phone: (input.phone || '').trim().slice(0, 30),
    location: (input.location || '').trim().slice(0, 150),
    notes: (input.notes || '').trim().slice(0, 400),
    isActive: input.isActive,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    await setDoc(doc(db, 'departments', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `departments/${id}`);
  }

  await logOrgAudit('CREATE_DEPARTMENT', 'departments', id, `إضافة شعبة: ${cleanName}`);
  return id;
}

export async function updateDepartment(
  id: string,
  input: DepartmentInput,
  existingDepartments: DepartmentRecord[]
): Promise<void> {
  const cleanName = input.name.trim();
  if (cleanName.length < 2 || cleanName.length > 120) {
    throw new Error('يجب أن يكون اسم الشعبة بين حرفين و120 حرفاً.');
  }

  const duplicate = existingDepartments.some(
    (d) => d.id !== id && d.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    throw new Error('توجد شعبة أخرى مسجلة بهذا الاسم.');
  }

  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'departments', id), {
      id,
      name: cleanName,
      managerName: (input.managerName || '').trim().slice(0, 120),
      phone: (input.phone || '').trim().slice(0, 30),
      location: (input.location || '').trim().slice(0, 150),
      notes: (input.notes || '').trim().slice(0, 400),
      isActive: input.isActive,
      updatedAt: nowIso,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `departments/${id}`);
  }

  await logOrgAudit('UPDATE_DEPARTMENT', 'departments', id, `تعديل بيانات الشعبة: ${cleanName}`);
}

export async function toggleDepartmentStatus(dept: DepartmentRecord): Promise<void> {
  const nextStatus = !dept.isActive;
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'departments', dept.id), {
      isActive: nextStatus,
      updatedAt: nowIso,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `departments/${dept.id}`);
  }

  await logOrgAudit(
    nextStatus ? 'ACTIVATE_DEPARTMENT' : 'ARCHIVE_DEPARTMENT',
    'departments',
    dept.id,
    `${nextStatus ? 'تفعيل' : 'أرشفة'} الشعبة: ${dept.name}`
  );
}

export async function createUnit(
  input: UnitInput,
  existingUnits: UnitRecord[]
): Promise<string> {
  const cleanName = input.name.trim();
  if (!input.departmentId) {
    throw new Error('يجب اختيار الشعبة التابعة لها الوحدة.');
  }
  if (cleanName.length < 2 || cleanName.length > 120) {
    throw new Error('يجب أن يكون اسم الوحدة بين حرفين و120 حرفاً.');
  }

  const duplicate = existingUnits.some(
    (u) =>
      u.departmentId === input.departmentId &&
      u.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    throw new Error('توجد وحدة بنفس الاسم مسجلة مسبقاً ضمن هذه الشعبة.');
  }

  const id = generateId('unit');
  const nowIso = new Date().toISOString();
  const payload: UnitRecord = {
    id,
    departmentId: input.departmentId,
    name: cleanName,
    supervisorName: (input.supervisorName || '').trim().slice(0, 120),
    phone: (input.phone || '').trim().slice(0, 30),
    location: (input.location || '').trim().slice(0, 150),
    notes: (input.notes || '').trim().slice(0, 400),
    isActive: input.isActive,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    await setDoc(doc(db, 'units', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `units/${id}`);
  }

  await logOrgAudit('CREATE_UNIT', 'units', id, `إضافة وحدة: ${cleanName}`);
  return id;
}

export async function updateUnit(
  id: string,
  input: UnitInput,
  existingUnits: UnitRecord[]
): Promise<void> {
  const cleanName = input.name.trim();
  if (!input.departmentId) {
    throw new Error('يجب اختيار الشعبة التابعة لها الوحدة.');
  }
  if (cleanName.length < 2 || cleanName.length > 120) {
    throw new Error('يجب أن يكون اسم الوحدة بين حرفين و120 حرفاً.');
  }

  const duplicate = existingUnits.some(
    (u) =>
      u.id !== id &&
      u.departmentId === input.departmentId &&
      u.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    throw new Error('توجد وحدة أخرى بنفس الاسم ضمن هذه الشعبة.');
  }

  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'units', id), {
      id,
      departmentId: input.departmentId,
      name: cleanName,
      supervisorName: (input.supervisorName || '').trim().slice(0, 120),
      phone: (input.phone || '').trim().slice(0, 30),
      location: (input.location || '').trim().slice(0, 150),
      notes: (input.notes || '').trim().slice(0, 400),
      isActive: input.isActive,
      updatedAt: nowIso,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `units/${id}`);
  }

  await logOrgAudit('UPDATE_UNIT', 'units', id, `تعديل بيانات الوحدة: ${cleanName}`);
}

export async function toggleUnitStatus(unit: UnitRecord): Promise<void> {
  const nextStatus = !unit.isActive;
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'units', unit.id), {
      isActive: nextStatus,
      updatedAt: nowIso,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `units/${unit.id}`);
  }

  await logOrgAudit(
    nextStatus ? 'ACTIVATE_UNIT' : 'ARCHIVE_UNIT',
    'units',
    unit.id,
    `${nextStatus ? 'تفعيل' : 'أرشفة'} الوحدة: ${unit.name}`
  );
}
