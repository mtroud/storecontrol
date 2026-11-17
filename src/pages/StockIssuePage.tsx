import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  Eye,
  HardDrive,
  Plus,
  QrCode,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { VoucherPreviewModal } from '../components/operations/VoucherPreviewModal';
import { useAuth } from '../context/AuthContext';
import { resolveAssetByScannedCode } from '../services/barcodeService';
import {
  ConsumableRecord,
  subscribeToConsumablesWithBalances,
} from '../services/consumablesService';
import {
  DepartmentRecord,
  subscribeToDepartments,
  subscribeToUnits,
  UnitRecord,
} from '../services/departmentsService';
import { DeviceRecord, subscribeToDevices } from '../services/devicesService';
import {
  executeStockIssue,
  generateVoucherNumber,
  IssueConsumableLine,
  PrintableVoucherData,
  StockIssueVoucherRecord,
  subscribeToStockIssues,
} from '../services/operationsService';
import { DeviceStorageStatus, UserRole } from '../types/inventory';

export function StockIssuePage() {
  const { session } = useAuth();
  const canExecute =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER ||
    session?.role === UserRole.WAREHOUSE_STAFF;

  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [consumables, setConsumables] = useState<ConsumableRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [issues, setIssues] = useState<StockIssueVoucherRecord[]>([]);

  const [voucherNumber, setVoucherNumber] = useState(() => generateVoucherNumber('ISS'));
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departmentId, setDepartmentId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [officialDocRef, setOfficialDocRef] = useState('');
  const [notes, setNotes] = useState('');

  // Quick scan/search to add
  const [scanInput, setScanInput] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  const [selectedItemId, setSelectedItemId] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [consumableLines, setConsumableLines] = useState<IssueConsumableLine[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [previewVoucher, setPreviewVoucher] = useState<PrintableVoucherData | null>(null);

  useEffect(() => {
    const unsubDevs = subscribeToDevices(setDevices, () => {});
    const unsubItems = subscribeToConsumablesWithBalances((list) => {
      const available = list.filter((i) => !i.isArchived && i.currentQuantity > 0);
      setConsumables(available);
      if (available.length > 0) setSelectedItemId((prev) => prev || available[0].id);
    }, () => {});
    const unsubDepts = subscribeToDepartments((list) => {
      const active = list.filter((d) => d.isActive);
      setDepartments(active);
      if (active.length > 0) setDepartmentId((prev) => prev || active[0].id);
    }, () => {});
    const unsubUnits = subscribeToUnits(setUnits, () => {});
    const unsubIssues = subscribeToStockIssues(setIssues, () => {});

    return () => {
      unsubDevs();
      unsubItems();
      unsubDepts();
      unsubUnits();
      unsubIssues();
    };
  }, []);

  const availableDevices = useMemo(() => {
    const q = deviceFilter.trim().toLowerCase();
    return devices.filter((d) => {
      if (d.isArchived || d.storageStatus !== DeviceStorageStatus.IN_WAREHOUSE) return false;
      if (!q) return true;
      return (
        d.inventoryNumber.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        (d.serialNumber || '').toLowerCase().includes(q) ||
        (d.barcode || '').toLowerCase().includes(q)
      );
    });
  }, [devices, deviceFilter]);

  const availableUnits = useMemo(
    () => units.filter((u) => u.departmentId === departmentId && u.isActive),
    [units, departmentId]
  );

  const selectedDevicesList = useMemo(
    () => devices.filter((d) => selectedDeviceIds.includes(d.id)),
    [devices, selectedDeviceIds]
  );

  const handleScanAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = scanInput.trim();
    if (!code) return;
    setFeedback(null);

    try {
      const res = await resolveAssetByScannedCode(code);
      if (!res) {
        setFeedback({ type: 'error', message: `لم يتم العثور على أصل بالرمز ${code}.` });
        return;
      }
      if (res.kind === 'DEVICE') {
        if (
          res.device.isArchived ||
          res.device.storageStatus !== DeviceStorageStatus.IN_WAREHOUSE
        ) {
          setFeedback({
            type: 'error',
            message: `الجهاز ${res.device.inventoryNumber} (${res.device.name}) غير متوفر للصرف حالياً.`,
          });
          return;
        }
        setSelectedDeviceIds((prev) =>
          prev.includes(res.device.id) ? prev : [...prev, res.device.id]
        );
        setScanInput('');
      } else {
        setSelectedItemId(res.item.id);
        setScanInput('');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر البحث عن الرمز.',
      });
    }
  };

  const toggleDeviceSelection = (id: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAddConsumableLine = () => {
    setFeedback(null);
    const item = consumables.find((c) => c.id === selectedItemId);
    if (!item) return;
    if (itemQty <= 0) {
      setFeedback({ type: 'error', message: 'الكمية المصروفة يجب أن تكون أكبر من صفر.' });
      return;
    }

    const existingLine = consumableLines.find((l) => l.itemId === item.id);
    const totalRequested = (existingLine?.quantity || 0) + itemQty;
    if (totalRequested > item.currentQuantity) {
      setFeedback({
        type: 'error',
        message: `الرصيد المتوفر من "${item.name}" هو ${item.currentQuantity} ${item.unitOfMeasure} فقط.`,
      });
      return;
    }

    setConsumableLines((prev) => {
      if (existingLine) {
        return prev.map((l) =>
          l.itemId === item.id ? { ...l, quantity: totalRequested } : l
        );
      }
      return [
        ...prev,
        {
          itemId: item.id,
          itemCode: item.itemCode,
          itemName: item.name,
          unitOfMeasure: item.unitOfMeasure,
          quantity: itemQty,
          minStock: item.minStock,
          reorderPoint: item.reorderPoint,
        },
      ];
    });
    setItemQty(1);
  };

  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);

    const dept = departments.find((d) => d.id === departmentId);
    const unit = units.find((u) => u.id === unitId);

    try {
      const created = await executeStockIssue({
        voucherNumber,
        issueDate,
        departmentId,
        departmentName: dept?.name || '',
        unitId: unit?.id || '',
        unitName: unit?.name || '',
        recipientName,
        officialDocRef,
        notes,
        actorName: session?.fullName || 'موظف المخزن',
        deviceIds: selectedDeviceIds,
        consumableLines,
      });

      setFeedback({
        type: 'success',
        message: `تم تنفيذ سند الصرف رقم ${created.voucherNumber} وتسليم العهدة إلى ${created.recipientName} بنجاح.`,
      });

      setPreviewVoucher({
        voucherNumber: created.voucherNumber,
        voucherType: 'ISSUE',
        title: 'سند صرف مخزني رسمي',
        date: created.issueDate,
        officialDocRef: created.officialDocRef,
        departmentName: created.departmentName,
        unitName: created.unitName,
        recipientName: created.recipientName,
        executedByName: created.issuedByName,
        notes: created.notes,
        lines: created.lines,
      });

      setSelectedDeviceIds([]);
      setConsumableLines([]);
      setRecipientName('');
      setOfficialDocRef('');
      setNotes('');
      setVoucherNumber(generateVoucherNumber('ISS'));
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تنفيذ عملية الصرف.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            صرف الموجودات إلى الشعب والوحدات
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            صرف مباشر من المخزن للشعب والوحدات التابعة للمجمع مع التحقق الفوري من التوفر ومنع الصرف المكرر.
          </p>
        </div>
        <div className="text-xs font-mono-tabular text-slate-500">
          الأجهزة المتاحة للصرف: {availableDevices.length}
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
              : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {canExecute && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left/Right Selection Panel */}
          <div className="xl:col-span-7 space-y-4">
            {/* Scan Barcode/QR quick add */}
            <form
              onSubmit={handleScanAdd}
              className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-2 items-center"
            >
              <QrCode className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60] shrink-0" />
              <input
                type="text"
                dir="ltr"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="امسح الباركود أو أدخل رقم الجرد للإضافة السريعة (SM-...)"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
              >
                إضافة بالرمز
              </button>
            </form>

            {/* Available Devices Picker */}
            <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                  <HardDrive className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60]" />
                  <span>الأجهزة المتوفرة في المخزن</span>
                </div>
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={deviceFilter}
                    onChange={(e) => setDeviceFilter(e.target.value)}
                    placeholder="تصفية الأجهزة..."
                    className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>

              {availableDevices.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  لا توجد أجهزة متوفرة في المخزن حالياً.
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {availableDevices.map((dev) => {
                    const checked = selectedDeviceIds.includes(dev.id);
                    return (
                      <label
                        key={dev.id}
                        className={`px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer ${
                          checked
                            ? 'bg-slate-50 dark:bg-slate-800/60'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDeviceSelection(dev.id)}
                            className="w-4 h-4 rounded border-slate-300"
                          />
                          <div className="min-w-0">
                            <div className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                              {dev.inventoryNumber}
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {dev.name}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                          {dev.serialNumber || dev.currentLocation || 'المخزن'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Consumables Picker */}
            <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                <Boxes className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60]" />
                <span>صرف مواد كمية / استهلاكية</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  aria-label="المادة الاستهلاكية"
                  className="sm:col-span-7 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                >
                  {consumables.length === 0 ? (
                    <option value="">لا توجد مواد كمية برصيد متوفر</option>
                  ) : (
                    consumables.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.itemCode} — {c.name} (المتوفر: {c.currentQuantity} {c.unitOfMeasure})
                      </option>
                    ))
                  )}
                </select>
                <input
                  type="number"
                  min={1}
                  value={itemQty}
                  onChange={(e) => setItemQty(Math.max(1, Number(e.target.value)))}
                  aria-label="الكمية المطلوبة"
                  className="sm:col-span-3 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
                <button
                  type="button"
                  disabled={consumables.length === 0}
                  onClick={handleAddConsumableLine}
                  className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>إدراج</span>
                </button>
              </div>
            </div>
          </div>

          {/* Issue Voucher Form */}
          <form
            onSubmit={handleSubmitIssue}
            className="xl:col-span-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4 self-start"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              بيانات سند الصرف والجهة المستفيدة
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  رقم السند
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={voucherNumber}
                  onChange={(e) => setVoucherNumber(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  تاريخ الصرف
                </label>
                <input
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                الشعبة المستفيدة <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setUnitId('');
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
              >
                <option value="">اختر الشعبة من الدليل...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                الوحدة المستفيدة (اختياري)
              </label>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
              >
                <option value="">على مستوى الشعبة مباشرة</option>
                {availableUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  اسم الشخص المستلم <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="الاسم الثلاثي للمستلم"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  رقم الطلب / الكتاب
                </label>
                <input
                  type="text"
                  value={officialDocRef}
                  onChange={(e) => setOfficialDocRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ملاحظات الصرف
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
            </div>

            {/* Selected lines */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-2">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                المحتويات المختارة للصرف ({selectedDevicesList.length + consumableLines.length})
              </div>
              {selectedDevicesList.length === 0 && consumableLines.length === 0 ? (
                <div className="text-[11px] text-slate-400">
                  اختر أجهزة أو مواد كمية من القائمة المجاورة.
                </div>
              ) : (
                <div className="space-y-1.5 text-xs">
                  {selectedDevicesList.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800"
                    >
                      <span className="truncate">
                        <strong className="font-mono-tabular">{d.inventoryNumber}</strong> ·{' '}
                        {d.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleDeviceSelection(d.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {consumableLines.map((c) => (
                    <div
                      key={c.itemId}
                      className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800"
                    >
                      <span className="truncate">
                        <strong className="font-mono-tabular">{c.itemCode}</strong> ·{' '}
                        {c.itemName} ({c.quantity} {c.unitOfMeasure})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setConsumableLines((prev) =>
                            prev.filter((l) => l.itemId !== c.itemId)
                          )
                        }
                        className="text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={
                submitting ||
                (selectedDevicesList.length === 0 && consumableLines.length === 0)
              }
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-50 min-h-[42px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'جاري الصرف...' : 'اعتماد وإصدار سند الصرف'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Recent Issues Table */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-slate-100">
          سجل سندات الصرف الصادرة
        </div>
        {issues.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد سندات صرف مسجلة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                  <th className="py-3 px-4">رقم السند</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">الجهة المستفيدة</th>
                  <th className="py-3 px-4">المستلم</th>
                  <th className="py-3 px-4">البنود</th>
                  <th className="py-3 px-4">السند</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {issues.map((iss) => (
                  <tr key={iss.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                      {iss.voucherNumber}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular">{iss.issueDate}</td>
                    <td className="py-3 px-4">
                      {[iss.departmentName, iss.unitName].filter(Boolean).join(' / ')}
                    </td>
                    <td className="py-3 px-4 font-semibold">{iss.recipientName}</td>
                    <td className="py-3 px-4 font-mono-tabular">{iss.lines?.length || 0} بند</td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewVoucher({
                            voucherNumber: iss.voucherNumber,
                            voucherType: 'ISSUE',
                            title: 'سند صرف مخزني رسمي',
                            date: iss.issueDate,
                            officialDocRef: iss.officialDocRef,
                            departmentName: iss.departmentName,
                            unitName: iss.unitName,
                            recipientName: iss.recipientName,
                            executedByName: iss.issuedByName,
                            notes: iss.notes,
                            lines: iss.lines || [],
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>عرض / طباعة</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <VoucherPreviewModal
        voucher={previewVoucher}
        onClose={() => setPreviewVoucher(null)}
      />
    </div>
  );
}
