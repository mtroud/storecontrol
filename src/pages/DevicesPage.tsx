import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowUpDown,
  Download,
  Edit3,
  Eye,
  HardDrive,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import {
  PrintDocumentHeader,
  PrintSignatureFooter,
  PrintSignatureTriggerButton,
} from '../components/common/PrintDocumentHeader';
import { DeviceCardModal } from '../components/devices/DeviceCardModal';
import { useAuth } from '../context/AuthContext';
import { CategoryRecord, subscribeToCategories } from '../services/categoriesService';
import {
  DepartmentRecord,
  subscribeToDepartments,
  subscribeToUnits,
  UnitRecord,
} from '../services/departmentsService';
import {
  createDevice,
  DeviceInput,
  DeviceRecord,
  generateNextInventoryNumber,
  STORAGE_STATUS_LABELS,
  subscribeToDevices,
  TECHNICAL_STATUS_OPTIONS,
  toggleArchiveDevice,
  updateDevice,
} from '../services/devicesService';
import { uploadAssetAttachment } from '../services/storageService';
import { DeviceStorageStatus, UserRole } from '../types/inventory';

type SortField = 'inventoryNumber' | 'name' | 'receivedDate' | 'storageStatus';

export function DevicesPage() {
  const { session } = useAuth();
  const canEdit =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER ||
    session?.role === UserRole.WAREHOUSE_STAFF;

  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [sortField, setSortField] = useState<SortField>('inventoryNumber');
  const [sortAsc, setSortAsc] = useState(true);

  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [formState, setFormState] = useState<DeviceInput>({
    inventoryNumber: '',
    name: '',
    categoryId: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    purchaseDate: '',
    receivedDate: new Date().toISOString().slice(0, 10),
    acquisitionSource: '',
    technicalStatus: TECHNICAL_STATUS_OPTIONS[0],
    storageStatus: DeviceStorageStatus.IN_WAREHOUSE,
    currentLocation: 'المخزن الرئيسي',
    departmentId: '',
    unitId: '',
    recipientName: '',
    issuedDate: '',
    returnedDate: '',
    warrantyPeriod: '',
    barcode: '',
    imageUrl: '',
    notes: '',
  });

  useEffect(() => {
    setLoading(true);
    const unsubDevices = subscribeToDevices(
      (list) => {
        setDevices(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setFeedback({ type: 'error', message: `تعذر تحميل الأجهزة: ${err.message}` });
      }
    );
    const unsubCats = subscribeToCategories(setCategories, () => {});
    const unsubDepts = subscribeToDepartments(setDepartments, () => {});
    const unsubUnits = subscribeToUnits(setUnits, () => {});

    return () => {
      unsubDevices();
      unsubCats();
      unsubDepts();
      unsubUnits();
    };
  }, []);

  const categoryMap = useMemo(() => {
    const m = new Map<string, CategoryRecord>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const deptMap = useMemo(() => {
    const m = new Map<string, DepartmentRecord>();
    departments.forEach((d) => m.set(d.id, d));
    return m;
  }, [departments]);

  const unitMap = useMemo(() => {
    const m = new Map<string, UnitRecord>();
    units.forEach((u) => m.set(u.id, u));
    return m;
  }, [units]);

  const filteredDevices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = devices.filter((dev) => {
      if (!showArchived && dev.isArchived) return false;
      if (showArchived && !dev.isArchived) return false;
      if (categoryFilter !== 'all' && dev.categoryId !== categoryFilter) return false;
      if (statusFilter !== 'all' && dev.storageStatus !== statusFilter) return false;
      if (departmentFilter !== 'all' && dev.departmentId !== departmentFilter) return false;

      if (!q) return true;
      return (
        dev.inventoryNumber.toLowerCase().includes(q) ||
        dev.name.toLowerCase().includes(q) ||
        (dev.serialNumber || '').toLowerCase().includes(q) ||
        (dev.model || '').toLowerCase().includes(q) ||
        (dev.manufacturer || '').toLowerCase().includes(q) ||
        (dev.barcode || '').toLowerCase().includes(q) ||
        (dev.recipientName || '').toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const valA = (a[sortField] || '').toString().toLowerCase();
      const valB = (b[sortField] || '').toString().toLowerCase();
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  }, [
    devices,
    showArchived,
    categoryFilter,
    statusFilter,
    departmentFilter,
    searchQuery,
    sortField,
    sortAsc,
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const openAddModal = () => {
    const defaultCat = categories.find((c) => c.isActive) || categories[0];
    const autoInv = generateNextInventoryNumber(
      defaultCat?.codePrefix || 'DEV',
      devices
    );
    setEditingDevice(null);
    setFormState({
      inventoryNumber: autoInv,
      name: '',
      categoryId: defaultCat?.id || '',
      manufacturer: '',
      model: '',
      serialNumber: '',
      purchaseDate: '',
      receivedDate: new Date().toISOString().slice(0, 10),
      acquisitionSource: '',
      technicalStatus: TECHNICAL_STATUS_OPTIONS[0],
      storageStatus: DeviceStorageStatus.IN_WAREHOUSE,
      currentLocation: 'المخزن الرئيسي',
      departmentId: '',
      unitId: '',
      recipientName: '',
      issuedDate: '',
      returnedDate: '',
      warrantyPeriod: '',
      barcode: autoInv,
      imageUrl: '',
      notes: '',
    });
    setFormOpen(true);
  };

  const openEditModal = (dev: DeviceRecord) => {
    setSelectedDevice(null);
    setEditingDevice(dev);
    setFormState({
      inventoryNumber: dev.inventoryNumber,
      name: dev.name,
      categoryId: dev.categoryId,
      manufacturer: dev.manufacturer || '',
      model: dev.model || '',
      serialNumber: dev.serialNumber || '',
      purchaseDate: dev.purchaseDate || '',
      receivedDate: dev.receivedDate || '',
      acquisitionSource: dev.acquisitionSource || '',
      technicalStatus: dev.technicalStatus || TECHNICAL_STATUS_OPTIONS[0],
      storageStatus: dev.storageStatus,
      currentLocation: dev.currentLocation || '',
      departmentId: dev.departmentId || '',
      unitId: dev.unitId || '',
      recipientName: dev.recipientName || '',
      issuedDate: dev.issuedDate || '',
      returnedDate: dev.returnedDate || '',
      warrantyPeriod: dev.warrantyPeriod || '',
      barcode: dev.barcode || dev.inventoryNumber,
      imageUrl: dev.imageUrl || '',
      notes: dev.notes || '',
    });
    setFormOpen(true);
  };

  const handleCategoryChange = (catId: string) => {
    if (!editingDevice) {
      const cat = categoryMap.get(catId);
      const nextInv = generateNextInventoryNumber(cat?.codePrefix || 'DEV', devices);
      setFormState((prev) => ({
        ...prev,
        categoryId: catId,
        inventoryNumber: nextInv,
        barcode: nextInv,
      }));
    } else {
      setFormState((prev) => ({ ...prev, categoryId: catId }));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const folderKey = editingDevice?.id || `draft_${Date.now()}`;
      const res = await uploadAssetAttachment('devices', folderKey, file);
      setFormState((prev) => ({ ...prev, imageUrl: res.downloadUrl }));
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر رفع صورة الجهاز.',
      });
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const actor = session?.fullName || 'موظف المخزن';
      if (editingDevice) {
        await updateDevice(editingDevice.id, formState, editingDevice, actor);
        setFeedback({
          type: 'success',
          message: `تم تحديث بطاقة الجهاز "${formState.name.trim()}" (${editingDevice.inventoryNumber}) بنجاح.`,
        });
      } else {
        await createDevice(formState, actor, devices);
        setFeedback({
          type: 'success',
          message: `تم تسجيل الجهاز "${formState.name.trim()}" برقم جرد ${formState.inventoryNumber} بنجاح.`,
        });
      }
      setFormOpen(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر حفظ بيانات الجهاز.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async (dev: DeviceRecord) => {
    setFeedback(null);
    try {
      await toggleArchiveDevice(dev, session?.fullName || 'موظف المخزن');
      setFeedback({
        type: 'success',
        message: dev.isArchived
          ? `تم إلغاء أرشفة الجهاز ${dev.inventoryNumber} وإعادته للمخزن.`
          : `تمت أرشفة الجهاز ${dev.inventoryNumber} مع الاحتفاظ بسجلاته التاريخية.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تنفيذ عملية الأرشفة.',
      });
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'رقم الجرد',
      'اسم الجهاز',
      'التصنيف',
      'الشركة المصنعة',
      'الموديل',
      'الرقم التسلسلي',
      'الحالة المخزنية',
      'الموقع الحالي',
      'الشعبة المستفيدة',
      'الوحدة المستفيدة',
      'المستلم',
      'تاريخ الاستلام',
      'الباركود',
    ];
    const rows = filteredDevices.map((d) => [
      d.inventoryNumber,
      d.name,
      categoryMap.get(d.categoryId)?.name || '',
      d.manufacturer || '',
      d.model || '',
      d.serialNumber || '',
      STORAGE_STATUS_LABELS[d.storageStatus],
      d.currentLocation || '',
      d.departmentId ? deptMap.get(d.departmentId)?.name || '' : '',
      d.unitId ? unitMap.get(d.unitId)?.name || '' : '',
      d.recipientName || '',
      d.receivedDate || '',
      d.barcode || '',
    ]);

    const csv =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        )
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sayed-mart-devices-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusClass = (status: DeviceStorageStatus) => {
    switch (status) {
      case DeviceStorageStatus.IN_WAREHOUSE:
        return 'text-emerald-700 dark:text-emerald-400';
      case DeviceStorageStatus.ISSUED:
        return 'text-blue-700 dark:text-blue-400';
      case DeviceStorageStatus.IN_MAINTENANCE:
        return 'text-amber-700 dark:text-amber-400';
      case DeviceStorageStatus.DAMAGED:
        return 'text-red-700 dark:text-red-400';
      default:
        return 'text-slate-500 dark:text-slate-400';
    }
  };

  const availableFormUnits = units.filter(
    (u) => u.departmentId === formState.departmentId && u.isActive
  );

  return (
    <div className="space-y-5">
      <PrintDocumentHeader
        title="قائمة جرد الأجهزة والمعدات التقنية"
        subtitle={
          showArchived
            ? 'السجل المؤرشف للأجهزة'
            : 'السجل الموحد للأجهزة الفردية النشطة حسب معايير التصفية الحالية'
        }
        docCode="INV-DEV"
        metaItems={[
          { label: 'عدد الأجهزة الظاهرة', value: filteredDevices.length },
          {
            label: 'بالمخزن',
            value: filteredDevices.filter(
              (d) => d.storageStatus === DeviceStorageStatus.IN_WAREHOUSE
            ).length,
          },
          {
            label: 'مصروفة',
            value: filteredDevices.filter(
              (d) => d.storageStatus === DeviceStorageStatus.ISSUED
            ).length,
          },
          { label: 'المُصدِر', value: session?.fullName || 'مسؤول النظام' },
        ]}
      />

      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>إجمالي البطاقات: {devices.filter((d) => !d.isArchived).length}</span>
            <span aria-hidden="true">·</span>
            <span>
              بالمخزن:{' '}
              {
                devices.filter(
                  (d) => !d.isArchived && d.storageStatus === DeviceStorageStatus.IN_WAREHOUSE
                ).length
              }
            </span>
            <span aria-hidden="true">·</span>
            <span>
              مصروفة:{' '}
              {
                devices.filter(
                  (d) => !d.isArchived && d.storageStatus === DeviceStorageStatus.ISSUED
                ).length
              }
            </span>
            <span aria-hidden="true">·</span>
            <span>مؤرشفة: {devices.filter((d) => d.isArchived).length}</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            السجل الموحد للأجهزة الفردية برقم جرد فريد وبطاقة مستقلة لكل جهاز.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredDevices.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 min-h-[40px]"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel/CSV</span>
          </button>

          <PrintSignatureTriggerButton className="min-h-[40px]" />

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[40px]"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] dark:hover:bg-[#D4AE60] transition-colors whitespace-nowrap min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة جهاز جديد</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 print:hidden ${
            feedback.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
              : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="إغلاق"
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Multi-Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 print:hidden">
        <div className="lg:col-span-4 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الجرد، الاسم، S/N، الباركود، المستلم..."
            className="w-full pr-10 pl-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="تصفية بالتصنيف"
          className="lg:col-span-3 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-xs sm:text-sm text-slate-900 dark:text-slate-100"
        >
          <option value="all">جميع التصنيفات</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="تصفية بالحالة"
          className="lg:col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-xs sm:text-sm text-slate-900 dark:text-slate-100"
        >
          <option value="all">جميع الحالات</option>
          <option value={DeviceStorageStatus.IN_WAREHOUSE}>متوفر في المخزن</option>
          <option value={DeviceStorageStatus.ISSUED}>مصروف لجهة</option>
          <option value={DeviceStorageStatus.IN_MAINTENANCE}>قيد الصيانة</option>
          <option value={DeviceStorageStatus.DAMAGED}>تالف</option>
        </select>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          aria-label="تصفية بالشعبة"
          className="lg:col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-xs sm:text-sm text-slate-900 dark:text-slate-100"
        >
          <option value="all">جميع الشعب</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setShowArchived((prev) => !prev)}
          className={`lg:col-span-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
            showArchived
              ? 'bg-[#0F2544] text-white border-[#0F2544] dark:bg-[#C59B47] dark:text-[#0B1220]'
              : 'bg-white dark:bg-[#111C2E] border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          {showArchived ? 'الأرشيف' : 'النشطة'}
        </button>
      </div>

      {/* Devices Directory Table */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-11 rounded bg-slate-100 dark:bg-slate-800/60"
              />
            ))}
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
              <HardDrive className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {devices.length === 0
                ? 'لا توجد أجهزة مسجلة في الدليل بعد'
                : 'لا توجد أجهزة مطابقة لمعايير التصفية'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              تأكد من إضافة التصنيفات أولاً من قسم تصنيفات الأجهزة، ثم أضف بطاقة مستقلة لكل جهاز ليتولد له رقم جرد وباركود فريد.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('inventoryNumber')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>رقم الجرد</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>اسم الجهاز</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-3 whitespace-nowrap">التصنيف</th>
                  <th className="py-3 px-3 whitespace-nowrap">الشركة / الموديل</th>
                  <th className="py-3 px-3 whitespace-nowrap">الرقم التسلسلي</th>
                  <th className="py-3 px-3 whitespace-nowrap">الحالة</th>
                  <th className="py-3 px-3 whitespace-nowrap">الموقع الحالي</th>
                  <th className="py-3 px-3 whitespace-nowrap">الجهة المستفيدة</th>
                  <th className="py-3 px-3 whitespace-nowrap">تاريخ الاستلام</th>
                  <th className="py-3 px-3 whitespace-nowrap">الباركود</th>
                  <th className="py-3 px-3 whitespace-nowrap print:hidden">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {filteredDevices.map((dev) => {
                  const catName = categoryMap.get(dev.categoryId)?.name || '—';
                  const deptName = dev.departmentId
                    ? deptMap.get(dev.departmentId)?.name || ''
                    : '';
                  const uName = dev.unitId ? unitMap.get(dev.unitId)?.name || '' : '';
                  const beneficiary =
                    [deptName, uName].filter(Boolean).join(' / ') ||
                    dev.recipientName ||
                    'المخزن';

                  return (
                    <tr
                      key={dev.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-3 font-mono-tabular font-semibold text-[#0F2544] dark:text-[#D4AE60] whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedDevice(dev)}
                          className="hover:underline"
                        >
                          {dev.inventoryNumber}
                        </button>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100 min-w-[160px]">
                        <button
                          type="button"
                          onClick={() => setSelectedDevice(dev)}
                          className="text-right hover:text-[#0F2544] dark:hover:text-[#D4AE60]"
                        >
                          {dev.name}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {catName}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {[dev.manufacturer, dev.model].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {dev.serialNumber || '—'}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`font-semibold ${getStatusClass(dev.storageStatus)}`}>
                          {STORAGE_STATUS_LABELS[dev.storageStatus]}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {dev.currentLocation || '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 min-w-[140px]">
                        <div>{beneficiary}</div>
                        {dev.recipientName && (
                          <div className="text-[11px] text-slate-400">
                            المستلم: {dev.recipientName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-slate-500 whitespace-nowrap">
                        {dev.receivedDate || '—'}
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {dev.barcode || dev.inventoryNumber}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap print:hidden">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedDevice(dev)}
                            title="عرض بطاقة الجهاز"
                            aria-label={`عرض بطاقة ${dev.inventoryNumber}`}
                            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(dev)}
                                title="تعديل الجهاز"
                                aria-label={`تعديل ${dev.inventoryNumber}`}
                                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleArchive(dev)}
                                title={dev.isArchived ? 'استعادة من الأرشيف' : 'أرشفة الجهاز'}
                                aria-label={
                                  dev.isArchived
                                    ? `استعادة ${dev.inventoryNumber}`
                                    : `أرشفة ${dev.inventoryNumber}`
                                }
                                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {dev.isArchived ? (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                ) : (
                                  <Archive className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PrintSignatureFooter />

      {/* Individual Device Card Modal */}
      {selectedDevice && (
        <DeviceCardModal
          device={selectedDevice}
          categoryName={categoryMap.get(selectedDevice.categoryId)?.name || 'غير مصنف'}
          departmentName={
            selectedDevice.departmentId
              ? deptMap.get(selectedDevice.departmentId)?.name || '—'
              : 'المخزن الرئيسي'
          }
          unitName={
            selectedDevice.unitId ? unitMap.get(selectedDevice.unitId)?.name || '—' : '—'
          }
          onClose={() => setSelectedDevice(null)}
          onEdit={(dev) => openEditModal(dev)}
        />
      )}

      {/* Add / Edit Device Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label={editingDevice ? 'تعديل بطاقة الجهاز' : 'تسجيل جهاز جديد'}
        >
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setFormOpen(false)}
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[92vh] rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingDevice
                  ? `تعديل بطاقة الجهاز: ${editingDevice.inventoryNumber}`
                  : 'تسجيل جهاز فردي جديد'}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="إغلاق"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    التصنيف <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formState.categoryId}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  >
                    <option value="">اختر التصنيف...</option>
                    {categories
                      .filter((c) => c.isActive || c.id === formState.categoryId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.codePrefix})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    رقم الجرد الفريد <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    disabled={Boolean(editingDevice)}
                    value={formState.inventoryNumber}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        inventoryNumber: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الباركود
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formState.barcode}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        barcode: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    اسم الجهاز <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="مثال: سويتش شبكات Cisco Catalyst 2960X"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الرقم التسلسلي (Serial Number)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formState.serialNumber}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, serialNumber: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الشركة المصنعة
                  </label>
                  <input
                    type="text"
                    value={formState.manufacturer}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, manufacturer: e.target.value }))
                    }
                    placeholder="Cisco / Dell / HP..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الموديل
                  </label>
                  <input
                    type="text"
                    value={formState.model}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, model: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    مدة الضمان
                  </label>
                  <input
                    type="text"
                    value={formState.warrantyPeriod}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, warrantyPeriod: e.target.value }))
                    }
                    placeholder="مثال: سنتان"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ الاستلام
                  </label>
                  <input
                    type="date"
                    value={formState.receivedDate}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, receivedDate: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ الشراء (إن توفر)
                  </label>
                  <input
                    type="date"
                    value={formState.purchaseDate}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, purchaseDate: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    مصدر التجهيز / سبب الإضافة
                  </label>
                  <input
                    type="text"
                    value={formState.acquisitionSource}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        acquisitionSource: e.target.value,
                      }))
                    }
                    placeholder="جرد سابق / تجهيز مركزي..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الحالة الفنية
                  </label>
                  <select
                    value={formState.technicalStatus}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, technicalStatus: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  >
                    {TECHNICAL_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الحالة المخزنية
                  </label>
                  <select
                    value={formState.storageStatus}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        storageStatus: e.target.value as DeviceStorageStatus,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  >
                    <option value={DeviceStorageStatus.IN_WAREHOUSE}>متوفر في المخزن</option>
                    <option value={DeviceStorageStatus.ISSUED}>مصروف (بعهدة جهة)</option>
                    <option value={DeviceStorageStatus.IN_MAINTENANCE}>قيد الصيانة</option>
                    <option value={DeviceStorageStatus.DAMAGED}>تالف / خارج الخدمة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الموقع الحالي
                  </label>
                  <input
                    type="text"
                    value={formState.currentLocation}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, currentLocation: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* Beneficiary Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الشعبة المستفيدة (إن وجدت)
                  </label>
                  <select
                    value={formState.departmentId}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        departmentId: e.target.value,
                        unitId: '',
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  >
                    <option value="">في المخزن (بدون جهة)</option>
                    {departments
                      .filter((d) => d.isActive || d.id === formState.departmentId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الوحدة المستفيدة
                  </label>
                  <select
                    value={formState.unitId}
                    disabled={!formState.departmentId}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, unitId: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm disabled:opacity-50"
                  >
                    <option value="">اختر الوحدة...</option>
                    {availableFormUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    اسم المستلم
                  </label>
                  <input
                    type="text"
                    value={formState.recipientName}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, recipientName: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* Image Upload */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    صورة الجهاز:
                  </span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    {formState.imageUrl ? 'تم إرفاق صورة بنجاح' : 'اختياري (يُرفع إلى Storage)'}
                  </span>
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer hover:bg-slate-50">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingImage ? 'جاري الرفع...' : 'رفع صورة الجهاز'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingImage}
                    onChange={handleImageUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  الملاحظات
                </label>
                <textarea
                  rows={2}
                  maxLength={800}
                  value={formState.notes}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImage}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-60"
                >
                  {saving ? 'جاري الحفظ...' : editingDevice ? 'حفظ التعديلات' : 'تسجيل الجهاز'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
