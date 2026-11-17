import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  Save,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isAppCheckConfigured } from '../lib/firebase';
import {
  BackupPayload,
  DEFAULT_SYSTEM_SETTINGS,
  exportFullDatabaseBackup,
  restoreDatabaseBackup,
  saveSystemSettings,
  subscribeToSystemSettings,
  SystemSettingsRecord,
  validateBackupFileJson,
} from '../services/adminService';
import { UserRole } from '../types/inventory';

export function SettingsPage() {
  const { session } = useAuth();
  const isAdmin = session?.role === UserRole.SYSTEM_ADMIN;

  const [settings, setSettings] = useState<SystemSettingsRecord>(DEFAULT_SYSTEM_SETTINGS);
  const [orgName, setOrgName] = useState(DEFAULT_SYSTEM_SETTINGS.organizationName);
  const [deptName, setDeptName] = useState(DEFAULT_SYSTEM_SETTINGS.departmentName);
  const [divName, setDivName] = useState(DEFAULT_SYSTEM_SETTINGS.divisionName);
  const [sessionTimeout, setSessionTimeout] = useState(
    DEFAULT_SYSTEM_SETTINGS.sessionTimeoutMinutes
  );
  const [invPrefix, setInvPrefix] = useState(DEFAULT_SYSTEM_SETTINGS.inventoryPrefix);
  const [lowStockAlerts, setLowStockAlerts] = useState(
    DEFAULT_SYSTEM_SETTINGS.lowStockAlertEnabled
  );
  const [backupDays, setBackupDays] = useState(
    DEFAULT_SYSTEM_SETTINGS.autoBackupReminderDays
  );

  const [savingSettings, setSavingSettings] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<BackupPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = subscribeToSystemSettings((loaded) => {
      setSettings(loaded);
      setOrgName(loaded.organizationName);
      setDeptName(loaded.departmentName);
      setDivName(loaded.divisionName);
      setSessionTimeout(loaded.sessionTimeoutMinutes);
      setInvPrefix(loaded.inventoryPrefix);
      setLowStockAlerts(loaded.lowStockAlertEnabled);
      setBackupDays(loaded.autoBackupReminderDays);
    });
    return () => unsub();
  }, []);

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-red-200 dark:border-red-900/60 p-10 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 mx-auto text-red-600 dark:text-red-400" />
        <h2 className="text-base font-bold">وصول مقصور على مدير النظام</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          تعديل إعدادات النظام وسياسة انتهاء الجلسة وإدارة النسخ الاحتياطي مخصص حصرياً لمدير النظام.
        </p>
      </div>
    );
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSavingSettings(true);
    try {
      await saveSystemSettings(settings, {
        organizationName: orgName,
        departmentName: deptName,
        divisionName: divName,
        sessionTimeoutMinutes: sessionTimeout,
        inventoryPrefix: invPrefix,
        lowStockAlertEnabled: lowStockAlerts,
        autoBackupReminderDays: backupDays,
      });
      setSuccessMsg('تم حفظ إعدادات النظام وسياسة الأمان في قاعدة البيانات بنجاح.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حفظ الإعدادات.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExportBackup = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setBackingUp(true);
    try {
      const res = await exportFullDatabaseBackup(
        session?.fullName || 'مدير النظام',
        settings
      );
      setSuccessMsg(
        `تم تصدير النسخة الاحتياطية الكاملة (${res.fileName}) متضمنة ${res.totalDocs} مستنداً.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تصدير النسخة الاحتياطية.');
    } finally {
      setBackingUp(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const text = await file.text();
      const parsed = validateBackupFileJson(text);
      setPendingBackup(parsed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر قراءة ملف النسخة الاحتياطية.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingBackup) return;
    setRestoring(true);
    setErrorMsg('');
    try {
      const count = await restoreDatabaseBackup(pendingBackup);
      setPendingBackup(null);
      setSuccessMsg(
        `تمت استعادة البيانات الأساسية بنجاح (${count} سجل تم تحديثه/دمجه دون المساس بالسجلات غير القابلة للتعديل).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر استعادة النسخة الاحتياطية.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          إعدادات النظام والنسخ الاحتياطي
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          إدارة الترويسة الرسمية للتقارير، سياسة انتهاء الجلسة الأمنية، الحماية عبر App Check، والنسخ الاحتياطي والاستعادة لقاعدة Firestore.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 text-xs sm:text-sm flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg('')} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg('')} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* General Settings Form */}
        <form
          onSubmit={handleSaveSettings}
          className="xl:col-span-7 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4 text-xs sm:text-sm"
        >
          <div className="font-bold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-100 dark:border-slate-800">
            الإعدادات المؤسساتية وسياسة الأمان
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">اسم الجهة العليا</label>
            <input
              type="text"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">القسم</label>
              <input
                type="text"
                required
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">الشعبة</label>
              <input
                type="text"
                required
                value={divName}
                onChange={(e) => setDivName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">
                انتهاء الجلسة (بالدقائق)
              </label>
              <select
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-tabular"
              >
                <option value={15}>15 دقيقة</option>
                <option value={30}>30 دقيقة (موصى به)</option>
                <option value={60}>60 دقيقة</option>
                <option value={120}>120 دقيقة</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">بادئة أرقام الجرد</label>
              <input
                type="text"
                dir="ltr"
                value={invPrefix}
                onChange={(e) => setInvPrefix(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">دورية النسخ (أيام)</label>
              <input
                type="number"
                min={1}
                max={90}
                value={backupDays}
                onChange={(e) => setBackupDays(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-tabular"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={lowStockAlerts}
              onChange={(e) => setLowStockAlerts(e.target.checked)}
            />
            <span>
              تفعيل توليد تنبيهات انخفاض المخزون تلقائياً عند صرف المواد الاستهلاكية
            </span>
          </label>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? 'جاري الحفظ...' : 'حفظ إعدادات النظام'}</span>
            </button>
          </div>
        </form>

        {/* Backup, Restore & App Check Panel */}
        <div className="xl:col-span-5 space-y-5">
          {/* App Check & Security Status */}
          <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
              <ShieldCheck className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60]" />
              <span>حالة الحماية (Firebase App Check)</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {isAppCheckConfigured
                ? 'تم ربط مفتاح reCAPTCHA v3 وتفعيل حماية App Check على طلبات Firestore وStorage.'
                : 'مكتبة App Check مهيأة في التطبيق، وتعمل بمجرد ضبط المتغير VITE_FIREBASE_APP_CHECK_SITE_KEY في إعدادات النشر.'}
            </p>
            <div className="text-xs font-mono-tabular p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
              الحالة:{' '}
              <span
                className={
                  isAppCheckConfigured
                    ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                    : 'text-amber-700 dark:text-amber-400 font-bold'
                }
              >
                {isAppCheckConfigured ? 'مفعّل' : 'جاهز للربط بالمفتاح الإنتاجي'}
              </span>
            </div>
          </div>

          {/* Database Backup & Restore */}
          <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
              <DatabaseBackup className="w-4 h-4 text-[#C59B47]" />
              <span>النسخ الاحتياطي والاستعادة لقاعدة البيانات</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              تصدير نسخة JSON كاملة شاملة الأجهزة والمواد والتصنيفات والشعب والوحدات والسندات والحركات وسجلات الصيانة والجرد، مع إمكانية الاستعادة الآمنة للجداول الأساسية.
            </p>

            {settings.lastBackupAt && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="text-slate-500">آخر نسخة احتياطية مسجلة:</div>
                <div className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                  {new Date(settings.lastBackupAt).toLocaleString('ar-IQ')}
                </div>
                {settings.lastBackupBy && (
                  <div className="text-[11px] text-slate-500">
                    بواسطة: {settings.lastBackupBy}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={backingUp}
                onClick={() => void handleExportBackup()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
              >
                <Download className="w-4 h-4" />
                <span>{backingUp ? 'جاري التصدير...' : 'تنزيل نسخة احتياطية'}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Upload className="w-4 h-4" />
                <span>استعادة من ملف JSON</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileSelected}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {pendingBackup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد استعادة النسخة الاحتياطية"
        >
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setPendingBackup(null)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تأكيد استعادة البيانات الأساسية
              </h3>
              <button
                type="button"
                onClick={() => setPendingBackup(null)}
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 leading-relaxed">
                سيتم دمج واستعادة التصنيفات، الشعب، الوحدات، المواد، الأرصدة، الأجهزة، وتذاكر الصيانة من الملف المؤرخ في{' '}
                <span className="font-mono-tabular font-bold">
                  {new Date(pendingBackup.exportedAt).toLocaleString('ar-IQ')}
                </span>
                .
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {Object.entries(pendingBackup.collections).map(([name, docs]) => (
                  <div
                    key={name}
                    className="p-2 rounded bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                  >
                    <span className="font-mono-tabular text-slate-600 dark:text-slate-300">
                      {name}
                    </span>
                    <span className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                      {docs.length}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPendingBackup(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={() => void handleConfirmRestore()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{restoring ? 'جاري الاستعادة...' : 'تأكيد الاستعادة الآمنة'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
