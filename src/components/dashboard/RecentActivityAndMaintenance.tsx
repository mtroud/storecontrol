import { ArrowUpLeft } from 'lucide-react';
import {
  AppRouteId,
  MAINTENANCE_STATUS_LABELS,
  MOVEMENT_TYPE_LABELS,
  MaintenanceStatus,
  MaintenanceWatchItem,
  MovementType,
  RecentMovementItem,
} from '../../types/inventory';

interface RecentActivityAndMaintenanceProps {
  recentMovements: RecentMovementItem[];
  maintenanceWatchlist: MaintenanceWatchItem[];
  onNavigate: (route: AppRouteId) => void;
}

export function RecentActivityAndMaintenance({
  recentMovements,
  maintenanceWatchlist,
  onNavigate,
}: RecentActivityAndMaintenanceProps) {
  const getMovementColor = (type: MovementType) => {
    switch (type) {
      case MovementType.ISSUE:
        return 'text-blue-700 dark:text-blue-400';
      case MovementType.RETURN:
        return 'text-emerald-700 dark:text-emerald-400';
      case MovementType.SEND_TO_MAINTENANCE:
        return 'text-amber-700 dark:text-amber-400';
      case MovementType.TRANSFER:
        return 'text-indigo-700 dark:text-indigo-400';
      default:
        return 'text-slate-700 dark:text-slate-300';
    }
  };

  const getMaintenanceColor = (status: MaintenanceStatus) => {
    switch (status) {
      case MaintenanceStatus.NEEDS_MAINTENANCE:
        return 'text-red-700 dark:text-red-400';
      case MaintenanceStatus.IN_PROGRESS:
        return 'text-amber-700 dark:text-amber-400';
      case MaintenanceStatus.COMPLETED:
        return 'text-emerald-700 dark:text-emerald-400';
      case MaintenanceStatus.UNREPAIRABLE:
        return 'text-slate-600 dark:text-slate-400';
    }
  };

  return (
    <section
      aria-label="آخر الحركات المخزنية والأجهزة التي تحتاج إلى صيانة"
      className="grid grid-cols-1 xl:grid-cols-12 gap-4"
    >
      {/* Table 1: آخر الحركات المخزنية */}
      <div className="xl:col-span-7 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              آخر الحركات المخزنية
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              سجل غير قابل للتعديل لعمليات الإدخال والصرف والإرجاع والنقل
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('movements')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F2544] dark:text-[#D4AE60] hover:underline whitespace-nowrap shrink-0"
          >
            <span>عرض السجل الكامل</span>
            <ArrowUpLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentMovements.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            لا توجد حركات مخزنية مسجلة في هذه الفترة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 whitespace-nowrap">رقم الجرد</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">الجهاز / المادة</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">نوع الحركة</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">المستلم / الجهة</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {recentMovements.map((mov) => (
                  <tr
                    key={mov.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-[#0F2544] dark:text-[#D4AE60] whitespace-nowrap">
                      {mov.inventoryCode}
                    </td>
                    <td className="py-3 px-4 text-slate-900 dark:text-slate-100 font-medium min-w-[180px]">
                      <div>{mov.assetName}</div>
                      <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
                        سند {mov.voucherNumber}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`font-semibold ${getMovementColor(mov.type)}`}>
                        {MOVEMENT_TYPE_LABELS[mov.type]}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 min-w-[160px]">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {mov.recipientName}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                        {mov.newLocation}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono-tabular whitespace-nowrap">
                      {mov.timestamp}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Table 2: الأجهزة التي تحتاج إلى صيانة */}
      <div className="xl:col-span-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              الأجهزة التي تحتاج إلى صيانة
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              قائمة المتابعة الفنية والأعطال الجارية
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('maintenance')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F2544] dark:text-[#D4AE60] hover:underline whitespace-nowrap shrink-0"
          >
            <span>قسم الصيانة</span>
            <ArrowUpLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {maintenanceWatchlist.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            لا توجد أجهزة مسجلة في قائمة الصيانة حالياً.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {maintenanceWatchlist.map((item) => (
              <div
                key={item.id}
                className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono-tabular font-semibold text-[#0F2544] dark:text-[#D4AE60]">
                      {item.inventoryCode}
                    </span>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                      ·
                    </span>
                    <span className="font-mono-tabular text-slate-400">{item.sentDate}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                    {item.deviceName}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {item.faultType}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 truncate">
                    {item.assignedUnit}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold whitespace-nowrap shrink-0 ${getMaintenanceColor(
                    item.status
                  )}`}
                >
                  {MAINTENANCE_STATUS_LABELS[item.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
