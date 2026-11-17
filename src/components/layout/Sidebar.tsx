import {
  Activity,
  ArchiveRestore,
  ArrowLeftRight,
  Boxes,
  Building2,
  ClipboardCheck,
  FileBarChart2,
  FolderTree,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Moon,
  PackageMinus,
  PackagePlus,
  QrCode,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { NAV_GROUPS, NAV_ITEMS } from '../../constants/navigation';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { AppRouteId, USER_ROLE_LABELS } from '../../types/inventory';
import { InstitutionalEmblem } from '../brand/InstitutionalEmblem';

interface SidebarProps {
  activeRoute: AppRouteId;
  onNavigate: (route: AppRouteId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const ROUTE_ICONS: Record<AppRouteId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  devices: HardDrive,
  consumables: Boxes,
  categories: FolderTree,
  departments: Building2,
  'stock-entry': PackagePlus,
  'stock-issue': PackageMinus,
  'stock-return': ArchiveRestore,
  'asset-transfer': ArrowLeftRight,
  'inventory-audit': ClipboardCheck,
  maintenance: Wrench,
  'barcode-center': QrCode,
  movements: Activity,
  reports: FileBarChart2,
  users: Users,
  'audit-logs': ShieldCheck,
  settings: Settings,
};

export function Sidebar({
  activeRoute,
  onNavigate,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { session, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleSelect = (route: AppRouteId) => {
    onNavigate(route);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0F2544] text-slate-100 dark:bg-[#0B1526] border-l border-slate-200/10">
      {/* Institutional Header */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between gap-2">
        <InstitutionalEmblem size="md" showText inverted />
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="إغلاق القائمة الجانبية"
          className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* System Name Sub-banner */}
      <div className="px-4 py-2.5 border-b border-white/10 bg-black/15">
        <div className="text-[11px] font-medium text-[#D4AE60] truncate">
          الأمانة العامة للعتبة الحسينية المقدسة
        </div>
        <div className="text-xs font-semibold text-white/90 truncate mt-0.5">
          Sayed Mart · نظام جرد الموجودات
        </div>
      </div>

      {/* Navigation Groups */}
      <nav
        aria-label="القائمة الرئيسية للنظام"
        className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
      >
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter(
            (item) =>
              item.group === group.id &&
              (!session || item.allowedRoles.includes(session.role))
          );
          if (items.length === 0) return null;

          return (
            <div key={group.id}>
              <div className="px-3 mb-1.5 text-[11px] font-semibold text-slate-400">
                {group.title}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = ROUTE_ICONS[item.id];
                  const isActive = activeRoute === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-right min-h-[40px] ${
                          isActive
                            ? 'bg-white/12 text-white font-semibold border border-[#C59B47]/40'
                            : 'text-slate-300 hover:bg-white/8 hover:text-white border border-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-[#D4AE60]' : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {!item.phaseImplemented && (
                          <span className="text-[10px] font-mono-tabular text-slate-400 shrink-0">
                            م{item.phase}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer Utilities & Session */}
      <div className="p-3 border-t border-white/10 space-y-2 bg-black/15">
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors min-h-[40px]"
        >
          <span className="flex items-center gap-2">
            {theme === 'light' ? (
              <Moon className="w-4 h-4 text-[#D4AE60]" />
            ) : (
              <Sun className="w-4 h-4 text-[#D4AE60]" />
            )}
            <span>{theme === 'light' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'}</span>
          </span>
        </button>

        {session && (
          <div className="px-3 py-2.5 rounded-lg bg-white/5 border border-white/10">
            <div className="text-xs font-semibold text-white truncate">
              {session.fullName}
            </div>
            <div className="text-[11px] text-[#D4AE60] truncate mt-0.5">
              {USER_ROLE_LABELS[session.role]}
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="mt-2.5 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-red-500/15 text-red-200 hover:bg-red-500/25 border border-red-400/20 transition-colors min-h-[36px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[272px] shrink-0 h-screen sticky top-0 z-30 print:hidden">
        {sidebarContent}
      </aside>

      {/* Mobile / Tablet Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="القائمة الجانبية"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={onCloseMobile}
          />
          <div className="relative w-[285px] max-w-[85vw] h-full z-10 shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
