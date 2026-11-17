import React, { useState } from 'react';
import { Eye, EyeOff, Lock, LogIn, Mail, Moon, ShieldCheck, Sun } from 'lucide-react';
import { InstitutionalEmblem } from '../components/brand/InstitutionalEmblem';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export function LoginPage() {
  const { loginWithGoogle, loginWithEmail, sessionNotice, clearSessionNotice } =
    useAuth();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    clearSessionNotice();
    setErrorMessage(null);
    setGoogleSubmitting(true);
    const result = await loginWithGoogle();
    setGoogleSubmitting(false);
    if (!result.success && result.errorMessage) {
      setErrorMessage(result.errorMessage);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearSessionNotice();
    setErrorMessage(null);
    setSubmitting(true);

    const result = await loginWithEmail({ email, password });
    setSubmitting(false);

    if (!result.success && result.errorMessage) {
      setErrorMessage(result.errorMessage);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-[#0B1220]">
      {/* Right Institutional Panel (in RTL, first column) */}
      <div className="lg:w-[46%] bg-[#0F2544] dark:bg-[#0B1526] text-white p-8 sm:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-l border-white/10">
        <div className="flex items-center justify-between gap-4">
          <InstitutionalEmblem size="lg" showText inverted />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح'}
            className="p-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>

        <div className="my-10 lg:my-0 max-w-lg space-y-5">
          <div className="text-xs font-semibold text-[#D4AE60]">
            الأمانة العامة للعتبة الحسينية المقدسة · مجمع سيد الشهداء (عليه السلام) الخدمي
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-snug text-white [text-wrap:balance]">
            نظام إدارة وجرد الأجهزة والمعدات لشعبة السيطرة والإنترنت
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            منصة مؤسساتية مركزية متصلة بقاعدة بيانات Cloud Firestore لمتابعة الموجودات التقنية داخل المخزن والمصروفة للشعب والوحدات، وتوثيق حركات الصرف والإرجاع والنقل والصيانة والجرد الإلكتروني.
          </p>

          <div className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300">
            <div>
              <div className="font-semibold text-white">مصادقة Firebase الآمنة</div>
              <p className="mt-1 text-slate-400 leading-relaxed">
                التحقق من الهوية والصلاحيات في Cloud Firestore وقواعد الأمان المحكمة.
              </p>
            </div>
            <div>
              <div className="font-semibold text-white">حوكمة وسجل تدقيق</div>
              <p className="mt-1 text-slate-400 leading-relaxed">
                إنشاء الحسابات مقتصر على مدير النظام مع تسجيل الدخول والخروج وآخر نشاط.
              </p>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-white/10">
          <span>Sayed Mart · IT Asset &amp; Inventory Management</span>
          <span>متصل بـ Firebase Auth &amp; Firestore</span>
        </div>
      </div>

      {/* Left Login Form Panel */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-5">
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                تسجيل الدخول إلى النظام
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                سجّل الدخول بحسابك المؤسسي المعتمد من قبل مدير النظام.
              </p>
            </div>

            {(errorMessage || sessionNotice) && (
              <div
                role="alert"
                className="mb-5 p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-200 leading-relaxed"
              >
                {errorMessage || sessionNotice}
              </div>
            )}

            {/* Primary Google Authentication Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleSubmitting || submitting}
              className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] disabled:opacity-60 dark:bg-[#C59B47] dark:text-[#0B1220] dark:hover:bg-[#D4AE60] transition-colors min-h-[44px]"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              <span>
                {googleSubmitting
                  ? 'جاري التحقق عبر Google...'
                  : 'تسجيل الدخول بحساب Google المعتمد'}
              </span>
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-white dark:bg-[#111C2E] text-slate-400">
                  أو الدخول بالبريد الإلكتروني وكلمة المرور
                </span>
              </div>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  البريد الإلكتروني الرسمي
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 pointer-events-none">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@domain.iq"
                    className="w-full pr-10 pl-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  كلمة المرور
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 pointer-events-none">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pr-10 pl-10 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute inset-y-0 left-2.5 flex items-center px-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || googleSubmitting}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors min-h-[44px]"
              >
                <LogIn className="w-4 h-4" />
                <span>{submitting ? 'جاري التحقق...' : 'دخول بالبريد الإلكتروني'}</span>
              </button>
            </form>

            {/* Security Policy Notice */}
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                التسجيل العام معطّل وفق سياسة الأمان؛ يتم إنشاء الحسابات وتحديد الصلاحيات حصرياً من قبل مدير النظام، وتنتهي الجلسة تلقائياً بعد 30 دقيقة من عدم النشاط.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
