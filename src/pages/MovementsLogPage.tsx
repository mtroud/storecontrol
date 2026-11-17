import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Download,
  Lock,
  Printer,
  Search,
} from 'lucide-react';
import {
  PrintDocumentHeader,
  PrintSignatureFooter,
  PrintSignatureTriggerButton,
} from '../components/common/PrintDocumentHeader';
import {
  CentralMovementRecord,
  subscribeToCentralMovements,
} from '../services/controlService';
import { MOVEMENT_TYPE_LABELS, MovementType } from '../types/inventory';

type MovementFilter = 'ALL' | MovementType;

function formatTimestampIso(ts: unknown): string {
  if (!ts) return '';
  if (typeof ts === 'string') return ts;
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toISOString();
  }
  return '';
}

function formatTimestampDisplay(ts: unknown): string {
  const iso = formatTimestampIso(ts);
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ar-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MovementsLogPage() {
  const [movements, setMovements] = useState<CentralMovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<MovementFilter>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rowLimit, setRowLimit] = useState(150);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToCentralMovements(
      rowLimit,
      (rows) => {
        setMovements(rows);
        setLoading(false);
      },
      (err) => {
        setErrorMsg(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [rowLimit]);

  const filteredMovements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return movements.filter((m) => {
      if (typeFilter !== 'ALL' && m.type !== typeFilter) return false;

      const iso = formatTimestampIso(m.createdAt).slice(0, 10);
      if (dateFrom && iso && iso < dateFrom) return false;
      if (dateTo && iso && iso > dateTo) return false;

      if (!q) return true;
      return (
        m.movementNumber.toLowerCase().includes(q) ||
        m.inventoryCode.toLowerCase().includes(q) ||
        m.assetName.toLowerCase().includes(q) ||
        (m.voucherNumber || '').toLowerCase().includes(q) ||
        (m.recipientName || '').toLowerCase().includes(q) ||
        (m.performedByName || '').toLowerCase().includes(q) ||
        (m.previousLocation || '').toLowerCase().includes(q) ||
        (m.newLocation || '').toLowerCase().includes(q)
      );
    });
  }, [movements, typeFilter, dateFrom, dateTo, searchQuery]);

  const handleExportCsv = () => {
    const headers = [
      'رقم الحركة',
      'نوع الحركة',
      'رقم الجرد / المادة',
      'اسم الجهاز / المادة',
      'الموقع السابق',
      'الموقع الجديد',
      'المستلم',
      'رقم السند',
      'المنفذ',
      'التاريخ والوقت',
      'الملاحظات',
    ];
    const rows = filteredMovements.map((m) => [
      m.movementNumber,
      MOVEMENT_TYPE_LABELS[m.type] || m.type,
      m.inventoryCode,
      m.assetName,
      m.previousLocation || '',
      m.newLocation || '',
      m.recipientName || '',
      m.voucherNumber || '',
      m.performedByName || '',
      formatTimestampDisplay(m.createdAt),
      m.notes || '',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getMovementBadgeStyle = (type: MovementType) => {
    switch (type) {
      case MovementType.ENTRY:
        return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case MovementType.ISSUE:
        return 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case MovementType.RETURN:
      case MovementType.RECEIVE_FROM_MAINTENANCE:
        return 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800';
      case MovementType.TRANSFER:
        return 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
      case MovementType.SEND_TO_MAINTENANCE:
      case MovementType.ADJUSTMENT:
        return 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case MovementType.ARCHIVE:
        return 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800';
    }
  };

  return (
    <div className="space-y-5">
      <PrintDocumentHeader
        title="السجل المركزي لحركات الأجهزة والمواد"
        subtitle="التوثيق التسلسلي الرسمي لعمليات الإدخال والصرف والإرجاع والنقل والصيانة"
        docCode="MOV-LOG"
        metaItems={[
          { label: 'الحركات الظاهرة', value: filteredMovements.length },
        ]}
      />

      {/* Page Header */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            سجل حركات الأجهزة والمواد المركزي
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            توثيق تسلسلي لحظي لكافة عمليات الإدخال والصرف والإرجاع والنقل والصيانة والتسوية.
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
          <PrintSignatureTriggerButton />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة السجل</span>
          </button>
        </div>
      </div>

      {/* Immutability Security Banner */}
      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#111C2E] flex items-center justify-between gap-3 text-xs print:hidden">
        <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
          <Lock className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60] shrink-0" />
          <span>
            هذا السجل <strong className="font-bold">محمي من التعديل والحذف</strong> عبر قواعد الأمان (Firestore Security Rules) لضمان سلامة الأثر الرقابي وتاريخ العهدة.
          </span>
        </div>
        <span className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60] shrink-0">
          {filteredMovements.length} حركة
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

      {/* Multi-Filter Toolbar */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 print:hidden">
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الحركة، رقم الجرد، السند، المستلم، أو الموقع..."
            className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as MovementFilter)}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
        >
          <option value="ALL">جميع أنواع الحركات</option>
          {(Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[]).map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="من تاريخ"
          title="من تاريخ"
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
        />

        <div className="flex gap-2">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="إلى تاريخ"
            title="إلى تاريخ"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
          />
          <select
            value={rowLimit}
            onChange={(e) => setRowLimit(Number(e.target.value))}
            aria-label="الحد الأقصى للسجلات"
            className="px-2 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
          >
            <option value={100}>100</option>
            <option value={150}>150</option>
            <option value={300}>300</option>
            <option value={500}>500</option>
          </select>
        </div>
      </div>

      {/* Movements Table */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">
            جاري تحميل سجل الحركات المخزنية...
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Activity className="w-8 h-8 mx-auto text-slate-400" />
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
              لا توجد حركات مطابقة لمعايير البحث
            </div>
            <p className="text-xs text-slate-500">
              تُضاف الحركات تلقائياً عند تنفيذ أي عملية إدخال أو صرف أو إرجاع أو نقل أو صيانة.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                  <th className="py-3 px-3">رقم الحركة</th>
                  <th className="py-3 px-3">النوع</th>
                  <th className="py-3 px-3">رقم الجرد / المادة</th>
                  <th className="py-3 px-3">اسم الجهاز / المادة</th>
                  <th className="py-3 px-3">المسار (من ← إلى)</th>
                  <th className="py-3 px-3">المستلم</th>
                  <th className="py-3 px-3">السند</th>
                  <th className="py-3 px-3">المنفذ</th>
                  <th className="py-3 px-3">التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-3 font-mono-tabular font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {m.movementNumber}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[11px] font-semibold ${getMovementBadgeStyle(
                          m.type
                        )}`}
                      >
                        {MOVEMENT_TYPE_LABELS[m.type] || m.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60] whitespace-nowrap">
                      {m.inventoryCode}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {m.assetName}
                      </div>
                      {m.notes && (
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                          {m.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[11px]">
                      <span className="text-slate-500">{m.previousLocation || '—'}</span>
                      <span className="mx-1.5 text-[#C59B47] font-bold">←</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {m.newLocation || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3">{m.recipientName || '—'}</td>
                    <td className="py-3 px-3 font-mono-tabular text-[11px] text-slate-500 whitespace-nowrap">
                      {m.voucherNumber || '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {m.performedByName || '—'}
                    </td>
                    <td className="py-3 px-3 font-mono-tabular text-[11px] text-slate-500 whitespace-nowrap">
                      {formatTimestampDisplay(m.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PrintSignatureFooter />
    </div>
  );
}
