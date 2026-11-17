import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import {
  CategoryDistributionItem,
  DashboardSnapshot,
  DepartmentDistributionItem,
  DeviceStorageStatus,
  MaintenanceStatus,
  MaintenanceWatchItem,
  MonthlyFlowPoint,
  MovementType,
  RecentMovementItem,
  StatusDistributionItem,
  SystemNotification,
  TopConsumableItem,
} from '../types/inventory';

export type DashboardPeriod = 'current_month' | 'quarter' | 'year';

interface RawDeviceDoc {
  id: string;
  name?: string;
  categoryId?: string;
  storageStatus?: DeviceStorageStatus;
  departmentId?: string;
  isArchived?: boolean;
}

interface RawItemDoc {
  id: string;
  itemCode?: string;
  name?: string;
  unitOfMeasure?: string;
  isArchived?: boolean;
}

interface RawBalanceDoc {
  itemId: string;
  currentQuantity?: number;
}

interface RawCategoryDoc {
  id: string;
  name?: string;
}

interface RawDepartmentDoc {
  id: string;
  name?: string;
}

interface RawUnitDoc {
  id: string;
  departmentId?: string;
}

interface RawMovementDoc {
  id: string;
  movementNumber?: string;
  type?: MovementType;
  inventoryCode?: string;
  assetName?: string;
  previousLocation?: string;
  newLocation?: string;
  recipientName?: string;
  voucherNumber?: string;
  performedByName?: string;
  createdAt?: { toDate?: () => Date } | string;
}

interface RawMaintenanceDoc {
  id: string;
  inventoryCode?: string;
  deviceName?: string;
  faultType?: string;
  sentDate?: string;
  assignedUnit?: string;
  status?: MaintenanceStatus;
}

const ARABIC_MONTHS = [
  'كانون 2',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين 1',
  'تشرين 2',
  'كانون 1',
];

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') return fn();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function isWithinPeriod(date: Date | null, period: DashboardPeriod): boolean {
  if (!date) return true;
  const now = new Date();
  if (period === 'current_month') {
    return (
      date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    );
  }
  if (period === 'quarter') {
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const dateQuarter = Math.floor(date.getMonth() / 3);
    return date.getFullYear() === now.getFullYear() && dateQuarter === currentQuarter;
  }
  return date.getFullYear() === now.getFullYear();
}

