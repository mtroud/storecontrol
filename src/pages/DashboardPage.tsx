import { useEffect, useState } from 'react';
import { Calendar, Cloud, Database, ShieldCheck } from 'lucide-react';
import { DashboardCharts } from '../components/dashboard/DashboardCharts';
import { KpiGrid } from '../components/dashboard/KpiGrid';
import { QuickActionsBar } from '../components/dashboard/QuickActionsBar';
import { RecentActivityAndMaintenance } from '../components/dashboard/RecentActivityAndMaintenance';
import { useAuth } from '../context/AuthContext';
import { isAppCheckConfigured } from '../lib/firebase';
import {
  DashboardPeriod,
  getEmptyDashboardSnapshot,
  subscribeToDashboardData,
} from '../services/dashboardService';
import { AppRouteId, DashboardSnapshot } from '../types/inventory';

interface DashboardPageProps {
  onNavigate: (route: AppRouteId) => void;
  onOpenScanner: () => void;
}

export function DashboardPage({ onNavigate, onOpenScanner }: DashboardPageProps) {
  const { isAuthenticated } = useAuth();
  const [period, setPeriod] = useState<DashboardPeriod>('current_month');
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(() =>
    getEmptyDashboardSnapshot('current_month')
  );
  const [loading, setLoading] = useState(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    setLoading(true);
    setFirestoreError(null);

    const unsubscribe = subscribeToDashboardData(
      period,
      (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setFirestoreError(
          err.message.includes('Quota exceeded')
            ? 'تم تجاوز الحصة اليومية المجانية لقاعدة البيانات. سيتم إعادة الضبط في اليوم التالي.'
            : 'تعذر تحميل بعض بيانات المخزن من Cloud Firestore. تأكد من صلاحيات الحساب وقواعد الأمان.'
        );
      }
    );

    return () => unsubscribe();
  }, [isAuthenticated, period]);

  const periods: Array<{ id: DashboardPeriod; label: string }> = [
    { id: 'current_month', label: 'الشهر الحالي' },
    { id: 'quarter', label: 'الربع الحالي' },
    { id: 'year', label: 'السنة الحالية' },
  ];

  const isDatabaseEmpty =
    !loading &&
    snapshot.kpis.totalDevices === 0 &&
    snapshot.kpis.consumableTypesCount === 0 &&
    snapshot.kpis.registeredUnitsCount === 0;

  return (
    <div className="space-y-6">
      {/* Toolbar: Live Firestore Context + Period Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <Cloud className="w-3.5 h-3.5" />
              <span>متصل بـ Cloud Firestore</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0F2544] dark:text-[#D4AE60]" />
              <span>
                App Check: {isAppCheckConfigured ? 'مفعّل' : 'بانتظار مفتاح reCAPTCHA'}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">آخر مزامنة: {snapshot.lastUpdated}</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            نظرة شاملة ومباشرة على أرصدة المخزن، العهدة لدى الشعب والوحدات، وحالة الصيانة والحركات.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="تصفية الفترة الزمنية"
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-500 mx-1.5 hidden sm:block" />
            {periods.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPeriod(item.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  period === item.id
                    ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60] font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {firestoreError && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs sm:text-sm text-red-800 dark:text-red-200"
        >
          {firestoreError}
        </div>
      )}

      {/* Quick Operations Shortcuts */}
      <QuickActionsBar onNavigate={onNavigate} onOpenScanner={onOpenScanner} />

      {/* Clean Empty Database Callout (when Firestore collections are newly provisioned) */}
      {isDatabaseEmpty && (
        <div className="p-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0F2544]/10 dark:bg-[#C59B47]/15 text-[#0F2544] dark:text-[#D4AE60] flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                قاعدة البيانات السحابية متصلة وجاهزة
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                تم ربط Cloud Firestore وAuthentication وStorage بنجاح. لا توجد أجهزة أو مواد مسجلة بعد — ستظهر الإحصائيات الحية هنا تلقائياً بمجرد بدء إدخال الشعب والتصنيفات والأجهزة في المراحل القادمة.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('departments')}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
          >
            استعراض المرحلة التالية
          </button>
        </div>
      )}

      {/* 12 Real-Time Inventory KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div
              key={idx}
              className="h-[96px] rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between"
            >
              <div className="h-3 w-2/3 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-6 w-1/3 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <KpiGrid kpis={snapshot.kpis} onNavigate={onNavigate} />
      )}

      {/* 5 Analytical Charts */}
      <DashboardCharts
        byCategory={snapshot.byCategory}
        byStatus={snapshot.byStatus}
        byDepartment={snapshot.byDepartment}
        monthlyFlow={snapshot.monthlyFlow}
        topConsumables={snapshot.topConsumables}
      />

      {/* Recent Movements & Maintenance Watchlist */}
      <RecentActivityAndMaintenance
        recentMovements={snapshot.recentMovements}
        maintenanceWatchlist={snapshot.maintenanceWatchlist}
        onNavigate={onNavigate}
      />
    </div>
  );
}
