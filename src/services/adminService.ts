import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  signOut as signOutSecondary,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { USER_ROLE_LABELS, UserRole } from '../types/inventory';
import { FirestoreUserProfile, sanitizeEmailKey } from './authService';

export interface UserInviteRecord {
  id: string;
  email: string;
  username?: string;
  fullName: string;
  role: UserRole;
  departmentName?: string;
  isActive: boolean;
  createdByUid: string;
  createdAt?: string;
}

export interface AuditLogRecord {
  id: string;
  actorUid: string;
  actorEmail?: string;
  action: string;
  targetCollection?: string;
  targetId?: string;
  details?: string;
  createdAt?: unknown;
}

export interface SystemSettingsRecord {
  id: string;
  organizationName: string;
  departmentName: string;
  divisionName: string;
  sessionTimeoutMinutes: number;
  inventoryPrefix: string;
  lowStockAlertEnabled: boolean;
  autoBackupReminderDays: number;
  lastBackupAt?: string;
  lastBackupBy?: string;
  updatedAt?: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsRecord = {
  id: 'general',
  organizationName: 'الأمانة العامة للعتبة الحسينية المقدسة',
  departmentName: 'قسم مجمع سيد الشهداء (عليه السلام) الخدمي',
  divisionName: 'شعبة السيطرة والإنترنت',
  sessionTimeoutMinutes: 30,
  inventoryPrefix: 'SM',
  lowStockAlertEnabled: true,
  autoBackupReminderDays: 7,
  lastBackupAt: '',
  lastBackupBy: '',
};

export interface BackupPayload {
  system: 'SayedMart';
  version: string;
  exportedAt: string;
  exportedBy: string;
  firestoreDatabaseId: string;
  collections: Record<string, Array<Record<string, unknown>>>;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function writeAdminAudit(
  action: string,
  targetCollection: string,
  targetId: string,
  details: string
): Promise<void> {
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
    console.warn('Admin audit log skipped:', err);
  }
}

// ==========================================
// 1. Users & RBAC Management
// ==========================================

export function subscribeToUsers(
  onData: (users: FirestoreUserProfile[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(collection(db, 'users'), orderBy('fullName', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as FirestoreUserProfile),
          uid: d.id,
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'users');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeToUserInvites(
  onData: (invites: UserInviteRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(collection(db, 'userInvites'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<UserInviteRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'userInvites');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createAuthorizedUserOrInvite(params: {
  mode: 'GOOGLE_INVITE' | 'EMAIL_PASSWORD';
  email: string;
  password?: string;
  fullName: string;
  username?: string;
  role: UserRole;
  departmentName?: string;
}): Promise<{ kind: 'USER' | 'INVITE'; message: string }> {
  const adminUser = auth.currentUser;
  if (!adminUser) throw new Error('يجب تسجيل الدخول كمدير نظام.');

  const email = params.email.trim().toLowerCase();
  const fullName = params.fullName.trim();
  const username = (params.username || email.split('@')[0]).trim().slice(0, 64);
  const departmentName = (
    params.departmentName || 'شعبة السيطرة والإنترنت — مجمع سيد الشهداء (عليه السلام)'
  )
    .trim()
    .slice(0, 140);

  if (!email.includes('@') || email.length < 5) {
    throw new Error('يرجى إدخال بريد إلكتروني صحيح.');
  }
  if (fullName.length < 2 || fullName.length > 120) {
    throw new Error('الاسم الكامل يجب أن يكون بين حرفين و120 حرفاً.');
  }

  const nowIso = new Date().toISOString();

  if (params.mode === 'EMAIL_PASSWORD') {
    const pwd = (params.password || '').trim();
    if (pwd.length < 8) {
      throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
    }

    const tempAppName = `provisioner_${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, tempAppName);
    try {
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pwd);
      const newUid = cred.user.uid;
      try {
        await sendEmailVerification(cred.user);
      } catch {
        // Verification email may be skipped if domain/SMTP not configured, still proceed
      }
      await signOutSecondary(secondaryAuth);

      const profile: FirestoreUserProfile = {
        uid: newUid,
        username,
        email,
        fullName,
        role: params.role,
        isActive: true,
        departmentName,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(doc(db, 'users', newUid), profile);

      await writeAdminAudit(
        'CREATE_USER_ACCOUNT',
        'users',
        newUid,
        `إنشاء حساب مستخدم جديد: ${fullName} (${email}) بدور ${USER_ROLE_LABELS[params.role]}`
      );

      return {
        kind: 'USER',
        message: `تم إنشاء الحساب في Firebase Authentication وقاعدة البيانات للمستخدم ${fullName} وإرسال رابط التحقق إلى ${email}.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/operation-not-allowed')) {
        throw new Error(
          'مزود Email/Password غير مفعّل في Firebase Console. يمكنك استخدام خيار «تفويض دخول عبر Google» أو تفعيل Email/Password من لوحة تحكم Firebase.'
        );
      }
      if (msg.includes('auth/email-already-in-use')) {
        throw new Error(
          'هذا البريد الإلكتروني مسجل مسبقاً في Firebase Authentication. استخدم وضع «تفويض دخول عبر Google» لربطه تلقائياً.'
        );
      }
      throw new Error(`تعذر إنشاء حساب المصادقة: ${msg}`);
    } finally {
      await deleteApp(secondaryApp).catch(() => {});
    }
  }

  // GOOGLE_INVITE mode: create deterministic invite in userInvites
  const inviteId = sanitizeEmailKey(email);
  const invitePayload: UserInviteRecord = {
    id: inviteId,
    email,
    username,
    fullName,
    role: params.role,
    departmentName,
    isActive: true,
    createdByUid: adminUser.uid,
    createdAt: nowIso,
  };

  try {
    await setDoc(doc(db, 'userInvites', inviteId), invitePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `userInvites/${inviteId}`);
  }

  await writeAdminAudit(
    'CREATE_USER_INVITE',
    'userInvites',
    inviteId,
    `تخويل بريد إلكتروني للدخول: ${fullName} (${email}) بصلاحية ${USER_ROLE_LABELS[params.role]}`
  );

  return {
    kind: 'INVITE',
    message: `تم تسجيل تخويل الحساب (${email}) بصلاحية «${USER_ROLE_LABELS[params.role]}». سيتم تفعيل ملف المستخدم تلقائياً فور تسجيل دخوله الأول.`,
  };
}

export async function updateUserProfileByAdmin(
  prevUser: FirestoreUserProfile,
  updates: {
    fullName: string;
    username: string;
    departmentName: string;
    role: UserRole;
    isActive: boolean;
  }
): Promise<void> {
  const fullName = updates.fullName.trim();
  if (fullName.length < 2 || fullName.length > 120) {
    throw new Error('الاسم الكامل يجب أن يكون بين حرفين و120 حرفاً.');
  }

  const nowIso = new Date().toISOString();
  const payload = {
    uid: prevUser.uid,
    email: prevUser.email,
    username: updates.username.trim().slice(0, 64),
    fullName,
    departmentName: updates.departmentName.trim().slice(0, 140),
    role: updates.role,
    isActive: updates.isActive,
    updatedAt: nowIso,
  };

  try {
    await updateDoc(doc(db, 'users', prevUser.uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${prevUser.uid}`);
  }

  const diffs: string[] = [];
  if (prevUser.role !== updates.role) {
    diffs.push(
      `الصلاحية: [${USER_ROLE_LABELS[prevUser.role]} ← ${USER_ROLE_LABELS[updates.role]}]`
    );
  }
  if (prevUser.isActive !== updates.isActive) {
    diffs.push(
      `حالة الحساب: [${prevUser.isActive ? 'نشط' : 'موقوف'} ← ${updates.isActive ? 'نشط' : 'موقوف'}]`
    );
  }
  if (prevUser.fullName !== fullName) {
    diffs.push(`الاسم: [${prevUser.fullName} ← ${fullName}]`);
  }

  await writeAdminAudit(
    'UPDATE_USER_RBAC',
    'users',
    prevUser.uid,
    `تعديل بيانات/صلاحيات ${prevUser.email}: ${diffs.join(' · ') || 'تحديث البيانات الإدارية'}`
  );
}

export async function deleteUserInvite(invite: UserInviteRecord): Promise<void> {
  try {
    await deleteDoc(doc(db, 'userInvites', invite.id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `userInvites/${invite.id}`);
  }

  await writeAdminAudit(
    'DELETE_USER_INVITE',
    'userInvites',
    invite.id,
    `إلغاء دعوة التخويل للبريد: ${invite.email}`
  );
}

// ==========================================
// 2. Security Audit Logs
// ==========================================

export function subscribeToAuditLogs(
  maxRows: number,
  onData: (logs: AuditLogRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'auditLogs'),
    orderBy('createdAt', 'desc'),
    limit(maxRows)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AuditLogRecord, 'id'>),
        }))
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'auditLogs');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

// ==========================================
// 3. System Settings & Backup / Restore
// ==========================================

export function subscribeToSystemSettings(
  onData: (settings: SystemSettingsRecord) => void,
  onError?: (err: Error) => void
): () => void {
  const ref = doc(db, 'settings', 'general');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(DEFAULT_SYSTEM_SETTINGS);
        return;
      }
      onData({
        ...DEFAULT_SYSTEM_SETTINGS,
        ...(snap.data() as Partial<SystemSettingsRecord>),
        id: 'general',
      });
    },
    (err) => {
      if (onError) {
        try {
          handleFirestoreError(err, OperationType.GET, 'settings/general');
        } catch (wrapped) {
          onError(wrapped as Error);
        }
      }
    }
  );
}

export async function fetchSystemSettingsOnce(): Promise<SystemSettingsRecord> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (!snap.exists()) return DEFAULT_SYSTEM_SETTINGS;
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...(snap.data() as Partial<SystemSettingsRecord>),
      id: 'general',
    };
  } catch {
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

export async function saveSystemSettings(
  prev: SystemSettingsRecord,
  next: Omit<SystemSettingsRecord, 'id'>
): Promise<void> {
  const nowIso = new Date().toISOString();
  const payload: SystemSettingsRecord = {
    id: 'general',
    organizationName: next.organizationName.trim().slice(0, 160),
    departmentName: next.departmentName.trim().slice(0, 160),
    divisionName: next.divisionName.trim().slice(0, 160),
    sessionTimeoutMinutes: Math.min(480, Math.max(5, Number(next.sessionTimeoutMinutes) || 30)),
    inventoryPrefix: (next.inventoryPrefix || 'SM').trim().toUpperCase().slice(0, 20),
    lowStockAlertEnabled: Boolean(next.lowStockAlertEnabled),
    autoBackupReminderDays: Math.max(1, Number(next.autoBackupReminderDays) || 7),
    lastBackupAt: prev.lastBackupAt || '',
    lastBackupBy: prev.lastBackupBy || '',
    updatedAt: nowIso,
  };

  try {
    await setDoc(doc(db, 'settings', 'general'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/general');
  }

  await writeAdminAudit(
    'UPDATE_SYSTEM_SETTINGS',
    'settings',
    'general',
    `تحديث إعدادات النظام: مهلة الجلسة [${prev.sessionTimeoutMinutes}د ← ${payload.sessionTimeoutMinutes}د]، البادئة [${prev.inventoryPrefix} ← ${payload.inventoryPrefix}]`
  );
}

const BACKUP_COLLECTIONS = [
  'categories',
  'departments',
  'units',
  'items',
  'stockBalances',
  'devices',
  'maintenanceRecords',
  'stockEntries',
  'stockIssues',
  'stockReturns',
  'assetTransfers',
  'stockMovements',
  'inventorySessions',
  'inventoryResults',
  'barcodeIndex',
  'settings',
] as const;

export async function exportFullDatabaseBackup(
  actorName: string,
  currentSettings: SystemSettingsRecord
): Promise<{ totalDocs: number; fileName: string }> {
  const collectionsData: Record<string, Array<Record<string, unknown>>> = {};
  let totalDocs = 0;

  for (const colName of BACKUP_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      const docs = snap.docs.map((d) => ({
        __docId: d.id,
        ...d.data(),
      }));
      collectionsData[colName] = docs;
      totalDocs += docs.length;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colName);
    }
  }

  const nowIso = new Date().toISOString();
  const backup: BackupPayload = {
    system: 'SayedMart',
    version: '1.0',
    exportedAt: nowIso,
    exportedBy: actorName,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
    collections: collectionsData,
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const fileName = `sayed-mart-backup-${nowIso.slice(0, 10)}.json`;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);

  // Update backup metadata in settings/general
  try {
    await setDoc(doc(db, 'settings', 'general'), {
      ...currentSettings,
      id: 'general',
      lastBackupAt: nowIso,
      lastBackupBy: actorName.slice(0, 120),
      updatedAt: nowIso,
    });
  } catch (err) {
    console.warn('Could not update backup metadata:', err);
  }

  await writeAdminAudit(
    'EXPORT_DATABASE_BACKUP',
    'settings',
    'general',
    `تصدير نسخة احتياطية كاملة (${totalDocs} مستند عبر ${BACKUP_COLLECTIONS.length} مجموعة)`
  );

  return { totalDocs, fileName };
}

export function validateBackupFileJson(rawText: string): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('ملف النسخة الاحتياطية غير صالح (صيغة JSON تالفة).');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as BackupPayload).system !== 'SayedMart' ||
    typeof (parsed as BackupPayload).collections !== 'object'
  ) {
    throw new Error('هذا الملف لا يطابق هيكل النسخة الاحتياطية المعتمدة لنظام Sayed Mart.');
  }
  return parsed as BackupPayload;
}

// Restores mutable master collections safely using chunked batches (max 400 ops/batch).
const RESTORABLE_COLLECTIONS = [
  'categories',
  'departments',
  'units',
  'items',
  'stockBalances',
  'devices',
  'maintenanceRecords',
  'settings',
] as const;

export async function restoreDatabaseBackup(
  backup: BackupPayload
): Promise<number> {
  let restoredCount = 0;
  let batch = writeBatch(db);
  let batchOps = 0;

  for (const colName of RESTORABLE_COLLECTIONS) {
    const docs = backup.collections[colName] || [];
    for (const rawDoc of docs) {
      const docId = String(rawDoc.__docId || rawDoc.id || '').trim();
      if (!docId || !/^[a-zA-Z0-9_-]+$/.test(docId)) continue;

      const cleanDoc: Record<string, unknown> = { ...rawDoc };
      delete cleanDoc.__docId;

      batch.set(doc(db, colName, docId), cleanDoc, { merge: true });
      batchOps += 1;
      restoredCount += 1;

      if (batchOps >= 400) {
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, colName);
        }
        batch = writeBatch(db);
        batchOps = 0;
      }
    }
  }

  if (batchOps > 0) {
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'backupRestore');
    }
  }

  await writeAdminAudit(
    'RESTORE_DATABASE_BACKUP',
    'settings',
    'general',
    `استعادة نسخة احتياطية بتاريخ ${backup.exportedAt} (${restoredCount} سجل أساسي تم تحديثه)`
  );

  return restoredCount;
}
