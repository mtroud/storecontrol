import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';
import { LiveCameraScanner } from '../components/barcode/LiveCameraScanner';
import {
  PrintDocumentHeader,
  PrintSignatureFooter,
} from '../components/common/PrintDocumentHeader';
import { useAuth } from '../context/AuthContext';
import { CategoryRecord, subscribeToCategories } from '../services/categoriesService';
import {
  approveInventorySession,
  AuditMatchStatus,
  createInventorySession,
  finalizeInventoryMissingDevices,
  InventoryResultRecord,
  InventorySessionRecord,
  recordInventoryScan,
  subscribeToInventoryResults,
  subscribeToInventorySessions,
} from '../services/controlService';
import { DepartmentRecord, subscribeToDepartments } from '../services/departmentsService';
import { DeviceRecord, subscribeToDevices } from '../services/devicesService';
import { DeviceStorageStatus, UserRole } from '../types/inventory';

const MATCH_STATUS_LABELS: Record<AuditMatchStatus, string> = {
  MATCHED: 'مطابق للسجل',
  WRONG_LOCATION: 'في موقع/نطاق مختلف',
  MISSING: 'مفقود (لم يُمسح)',
  UNREGISTERED: 'غير مسجل بالنظام',
};

const SESSION_STATUS_LABELS: Record<InventorySessionRecord['status'], string> = {
  IN_PROGRESS: 'جاري الجرد',
  COMPLETED: 'مكتمل (بانتظار الاعتماد)',
  APPROVED: 'معتمد رسمياً',
};

