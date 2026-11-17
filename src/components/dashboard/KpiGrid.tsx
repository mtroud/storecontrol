import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  Boxes,
  Building2,
  CheckCircle2,
  HardDrive,
  Layers,
  PackageMinus,
  ShieldAlert,
  Truck,
  Wrench,
} from 'lucide-react';
import { AppRouteId, DashboardKpis } from '../../types/inventory';

interface KpiGridProps {
  kpis: DashboardKpis;
  onNavigate: (route: AppRouteId) => void;
}

export function KpiGrid({ kpis, onNavigate }: KpiGridProps) {
  const cards: Array<{
    key: string;
    label: string;
    value: number;
    unit: string;
    icon: typeof HardDrive;
    tone: 'neutral' | 'success' | 'info' | 'warning' | 'danger';
    targetRoute: AppRouteId;
  }> = [
    {
      key: 'totalDevices',
      label: 'إجمالي الأجهزة والموجودات',
      value: kpis.totalDevices,
      unit: 'جهاز',
      icon: HardDrive,
      tone: 'neutral',
      targetRoute: 'devices',
    },
    {
      key: 'availableInWarehouse',
      label: 'المتوفرة في المخزن',
      value: kpis.availableInWarehouse,
      unit: 'جهاز',
      icon: CheckCircle2,
      tone: 'success',
      targetRoute: 'devices',
    },
    {
      key: 'issuedToUnits',
      label: 'المصروفة للشعب والوحدات',
      value: kpis.issuedToUnits,
      unit: 'جهاز',
      icon: Truck,
      tone: 'info',
      targetRoute: 'devices',
    },
    {
      key: 'inMaintenance',
      label: 'أجهزة قيد الصيانة',
      value: kpis.inMaintenance,
      unit: 'جهاز',
      icon: Wrench,
      tone: 'warning',
      targetRoute: 'maintenance',
    },
    {
      key: 'damagedDevices',
      label: 'الأجهزة التالفة',
      value: kpis.damagedDevices,
      unit: 'جهاز',
      icon: ShieldAlert,
      tone: 'danger',
      targetRoute: 'devices',
    },
    {
      key: 'consumableTypesCount',
      label: 'المواد الاستهلاكية المسجلة',
      value: kpis.consumableTypesCount,
      unit: 'صنف',
      icon: Boxes,
      tone: 'neutral',
      targetRoute: 'consumables',
    },
    {
      key: 'totalConsumableQuantity',
      label: 'إجمالي الكميات المتوفرة',
      value: kpis.totalConsumableQuantity,
      unit: 'وحدة قياس',
      icon: Layers,
      tone: 'info',
      targetRoute: 'consumables',
    },
    {
      key: 'registeredUnitsCount',
      label: 'الشعب والوحدات المسجلة',
      value: kpis.registeredUnitsCount,
      unit: 'جهة',
      icon: Building2,
      tone: 'neutral',
      targetRoute: 'departments',
    },
    {
      key: 'monthlyIssuesCount',
      label: 'عمليات الصرف (الفترة)',
      value: kpis.monthlyIssuesCount,
      unit: 'عملية',
      icon: PackageMinus,
      tone: 'info',
      targetRoute: 'stock-issue',
    },
    {
      key: 'monthlyReturnsCount',
      label: 'عمليات الإرجاع (الفترة)',
      value: kpis.monthlyReturnsCount,
      unit: 'عملية',
      icon: ArchiveRestore,
      tone: 'success',
      targetRoute: 'stock-return',
    },
    {
      key: 'needsMaintenanceCount',
      label: 'أجهزة تحتاج إلى صيانة',
      value: kpis.needsMaintenanceCount,
      unit: 'بلاغ',
      icon: AlertTriangle,
      tone: 'warning',
      targetRoute: 'maintenance',
    },
    {
      key: 'recentMovementsCount',
      label: 'الحركات المخزنية المسجلة',
      value: kpis.recentMovementsCount,
      unit: 'حركة',
      icon: Activity,
      tone: 'neutral',
      targetRoute: 'movements',
    },
  ];

  const getIconTone = (tone: 'neutral' | 'success' | 'info' | 'warning' | 'danger') => {
    switch (tone) {
      case 'success':
        return 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50';
      case 'info':
        return 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50';
      case 'warning':
        return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50';
      case 'danger':
        return 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/50';
      default:
        return 'text-[#0F2544] bg-slate-100 dark:text-[#D4AE60] dark:bg-slate-800/80';
    }
  };

  return (
    <section aria-label="المؤشرات الإحصائية للمخزن">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onNavigate(card.targetRoute)}
              className="group text-right p-4 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 hover:border-[#0F2544]/40 dark:hover:border-[#C59B47]/50 transition-colors flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-snug line-clamp-2">
                  {card.label}
                </span>
                <span
                  className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${getIconTone(
                    card.tone
                  )}`}
                >
                  <Icon className="w-4 h-4" />
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-2 w-full pt-1 border-t border-slate-100 dark:border-slate-800/70">
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono-tabular">
                  {card.value.toLocaleString('en-US')}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {card.unit}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
