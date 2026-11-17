import { Bell, LogOut, Menu, Moon, QrCode, Sun } from 'lucide-react';
import { NAV_ITEMS } from '../../constants/navigation';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { AppRouteId, USER_ROLE_LABELS } from '../../types/inventory';

interface TopHeaderProps {
  activeRoute: AppRouteId;
  unreadNotifications: number;
  onOpenMobileMenu: () => void;
  onOpenScanner: () => void;
  onOpenNotifications: () => void;
}

export function TopHeader({
  activeRoute,
  unreadNotifications,
  onOpenMobileMenu,
  onOpenScanner,
  onOpenNotifications,
}: TopHeaderProps) {
  const { session, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const currentNav = NAV_ITEMS.find((item) => item.id === activeRoute);

  const lastActivityFormatted = session
    ? new Date(session.lastActivityAt).toLocaleTimeString('ar-IQ', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#111C2E]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 print:hidden">
      <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Right side in RTL: Mobile menu trigger + Contextual Breadcrumbs */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="فتح القائمة الجانبية"
            className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
              <span className="hidden sm:inline">مجمع سيد الشهداء (ع)</span>
              <span className="hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="hidden md:inline">شعبة السيطرة والإنترنت</span>
              <span className="hidden md:inline" aria-hidden="true">
                /
              </span>
              <span className="text-[#0F2544] dark:text-[#D4AE60] font-medium truncate">
                {currentNav?.label ?? 'لوحة التحكم'}
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
              {currentNav?.label ?? 'لوحة التحكم'}
            </h1>
          </div>
        </div>

        {/* Left side in RTL: Primary Scan Action, Notifications, Theme Toggle, Session */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenScanner}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] dark:hover:bg-[#D4AE60] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span>مسح باركود</span>
          </button>

          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label="الإشعارات والتنبيهات"
            className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-mono-tabular font-semibold flex items-center justify-center">
                {unreadNotifications}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'التبديل للوضع الداكن' : 'التبديل للوضع الفاتح'}
            className="hidden sm:flex p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[40px] min-w-[40px] items-center justify-center shrink-0"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {session && (
            <div className="hidden xl:flex items-center gap-3 pr-2 border-r border-slate-200 dark:border-slate-700">
              <div className="text-right">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {session.fullName}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono-tabular">
                  {USER_ROLE_LABELS[session.role]} · نشاط {lastActivityFormatted}
                </div>
              </div>
              <button
                type="button"
                onClick={() => logout()}
                title="تسجيل الخروج"
                aria-label="تسجيل الخروج"
                className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/40 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
