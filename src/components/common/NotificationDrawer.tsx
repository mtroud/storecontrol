import { AlertTriangle, CheckCheck, Info, ShieldAlert, X } from 'lucide-react';
import { AppRouteId, SystemNotification } from '../../types/inventory';

interface NotificationDrawerProps {
  open: boolean;
  notifications: SystemNotification[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onSelectNotification: (notification: SystemNotification) => void;
}

export function NotificationDrawer({
  open,
  notifications,
  onClose,
  onMarkAllRead,
  onSelectNotification,
}: NotificationDrawerProps) {
  if (!open) return null;

  const getIcon = (severity: SystemNotification['severity']) => {
    if (severity === 'critical') return ShieldAlert;
    if (severity === 'warning') return AlertTriangle;
    return Info;
  };

  const getSeverityClasses = (severity: SystemNotification['severity']) => {
    if (severity === 'critical') {
      return 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/40';
    }
    if (severity === 'warning') {
      return 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40';
    }
    return 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/40';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="مركز الإشعارات"
    >
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-white dark:bg-[#111C2E] h-full border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col z-10">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              التنبيهات والإشعارات
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              متابعة الأرصدة الحرجة، الصيانة، وحركات الصرف
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق الإشعارات"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/30">
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            إجمالي التنبيهات: {notifications.length}
          </span>
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F2544] dark:text-[#D4AE60] hover:underline"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>تحديد الكل كمقروء</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              لا توجد إشعارات حالياً.
            </div>
          ) : (
            notifications.map((item) => {
              const Icon = getIcon(item.severity);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectNotification(item)}
                  className={`w-full text-right p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-start gap-3 ${
                    !item.read ? 'bg-slate-50/80 dark:bg-slate-800/30' : ''
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${getSeverityClasses(
                      item.severity
                    )}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.title}
                      </span>
                      {!item.read && (
                        <span className="text-[11px] font-medium text-[#0F2544] dark:text-[#D4AE60] shrink-0">
                          جديد
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {item.description}
                    </p>
                    <div className="text-[11px] text-slate-400 mt-1.5">{item.createdAt}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
