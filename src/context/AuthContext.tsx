import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { subscribeToSystemSettings } from '../services/adminService';
import {
  resolveOrBootstrapUserSession,
  signInWithEmailAccount,
  signInWithGoogleAccount,
  signOutFirebaseSession,
  syncUserActivityTimestamp,
} from '../services/authService';
import { UserSession } from '../types/inventory';

interface EmailLoginCredentials {
  email: string;
  password: string;
}

interface LoginResult {
  success: boolean;
  errorMessage?: string;
}

interface AuthContextValue {
  session: UserSession | null;
  authReady: boolean;
  isAuthenticated: boolean;
  sessionNotice: string | null;
  loginWithGoogle: () => Promise<LoginResult>;
  loginWithEmail: (credentials: EmailLoginCredentials) => Promise<LoginResult>;
  logout: (reason?: string) => Promise<void>;
  recordActivity: () => void;
  clearSessionNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const ACTIVITY_SYNC_INTERVAL_MS = 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState(30);
  const lastSyncedActivityRef = useRef<number>(0);

  useEffect(() => {
    if (!session) return;
    const unsubSettings = subscribeToSystemSettings((cfg) => {
      if (cfg.sessionTimeoutMinutes >= 5) {
        setTimeoutMinutes(cfg.sessionTimeoutMinutes);
      }
    });
    return () => unsubSettings();
  }, [session?.uid]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setSession(null);
        setAuthReady(true);
        return;
      }

      try {
        const result = await resolveOrBootstrapUserSession(firebaseUser, false);
        if (result.session) {
          setSession(result.session);
        } else {
          setSession(null);
          if (result.errorMessage) {
            setSessionNotice(result.errorMessage);
          }
        }
      } catch (err) {
        console.error('Auth state hydration error:', err);
        setSession(null);
        setSessionNotice(
          'حدث خطأ أثناء التحقق من صلاحية الحساب في قاعدة البيانات. يرجى المحاولة مرة أخرى.'
        );
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = useCallback(
    async (reason?: string) => {
      const uid = session?.uid;
      const email = session?.email;
      setSession(null);
      if (reason) {
        setSessionNotice(reason);
      }
      await signOutFirebaseSession(
        uid,
        email,
        reason || 'تسجيل خروج يدوي من النظام'
      );
    },
    [session]
  );

  const recordActivity = useCallback(() => {
    setSession((current) => {
      if (!current) return null;
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      if (now - lastSyncedActivityRef.current > ACTIVITY_SYNC_INTERVAL_MS) {
        lastSyncedActivityRef.current = now;
        void syncUserActivityTimestamp(current.uid);
      }
      return {
        ...current,
        lastActivityAt: nowIso,
        sessionExpiresAt: new Date(now + timeoutMinutes * 60 * 1000).toISOString(),
      };
    });
  }, [timeoutMinutes]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => {
      if (new Date(session.sessionExpiresAt).getTime() <= Date.now()) {
        void logout(
          `انتهت مهلة الجلسة تلقائياً وفق سياسة الأمان (${timeoutMinutes} دقيقة دون نشاط). يرجى إعادة تسجيل الدخول.`
        );
      }
    }, 30000);
    return () => window.clearInterval(interval);
  }, [session, logout, timeoutMinutes]);

  const loginWithGoogle = useCallback(async (): Promise<LoginResult> => {
    setSessionNotice(null);
    const result = await signInWithGoogleAccount();
    if (result.session) {
      setSession(result.session);
      return { success: true };
    }
    return {
      success: false,
      errorMessage: result.errorMessage || 'تعذر تسجيل الدخول عبر Google.',
    };
  }, []);

  const loginWithEmail = useCallback(
    async ({ email, password }: EmailLoginCredentials): Promise<LoginResult> => {
      if (!email.trim() || !password.trim()) {
        return {
          success: false,
          errorMessage: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.',
        };
      }
      setSessionNotice(null);
      const result = await signInWithEmailAccount(email, password);
      if (result.session) {
        setSession(result.session);
        return { success: true };
      }
      return {
        success: false,
        errorMessage: result.errorMessage || 'تعذر تسجيل الدخول.',
      };
    },
    []
  );

  const clearSessionNotice = useCallback(() => {
    setSessionNotice(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        authReady,
        isAuthenticated: session !== null,
        sessionNotice,
        loginWithGoogle,
        loginWithEmail,
        logout,
        recordActivity,
        clearSessionNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
