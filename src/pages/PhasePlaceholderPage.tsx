import { ArrowRight, CheckCircle2, Layers } from 'lucide-react';
import { NAV_ITEMS } from '../constants/navigation';
import { AppRouteId } from '../types/inventory';

interface PhasePlaceholderPageProps {
  routeId: AppRouteId;
  onReturnDashboard: () => void;
}

export function PhasePlaceholderPage({
  routeId,
  onReturnDashboard,
}: PhasePlaceholderPageProps) {
  const navConfig = NAV_ITEMS.find((item) => item.id === routeId);

  if (!navConfig) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-[#0F2544] text-[#D4AE60] flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#B88E3F] dark:text-[#D4AE60]">
                مجدول للتنفيذ في المرحلة {navConfig.phase}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {navConfig.label}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onReturnDashboard}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] transition-colors whitespace-nowrap min-h-[40px]"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى لوحة التحكم</span>
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {navConfig.description}
        </p>

        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            المتطلبات المخططة لهذه الوحدة:
          </div>
          <ul className="space-y-2">
            {navConfig.plannedFeatures.map((feat) => (
              <li
                key={feat}
                className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