export function InventoryAuditPage() {
  const { session } = useAuth();
  const isManagerOrAdmin =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER;
  const canScan =
    isManagerOrAdmin || session?.role === UserRole.WAREHOUSE_STAFF;

  const [sessions, setSessions] = useState<InventorySessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [results, setResults] = useState<InventoryResultRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [scopeType, setScopeType] = useState<'FULL' | 'CATEGORY' | 'DEPARTMENT'>('FULL');
  const [scopeTargetId, setScopeTargetId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [savingSession, setSavingSession] = useState(false);

  const [resultFilter, setResultFilter] = useState<'ALL' | AuditMatchStatus>('ALL');
  const [scanningBusy, setScanningBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    const unsubSess = subscribeToInventorySessions((list) => {
      setSessions(list);
      if (list.length > 0) {
        setSelectedSessionId((prev) => prev || list[0].id);
      }
    }, () => {});
    const unsubDevs = subscribeToDevices(setDevices, () => {});
    const unsubCats = subscribeToCategories(setCategories, () => {});
    const unsubDepts = subscribeToDepartments(setDepartments, () => {});

    return () => {
      unsubSess();
      unsubDevs();
      unsubCats();
      unsubDepts();
    };
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      setResults([]);
      return;
    }
    const unsub = subscribeToInventoryResults(
      selectedSessionId,
      setResults,
      (err) => setFeedback({ type: 'error', message: err.message })
    );
    return () => unsub();
  }, [selectedSessionId]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const expectedDevicesForScope = useMemo(() => {
    const active = devices.filter((d) => !d.isArchived);
    if (!activeSession) return active;
    if (activeSession.scopeType === 'CATEGORY') {
      return active.filter((d) => d.categoryId === activeSession.scopeTargetId);
    }
    if (activeSession.scopeType === 'DEPARTMENT') {
      return active.filter(
        (d) =>
          d.departmentId === activeSession.scopeTargetId &&
          d.storageStatus === DeviceStorageStatus.ISSUED
      );
    }
    return active;
  }, [devices, activeSession]);

  const computeExpectedCountForDraft = () => {
    const active = devices.filter((d) => !d.isArchived);
    if (scopeType === 'CATEGORY') {
      return active.filter((d) => d.categoryId === scopeTargetId).length;
    }
    if (scopeType === 'DEPARTMENT') {
      return active.filter(
        (d) =>
          d.departmentId === scopeTargetId &&
          d.storageStatus === DeviceStorageStatus.ISSUED
      ).length;
    }
    return active.length;
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSavingSession(true);

    let targetName = 'المخزن والشعب (جرد شامل)';
    if (scopeType === 'CATEGORY') {
      targetName = categories.find((c) => c.id === scopeTargetId)?.name || 'تصنيف محدد';
    } else if (scopeType === 'DEPARTMENT') {
      targetName = departments.find((d) => d.id === scopeTargetId)?.name || 'شعبة محددة';
    }

    try {
      const id = await createInventorySession({
        title: newTitle,
        scopeType,
        scopeTargetId: scopeType === 'FULL' ? '' : scopeTargetId,
        scopeTargetName: targetName,
        expectedCount: computeExpectedCountForDraft(),
        notes: newNotes,
        actorName: session?.fullName || 'مسؤول المخزن',
      });
      setSelectedSessionId(id);
      setCreateOpen(false);
      setNewTitle('');
      setNewNotes('');
      setFeedback({ type: 'success', message: 'تم فتح جلسة الجرد الإلكتروني بنجاح.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر إنشاء جلسة الجرد.',
      });
    } finally {
      setSavingSession(false);
    }
  };

  const handleScanCodeInSession = async (code: string) => {
    if (!activeSession) return;
    setScanningBusy(true);
    setFeedback(null);
    try {
      const res = await recordInventoryScan({
        session: activeSession,
        rawCode: code,
        actorName: session?.fullName || 'فريق الجرد',
        existingResults: results,
      });

      if (res.matchStatus === 'MATCHED') {
        setFeedback({
          type: 'success',
          message: `مطابق: ${res.scannedCode} — ${res.assetName}`,
        });
      } else if (res.matchStatus === 'WRONG_LOCATION') {
        setFeedback({
          type: 'warning',
          message: `تنبيه موقع: ${res.scannedCode} — ${res.notes}`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: `غير مسجل بالنظام: ${res.scannedCode}`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تسجيل عملية المسح.',
      });
    } finally {
      setScanningBusy(false);
    }
  };

  const handleFinalizeSession = async () => {
    if (!activeSession) return;
    setFeedback(null);
    try {
      const missingCount = await finalizeInventoryMissingDevices({
        session: activeSession,
        expectedDevices: expectedDevicesForScope,
        existingResults: results,
        actorName: session?.fullName || 'مسؤول المخزن',
      });
      setFeedback({
        type: 'success',
        message: `تم إنهاء الجرد وحساب الفروقات (الأجهزة المفقودة غير الممسوحة: ${missingCount}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر إنهاء جلسة الجرد.',
      });
    }
  };

  const handleApproveSession = async () => {
    if (!activeSession) return;
    setFeedback(null);
    try {
      await approveInventorySession(
        activeSession,
        session?.fullName || 'مسؤول المخزن'
      );
      setFeedback({
        type: 'success',
        message: `تم اعتماد نتائج جلسة الجرد ${activeSession.sessionCode} رسمياً.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر اعتماد الجلسة.',
      });
    }
  };

  const filteredResults = useMemo(() => {
    if (resultFilter === 'ALL') return results;
    return results.filter((r) => r.matchStatus === resultFilter);
  }, [results, resultFilter]);

  return (
    <div className="space-y-5">
      {activeSession && (
        <PrintDocumentHeader
          title={`تقرير محضر الجرد المخزني: ${activeSession.title}`}
          subtitle={`النطاق: ${activeSession.scopeTargetName} · الحالة: ${SESSION_STATUS_LABELS[activeSession.status]}`}
          docCode={activeSession.sessionCode}
          metaItems={[
            { label: 'المفترض', value: activeSession.expectedCount },
            { label: 'الممسوح', value: activeSession.scannedCount },
            { label: 'المطابق', value: activeSession.matchedCount },
            { label: 'المفقود', value: activeSession.missingCount },
            { label: 'المُصدِر', value: session?.fullName || 'مسؤول النظام' },
          ]}
        />
      )}

      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            الجرد المخزني الإلكتروني والمطابقة الميدانية
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            إجراء جرد شامل أو جزئي بمسح الباركود وQR ومقارنة الموجود الفعلي مع سجلات قاعدة البيانات.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة تقرير الجرد</span>
          </button>
          {isManagerOrAdmin && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
            >
              <Plus className="w-4 h-4" />
              <span>جلسة جرد جديدة</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 print:hidden ${
            feedback.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
              : feedback.type === 'warning'
                ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
                : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sessions Selector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 print:block">
        <div className="xl:col-span-4 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden print:hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
            جلسات الجرد ({sessions.length})
          </div>
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              لا توجد جلسات جرد مسجلة بعد. افتح جلسة جرد جديدة للبدء.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSessionId(s.id)}
                  className={`w-full text-right p-4 transition-colors ${
                    s.id === selectedSessionId
                      ? 'bg-slate-50 dark:bg-slate-800/70'
                      : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                      {s.sessionCode}
                    </span>
                    <span
                      className={`font-semibold ${
                        s.status === 'APPROVED'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : s.status === 'COMPLETED'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-blue-700 dark:text-blue-400'
                      }`}
                    >
                      {SESSION_STATUS_LABELS[s.status]}
                    </span>
                  </div>
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-1">
                    {s.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    النطاق: {s.scopeTargetName} · ممسوح {s.scannedCount} / {s.expectedCount}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active Audit Session Details */}
        <div className="xl:col-span-8 print:col-span-12 space-y-4">
          {!activeSession ? (
            <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
              <ClipboardCheck className="w-8 h-8 mx-auto text-slate-400" />
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                اختر جلسة جرد أو أنشئ جلسة جديدة
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                يُمكّنك الجرد الإلكتروني من مسح الأجهزة ميدانياً ومقارنة النتائج مع أرصدة النظام لاكتشاف الفروقات أو الأجهزة المفقودة.
              </p>
            </div>
          ) : (
            <>
              {/* Summary Metrics */}
              <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                      {activeSession.sessionCode} · {activeSession.scopeTargetName}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {activeSession.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-2 print:hidden">
                    {isManagerOrAdmin && activeSession.status === 'IN_PROGRESS' && (
                      <button
                        type="button"
                        onClick={() => void handleFinalizeSession()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>إنهاء الجرد وحساب المفقودات</span>
                      </button>
                    )}
                    {isManagerOrAdmin && activeSession.status === 'COMPLETED' && (
                      <button
                        type="button"
                        onClick={() => void handleApproveSession()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>اعتماد المسؤول النهائي</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  {[
                    { label: 'المفترض جرده', val: activeSession.expectedCount, cls: 'text-slate-900 dark:text-slate-100' },
                    { label: 'تم مسحه', val: activeSession.scannedCount, cls: 'text-blue-700 dark:text-blue-400' },
                    { label: 'مطابق', val: activeSession.matchedCount, cls: 'text-emerald-700 dark:text-emerald-400' },
                    { label: 'موقع مختلف / مفقود', val: activeSession.mismatchCount + activeSession.missingCount, cls: 'text-amber-700 dark:text-amber-400' },
                    { label: 'غير مسجل', val: activeSession.unregisteredCount, cls: 'text-red-700 dark:text-red-400' },
                  ].map((m) => (
                    <div key={m.label} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                      <div className="text-[11px] text-slate-500">{m.label}</div>
                      <div className={`text-lg font-bold font-mono-tabular mt-0.5 ${m.cls}`}>
                        {m.val}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Field Scanner for Active Session */}
              {canScan && activeSession.status !== 'APPROVED' && (
                <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 print:hidden">
                  <LiveCameraScanner
                    onScanCode={handleScanCodeInSession}
                    searching={scanningBusy}
                    autoFocusInput={false}
                  />
                </div>
              )}

              {/* Results & Variance Table */}
              <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    نتائج المسح والفروقات ({filteredResults.length})
                  </span>
                  <div className="inline-flex flex-wrap p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] print:hidden">
                    {(
                      [
                        { id: 'ALL', label: 'الكل' },
                        { id: 'MATCHED', label: 'مطابق' },
                        { id: 'WRONG_LOCATION', label: 'موقع مختلف' },
                        { id: 'MISSING', label: 'مفقود' },
                        { id: 'UNREGISTERED', label: 'غير مسجل' },
                      ] as Array<{ id: 'ALL' | AuditMatchStatus; label: string }>
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setResultFilter(t.id)}
                        className={`px-2.5 py-1 rounded font-medium ${
                          resultFilter === t.id
                            ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60] font-semibold'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredResults.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    لم يتم مسح أي بنود ضمن هذا التصنيف بعد.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                          <th className="py-2.5 px-3">رقم الجرد / الرمز</th>
                          <th className="py-2.5 px-3">اسم الجهاز</th>
                          <th className="py-2.5 px-3">الموقع المسجل</th>
                          <th className="py-2.5 px-3">حالة المطابقة</th>
                          <th className="py-2.5 px-3">الملاحظات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredResults.map((r) => (
                          <tr key={r.id}>
                            <td className="py-2.5 px-3 font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                              {r.scannedCode}
                            </td>
                            <td className="py-2.5 px-3 font-semibold">{r.assetName}</td>
                            <td className="py-2.5 px-3">{r.expectedLocation || '—'}</td>
                            <td className="py-2.5 px-3 font-semibold">
                              <span
                                className={
                                  r.matchStatus === 'MATCHED'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : r.matchStatus === 'WRONG_LOCATION'
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-red-700 dark:text-red-400'
                                }
                              >
                                {MATCH_STATUS_LABELS[r.matchStatus]}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{r.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {activeSession && (
                <PrintSignatureFooter
                  rightRole="لجنة الجرد الميداني"
                  centerRole="أمين المخزن"
                  leftRole="مصادقة مسؤول الشعبة"
                  leftName={activeSession.approvedByName || 'الختم والتوقيع'}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Audit Session Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="فتح جلسة جرد جديدة"
        >
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                إنشاء جلسة جرد إلكتروني جديدة
              </h3>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="إغلاق">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSession} className="p-5 space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  عنوان جلسة الجرد <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="مثال: الجرد الفصلي لشعبة السيطرة والإنترنت"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">نطاق الجرد</label>
                <select
                  value={scopeType}
                  onChange={(e) => {
                    const next = e.target.value as 'FULL' | 'CATEGORY' | 'DEPARTMENT';
                    setScopeType(next);
                    if (next === 'CATEGORY' && categories[0]) setScopeTargetId(categories[0].id);
                    if (next === 'DEPARTMENT' && departments[0]) setScopeTargetId(departments[0].id);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="FULL">جرد شامل لجميع الأجهزة النشطة</option>
                  <option value="CATEGORY">جرد جزئي حسب تصنيف محدد</option>
                  <option value="DEPARTMENT">جرد جزئي لعهدة شعبة محددة</option>
                </select>
              </div>

              {scopeType === 'CATEGORY' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">التصنيف</label>
                  <select
                    value={scopeTargetId}
                    onChange={(e) => setScopeTargetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {scopeType === 'DEPARTMENT' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">الشعبة</label>
                  <select
                    value={scopeTargetId}
                    onChange={(e) => setScopeTargetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-xs flex items-center justify-between">
                <span>عدد الأجهزة المتوقع جردها ضمن النطاق:</span>
                <span className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                  {computeExpectedCountForDraft()}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingSession}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingSession ? 'جاري الإنشاء...' : 'فتح جلسة الجرد'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
