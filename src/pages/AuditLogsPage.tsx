import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Lock,
  Printer,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  PrintDocumentHeader,
  PrintSignatureFooter,
  PrintSignatureTriggerButton,
} from '../components/common/PrintDocumentHeader';
import { useAuth } from '../context/AuthContext';
import {
  AuditLogRecord,
  subscribeToAuditLogs,
} from '../services/adminService';
import { UserRole } from '../types/inventory';

function toIsoDate(ts: unknown): string {
  if (!ts) return '';
  if (typeof ts === 'string') return ts;
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
    return (ts as { toDate: () => Date }).toDate().toISOString();
  }
  return '';
}

function formatDisplay(ts: unknown): string {
  const iso = toIsoDate(ts);
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ar-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AuditLogsPage() {
  const { session } = useAuth();
  const isAdmin = session?.role === UserRole.SYSTEM_ADMIN;

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rowLimit, setRowLimit] = useState(200);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeToAuditLogs(
      rowLimit,
      (items) => {
        setLogs(items);
        setLoading(false);
      },
      (err) => {
        setErrorMsg(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [isAdmin, rowLimit]);

  const uniqueActions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action))).sort(),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((l) => {
      if (actionFilter !== 'ALL' && l.action !== actionFilter) return false;
      const dStr = toIsoDate(l.createdAt).slice(0, 10);
      if (dateFrom && dStr && dStr < dateFrom) return false;
      if (dateTo && dStr && dStr > dateTo) return false;
      if (!q) return true;
      return (
        l.action.toLowerCase().includes(q) ||
        (l.actorEmail || '').toLowerCase().includes(q) ||
        (l.targetCollection || '').toLowerCase().includes(q) ||
        (l.targetId || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q)
      );
    });
  }, [logs, actionFilter, dateFrom, dateTo, searchQuery]);

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-red-200 dark:border-red-900/60 p-10 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 mx-auto text-red-600 dark:text-red-400" />
        <h2 className="text-base font-bold">وصول مقصور على مدير النظام</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          سجل التدقيق الأمني ومراقبة عمليات الدخول والخروج وتعديل الصلاحيات متاح حصرياً لمدير النظام.
        </p>
      </div>
    );
  }

  const handleExportCsv = () => {
    const headers = [
      'معرف السجل',
      'الحدث',
      'البريد المنفذ',
      'المجموعة المستهدفة',
      'معرف السجل المستهدف',
      'التفاصيل',
      'التاريخ والوقت',
    ];
    const rows = filteredLogs.map((l) => [
      l.id,
      l.action,
      l.actorEmail || l.actorUid,
      l.targetCollection || '—',
      l.targetId || '—',
      l.details || '',
      formatDisplay(l.createdAt),
    ]);

    const csv =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `security-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <PrintDocumentHeader
        title="سجل التدقيق الأمني الشامل"
        subtitle="توثيق رسمي غير قابل للتعديل أو الحذف لأحداث النظام والصلاحيات"
        docCode="SEC-AUD"
        metaItems={[
          { label: 'عدد السجلات الظاهرة', value: filteredLogs.length },
          { label: 'المُصدِر', value: session?.fullName || 'مدير النظام' },
        ]}
      />

      {/* Header */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            سجل التدقيق الأمني الشامل
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            توثيق غير قابل للتعديل أو الحذف لجميع عمليات الدخول والخروج وتعديل الصلاحيات والتسويات والنسخ الاحتياطي.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>
          <PrintSignatureTriggerButton
            roleLabels={{
              organizer: 'مدير النظام / التدقيق الأمني',
              reviewer: 'التدقيق الفني / شعبة السيطرة',
              approver: 'مصادقة مدير القسم',
            }}
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة</span>
          </button>
        </div>
      </div>

      {/* Immutability banner */}
      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#111C2E] flex items-center justify-between gap-3 text-xs print:hidden">
        <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
          <Lock className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60] shrink-0" />
          <span>
            مقيد بقواعد أمان Firestore: مسموح بالإدراج فقط مع توقيت الخادم (<code className="font-mono-tabular">request.time</code>)، وممنوع التعديل أو الحذف نهائياً.
          </span>
        </div>
        <span className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60] shrink-0">
          {filteredLogs.length} سجل
        </span>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 text-xs flex items-center gap-2 print:hidden"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 print:hidden">
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالحدث، البريد الإلكتروني، أو التفاصيل..."
            className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
        >
          <option value="ALL">جميع الأحداث</option>
          {uniqueActions.map((act) => (
            <option key={act} value={act}>
              {act}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="من تاريخ"
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
        />

        <div className="flex gap-2">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="إلى تاريخ"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
          />
          <select
            value={rowLimit}
            onChange={(e) => setRowLimit(Number(e.target.value))}
            aria-label="عدد السجلات"
            className="px-2 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
          >
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">
            جاري تحميل سجل التدقيق الأمني...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <ShieldCheck className="w-8 h-8 mx-auto text-slate-400" />
            <div className="text-sm font-bold">لا توجد أحداث تدقيق مطابقة</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                  <th className="py-3 px-3">نوع الحدث</th>
                  <th className="py-3 px-3">المستخدم المنفذ</th>
                  <th className="py-3 px-3">المجموعة / السجل</th>
                  <th className="py-3 px-3">التفاصيل</th>
                  <th className="py-3 px-3">التوقيت الدقيق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60] whitespace-nowrap">
                      {l.action}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-[11px]" dir="ltr">
                      {l.actorEmail || l.actorUid}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-[11px] text-slate-500 whitespace-nowrap">
                      {l.targetCollection || '—'}
                      {l.targetId ? ` / ${l.targetId}` : ''}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                      {l.details || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-[11px] text-slate-500 whitespace-nowrap">
                      {formatDisplay(l.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PrintSignatureFooter
        rightRole="مدير النظام"
        centerRole="التدقيق والرقابة"
        leftRole="مصادقة مسؤول الشعبة"
      />
    </div>
  );
}
