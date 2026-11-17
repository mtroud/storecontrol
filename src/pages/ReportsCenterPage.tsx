import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import { InstitutionalEmblem } from '../components/brand/InstitutionalEmblem';
import {
  PrintSignatureFooter,
  PrintSignatureTriggerButton,
} from '../components/common/PrintDocumentHeader';
import { useAuth } from '../context/AuthContext';
import { useSignatures } from '../context/SignatureContext';
import {
  buildReportData,
  exportReportExcel,
  exportReportPdf,
  fetchReportsDataset,
  REPORT_DEFINITIONS,
  REPORT_GROUPS,
  ReportFilters,
  ReportGroupId,
  ReportId,
  ReportsDataset,
} from '../services/reportsService';

const EMPTY_FILTERS: ReportFilters = {
  dateFrom: '',
  dateTo: '',
  departmentId: '',
  unitId: '',
  categoryId: '',
  recipientQuery: '',
  searchQuery: '',
};

export function ReportsCenterPage() {
  const { session } = useAuth();
  const { signatures } = useSignatures();
  const [dataset, setDataset] = useState<ReportsDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [activeGroup, setActiveGroup] = useState<ReportGroupId>('devices');
  const [selectedReportId, setSelectedReportId] = useState<ReportId>('RPT-01');
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [exportingPdf, setExportingPdf] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await fetchReportsDataset();
      setDataset(data);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'تعذر تحميل بيانات التقارير من قاعدة البيانات.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const groupReports = useMemo(
    () => REPORT_DEFINITIONS.filter((r) => r.group === activeGroup),
    [activeGroup]
  );

  const handleSelectGroup = (group: ReportGroupId) => {
    setActiveGroup(group);
    const first = REPORT_DEFINITIONS.find((r) => r.group === group);
    if (first) setSelectedReportId(first.id);
  };

  const availableUnits = useMemo(() => {
    if (!dataset) return [];
    if (!filters.departmentId) return dataset.units;
    return dataset.units.filter((u) => u.departmentId === filters.departmentId);
  }, [dataset, filters.departmentId]);

  const builtReport = useMemo(() => {
    if (!dataset) return null;
    return buildReportData(selectedReportId, dataset, filters);
  }, [dataset, selectedReportId, filters]);

  const activeFilterSummary = useMemo(() => {
    if (!dataset) return '';
    const parts: string[] = [];
    if (filters.dateFrom || filters.dateTo) {
      parts.push(`الفترة: ${filters.dateFrom || 'البداية'} إلى ${filters.dateTo || 'اليوم'}`);
    }
    if (filters.departmentId) {
      const dept = dataset.departments.find((d) => d.id === filters.departmentId)?.name;
      if (dept) parts.push(`الشعبة: ${dept}`);
    }
    if (filters.unitId) {
      const unit = dataset.units.find((u) => u.id === filters.unitId)?.name;
      if (unit) parts.push(`الوحدة: ${unit}`);
    }
    if (filters.categoryId) {
      const cat = dataset.categories.find((c) => c.id === filters.categoryId)?.name;
      if (cat) parts.push(`التصنيف: ${cat}`);
    }
    if (filters.recipientQuery.trim()) {
      parts.push(`المستلم: ${filters.recipientQuery.trim()}`);
    }
    return parts.join(' · ') || 'بدون قيود تصفية (كافة السجلات)';
  }, [dataset, filters]);

  const handleExportPdf = async () => {
    if (!builtReport) return;
    setExportingPdf(true);
    try {
      await exportReportPdf(
        builtReport,
        session?.fullName || 'مستخدم النظام',
        signatures
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = () => {
    if (!builtReport) return;
    exportReportExcel(builtReport);
  };

  return (
    <div className="space-y-5">
      {/* Header & Export Toolbar */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            مركز التقارير الرسمية (18 تقريراً مؤسساتياً)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            إصدار ومعاينة التقارير الرسمية للعتبة الحسينية المقدسة بتنسيق A4 مع التصدير إلى PDF وExcel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث البيانات</span>
          </button>

          <button
            type="button"
            disabled={!builtReport}
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            disabled={!builtReport || exportingPdf}
            onClick={() => void handleExportPdf()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileText className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60]" />
            <span>{exportingPdf ? 'جاري التجهيز...' : 'تصدير PDF (A4)'}</span>
          </button>

          <PrintSignatureTriggerButton
            roleLabels={{
              organizer: 'منظم التقرير / أمين المخزن',
              reviewer: 'مسؤول شعبة السيطرة والإنترنت',
              approver: 'مصادقة مدير قسم مجمع سيد الشهداء (ع)',
            }}
          />

          <button
            type="button"
            disabled={!builtReport}
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة رسمية A4</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 text-xs sm:text-sm flex items-center gap-2 print:hidden"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Report Groups + Picker */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex flex-wrap p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
            {REPORT_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => handleSelectGroup(g.id)}
                className={`px-3 py-1.5 rounded font-medium transition-colors whitespace-nowrap ${
                  activeGroup === g.id
                    ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60] font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
            18 تقريراً رسمياً معتمداً
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {groupReports.map((rep) => {
            const active = rep.id === selectedReportId;
            return (
              <button
                key={rep.id}
                type="button"
                onClick={() => setSelectedReportId(rep.id)}
                className={`text-right p-3 rounded-lg border transition-colors ${
                  active
                    ? 'border-[#0F2544] dark:border-[#C59B47] bg-[#0F2544]/5 dark:bg-[#C59B47]/10'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                    {rep.code}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {rep.orientation === 'landscape' ? 'أفقي A4' : 'عمودي A4'}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {rep.title}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                  {rep.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 space-y-3 print:hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            خيارات التصفية والنطاق
          </span>
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة تعيين التصفية</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 text-xs">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">من تاريخ</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-tabular"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-tabular"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">الشعبة</label>
            <select
              value={filters.departmentId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, departmentId: e.target.value, unitId: '' }))
              }
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="">كل الشعب</option>
              {dataset?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">الوحدة</label>
            <select
              value={filters.unitId}
              onChange={(e) => setFilters((f) => ({ ...f, unitId: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="">كل الوحدات</option>
              {availableUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">التصنيف</label>
            <select
              value={filters.categoryId}
              onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="">كل التصنيفات</option>
              {dataset?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">المستلم</label>
            <input
              type="text"
              value={filters.recipientQuery}
              onChange={(e) =>
                setFilters((f) => ({ ...f, recipientQuery: e.target.value }))
              }
              placeholder="اسم المستلم..."
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">بحث في النتائج</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filters.searchQuery}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, searchQuery: e.target.value }))
                }
                placeholder="تصفية نصية..."
                className="w-full pr-8 pl-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Official A4 Report Sheet Preview */}
      {loading || !builtReport ? (
        <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-12 text-center text-xs text-slate-500">
          جاري تجميع البيانات وإعداد معاينة التقرير الرسمي...
        </div>
      ) : (
        <div className="rounded-xl bg-white text-slate-900 border border-slate-300 dark:border-slate-700 p-6 sm:p-8 space-y-6 shadow-sm print:border-0 print:shadow-none print:p-0">
          {/* Official Institutional Letterhead */}
          <div className="pb-4 border-b-2 border-[#0F2544] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <InstitutionalEmblem size="md" showText={false} />
              <div>
                <div className="text-xs font-semibold text-slate-600">
                  الأمانة العامة للعتبة الحسينية المقدسة
                </div>
                <div className="text-sm font-bold text-[#0F2544]">
                  قسم مجمع سيد الشهداء (عليه السلام) الخدمي
                </div>
                <div className="text-xs text-slate-600">
                  شعبة السيطرة والإنترنت — إدارة المخزن والموجودات
                </div>
              </div>
            </div>

            <div className="text-left text-xs space-y-1">
              <div className="font-mono-tabular font-bold text-[#0F2544]">
                رمز التقرير: {builtReport.definition.code}
              </div>
              <div className="font-mono-tabular text-slate-600">
                تاريخ الإصدار: {new Date().toLocaleDateString('ar-IQ')}
              </div>
              <div className="text-slate-600">
                المُصدِر: {session?.fullName || 'مسؤول النظام'}
              </div>
            </div>
          </div>

          {/* Report Title & Filter Scope */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#0F2544]">
                {builtReport.definition.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {builtReport.definition.description}
              </p>
            </div>
            <div className="text-[11px] text-slate-600 bg-slate-50 px-3 py-1.5 rounded border border-slate-200">
              {activeFilterSummary}
            </div>
          </div>

          {/* Report Summary Strip */}
          {builtReport.summary.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {builtReport.summary.map((item) => (
                <div
                  key={item.label}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <div className="text-[11px] text-slate-500">{item.label}</div>
                  <div className="text-base font-bold font-mono-tabular text-[#0F2544] mt-0.5">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Data Table */}
          {builtReport.rows.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-300 rounded-lg space-y-2">
              <FileBarChart2 className="w-8 h-8 mx-auto text-slate-400" />
              <div className="text-sm font-bold text-slate-700">
                لا توجد سجلات مطابقة في هذا التقرير
              </div>
              <p className="text-xs text-slate-500">
                جرّب تعديل خيارات التصفية أو إضافة بيانات جديدة عبر صفحات النظام.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0F2544] text-white">
                    <th className="py-2.5 px-2.5 w-10">#</th>
                    {builtReport.headers.map((h) => (
                      <th key={h} className="py-2.5 px-2.5 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {builtReport.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={rIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                    >
                      <td className="py-2 px-2.5 font-mono-tabular text-slate-500">
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={`py-2 px-2.5 ${
                            cIdx === 0
                              ? 'font-mono-tabular font-semibold text-[#0F2544] whitespace-nowrap'
                              : ''
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Official 3-Signature Institutional Validation Block */}
          <PrintSignatureFooter
            forceVisible
            showInteractiveControls
            rightRole="منظم التقرير / أمين المخزن"
            centerRole="مسؤول شعبة السيطرة والإنترنت"
            leftRole="مصادقة مدير قسم مجمع سيد الشهداء (ع)"
            rightName={session?.fullName || 'الاسم والتوقيع'}
            centerName="التوقيع والختم"
            leftName="التوقيع والتاريخ"
          />
        </div>
      )}
    </div>
  );
}
