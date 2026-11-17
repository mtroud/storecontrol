import { HardDrive, LayoutDashboard, PackageMinus, QrCode } from 'lucide-react';
import { AppRouteId } from '../../types/inventory';

interface MobileQuickBarProps {
  activeRoute: AppRouteId;
  onNavigate: (route: AppRouteId) => void;
  onOpenScanner: () => void;
}

export function MobileQuickBar({
  activeRoute,
  onNavigate,
  onOpenScanner,
}: MobileQuickBarProps) {
  return (
    <nav
      aria-label="شريط الوصول السريع للهاتف"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 dark:bg-[#111C2E]/95 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 print:hidden"
    >
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
          activeRoute === 'dashboard'
            ? 'text-[#0F2544] dark:text-[#D4AE60] font-semibold'
            : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        <LayoutDashboard className="w-4 h-4" />
        <span>الرئيسية</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('devices')}
        className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
          activeRoute === 'devices'
            ? 'text-[#0F2544] dark:text-[#D4AE60] font-semibold'
            : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        <HardDrive className="w-4 h-4" />
        <span>الأجهزة</span>
      </button>

      <button
        type="button"
        onClick={onOpenScanner}
        className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#0F2544] dark:text-[#D4AE60]"
      >
        <QrCode className="w-4 h-4" />
        <span>مسح رمز</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('stock-issue')}
        className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
          activeRoute === 'stock-issue'
            ? 'text-[#0F2544] dark:text-[#D4AE60] font-semibold'
            : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        <PackageMinus className="w-4 h-4" />
        <span>صرف</span>
      </button>
    </nav>
  );
}
