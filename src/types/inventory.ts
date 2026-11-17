export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  WAREHOUSE_MANAGER = 'WAREHOUSE_MANAGER',
  WAREHOUSE_STAFF = 'WAREHOUSE_STAFF',
  VIEWER = 'VIEWER',
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SYSTEM_ADMIN]: 'مدير النظام',
  [UserRole.WAREHOUSE_MANAGER]: 'مسؤول المخزن',
  [UserRole.WAREHOUSE_STAFF]: 'موظف المخزن',
  [UserRole.VIEWER]: 'مستخدم مشاهدة',
};

export enum DeviceStorageStatus {
  IN_WAREHOUSE = 'IN_WAREHOUSE',
  ISSUED = 'ISSUED',
  IN_MAINTENANCE = 'IN_MAINTENANCE',
  DAMAGED = 'DAMAGED',
  ARCHIVED = 'ARCHIVED',
}

export enum MovementType {
  ENTRY = 'ENTRY',
  ISSUE = 'ISSUE',
  RETURN = 'RETURN',
  TRANSFER = 'TRANSFER',
  SEND_TO_MAINTENANCE = 'SEND_TO_MAINTENANCE',
  RECEIVE_FROM_MAINTENANCE = 'RECEIVE_FROM_MAINTENANCE',
  ADJUSTMENT = 'ADJUSTMENT',
  ARCHIVE = 'ARCHIVE',
}

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  [MovementType.ENTRY]: 'إضافة للمخزن',
  [MovementType.ISSUE]: 'صرف',
  [MovementType.RETURN]: 'إرجاع',
  [MovementType.TRANSFER]: 'نقل',
  [MovementType.SEND_TO_MAINTENANCE]: 'إرسال للصيانة',
  [MovementType.RECEIVE_FROM_MAINTENANCE]: 'استلام من الصيانة',
  [MovementType.ADJUSTMENT]: 'تسوية',
  [MovementType.ARCHIVE]: 'أرشفة',
};

export enum MaintenanceStatus {
  NEEDS_MAINTENANCE = 'NEEDS_MAINTENANCE',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  UNREPAIRABLE = 'UNREPAIRABLE',
}

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  [MaintenanceStatus.NEEDS_MAINTENANCE]: 'يحتاج إلى صيانة',
  [MaintenanceStatus.IN_PROGRESS]: 'قيد الصيانة',
  [MaintenanceStatus.COMPLETED]: 'تمت الصيانة',
  [MaintenanceStatus.UNREPAIRABLE]: 'غير قابل للإصلاح',
};

export type AppRouteId =
  | 'dashboard'
  | 'devices'
  | 'consumables'
  | 'categories'
  | 'departments'
  | 'stock-entry'
  | 'stock-issue'
  | 'stock-return'
  | 'asset-transfer'
  | 'inventory-audit'
  | 'maintenance'
  | 'barcode-center'
  | 'movements'
  | 'reports'
  | 'users'
  | 'audit-logs'
  | 'settings';

export interface UserSession {
  uid: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  departmentName: string;
  loginAt: string;
  lastActivityAt: string;
  sessionExpiresAt: string;
}

export interface DashboardKpis {
  totalDevices: number;
  availableInWarehouse: number;
  issuedToUnits: number;
  inMaintenance: number;
  damagedDevices: number;
  consumableTypesCount: number;
  totalConsumableQuantity: number;
  registeredUnitsCount: number;
  monthlyIssuesCount: number;
  monthlyReturnsCount: number;
  needsMaintenanceCount: number;
  recentMovementsCount: number;
}

export interface CategoryDistributionItem {
  id: string;
  name: string;
  count: number;
  percentage: number;
}

export interface StatusDistributionItem {
  status: DeviceStorageStatus;
  label: string;
  count: number;
  colorHex: string;
}

export interface DepartmentDistributionItem {
  id: string;
  departmentName: string;
  deviceCount: number;
  unitsCount: number;
}

export interface MonthlyFlowPoint {
  monthLabel: string;
  issued: number;
  returned: number;
}

export interface TopConsumableItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  issuedQuantity: number;
  remainingQuantity: number;
}

export interface RecentMovementItem {
  id: string;
  movementNumber: string;
  type: MovementType;
  inventoryCode: string;
  assetName: string;
  previousLocation: string;
  newLocation: string;
  recipientName: string;
  timestamp: string;
  performedBy: string;
  voucherNumber: string;
}

export interface MaintenanceWatchItem {
  id: string;
  inventoryCode: string;
  deviceName: string;
  faultType: string;
  sentDate: string;
  assignedUnit: string;
  status: MaintenanceStatus;
}

export interface SystemNotification {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
  read: boolean;
  targetRoute: AppRouteId;
}

export interface DashboardSnapshot {
  periodLabel: string;
  lastUpdated: string;
  kpis: DashboardKpis;
  byCategory: CategoryDistributionItem[];
  byStatus: StatusDistributionItem[];
  byDepartment: DepartmentDistributionItem[];
  monthlyFlow: MonthlyFlowPoint[];
  topConsumables: TopConsumableItem[];
  recentMovements: RecentMovementItem[];
  maintenanceWatchlist: MaintenanceWatchItem[];
}
