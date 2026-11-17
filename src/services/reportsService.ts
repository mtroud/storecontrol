import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import {
  DeviceStorageStatus,
  MAINTENANCE_STATUS_LABELS,
  MOVEMENT_TYPE_LABELS,
  MovementType,
} from '../types/inventory';
import { SignatureMap, SignatureSlotId } from '../types/signature';
import { CategoryRecord } from './categoriesService';
import { ConsumableRecord } from './consumablesService';
import {
  CentralMovementRecord,
  InventorySessionRecord,
  MaintenanceTicketRecord,
} from './controlService';
import { DepartmentRecord, UnitRecord } from './departmentsService';
import { DeviceRecord, STORAGE_STATUS_LABELS } from './devicesService';
import {
  AssetTransferVoucherRecord,
  StockEntryVoucherRecord,
  StockIssueVoucherRecord,
  StockReturnVoucherRecord,
} from './operationsService';

export type ReportGroupId = 'devices' | 'maintenance' | 'consumables' | 'operations';

export type ReportId =
  | 'RPT-01'
  | 'RPT-02'
  | 'RPT-03'
  | 'RPT-04'
  | 'RPT-05'
  | 'RPT-06'
  | 'RPT-07'
  | 'RPT-08'
  | 'RPT-09'
  | 'RPT-10'
  | 'RPT-11'
  | 'RPT-12'
  | 'RPT-13'
  | 'RPT-14'
  | 'RPT-15'
  | 'RPT-16'
  | 'RPT-17'
  | 'RPT-18';

export interface ReportDefinition {
  id: ReportId;
  code: string;
  title: string;
  description: string;
  group: ReportGroupId;
  orientation: 'portrait' | 'landscape';
}

export const REPORT_GROUPS: Array<{ id: ReportGroupId; label: string }> = [
  { id: 'devices', label: 'موجودات الأجهزة والعهدة (6)' },
  { id: 'maintenance', label: 'الصيانة والتالف والأرشفة (4)' },
  { id: 'consumables', label: 'المواد الاستهلاكية (3)' },
  { id: 'operations', label: 'السندات والحركات والجرد (5)' },
];

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'RPT-01',
    code: 'RPT-01',
    title: 'تقرير الجرد الشامل للأجهزة والمعدات',
    description: 'كشف متكامل لجميع الأجهزة النشطة مع أرقام الجرد والرقم التسلسلي والحالة والموقع.',
    group: 'devices',
    orientation: 'landscape',
  },
  {
    id: 'RPT-02',
    code: 'RPT-02',
    title: 'تقرير الأجهزة المتوفرة داخل المخزن',
    description: 'حصر الأجهزة الجاهزة للصرف والموجودة فعلياً في المخزن الرئيسي.',
    group: 'devices',
    orientation: 'landscape',
  },
  {
    id: 'RPT-03',
    code: 'RPT-03',
    title: 'تقرير الأجهزة المصروفة للشعب والوحدات',
    description: 'جميع الأجهزة المصروفة خارج المخزن مع الجهة المستفيدة والمستلم وتاريخ الصرف.',
    group: 'devices',
    orientation: 'landscape',
  },
  {
    id: 'RPT-04',
    code: 'RPT-04',
    title: 'تقرير عهدة الأجهزة حسب الشعبة والوحدة',
    description: 'تفصيل الموجودات التقنية الموزعة على الشعب والوحدات التابعة لمجمع سيد الشهداء (ع).',
    group: 'devices',
    orientation: 'landscape',
  },
  {
    id: 'RPT-05',
    code: 'RPT-05',
    title: 'تقرير عهدة المستلمين (الذمم الشخصية)',
    description: 'جدول يوثق الأجهزة المسلمة بعهدة كل موظف أو مستلم.',
    group: 'devices',
    orientation: 'landscape',
  },
  {
    id: 'RPT-06',
    code: 'RPT-06',
    title: 'تقرير توزيع الأجهزة حسب التصنيف الفني',
    description: 'خلاصة أعداد الأجهزة المتوفرة والمصروفة وقيد الصيانة والتالفة لكل تصنيف.',
    group: 'devices',
    orientation: 'portrait',
  },
  {
    id: 'RPT-07',
    code: 'RPT-07',
    title: 'تقرير الأجهزة التي تحتاج إلى صيانة وقيد الصيانة',
    description: 'قائمة بالأجهزة المعطلة أو المحالة إلى الورش الفنية في الوقت الحالي.',
    group: 'maintenance',
    orientation: 'landscape',
  },
  {
    id: 'RPT-08',
    code: 'RPT-08',
    title: 'سجل وتكاليف الصيانة التفصيلي',
    description: 'تقرير تاريخي بتذاكر الصيانة، الأعطال، الجهات المنفذة، وتكاليف الإصلاح.',
    group: 'maintenance',
    orientation: 'landscape',
  },
  {
    id: 'RPT-09',
    code: 'RPT-09',
    title: 'تقرير الأجهزة التالفة والخارجة عن الخدمة',
    description: 'حصر الأجهزة بحالة تالف لتوثيق الاستبعاد أو الإتلاف الأصولي.',
    group: 'maintenance',
    orientation: 'landscape',
  },
  {
    id: 'RPT-10',
    code: 'RPT-10',
    title: 'تقرير الأجهزة المؤرشفة',
    description: 'سجل الأجهزة المؤرشفة في النظام مع الاحتفاظ ببياناتها التاريخية.',
    group: 'maintenance',
    orientation: 'landscape',
  },
  {
    id: 'RPT-11',
    code: 'RPT-11',
    title: 'تقرير جرد أرصدة المواد الاستهلاكية',
    description: 'أرصدة جميع المواد الكمية والملحقات ومقارنتها بالحد الأدنى وحد إعادة الطلب.',
    group: 'consumables',
    orientation: 'landscape',
  },
  {
    id: 'RPT-12',
    code: 'RPT-12',
    title: 'تقرير نواقص المخزون وإعادة الطلب',
    description: 'المواد الاستهلاكية التي بلغت حد إعادة الطلب أو الحد الأدنى أو نفد رصيدها.',
    group: 'consumables',
    orientation: 'portrait',
  },
  {
    id: 'RPT-13',
    code: 'RPT-13',
    title: 'تقرير المواد الاستهلاكية الأكثر صرفاً',
    description: 'تحليل كميات الصرف التراكمية للمواد الكمية حسب سندات الصرف المسجلة.',
    group: 'consumables',
    orientation: 'portrait',
  },
  {
    id: 'RPT-14',
    code: 'RPT-14',
    title: 'تقرير السجل المركزي لحركات المخزن',
    description: 'سجل تفصيلي غير قابل للتعديل لكافة حركات الإدخال والصرف والإرجاع والنقل والصيانة.',
    group: 'operations',
    orientation: 'landscape',
  },
  {
    id: 'RPT-15',
    code: 'RPT-15',
    title: 'تقرير سندات الإدخال المخزني',
    description: 'ملخص سندات استلام وإدخال الأجهزة والمواد للمخزن مع أرقام الكتب الرسمية.',
    group: 'operations',
    orientation: 'landscape',
  },
  {
    id: 'RPT-16',
    code: 'RPT-16',
    title: 'تقرير سندات الصرف للشعب والوحدات',
    description: 'كشف سندات الصرف الرسمية الصادرة خلال الفترة مع أسماء المستلمين.',
    group: 'operations',
    orientation: 'landscape',
  },
  {
    id: 'RPT-17',
    code: 'RPT-17',
    title: 'تقرير سندات الإرجاع ونقل العهدة',
    description: 'تقرير موحد لعمليات الإرجاع ونتائج الفحص الفني ومناقلات الأجهزة بين الشعب.',
    group: 'operations',
    orientation: 'landscape',
  },
  {
    id: 'RPT-18',
    code: 'RPT-18',
    title: 'تقرير جلسات الجرد الإلكتروني والاعتمادات',
    description: 'نتائج جلسات الجرد الميداني بالباركود وأعداد المطابق والمفقود واعتمادات المسؤول.',
    group: 'operations',
    orientation: 'landscape',
  },
];

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  departmentId: string;
  unitId: string;
  categoryId: string;
  recipientQuery: string;
  searchQuery: string;
}

