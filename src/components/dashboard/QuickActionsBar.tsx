import {
  ArchiveRestore,
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  PackageMinus,
  PlusSquare,
  QrCode,
} from 'lucide-react';
import { AppRouteId } from '../../types/inventory';

interface QuickActionsBarProps {
  onNavigate: (route: AppRouteId) => void;
  onOpenScanner: () => void;
}

export function QuickActionsBar({
  onNavigate,
  onOpenScanner,
}: QuickActionsBarProps) {
  const actions: Array<{
    id: string;
    label: string;
    icon: typeof PlusSquare;
    primary?: boolean;
    onClick: () => void;
  }> = [
    {
      id: 'new-device',
      label: 'تسجيل جهاز جديد',
      icon: PlusSquare,
      primary: true,
      onClick: () => onNavigate('stock-entry'),
    },
    {
      id: 'add-consumable',
      label: 'إضافة مادة',
      icon: Boxes,
      onClick: () => onNavigate('consumables'),
    },
    {
      id: 'issue-device',
      label: 'صرف جهاز',
      icon: PackageMinus,
      onClick: () => onNavigate('stock-issue'),
    },
    {
      id: 'return-device',
      label: 'إرجاع جهاز',
      icon: ArchiveRestore,
      onClick: () => onNavigate('stock-return'),
    },
    {
      id: 'transfer-device',
      label: 'نقل جهاز',
      icon: ArrowLeftRight,
      onClick: () => onNavigate('asset-transfer'),
    },
    {
      id: 'inventory-audit',
      label: 'جرد المخزن',
      icon: ClipboardCheck,
      onClick: () => onNavigate('inventory-audit'),
    },
    {
      id: 'scan-barcode',
      label: 'مسح باركود',
      icon: QrCode,
      onClick: onOpenScanner,
    },
  ];

  return (
    <section aria-label="اختصارات العمليات السريعة">
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
                action.primary
                  ? 'bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] dark:hover:bg-[#D4AE60] font-semibold'
                  : 'bg-white dark:bg-[#111C2E] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:border-[#0F2544]/40 dark:hover:border-[#C59B47]/50 hover:bg-slate-50 dark:hover:bg-slate-800/70'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  action.primary
                    ? 'text-[#D4AE60] dark:text-[#0B1220]'
                    : 'text-[#0F2544] dark:text-[#D4AE60]'
                }`}
              />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
