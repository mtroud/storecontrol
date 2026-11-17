import { useEffect, useState } from 'react';
import { InstitutionalEmblem } from './components/brand/InstitutionalEmblem';
import { NotificationDrawer } from './components/common/NotificationDrawer';
import { QuickScannerModal } from './components/common/QuickScannerModal';
import { MobileQuickBar } from './components/layout/MobileQuickBar';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AssetTransferPage } from './pages/AssetTransferPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { BarcodeCenterPage } from './pages/BarcodeCenterPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ConsumablesPage } from './pages/ConsumablesPage';
import { DashboardPage } from './pages/DashboardPage';
import { DepartmentsPage } from './pages/DepartmentsPage';
import { DevicesPage } from './pages/DevicesPage';
import { InventoryAuditPage } from './pages/InventoryAuditPage';
import { LoginPage } from './pages/LoginPage';
import { MaintenancePage } from './pages/MaintenancePage';
import { MovementsLogPage } from './pages/MovementsLogPage';
import { PhasePlaceholderPage } from './pages/PhasePlaceholderPage';
import { ReportsCenterPage } from './pages/ReportsCenterPage';
import { SettingsPage } from './pages/SettingsPage';
import { StockEntryPage } from './pages/StockEntryPage';
import { StockIssuePage } from './pages/StockIssuePage';
import { StockReturnPage } from './pages/StockReturnPage';
import { UsersPage } from './pages/UsersPage';
import {
  markAllNotificationsReadInDb,
  markNotificationReadInDb,
  subscribeToNotifications,
} from './services/dashboardService';
import { AppRouteId, SystemNotification } from './types/inventory';

function AuthenticatedShell() {
  const { isAuthenticated, authReady, recordActivity } = useAuth();
  const [activeRoute, setActiveRoute] = useState<AppRouteId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);

  // Track user activity to refresh session security policy timer
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleActivity = () => recordActivity();
    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [isAuthenticated, recordActivity]);

  // Subscribe to live Firestore notifications only when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      return;
    }

    const unsubscribe = subscribeToNotifications((items) => {
      setNotifications(items);
    });
    return () => unsubscribe();
  }, [isAuthenticated]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-[#0B1220] p-6">
        <InstitutionalEmblem size="lg" showText />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          جاري التحقق من جلسة المستخدم والاتصال بقاعدة البيانات...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) {
      void markAllNotificationsReadInDb(unreadIds);
    }
  };

  const handleSelectNotification = (notif: SystemNotification) => {
    if (!notif.read) {
      void markNotificationReadInDb(notif.id);
    }
    setNotificationsOpen(false);
    setActiveRoute(notif.targetRoute);
  };

  const renderActivePage = () => {
    switch (activeRoute) {
      case 'dashboard':
        return (
          <DashboardPage
            onNavigate={setActiveRoute}
            onOpenScanner={() => setScannerOpen(true)}
          />
        );
      case 'devices':
        return <DevicesPage />;
      case 'consumables':
        return <ConsumablesPage />;
      case 'categories':
        return <CategoriesPage />;
      case 'departments':
        return <DepartmentsPage />;
      case 'stock-entry':
        return <StockEntryPage />;
      case 'stock-issue':
        return <StockIssuePage />;
      case 'stock-return':
        return <StockReturnPage />;
      case 'asset-transfer':
        return <AssetTransferPage />;
      case 'barcode-center':
        return <BarcodeCenterPage />;
      case 'inventory-audit':
        return <InventoryAuditPage />;
      case 'maintenance':
        return <MaintenancePage />;
      case 'movements':
        return <MovementsLogPage />;
      case 'reports':
        return <ReportsCenterPage />;
      case 'users':
        return <UsersPage />;
      case 'audit-logs':
        return <AuditLogsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return (
          <PhasePlaceholderPage
            routeId={activeRoute}
            onReturnDashboard={() => setActiveRoute('dashboard')}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeRoute={activeRoute}
        onNavigate={setActiveRoute}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader
          activeRoute={activeRoute}
          unreadNotifications={unreadCount}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenScanner={() => setScannerOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 pb-20 md:pb-8 max-w-[1600px] w-full mx-auto">
          {renderActivePage()}
        </main>
      </div>

      <MobileQuickBar
        activeRoute={activeRoute}
        onNavigate={setActiveRoute}
        onOpenScanner={() => setScannerOpen(true)}
      />

      <QuickScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onNavigateToBarcodeCenter={(route) => setActiveRoute(route)}
      />

      <NotificationDrawer
        open={notificationsOpen}
        notifications={notifications}
        onClose={() => setNotificationsOpen(false)}
        onMarkAllRead={handleMarkAllRead}
        onSelectNotification={handleSelectNotification}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