export function getEmptyDashboardSnapshot(period: DashboardPeriod): DashboardSnapshot {
  const periodLabel =
    period === 'current_month'
      ? 'الشهر الحالي'
      : period === 'quarter'
        ? 'الربع الحالي'
        : 'السنة الحالية';

  return {
    periodLabel,
    lastUpdated: new Date().toLocaleTimeString('ar-IQ', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    kpis: {
      totalDevices: 0,
      availableInWarehouse: 0,
      issuedToUnits: 0,
      inMaintenance: 0,
      damagedDevices: 0,
      consumableTypesCount: 0,
      totalConsumableQuantity: 0,
      registeredUnitsCount: 0,
      monthlyIssuesCount: 0,
      monthlyReturnsCount: 0,
      needsMaintenanceCount: 0,
      recentMovementsCount: 0,
    },
    byCategory: [],
    byStatus: [],
    byDepartment: [],
    monthlyFlow: [],
    topConsumables: [],
    recentMovements: [],
    maintenanceWatchlist: [],
  };
}

export function subscribeToDashboardData(
  period: DashboardPeriod,
  onSnapshotUpdate: (snapshot: DashboardSnapshot) => void,
  onError: (err: Error) => void
): () => void {
  let devices: RawDeviceDoc[] = [];
  let items: RawItemDoc[] = [];
  let balances: RawBalanceDoc[] = [];
  let categories: RawCategoryDoc[] = [];
  let departments: RawDepartmentDoc[] = [];
  let units: RawUnitDoc[] = [];
  let movements: RawMovementDoc[] = [];
  let maintenance: RawMaintenanceDoc[] = [];

  const recompute = () => {
    const activeDevices = devices.filter((d) => !d.isArchived);
    const availableInWarehouse = activeDevices.filter(
      (d) => d.storageStatus === DeviceStorageStatus.IN_WAREHOUSE
    ).length;
    const issuedToUnits = activeDevices.filter(
      (d) => d.storageStatus === DeviceStorageStatus.ISSUED
    ).length;
    const inMaintenance = activeDevices.filter(
      (d) => d.storageStatus === DeviceStorageStatus.IN_MAINTENANCE
    ).length;
    const damagedDevices = activeDevices.filter(
      (d) => d.storageStatus === DeviceStorageStatus.DAMAGED
    ).length;

    const activeItems = items.filter((i) => !i.isArchived);
    const balanceMap = new Map<string, number>();
    balances.forEach((b) => {
      balanceMap.set(b.itemId, Number(b.currentQuantity || 0));
    });
    const totalConsumableQuantity = activeItems.reduce(
      (sum, item) => sum + (balanceMap.get(item.id) || 0),
      0
    );

    const periodMovements = movements.filter((m) =>
      isWithinPeriod(parseDateValue(m.createdAt), period)
    );
    const monthlyIssuesCount = periodMovements.filter(
      (m) => m.type === MovementType.ISSUE
    ).length;
    const monthlyReturnsCount = periodMovements.filter(
      (m) => m.type === MovementType.RETURN
    ).length;

    const needsMaintenanceRecords = maintenance.filter(
      (m) =>
        m.status === MaintenanceStatus.NEEDS_MAINTENANCE ||
        m.status === MaintenanceStatus.IN_PROGRESS
    );

    // Category breakdown
    const catNameMap = new Map<string, string>();
    categories.forEach((c) => catNameMap.set(c.id, c.name || c.id));
    const catCounts = new Map<string, number>();
    activeDevices.forEach((d) => {
      if (!d.categoryId) return;
      catCounts.set(d.categoryId, (catCounts.get(d.categoryId) || 0) + 1);
    });
    const totalDevCount = activeDevices.length || 1;
    const byCategory: CategoryDistributionItem[] = Array.from(catCounts.entries())
      .map(([catId, count]) => ({
        id: catId,
        name: catNameMap.get(catId) || 'غير مصنف',
        count,
        percentage: Math.round((count / totalDevCount) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Status breakdown
    const byStatus: StatusDistributionItem[] =
      activeDevices.length === 0
        ? []
        : [
            {
              status: DeviceStorageStatus.ISSUED,
              label: 'مصروفة للشعب والوحدات',
              count: issuedToUnits,
              colorHex: '#1D4ED8',
            },
            {
              status: DeviceStorageStatus.IN_WAREHOUSE,
              label: 'متوفرة في المخزن',
              count: availableInWarehouse,
              colorHex: '#15803D',
            },
            {
              status: DeviceStorageStatus.IN_MAINTENANCE,
              label: 'قيد الصيانة',
              count: inMaintenance,
              colorHex: '#D97706',
            },
            {
              status: DeviceStorageStatus.DAMAGED,
              label: 'تالفة / خارج الخدمة',
              count: damagedDevices,
              colorHex: '#DC2626',
            },
          ];

    // Department breakdown
    const deptUnitCounts = new Map<string, number>();
    units.forEach((u) => {
      if (u.departmentId) {
        deptUnitCounts.set(u.departmentId, (deptUnitCounts.get(u.departmentId) || 0) + 1);
      }
    });
    const deptDeviceCounts = new Map<string, number>();
    activeDevices.forEach((d) => {
      if (d.departmentId && d.storageStatus === DeviceStorageStatus.ISSUED) {
        deptDeviceCounts.set(
          d.departmentId,
          (deptDeviceCounts.get(d.departmentId) || 0) + 1
        );
      }
    });
    const byDepartment: DepartmentDistributionItem[] = departments
      .map((dept) => ({
        id: dept.id,
        departmentName: dept.name || dept.id,
        deviceCount: deptDeviceCounts.get(dept.id) || 0,
        unitsCount: deptUnitCounts.get(dept.id) || 0,
      }))
      .filter((d) => d.deviceCount > 0 || d.unitsCount > 0)
      .sort((a, b) => b.deviceCount - a.deviceCount)
      .slice(0, 5);

    // Monthly Flow (last 6 months)
    const now = new Date();
    const monthlyFlow: MonthlyFlowPoint[] = [];
    if (movements.length > 0) {
      for (let i = 5; i >= 0; i -= 1) {
        const refDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = refDate.getFullYear();
        const m = refDate.getMonth();
        const monthMovements = movements.filter((mv) => {
          const dt = parseDateValue(mv.createdAt);
          return dt && dt.getFullYear() === y && dt.getMonth() === m;
        });
        monthlyFlow.push({
          monthLabel: ARABIC_MONTHS[m] || `${m + 1}`,
          issued: monthMovements.filter((mv) => mv.type === MovementType.ISSUE).length,
          returned: monthMovements.filter((mv) => mv.type === MovementType.RETURN).length,
        });
      }
    }

    // Top consumables
    const topConsumables: TopConsumableItem[] = activeItems
      .map((item) => ({
        id: item.id,
        code: item.itemCode || item.id,
        name: item.name || 'مادة مخزنية',
        unit: item.unitOfMeasure || 'قطعة',
        issuedQuantity: 0,
        remainingQuantity: balanceMap.get(item.id) || 0,
      }))
      .slice(0, 5);

    // Recent movements
    const recentMovements: RecentMovementItem[] = movements.slice(0, 8).map((mv) => {
      const dt = parseDateValue(mv.createdAt);
      const formattedDate = dt
        ? dt.toLocaleString('ar-IQ', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—';
      return {
        id: mv.id,
        movementNumber: mv.movementNumber || mv.id,
        type: mv.type || MovementType.ENTRY,
        inventoryCode: mv.inventoryCode || '—',
        assetName: mv.assetName || '—',
        previousLocation: mv.previousLocation || '—',
        newLocation: mv.newLocation || '—',
        recipientName: mv.recipientName || '—',
        timestamp: formattedDate,
        performedBy: mv.performedByName || '—',
        voucherNumber: mv.voucherNumber || '—',
      };
    });

    // Maintenance watchlist
    const maintenanceWatchlist: MaintenanceWatchItem[] = needsMaintenanceRecords
      .slice(0, 6)
      .map((rec) => ({
        id: rec.id,
        inventoryCode: rec.inventoryCode || '—',
        deviceName: rec.deviceName || '—',
        faultType: rec.faultType || 'عطل فني',
        sentDate: rec.sentDate || '—',
        assignedUnit: rec.assignedUnit || '—',
        status: rec.status || MaintenanceStatus.NEEDS_MAINTENANCE,
      }));

    const baseEmpty = getEmptyDashboardSnapshot(period);
    onSnapshotUpdate({
      ...baseEmpty,
      kpis: {
        totalDevices: activeDevices.length,
        availableInWarehouse,
        issuedToUnits,
        inMaintenance,
        damagedDevices,
        consumableTypesCount: activeItems.length,
        totalConsumableQuantity,
        registeredUnitsCount: departments.length + units.length,
        monthlyIssuesCount,
        monthlyReturnsCount,
        needsMaintenanceCount: needsMaintenanceRecords.length,
        recentMovementsCount: periodMovements.length,
      },
      byCategory,
      byStatus,
      byDepartment,
      monthlyFlow,
      topConsumables,
      recentMovements,
      maintenanceWatchlist,
    });
  };

  const unsubDevices = onSnapshot(
    collection(db, 'devices'),
    (snap) => {
      devices = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RawDeviceDoc, 'id'>) }));
      recompute();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'devices');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const unsubItems = onSnapshot(
    collection(db, 'items'),
    (snap) => {
      items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RawItemDoc, 'id'>) }));
      recompute();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'items');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const unsubBalances = onSnapshot(
    collection(db, 'stockBalances'),
    (snap) => {
      balances = snap.docs.map((d) => ({
        itemId: d.id,
        ...(d.data() as Omit<RawBalanceDoc, 'itemId'>),
      }));
      recompute();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'stockBalances');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const unsubCategories = onSnapshot(
    collection(db, 'categories'),
    (snap) => {
      categories = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RawCategoryDoc, 'id'>),
      }));
      recompute();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'categories');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const unsubDepartments = onSnapshot(
    collection(db, 'departments'),
    (snap) => {
      departments = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RawDepartmentDoc, 'id'>),
      }));
      recompute();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'departments');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const unsubUnits = onSnapshot(
    collection(db, 'units'),
    (snap) => {
      units = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RawUnitDoc, 'id'>),
      }));
      recompute();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'units');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const movementsQuery = query(
    collection(db, 'stockMovements'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  const unsubMovements = onSnapshot(
    movementsQuery,
    (snap) => {
      movements = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RawMovementDoc, 'id'>),
      }));
      recompute();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'stockMovements');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const unsubMaintenance = onSnapshot(
    collection(db, 'maintenanceRecords'),
    (snap) => {
      maintenance = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RawMaintenanceDoc, 'id'>),
      }));
      recompute();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'maintenanceRecords');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubDevices();
    unsubItems();
    unsubBalances();
    unsubCategories();
    unsubDepartments();
    unsubUnits();
    unsubMovements();
    unsubMaintenance();
  };
}

export function subscribeToNotifications(
  onData: (items: SystemNotification[]) => void
): () => void {
  const q = query(
    collection(db, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(25)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: SystemNotification[] = snap.docs.map((d) => {
        const data = d.data() as Partial<SystemNotification> & {
          createdAt?: { toDate?: () => Date } | string;
        };
        const dt = parseDateValue(data.createdAt);
        return {
          id: d.id,
          title: data.title || 'إشعار نظام',
          description: data.description || '',
          severity: data.severity || 'info',
          read: Boolean(data.read),
          targetRoute: data.targetRoute || 'dashboard',
          createdAt: dt
            ? dt.toLocaleString('ar-IQ', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'الآن',
        };
      });
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'notifications');
    }
  );
}

export async function markNotificationReadInDb(id: string): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsReadInDb(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const batch = writeBatch(db);
    ids.forEach((id) => {
      batch.update(doc(db, 'notifications', id), { read: true });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'notifications');
  }
}
