import { useState } from 'react';
import {
  CategoryDistributionItem,
  DepartmentDistributionItem,
  MonthlyFlowPoint,
  StatusDistributionItem,
  TopConsumableItem,
} from '../../types/inventory';

interface DashboardChartsProps {
  byCategory: CategoryDistributionItem[];
  byStatus: StatusDistributionItem[];
  byDepartment: DepartmentDistributionItem[];
  monthlyFlow: MonthlyFlowPoint[];
  topConsumables: TopConsumableItem[];
}

export function DashboardCharts({
  byCategory,
  byStatus,
  byDepartment,
  monthlyFlow,
  topConsumables,
}: DashboardChartsProps) {
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const totalStatusCount = byStatus.reduce((acc, item) => acc + item.count, 0);
  const maxCategoryCount = Math.max(...byCategory.map((c) => c.count), 1);
  const maxDeptCount = Math.max(...byDepartment.map((d) => d.deviceCount), 1);
  const maxMonthlyValue = Math.max(
    ...monthlyFlow.flatMap((m) => [m.issued, m.returned]),
    1
  );
  const maxConsumableIssued = Math.max(
    ...topConsumables.map((c) => c.issuedQuantity),
    1
  );

  // Build SVG Donut arcs
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <section aria-label="الرسوم البيانية والتحليلات" className="space-y-4">
      {/* Row 1: Monthly Issue vs Return Flow (wide) + Status Distribution (Donut) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Chart 4: حركة الصرف والإرجاع شهرياً */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                حركة الصرف والإرجاع شهرياً
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                مقارنة عدد عمليات الصرف والاسترجاع خلال آخر 6 أشهر
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#0F2544] dark:bg-[#3B82F6]" />
                <span>عمليات الصرف</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#C59B47]" />
                <span>عمليات الإرجاع</span>
              </span>
            </div>
          </div>

          {monthlyFlow.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              لا توجد بيانات حركة مسجلة لعرض الرسم البياني.
            </div>
          ) : (
            <div className="pt-6">
              <div className="grid grid-cols-6 gap-3 items-end h-52 px-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                {monthlyFlow.map((point) => {
                  const issuedPct = Math.round((point.issued / maxMonthlyValue) * 100);
                  const returnedPct = Math.round((point.returned / maxMonthlyValue) * 100);
                  const isHovered = hoveredMonth === point.monthLabel;

                  return (
                    <div
                      key={point.monthLabel}
                      onMouseEnter={() => setHoveredMonth(point.monthLabel)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      className="relative flex flex-col items-center justify-end h-full group cursor-default"
                    >
                      {isHovered && (
                        <div className="absolute -top-9 z-10 px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-mono-tabular whitespace-nowrap shadow-md">
                          صرف {point.issued} · إرجاع {point.returned}
                        </div>
                      )}
                      <div className="flex items-end gap-1.5 w-full justify-center h-40">
                        <div
                          style={{ height: `${Math.max(issuedPct, 8)}%` }}
                          className="w-4 sm:w-5 rounded-t bg-[#0F2544] dark:bg-[#3B82F6] transition-opacity group-hover:opacity-90"
                          title={`صرف: ${point.issued}`}
                        />
                        <div
                          style={{ height: `${Math.max(returnedPct, 8)}%` }}
                          className="w-4 sm:w-5 rounded-t bg-[#C59B47] transition-opacity group-hover:opacity-90"
                          title={`إرجاع: ${point.returned}`}
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
                        <span>{point.issued}</span>
                        <span>/</span>
                        <span>{point.returned}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-6 gap-3 px-2 pt-2 text-center">
                {monthlyFlow.map((point) => (
                  <span
                    key={point.monthLabel}
                    className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate"
                  >
                    {point.monthLabel}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart 2: توزيع الأجهزة حسب الحالة */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              توزيع الأجهزة حسب الحالة
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              نسبة الأجهزة المتوفرة والمصروفة وقيد الصيانة والتالفة
            </p>
          </div>

          {totalStatusCount === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              لا توجد أجهزة مسجلة حالياً.
            </div>
          ) : (
            <div className="py-4 flex flex-col sm:flex-row items-center gap-6">
              <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="16"
                    className="text-slate-100 dark:text-slate-800"
                  />
                  {byStatus.map((item) => {
                    const fraction = item.count / totalStatusCount;
                    const dashLength = fraction * circumference;
                    const strokeDasharray = `${dashLength} ${circumference - dashLength}`;
                    const strokeDashoffset = -cumulativeOffset;
                    cumulativeOffset += dashLength;

                    return (
                      <circle
                        key={item.status}
                        cx="70"
                        cy="70"
                        r={radius}
                        fill="transparent"
                        stroke={item.colorHex}
                        strokeWidth="16"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono-tabular">
                    {totalStatusCount}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    إجمالي الأجهزة
                  </span>
                </div>
              </div>

              <div className="flex-1 w-full space-y-2.5">
                {byStatus.map((item) => {
                  const pct = Math.round((item.count / totalStatusCount) * 100);
                  return (
                    <div
                      key={item.status}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: item.colorHex }}
                        />
                        <span className="text-slate-700 dark:text-slate-300 truncate">
                          {item.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono-tabular shrink-0">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.count}
                        </span>
                        <span className="text-slate-400 w-9 text-left">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Category Distribution + Department Distribution + Top Consumables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 1: توزيع الأجهزة حسب التصنيف */}
        <div className="p-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              توزيع الأجهزة حسب التصنيف
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              أكثر الفئات التقنية تواجداً في المخزن والعهدة
            </p>
          </div>
          {byCategory.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              لا توجد تصنيفات مسجلة بعد.
            </div>
          ) : (
            <div className="space-y-3">
              {byCategory.map((cat) => {
                const widthPct = Math.round((cat.count / maxCategoryCount) * 100);
                return (
                  <div key={cat.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                        {cat.name}
                      </span>
                      <span className="font-mono-tabular text-slate-900 dark:text-slate-100 font-semibold shrink-0">
                        {cat.count} · {cat.percentage}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#0F2544] dark:bg-[#C59B47]"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 3: توزيع الأجهزة حسب الشعب والوحدات */}
        <div className="p-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              توزيع الأجهزة حسب الشعب والوحدات
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              العهدة التقنية المصروفة لكل شعبة ووحداتها
            </p>
          </div>
          {byDepartment.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              لا توجد عهد مصروفة للشعب حالياً.
            </div>
          ) : (
            <div className="space-y-3">
              {byDepartment.map((dept) => {
                const widthPct = Math.round((dept.deviceCount / maxDeptCount) * 100);
                return (
                  <div key={dept.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                        {dept.departmentName}
                      </span>
                      <span className="font-mono-tabular text-slate-900 dark:text-slate-100 font-semibold shrink-0">
                        {dept.deviceCount} جهاز · {dept.unitsCount} وحدات
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-700 dark:bg-blue-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 5: المواد الأكثر صرفاً */}
        <div className="p-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              المواد الاستهلاكية الأكثر صرفاً
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              مقارنة الكمية المصروفة مع الرصيد المتاح حالياً
            </p>
          </div>
          {topConsumables.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              لا توجد عمليات صرف مواد مسجلة.
            </div>
          ) : (
            <div className="space-y-3">
              {topConsumables.map((item) => {
                const widthPct = Math.round(
                  (item.issuedQuantity / maxConsumableIssued) * 100
                );
                return (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                        {item.name}
                      </span>
                      <span className="font-mono-tabular text-slate-900 dark:text-slate-100 font-semibold shrink-0">
                        {item.issuedQuantity.toLocaleString('en-US')} {item.unit}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-700 dark:bg-emerald-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono-tabular">
                      {item.code} · المتبقي بالمخزن: {item.remainingQuantity.toLocaleString('en-US')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