export interface ReportsDataset {
  devices: DeviceRecord[];
  categories: CategoryRecord[];
  departments: DepartmentRecord[];
  units: UnitRecord[];
  consumables: ConsumableRecord[];
  maintenance: MaintenanceTicketRecord[];
  movements: CentralMovementRecord[];
  entries: StockEntryVoucherRecord[];
  issues: StockIssueVoucherRecord[];
  returns: StockReturnVoucherRecord[];
  transfers: AssetTransferVoucherRecord[];
  sessions: InventorySessionRecord[];
  fetchedAt: string;
}

export interface ReportSummaryMetric {
  label: string;
  value: string | number;
}

export interface BuiltReportData {
  definition: ReportDefinition;
  headers: string[];
  rows: string[][];
  summary: ReportSummaryMetric[];
}

function toIsoDateOnly(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  if (typeof val === 'object' && val !== null && 'toDate' in val) {
    return (val as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  return '';
}

function inDateRange(dateStr: string | undefined, from: string, to: string): boolean {
  const clean = (dateStr || '').slice(0, 10);
  if (!clean) return !from && !to;
  if (from && clean < from) return false;
  if (to && clean > to) return false;
  return true;
}

async function safeGetDocs<T>(
  path: string,
  q: ReturnType<typeof query>
): Promise<Array<T & { id: string }>> {
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as T),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function fetchReportsDataset(): Promise<ReportsDataset> {
  const [
    devices,
    categories,
    departments,
    units,
    rawItems,
    rawBalances,
    maintenance,
    movements,
    entries,
    issues,
    returns,
    transfers,
    sessions,
  ] = await Promise.all([
    safeGetDocs<Omit<DeviceRecord, 'id'>>(
      'devices',
      query(collection(db, 'devices'), orderBy('inventoryNumber', 'asc'))
    ),
    safeGetDocs<Omit<CategoryRecord, 'id'>>(
      'categories',
      query(collection(db, 'categories'), orderBy('name', 'asc'))
    ),
    safeGetDocs<Omit<DepartmentRecord, 'id'>>(
      'departments',
      query(collection(db, 'departments'), orderBy('name', 'asc'))
    ),
    safeGetDocs<Omit<UnitRecord, 'id'>>(
      'units',
      query(collection(db, 'units'), orderBy('name', 'asc'))
    ),
    safeGetDocs<Omit<ConsumableRecord, 'id' | 'currentQuantity'>>(
      'items',
      query(collection(db, 'items'), orderBy('name', 'asc'))
    ),
    safeGetDocs<{ itemId?: string; currentQuantity?: number }>(
      'stockBalances',
      query(collection(db, 'stockBalances'))
    ),
    safeGetDocs<Omit<MaintenanceTicketRecord, 'id'>>(
      'maintenanceRecords',
      query(collection(db, 'maintenanceRecords'), orderBy('sentDate', 'desc'))
    ),
    safeGetDocs<Omit<CentralMovementRecord, 'id'>>(
      'stockMovements',
      query(collection(db, 'stockMovements'), orderBy('createdAt', 'desc'), limit(500))
    ),
    safeGetDocs<Omit<StockEntryVoucherRecord, 'id'>>(
      'stockEntries',
      query(collection(db, 'stockEntries'), orderBy('createdAt', 'desc'), limit(200))
    ),
    safeGetDocs<Omit<StockIssueVoucherRecord, 'id'>>(
      'stockIssues',
      query(collection(db, 'stockIssues'), orderBy('createdAt', 'desc'), limit(200))
    ),
    safeGetDocs<Omit<StockReturnVoucherRecord, 'id'>>(
      'stockReturns',
      query(collection(db, 'stockReturns'), orderBy('createdAt', 'desc'), limit(200))
    ),
    safeGetDocs<Omit<AssetTransferVoucherRecord, 'id'>>(
      'assetTransfers',
      query(collection(db, 'assetTransfers'), orderBy('createdAt', 'desc'), limit(200))
    ),
    safeGetDocs<Omit<InventorySessionRecord, 'id'>>(
      'inventorySessions',
      query(collection(db, 'inventorySessions'), orderBy('createdAt', 'desc'), limit(100))
    ),
  ]);

  const balanceMap = new Map<string, number>();
  rawBalances.forEach((b) => {
    balanceMap.set(b.id, Number(b.currentQuantity || 0));
  });

  const consumables: ConsumableRecord[] = rawItems.map((it) => ({
    ...it,
    currentQuantity: balanceMap.get(it.id) ?? 0,
  }));

  return {
    devices,
    categories,
    departments,
    units,
    consumables,
    maintenance,
    movements,
    entries,
    issues,
    returns,
    transfers,
    sessions,
    fetchedAt: new Date().toISOString(),
  };
}

export function buildReportData(
  reportId: ReportId,
  dataset: ReportsDataset,
  filters: ReportFilters
): BuiltReportData {
  const definition =
    REPORT_DEFINITIONS.find((r) => r.id === reportId) || REPORT_DEFINITIONS[0];

  const catMap = new Map(dataset.categories.map((c) => [c.id, c.name]));
  const deptMap = new Map(dataset.departments.map((d) => [d.id, d.name]));
  const unitMap = new Map(dataset.units.map((u) => [u.id, u.name]));

  const recQ = filters.recipientQuery.trim().toLowerCase();
  const txtQ = filters.searchQuery.trim().toLowerCase();

  const matchesSearch = (cells: string[]) =>
    !txtQ || cells.some((c) => c.toLowerCase().includes(txtQ));

  const filterDevicesBase = (list: DeviceRecord[], dateField: 'receivedDate' | 'issuedDate' = 'receivedDate') =>
    list.filter((d) => {
      if (filters.categoryId && d.categoryId !== filters.categoryId) return false;
      if (filters.departmentId && d.departmentId !== filters.departmentId) return false;
      if (filters.unitId && d.unitId !== filters.unitId) return false;
      if (recQ && !(d.recipientName || '').toLowerCase().includes(recQ)) return false;
      const targetDate = dateField === 'issuedDate' ? d.issuedDate : d.receivedDate;
      if ((filters.dateFrom || filters.dateTo) && !inDateRange(targetDate, filters.dateFrom, filters.dateTo)) {
        return false;
      }
      return true;
    });

  const deviceRow = (d: DeviceRecord): string[] => [
    d.inventoryNumber,
    d.name,
    catMap.get(d.categoryId) || 'غير مصنف',
    [d.manufacturer, d.model].filter(Boolean).join(' / ') || '—',
    d.serialNumber || '—',
    STORAGE_STATUS_LABELS[d.storageStatus] || d.storageStatus,
    d.technicalStatus || '—',
    d.currentLocation || 'المخزن الرئيسي',
    d.departmentId ? deptMap.get(d.departmentId) || '—' : '—',
    d.recipientName || '—',
    d.receivedDate || '—',
  ];

  const DEVICE_HEADERS = [
    'رقم الجرد',
    'اسم الجهاز',
    'التصنيف',
    'الشركة / الموديل',
    'الرقم التسلسلي',
    'الحالة المخزنية',
    'الحالة الفنية',
    'الموقع الحالي',
    'الشعبة المستفيدة',
    'المستلم',
    'تاريخ الاستلام',
  ];

  let headers: string[] = [];
  let rows: string[][] = [];
  let summary: ReportSummaryMetric[] = [];

  switch (reportId) {
    case 'RPT-01': {
      const list = filterDevicesBase(dataset.devices.filter((d) => !d.isArchived));
      headers = DEVICE_HEADERS;
      rows = list.map(deviceRow).filter(matchesSearch);
      summary = [
        { label: 'إجمالي الأجهزة النشطة', value: rows.length },
        { label: 'متوفر بالمخزن', value: list.filter((d) => d.storageStatus === DeviceStorageStatus.IN_WAREHOUSE).length },
        { label: 'مصروف للشعب', value: list.filter((d) => d.storageStatus === DeviceStorageStatus.ISSUED).length },
        { label: 'صيانة / تالف', value: list.filter((d) => d.storageStatus === DeviceStorageStatus.IN_MAINTENANCE || d.storageStatus === DeviceStorageStatus.DAMAGED).length },
      ];
      break;
    }

    case 'RPT-02': {
      const list = filterDevicesBase(
        dataset.devices.filter(
          (d) => !d.isArchived && d.storageStatus === DeviceStorageStatus.IN_WAREHOUSE
        )
      );
      headers = [
        'رقم الجرد',
        'اسم الجهاز',
        'التصنيف',
        'الشركة / الموديل',
        'الرقم التسلسلي',
        'الحالة الفنية',
        'موقع التخزين',
        'تاريخ الاستلام',
      ];
      rows = list
        .map((d) => [
          d.inventoryNumber,
          d.name,
          catMap.get(d.categoryId) || 'غير مصنف',
          [d.manufacturer, d.model].filter(Boolean).join(' / ') || '—',
          d.serialNumber || '—',
          d.technicalStatus || '—',
          d.currentLocation || 'المخزن الرئيسي',
          d.receivedDate || '—',
        ])
        .filter(matchesSearch);
      summary = [
        { label: 'الأجهزة الجاهزة للصرف', value: rows.length },
        { label: 'عدد التصنيفات المتوفرة', value: new Set(list.map((d) => d.categoryId)).size },
      ];
      break;
    }

    case 'RPT-03':
    case 'RPT-04':
    case 'RPT-05': {
      const issued = filterDevicesBase(
        dataset.devices.filter(
          (d) => !d.isArchived && d.storageStatus === DeviceStorageStatus.ISSUED
        ),
        'issuedDate'
      );
      const sorted = [...issued].sort((a, b) => {
        if (reportId === 'RPT-05') {
          return (a.recipientName || '').localeCompare(b.recipientName || '', 'ar');
        }
        return (deptMap.get(a.departmentId || '') || '').localeCompare(
          deptMap.get(b.departmentId || '') || '',
          'ar'
        );
      });
      headers = [
        'رقم الجرد',
        'اسم الجهاز',
        'التصنيف',
        'الرقم التسلسلي',
        'الشعبة المستفيدة',
        'الوحدة',
        'المستلم',
        'تاريخ الصرف',
        'الموقع الحالي',
      ];
      rows = sorted
        .map((d) => [
          d.inventoryNumber,
          d.name,
          catMap.get(d.categoryId) || 'غير مصنف',
          d.serialNumber || '—',
          d.departmentId ? deptMap.get(d.departmentId) || '—' : '—',
          d.unitId ? unitMap.get(d.unitId) || '—' : '—',
          d.recipientName || '—',
          d.issuedDate || '—',
          d.currentLocation || '—',
        ])
        .filter(matchesSearch);
      summary = [
        { label: 'إجمالي الأجهزة المصروفة', value: rows.length },
        { label: 'عدد الشعب المستفيدة', value: new Set(sorted.map((d) => d.departmentId).filter(Boolean)).size },
        { label: 'عدد المستلمين', value: new Set(sorted.map((d) => d.recipientName).filter(Boolean)).size },
      ];
      break;
    }

    case 'RPT-06': {
      const filteredDevs = filterDevicesBase(dataset.devices.filter((d) => !d.isArchived));
      headers = [
        'رمز التصنيف',
        'اسم التصنيف',
        'الإجمالي',
        'بالمخزن',
        'مصروف',
        'صيانة',
        'تالف',
      ];
      rows = dataset.categories
        .filter((c) => !filters.categoryId || c.id === filters.categoryId)
        .map((c) => {
          const devs = filteredDevs.filter((d) => d.categoryId === c.id);
          return [
            c.codePrefix,
            c.name,
            String(devs.length),
            String(devs.filter((d) => d.storageStatus === DeviceStorageStatus.IN_WAREHOUSE).length),
            String(devs.filter((d) => d.storageStatus === DeviceStorageStatus.ISSUED).length),
            String(devs.filter((d) => d.storageStatus === DeviceStorageStatus.IN_MAINTENANCE).length),
            String(devs.filter((d) => d.storageStatus === DeviceStorageStatus.DAMAGED).length),
          ];
        })
        .filter(matchesSearch);
      summary = [
        { label: 'عدد التصنيفات', value: rows.length },
        { label: 'إجمالي الأجهزة النشطة', value: filteredDevs.length },
      ];
      break;
    }

    case 'RPT-07': {
      const list = filterDevicesBase(
        dataset.devices.filter(
          (d) => !d.isArchived && d.storageStatus === DeviceStorageStatus.IN_MAINTENANCE
        )
      );
      headers = [
        'رقم الجرد',
        'اسم الجهاز',
        'التصنيف',
        'الرقم التسلسلي',
        'الحالة الفنية',
        'الموقع / الورشة',
        'تاريخ آخر تحديث',
        'الملاحظات',
      ];
      rows = list
        .map((d) => [
          d.inventoryNumber,
          d.name,
          catMap.get(d.categoryId) || 'غير مصنف',
          d.serialNumber || '—',
          d.technicalStatus || 'قيد الصيانة',
          d.currentLocation || 'ورشة الصيانة',
          (d.updatedAt || '').slice(0, 10) || '—',
          d.notes || '—',
        ])
        .filter(matchesSearch);
      summary = [{ label: 'أجهزة قيد الصيانة حالياً', value: rows.length }];
      break;
    }

    case 'RPT-08': {
      const filteredTickets = dataset.maintenance.filter((t) =>
        inDateRange(t.sentDate, filters.dateFrom, filters.dateTo)
      );
      headers = [
        'رقم التذكرة',
        'رقم الجرد',
        'اسم الجهاز',
        'نوع العطل',
        'الجهة المنفذة',
        'تاريخ الإرسال',
        'الحالة',
        'تاريخ الإنجاز',
        'التكلفة (د.ع)',
      ];
      rows = filteredTickets
        .map((t) => [
          t.id,
          t.inventoryCode,
          t.deviceName,
          t.faultType,
          t.assignedUnit || '—',
          t.sentDate || '—',
          MAINTENANCE_STATUS_LABELS[t.status],
          t.completedDate || '—',
          String(t.cost ?? 0),
        ])
        .filter(matchesSearch);
      const totalCost = filteredTickets.reduce((acc, t) => acc + Number(t.cost || 0), 0);
      summary = [
        { label: 'عدد تذاكر الصيانة', value: rows.length },
        { label: 'إجمالي التكاليف (د.ع)', value: totalCost.toLocaleString('en-US') },
      ];
      break;
    }

    case 'RPT-09': {
      const list = filterDevicesBase(
        dataset.devices.filter(
          (d) => !d.isArchived && d.storageStatus === DeviceStorageStatus.DAMAGED
        )
      );
      headers = DEVICE_HEADERS;
      rows = list.map(deviceRow).filter(matchesSearch);
      summary = [{ label: 'إجمالي الأجهزة التالفة', value: rows.length }];
      break;
    }

    case 'RPT-10': {
      const list = filterDevicesBase(
        dataset.devices.filter(
          (d) => d.isArchived || d.storageStatus === DeviceStorageStatus.ARCHIVED
        )
      );
      headers = DEVICE_HEADERS;
      rows = list.map(deviceRow).filter(matchesSearch);
      summary = [{ label: 'إجمالي الأجهزة المؤرشفة', value: rows.length }];
      break;
    }

    case 'RPT-11': {
      const items = dataset.consumables.filter(
        (c) => !c.isArchived && (!filters.categoryId || c.categoryId === filters.categoryId)
      );
      headers = [
        'رمز المادة',
        'اسم المادة',
        'التصنيف',
        'الوحدة',
        'الرصيد الحالي',
        'الحد الأدنى',
        'حد إعادة الطلب',
        'المخزون الاحتياطي',
        'موقع التخزين',
      ];
      rows = items
        .map((c) => [
          c.itemCode,
          c.name,
          catMap.get(c.categoryId) || 'غير مصنف',
          c.unitOfMeasure,
          String(c.currentQuantity),
          String(c.minStock),
          String(c.reorderPoint),
          String(c.reserveStock),
          c.storageLocation || 'المخزن الرئيسي',
        ])
        .filter(matchesSearch);
      summary = [
        { label: 'عدد المواد الاستهلاكية', value: rows.length },
        { label: 'إجمالي الكميات المتوفرة', value: items.reduce((s, c) => s + c.currentQuantity, 0) },
      ];
      break;
    }

    case 'RPT-12': {
      const lowItems = dataset.consumables.filter(
        (c) =>
          !c.isArchived &&
          (!filters.categoryId || c.categoryId === filters.categoryId) &&
          c.currentQuantity <= c.reorderPoint
      );
      headers = [
        'رمز المادة',
        'اسم المادة',
        'الوحدة',
        'الرصيد المتوفر',
        'الحد الأدنى',
        'حد إعادة الطلب',
        'درجة الأولوية',
      ];
      rows = lowItems
        .map((c) => [
          c.itemCode,
          c.name,
          c.unitOfMeasure,
          String(c.currentQuantity),
          String(c.minStock),
          String(c.reorderPoint),
          c.currentQuantity === 0
            ? 'نفد الرصيد (حرج)'
            : c.currentQuantity <= c.minStock
              ? 'أقل من الحد الأدنى'
              : 'وصل حد إعادة الطلب',
        ])
        .filter(matchesSearch);
      summary = [
        { label: 'مواد تحتاج تزويد', value: rows.length },
        { label: 'مواد نفد رصيدها', value: lowItems.filter((c) => c.currentQuantity === 0).length },
      ];
      break;
    }

    case 'RPT-13': {
      const totals = new Map<string, { code: string; name: string; unit: string; issuedQty: number; count: number }>();
      dataset.issues
        .filter((v) => inDateRange(v.issueDate, filters.dateFrom, filters.dateTo))
        .forEach((v) => {
          if (filters.departmentId && v.departmentId !== filters.departmentId) return;
          (v.lines || []).forEach((line) => {
            if (line.kind !== 'CONSUMABLE') return;
            const prev = totals.get(line.code) || {
              code: line.code,
              name: line.name,
              unit: line.unit,
              issuedQty: 0,
              count: 0,
            };
            prev.issuedQty += Number(line.quantity || 0);
            prev.count += 1;
            totals.set(line.code, prev);
          });
        });
      const sorted = Array.from(totals.values()).sort((a, b) => b.issuedQty - a.issuedQty);
      headers = ['رمز المادة', 'اسم المادة', 'الوحدة', 'الكمية المصروفة', 'عدد مرات الصرف'];
      rows = sorted
        .map((r) => [r.code, r.name, r.unit, String(r.issuedQty), String(r.count)])
        .filter(matchesSearch);
      summary = [
        { label: 'أصناف مصروفة', value: rows.length },
        { label: 'إجمالي الوحدات المصروفة', value: sorted.reduce((s, r) => s + r.issuedQty, 0) },
      ];
      break;
    }

    case 'RPT-14': {
      const list = dataset.movements.filter((m) => {
        const dStr = toIsoDateOnly(m.createdAt);
        if ((filters.dateFrom || filters.dateTo) && !inDateRange(dStr, filters.dateFrom, filters.dateTo)) {
          return false;
        }
        if (recQ && !(m.recipientName || '').toLowerCase().includes(recQ)) return false;
        return true;
      });
      headers = [
        'رقم الحركة',
        'نوع الحركة',
        'رقم الجرد / المادة',
        'الأصل',
        'من الموقع',
        'إلى الموقع',
        'المستلم',
        'السند',
        'المنفذ',
        'التاريخ',
      ];
      rows = list
        .map((m) => [
          m.movementNumber,
          MOVEMENT_TYPE_LABELS[m.type as MovementType] || m.type,
          m.inventoryCode,
          m.assetName,
          m.previousLocation || '—',
          m.newLocation || '—',
          m.recipientName || '—',
          m.voucherNumber || '—',
          m.performedByName || '—',
          toIsoDateOnly(m.createdAt) || '—',
        ])
        .filter(matchesSearch);
      summary = [{ label: 'عدد الحركات المخزنية', value: rows.length }];
      break;
    }

    case 'RPT-15': {
      const list = dataset.entries.filter((v) =>
        inDateRange(v.entryDate, filters.dateFrom, filters.dateTo)
      );
      headers = [
        'رقم السند',
        'تاريخ الإدخال',
        'المصدر',
        'المرجع الرسمي',
        'عدد البنود',
        'المنفذ',
        'الملاحظات',
      ];
      rows = list
        .map((v) => [
          v.voucherNumber,
          v.entryDate,
          v.source,
          v.officialDocRef || '—',
          String((v.lines || []).length),
          v.recordedByName,
          v.notes || '—',
        ])
        .filter(matchesSearch);
      summary = [{ label: 'إجمالي سندات الإدخال', value: rows.length }];
      break;
    }

    case 'RPT-16': {
      const list = dataset.issues.filter((v) => {
        if (!inDateRange(v.issueDate, filters.dateFrom, filters.dateTo)) return false;
        if (filters.departmentId && v.departmentId !== filters.departmentId) return false;
        if (filters.unitId && v.unitId !== filters.unitId) return false;
        if (recQ && !(v.recipientName || '').toLowerCase().includes(recQ)) return false;
        return true;
      });
      headers = [
        'رقم السند',
        'تاريخ الصرف',
        'الشعبة',
        'الوحدة',
        'المستلم',
        'عدد البنود',
        'رقم الكتاب',
        'المنفذ',
      ];
      rows = list
        .map((v) => [
          v.voucherNumber,
          v.issueDate,
          v.departmentName,
          v.unitName || '—',
          v.recipientName,
          String((v.lines || []).length),
          v.officialDocRef || '—',
          v.issuedByName,
        ])
        .filter(matchesSearch);
      summary = [{ label: 'إجمالي سندات الصرف', value: rows.length }];
      break;
    }

    case 'RPT-17': {
      const retRows = dataset.returns
        .filter((r) => inDateRange(r.returnDate, filters.dateFrom, filters.dateTo))
        .map((r) => [
          'سند إرجاع',
          r.voucherNumber,
          r.returnDate,
          r.returnedByName,
          'المخزن الرئيسي',
          r.inspectionOutcome === 'WORKING'
            ? 'صالح للعمل'
            : r.inspectionOutcome === 'NEEDS_MAINTENANCE'
              ? 'محال للصيانة'
              : 'تالف',
          r.receivedByName,
        ]);
      const trnRows = dataset.transfers
        .filter((t) => inDateRange(t.transferDate, filters.dateFrom, filters.dateTo))
        .map((t) => [
          'سند نقل عهدة',
          t.voucherNumber,
          t.transferDate,
          t.fromDepartmentName,
          t.toDepartmentName,
          `${t.inventoryNumber} (${t.toRecipientName})`,
          t.executedByName,
        ]);
      headers = [
        'نوع العملية',
        'رقم السند',
        'التاريخ',
        'من / المُرجِع',
        'إلى الموقع',
        'النتيجة / التفاصيل',
        'المنفذ',
      ];
      rows = [...retRows, ...trnRows].filter(matchesSearch);
      summary = [
        { label: 'سندات الإرجاع', value: retRows.length },
        { label: 'سندات النقل', value: trnRows.length },
      ];
      break;
    }

    case 'RPT-18': {
      headers = [
        'رمز الجلسة',
        'عنوان الجلسة',
        'النطاق',
        'المتوقع',
        'الممسوح',
        'مطابق',
        'موقع مختلف',
        'مفقود',
        'غير مسجل',
        'الحالة',
        'المعتمد',
      ];
      rows = dataset.sessions
        .map((s) => [
          s.sessionCode,
          s.title,
          s.scopeTargetName,
          String(s.expectedCount),
          String(s.scannedCount),
          String(s.matchedCount),
          String(s.mismatchCount),
          String(s.missingCount),
          String(s.unregisteredCount),
          s.status === 'APPROVED'
            ? 'معتمد'
            : s.status === 'COMPLETED'
              ? 'مكتمل'
              : 'جاري الجرد',
          s.approvedByName || '—',
        ])
        .filter(matchesSearch);
      summary = [
        { label: 'إجمالي جلسات الجرد', value: rows.length },
        { label: 'الجلسات المعتمدة', value: dataset.sessions.filter((s) => s.status === 'APPROVED').length },
      ];
      break;
    }
  }

  return { definition, headers, rows, summary };
}

export function exportReportExcel(report: BuiltReportData): void {
  const wb = XLSX.utils.book_new();
  const titleRows: string[][] = [
    ['الأمانة العامة للعتبة الحسينية المقدسة — قسم مجمع سيد الشهداء (عليه السلام) الخدمي'],
    ['شعبة السيطرة والإنترنت — نظام إدارة وجرد الأجهزة والمعدات (Sayed Mart)'],
    [`${report.definition.code}: ${report.definition.title}`],
    [`تاريخ التصدير: ${new Date().toLocaleDateString('ar-IQ')} | إجمالي السجلات: ${report.rows.length}`],
    [],
    report.headers,
    ...report.rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(titleRows);
  ws['!views'] = [{ rightToLeft: true }];

  // Auto column widths
  ws['!cols'] = report.headers.map((h, colIdx) => {
    const maxLen = Math.max(
      h.length,
      ...report.rows.slice(0, 200).map((r) => (r[colIdx] || '').length)
    );
    return { wch: Math.min(42, Math.max(12, maxLen + 4)) };
  });

  XLSX.utils.book_append_sheet(wb, ws, report.definition.code);
  const fileName = `${report.definition.code}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

function fitCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let res = text;
  while (res.length > 1 && ctx.measureText(`${res}…`).width > maxWidth) {
    res = res.slice(0, -1);
  }
  return `${res}…`;
}

function loadSignatureImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function exportReportPdf(
  report: BuiltReportData,
  actorName: string,
  signatures?: SignatureMap
): Promise<void> {
  const isLandscape = report.definition.orientation === 'landscape';
  // High-DPI A4 Canvas (~150 DPI): Portrait 1240x1754, Landscape 1754x1240
  const pageW = isLandscape ? 1754 : 1240;
  const pageH = isLandscape ? 1240 : 1754;
  const margin = 56;
  const contentW = pageW - margin * 2;
  const rowH = 38;
  const tableHeaderH = 44;
  const topHeaderH = 148;
  const footerH = 156;

  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pdfW = isLandscape ? 297 : 210;
  const pdfH = isLandscape ? 210 : 297;

  const loadedImages: Partial<Record<SignatureSlotId, HTMLImageElement | null>> = {};
  if (signatures) {
    const slots: SignatureSlotId[] = ['organizer', 'reviewer', 'approver'];
    await Promise.all(
      slots.map(async (slot) => {
        const sig = signatures[slot];
        if (sig?.signatureImageDataUrl) {
          loadedImages[slot] = await loadSignatureImage(sig.signatureImageDataUrl);
        }
      })
    );
  }

  const rowsPerFirstPage = Math.max(
    1,
    Math.floor((pageH - margin * 2 - topHeaderH - 56 - tableHeaderH - footerH) / rowH)
  );
  const rowsPerNextPage = Math.max(
    1,
    Math.floor((pageH - margin * 2 - 90 - tableHeaderH - footerH) / rowH)
  );

  // Split rows across pages
  const chunks: string[][][] = [];
  if (report.rows.length === 0) {
    chunks.push([]);
  } else {
    chunks.push(report.rows.slice(0, rowsPerFirstPage));
    let cursor = rowsPerFirstPage;
    while (cursor < report.rows.length) {
      chunks.push(report.rows.slice(cursor, cursor + rowsPerNextPage));
      cursor += rowsPerNextPage;
    }
  }

  const colCount = Math.max(1, report.headers.length);
  const colW = contentW / colCount;
  const dateDisplay = new Date().toLocaleDateString('ar-IQ');

  chunks.forEach((pageRows, pageIndex) => {
    if (pageIndex > 0) {
      pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
    }

    const canvas = document.createElement('canvas');
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White sheet background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pageW, pageH);

    let y = margin;

    if (pageIndex === 0) {
      // Official Letterhead Banner
      ctx.fillStyle = '#0F2544';
      ctx.fillRect(margin, y, contentW, 114);
      ctx.fillStyle = '#C59B47';
      ctx.fillRect(margin, y + 114, contentW, 5);

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 20px Cairo, Tahoma, sans-serif';
      ctx.fillText(
        'الأمانة العامة للعتبة الحسينية المقدسة — مجمع سيد الشهداء (عليه السلام) الخدمي',
        pageW - margin - 24,
        y + 18
      );

      ctx.fillStyle = '#E5C67A';
      ctx.font = 'bold 24px Cairo, Tahoma, sans-serif';
      ctx.fillText(
        `${report.definition.code}: ${report.definition.title}`,
        pageW - margin - 24,
        y + 58
      );

      ctx.textAlign = 'left';
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 16px Cairo, Tahoma, sans-serif';
      ctx.fillText(`تاريخ الإصدار: ${dateDisplay}`, margin + 24, y + 26);
      ctx.fillText(`المستخدم: ${actorName}`, margin + 24, y + 62);

      y += topHeaderH;

      // Summary KPI strip
      if (report.summary.length > 0) {
        const sumText = report.summary
          .map((s) => `${s.label}: ${s.value}`)
          .join('   |   ');
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(margin, y, contentW, 42);
        ctx.strokeStyle = '#E2E8F0';
        ctx.strokeRect(margin, y, contentW, 42);
        ctx.fillStyle = '#0F2544';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 17px Cairo, Tahoma, sans-serif';
        ctx.fillText(sumText, pageW - margin - 16, y + 21);
        y += 56;
      }
    } else {
      ctx.fillStyle = '#0F2544';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 20px Cairo, Tahoma, sans-serif';
      ctx.fillText(
        `${report.definition.code}: ${report.definition.title} (تابع)`,
        pageW - margin,
        y
      );
      ctx.fillStyle = '#C59B47';
      ctx.fillRect(margin, y + 36, contentW, 3);
      y += 60;
    }

    // Table Header (RTL: right-to-left columns)
    ctx.fillStyle = '#0F2544';
    ctx.fillRect(margin, y, contentW, tableHeaderH);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px Cairo, Tahoma, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    report.headers.forEach((h, colIdx) => {
      const cellRight = pageW - margin - colIdx * colW;
      ctx.fillText(
        fitCanvasText(ctx, h, colW - 14),
        cellRight - 8,
        y + tableHeaderH / 2
      );
    });
    y += tableHeaderH;

    // Rows
    if (pageRows.length === 0) {
      ctx.fillStyle = '#64748B';
      ctx.textAlign = 'center';
      ctx.font = '600 18px Cairo, Tahoma, sans-serif';
      ctx.fillText('لا توجد بيانات مطابقة ضمن المعايير المحددة.', pageW / 2, y + 60);
    } else {
      pageRows.forEach((row, rIdx) => {
        if (rIdx % 2 === 1) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(margin, y, contentW, rowH);
        }
        ctx.strokeStyle = '#E2E8F0';
        ctx.beginPath();
        ctx.moveTo(margin, y + rowH);
        ctx.lineTo(pageW - margin, y + rowH);
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = '500 14px Cairo, Tahoma, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        row.forEach((cell, colIdx) => {
          const cellRight = pageW - margin - colIdx * colW;
          ctx.fillText(
            fitCanvasText(ctx, cell || '—', colW - 14),
            cellRight - 8,
            y + rowH / 2
          );
        });
        y += rowH;
      });
    }

    // Footer + Digital Signatures on last page
    const footY = pageH - margin - 134;
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(margin, footY);
    ctx.lineTo(pageW - margin, footY);
    ctx.stroke();

    if (pageIndex === chunks.length - 1) {
      const slotDefs: Array<{
        slotId: SignatureSlotId;
        label: string;
        centerX: number;
      }> = [
        {
          slotId: 'organizer',
          label: 'منظم التقرير / أمين المخزن',
          centerX: pageW - margin - contentW * 0.16,
        },
        {
          slotId: 'reviewer',
          label: 'مسؤول شعبة السيطرة والإنترنت',
          centerX: pageW / 2,
        },
        {
          slotId: 'approver',
          label: 'مصادقة مدير القسم',
          centerX: margin + contentW * 0.16,
        },
      ];

      slotDefs.forEach(({ slotId, label, centerX }) => {
        ctx.fillStyle = '#0F2544';
        ctx.font = 'bold 15px Cairo, Tahoma, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(label, centerX, footY + 10);

        const sig = signatures?.[slotId];
        const sigImg = loadedImages[slotId];
        if (sig && sigImg) {
          const maxW = 190;
          const maxH = 56;
          const ratio = Math.min(maxW / sigImg.width, maxH / sigImg.height);
          const drawW = sigImg.width * ratio;
          const drawH = sigImg.height * ratio;
          ctx.drawImage(sigImg, centerX - drawW / 2, footY + 32, drawW, drawH);

          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 13px Cairo, Tahoma, sans-serif';
          ctx.fillText(sig.signerName, centerX, footY + 92);

          ctx.fillStyle = '#475569';
          ctx.font = '500 11px "IBM Plex Mono", monospace';
          ctx.fillText(
            `${sig.verificationCode} · ${new Date(sig.signedAt).toLocaleDateString('ar-IQ')}`,
            centerX,
            footY + 111
          );
        } else {
          ctx.strokeStyle = '#94A3B8';
          ctx.beginPath();
          ctx.moveTo(centerX - 85, footY + 86);
          ctx.lineTo(centerX + 85, footY + 86);
          ctx.stroke();

          ctx.fillStyle = '#64748B';
          ctx.font = '500 12px Cairo, Tahoma, sans-serif';
          ctx.fillText('التوقيع والختم', centerX, footY + 94);
        }
      });
    }

    ctx.fillStyle = '#64748B';
    ctx.font = '500 14px Cairo, Tahoma, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `صفحة ${pageIndex + 1} من ${chunks.length}`,
      margin,
      pageH - margin + 12
    );

    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
  });

  pdf.save(`${report.definition.code}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
