import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { UserRole, UserSession } from '../types/inventory';

const BOOTSTRAPPED_ADMIN_EMAIL = 'control.mogma@gmail.com';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export function sanitizeEmailKey(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

export interface FirestoreUserProfile {
  uid: string;
  username?: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  departmentName?: string;
  lastLoginAt?: string;
  lastLogoutAt?: string;
  lastActivityAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

function buildAuditId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function writeAuthAuditLog(
  uid: string,
  email: string | null,
  action: string,
  details: string
): Promise<void> {
  const logId = buildAuditId('auth');
  const path = `auditLogs/${logId}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      id: logId,
      actorUid: uid,
      actorEmail: email || '',
      action,
      targetCollection: 'users',
      targetId: uid,
      details,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // Do not block session hydration if audit write fails, but log structured error
    console.warn('Audit log write warning:', path, error);
  }
}

export async function resolveOrBootstrapUserSession(
  firebaseUser: User,
  recordLoginAudit = false
): Promise<{ session: UserSession | null; errorMessage?: string }> {
  const userPath = `users/${firebaseUser.uid}`;
  const userRef = doc(db, 'users', firebaseUser.uid);

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + SESSION_TIMEOUT_MS).toISOString();

  if (!snap.exists()) {
    const email = (firebaseUser.email || '').toLowerCase();
    const isBootstrappedAdmin =
      email === BOOTSTRAPPED_ADMIN_EMAIL && firebaseUser.emailVerified;

    if (!isBootstrappedAdmin) {
      if (email && firebaseUser.emailVerified) {
        const inviteKey = sanitizeEmailKey(email);
        try {
          const inviteSnap = await getDoc(doc(db, 'userInvites', inviteKey));
          if (inviteSnap.exists()) {
            const invite = inviteSnap.data() as {
              email?: string;
              username?: string;
              fullName?: string;
              role?: UserRole;
              departmentName?: string;
              isActive?: boolean;
            };
            if (invite.isActive && invite.role) {
              const newProfile: FirestoreUserProfile = {
                uid: firebaseUser.uid,
                username: invite.username || email.split('@')[0],
                email,
                fullName:
                  invite.fullName ||
                  firebaseUser.displayName ||
                  email.split('@')[0],
                role: invite.role,
                isActive: true,
                departmentName:
                  invite.departmentName ||
                  'شعبة السيطرة والإنترنت — مجمع سيد الشهداء (عليه السلام)',
                lastLoginAt: nowIso,
                lastActivityAt: nowIso,
                createdAt: nowIso,
                updatedAt: nowIso,
              };
              await setDoc(userRef, newProfile);
              await writeAuthAuditLog(
                firebaseUser.uid,
                email,
                'INVITED_USER_ACTIVATED',
                `تفعيل حساب موظف مخول (${newProfile.fullName}) بصلاحية ${newProfile.role}`
              );
              return {
                session: {
                  uid: newProfile.uid,
                  username: newProfile.username || email.split('@')[0],
                  email: newProfile.email,
                  fullName: newProfile.fullName,
                  role: newProfile.role,
                  departmentName: newProfile.departmentName || '',
                  loginAt: nowIso,
                  lastActivityAt: nowIso,
                  sessionExpiresAt: expiresIso,
                },
              };
            }
          }
        } catch (inviteErr) {
          console.warn('Invite lookup skipped:', inviteErr);
        }
      }

      await signOut(auth);
      return {
        session: null,
        errorMessage:
          'هذا الحساب غير مسجل أو غير مخول للوصول إلى النظام. يتم إنشاء الحسابات وتحديد الصلاحيات من قبل مدير النظام حصراً.',
      };
    }

    const adminProfile: FirestoreUserProfile = {
      uid: firebaseUser.uid,
      username: 'admin',
      email,
      fullName: firebaseUser.displayName || 'مدير النظام — شعبة السيطرة والإنترنت',
      role: UserRole.SYSTEM_ADMIN,
      isActive: true,
      departmentName: 'شعبة السيطرة والإنترنت — مجمع سيد الشهداء (عليه السلام)',
      lastLoginAt: nowIso,
      lastActivityAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await setDoc(userRef, adminProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }

    if (recordLoginAudit) {
      await writeAuthAuditLog(
        firebaseUser.uid,
        firebaseUser.email,
        'BOOTSTRAP_ADMIN_LOGIN',
        'تفعيل حساب مدير النظام الرئيسي وتسجيل الدخول الأول.'
      );
    }

    return {
      session: {
        uid: adminProfile.uid,
        username: adminProfile.username || 'admin',
        email: adminProfile.email,
        fullName: adminProfile.fullName,
        role: adminProfile.role,
        departmentName: adminProfile.departmentName || '',
        loginAt: nowIso,
        lastActivityAt: nowIso,
        sessionExpiresAt: expiresIso,
      },
    };
  }

  const profile = snap.data() as FirestoreUserProfile;
  if (!profile.isActive) {
    await signOut(auth);
    return {
      session: null,
      errorMessage: 'تم إيقاف تفعيل هذا الحساب من قبل مدير النظام. يرجى مراجعة الإدارة.',
    };
  }

  if (recordLoginAudit) {
    try {
      await updateDoc(userRef, {
        lastLoginAt: nowIso,
        lastActivityAt: nowIso,
        updatedAt: nowIso,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }

    await writeAuthAuditLog(
      firebaseUser.uid,
      firebaseUser.email,
      'USER_LOGIN',
      `تسجيل دخول ناجح للمستخدم (${profile.fullName})`
    );
  }

  return {
    session: {
      uid: profile.uid,
      username: profile.username || profile.email.split('@')[0],
      email: profile.email,
      fullName: profile.fullName,
      role: profile.role,
      departmentName:
        profile.departmentName || 'شعبة السيطرة والإنترنت — مجمع سيد الشهداء (عليه السلام)',
      loginAt: profile.lastLoginAt || nowIso,
      lastActivityAt: nowIso,
      sessionExpiresAt: expiresIso,
    },
  };
}

export async function signInWithGoogleAccount(): Promise<{
  session: UserSession | null;
  errorMessage?: string;
}> {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    return await resolveOrBootstrapUserSession(credential.user, true);
  } catch (error) {
    return {
      session: null,
      errorMessage: translateFirebaseAuthError(error),
    };
  }
}

export async function signInWithEmailAccount(
  email: string,
  password: string
): Promise<{ session: UserSession | null; errorMessage?: string }> {
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    if (!credential.user.emailVerified) {
      await signOut(auth);
      return {
        session: null,
        errorMessage: 'يرجى تأكيد البريد الإلكتروني للحساب قبل تسجيل الدخول.',
      };
    }
    return await resolveOrBootstrapUserSession(credential.user, true);
  } catch (error) {
    return {
      session: null,
      errorMessage: translateFirebaseAuthError(error),
    };
  }
}

export async function signOutFirebaseSession(
  uid?: string,
  email?: string | null,
  reason = 'تسجيل خروج يدوي من النظام'
): Promise<void> {
  if (uid) {
    const nowIso = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', uid), {
        lastLogoutAt: nowIso,
        updatedAt: nowIso,
      });
      await writeAuthAuditLog(uid, email || null, 'USER_LOGOUT', reason);
    } catch (err) {
      console.warn('Could not update logout timestamp:', err);
    }
  }
  await signOut(auth);
}

export async function syncUserActivityTimestamp(uid: string): Promise<void> {
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'users', uid), {
      lastActivityAt: nowIso,
      updatedAt: nowIso,
    });
  } catch {
    // Non-blocking periodic heartbeat
  }
}

export function translateFirebaseAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('auth/popup-closed-by-user')) {
    return 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.';
  }
  if (message.includes('auth/popup-blocked')) {
    return 'تم حظر النافذة المنبثقة من المتصفح. يرجى السماح بالنوافذ المنبثقة لهذا الموقع ثم المحاولة مجدداً.';
  }
  if (
    message.includes('auth/invalid-credential') ||
    message.includes('auth/wrong-password') ||
    message.includes('auth/user-not-found')
  ) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  if (message.includes('auth/invalid-email')) {
    return 'صيغة البريد الإلكتروني غير صحيحة.';
  }
  if (
    message.includes('auth/operation-not-allowed') ||
    message.includes('auth/configuration-not-found')
  ) {
    return 'تسجيل الدخول بالبريد الإلكتروني وكلمة المرور غير مفعّل حالياً في إعدادات Firebase Authentication. استخدم تسجيل الدخول عبر حساب Google أعلاه، أو فعّل Email/Password من Firebase Console.';
  }
  if (message.includes('auth/too-many-requests')) {
    return 'تم تجاوز عدد محاولات الدخول المسموح بها مؤقتاً. يرجى الانتظار قليلاً ثم المحاولة.';
  }
  if (message.includes('auth/network-request-failed')) {
    return 'تعذر الاتصال بخدمة المصادقة. يرجى التحقق من اتصال الإنترنت.';
  }
  if (message.includes('Quota exceeded')) {
    return 'تم تجاوز الحصة اليومية المجانية لقاعدة البيانات. سيتم إعادة الضبط في اليوم التالي.';
  }

  return 'تعذر إتمام تسجيل الدخول. تأكد من صلاحية الحساب واتصال الشبكة.';
}
