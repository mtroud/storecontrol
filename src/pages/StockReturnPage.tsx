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
import { DeviceRecord, subscribeToDevices } from '../services/devicesService';
import {
  ConsumableReplenishLine,
  executeStockReturn,
  generateVoucherNumber,
  PrintableVoucherData,
  StockReturnVoucherRecord,
  subscribeToStockReturns,
} from '../services/operationsService';
import { DeviceStorageStatus, UserRole } from '../types/inventory';

const INSPECTION_LABELS: Record<'WORKING' | 'NEEDS_MAINTENANCE' | 'DAMAGED', string> = {
  WORKING: 'سليم ويعمل بكفاءة (إعادة للمخزن)',
  NEEDS_MAINTENANCE: 'يحتاج إلى صيانة (تحويل تلقائي لورشة الصيانة)',
  DAMAGED: 'تالف / غير قابل للإصلاح',
};

export function StockReturnPage() {
  const { session } = useAuth();
  const canExecute =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER ||
    session?.role === UserRole.WAREHOUSE_STAFF;

  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [consumables, setConsumables] = useState<ConsumableRecord[]>([]);
  const [returns, setReturns] = useState<StockReturnVoucherRecord[]>([]);

  const [voucherNumber, setVoucherNumber] = useState(() => generateVoucherNumber('RET'));
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [returnedByName, setReturnedByName] = useState('');
  const [inspectionOutcome, setInspectionOutcome] = useState<
    'WORKING' | 'NEEDS_MAINTENANCE' | 'DAMAGED'
  >('WORKING');
  const [faultDescription, setFaultDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmedPhysicalReceipt, setConfirmedPhysicalReceipt] = useState(false);

  const [scanInput, setScanInput] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  const [selectedItemId, setSelectedItemId] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [consumableLines, setConsumableLines] = useState<ConsumableReplenishLine[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [previewVoucher, setPreviewVoucher] = useState<PrintableVoucherData | null>(null);

  useEffect(() => {
    const unsubDevs = subscribeToDevices(setDevices, () => {});
    const unsubItems = subscribeToConsumablesWithBalances((list) => {
      const active = list.filter((i) => !i.isArchived);
      setConsumables(active);
      if (active.length > 0) setSelectedItemId((prev) => prev || active[0].id);
    }, () => {});
    const unsubReturns = subscribeToStockReturns(setReturns, () => {});

    return () => {
      unsubDevs();
      unsubItems();
      unsubReturns();
    };
  }, []);

  const issuedDevices = useMemo(() => {
    const q = deviceFilter.trim().toLowerCase();
    return devices.filter((d) => {
      if (d.isArchived || d.storageStatus !== DeviceStorageStatus.ISSUED) return false;
      if (!q) return true;
      return (
        d.inventoryNumber.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        (d.recipientName || '').toLowerCase().includes(q) ||
        (d.currentLocation || '').toLowerCase().includes(q)
      );
    });
  }, [devices, deviceFilter]);

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
        if (res.device.isArchived || res.device.storageStatus !== DeviceStorageStatus.ISSUED) {
          setFeedback({
            type: 'error',
            message: `الجهاز ${res.device.inventoryNumber} غير مصروف حالياً لإرجاعه.`,
          });
          return;
        }
        setSelectedDeviceIds((prev) =>
          prev.includes(res.device.id) ? prev : [...prev, res.device.id]
        );
        if (!returnedByName && res.device.recipientName) {
          setReturnedByName(res.device.recipientName);
        }
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

  const toggleDevice = (dev: DeviceRecord) => {
    setSelectedDeviceIds((prev) => {
      const exists = prev.includes(dev.id);
      if (!exists && !returnedByName && dev.recipientName) {
        setReturnedByName(dev.recipientName);
      }
      return exists ? prev.filter((id) => id !== dev.id) : [...prev, dev.id];
    });
  };

  const handleAddConsumableLine = () => {
    const item = consumables.find((c) => c.id === selectedItemId);
    if (!item || itemQty <= 0) return;

    setConsumableLines((prev) => {
      const exists = prev.find((l) => l.itemId === item.id);
      if (exists) {
        return prev.map((l) =>
          l.itemId === item.id ? { ...l, quantity: l.quantity + itemQty } : l
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
        },
      ];
    });
    setItemQty(1);
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!confirmedPhysicalReceipt) {
      setFeedback({
        type: 'error',
        message: 'يرجى تأكيد الاستلام الفعلي وفحص الأصل قبل إتمام الإرجاع.',
      });
      return;
    }
    setSubmitting(true);
    try {
      const created = await executeStockReturn({
        voucherNumber,
        returnDate,
        returnedByName,
        inspectionOutcome,
        faultDescription,
        notes,
        actorName: session?.fullName || 'موظف المخزن',
        deviceIds: selectedDeviceIds,
        consumableLines,
      });

      setFeedback({
        type: 'success',
        message: `تم توثيق سند الإرجاع رقم ${created.voucherNumber} وتحديث حالة الأصول وسجل الصيانة بنجاح.`,
      });

      setPreviewVoucher({
        voucherNumber: created.voucherNumber,
        voucherType: 'RETURN',
        title: 'سند إرجاع مخزني وفحص فني',
        date: created.returnDate,
        fromLocation: `إرجاع بواسطة: ${created.returnedByName}`,
        toLocation: INSPECTION_LABELS[created.inspectionOutcome],
        recipientName: created.returnedByName,
        executedByName: created.receivedByName,
        notes: created.notes,
        lines: created.lines,
      });

      setSelectedDeviceIds([]);
      setConsumableLines([]);
      setReturnedByName('');
      setFaultDescription('');
      setNotes('');
      setConfirmedPhysicalReceipt(false);
      setVoucherNumber(generateVoucherNumber('RET'));
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تنفيذ عملية الإرجاع.',
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
            إرجاع الموجودات إلى المخزن
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            استلام الأجهزة المعادة من الشعب والوحدات، فحص الحالة الفنية، وإعادتها للمخزن أو تحويلها للصيانة تلقائياً.
          </p>
        </div>
        <div className="text-xs font-mono-tabular text-slate-500">
          الأجهزة المصروفة حالياً: {issuedDevices.length}
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
          <div className="xl:col-span-7 space-y-4">
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
                placeholder="امسح باركود الجهاز المصروف لإدراجه في الإرجاع..."
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
              >
                إدراج بالرمز
              </button>
            </form>

            <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                  <HardDrive className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60]" />
                  <span>الأجهزة الموجودة بعهدة الشعب والوحدات</span>
                </div>
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={deviceFilter}
                    onChange={(e) => setDeviceFilter(e.target.value)}
                    placeholder="بحث بالاسم أو المستلم أو رقم الجرد..."
                    className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>

              {issuedDevices.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  لا توجد أجهزة مصروفة حالياً لدى الشعب.
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {issuedDevices.map((dev) => {
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
                            onChange={() => toggleDevice(dev)}
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
                        <div className="text-left text-[11px] text-slate-500 shrink-0">
                          <div>{dev.currentLocation || '—'}</div>
                          <div>المستلم: {dev.recipientName || '—'}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                <Boxes className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60]" />
                <span>إرجاع مواد كمية غير مستخدمة</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="sm:col-span-7 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                >
                  {consumables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.itemCode} — {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={itemQty}
                  onChange={(e) => setItemQty(Math.max(1, Number(e.target.value)))}
                  className="sm:col-span-3 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
                <button
                  type="button"
                  disabled={consumables.length === 0}
                  onClick={handleAddConsumableLine}
                  className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Plus className="w-4 h-4" />
                  <span>إدراج</span>
                </button>
              </div>
            </div>
          </div>

          {/* Return Assessment Form */}
          <form
            onSubmit={handleSubmitReturn}
            className="xl:col-span-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4 self-start"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              بيانات الاستلام والفحص الفني
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  رقم سند الإرجاع
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
                  تاريخ الإرجاع
                </label>
                <input
                  type="date"
                  required
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                اسم الشخص المُرجِع <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={returnedByName}
                onChange={(e) => setReturnedByName(e.target.value)}
                placeholder="الاسم الثلاثي لمُسلّم الأصل المعاد"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                نتيجة الفحص الفني عند الاستلام
              </label>
              <select
                value={inspectionOutcome}
                onChange={(e) =>
                  setInspectionOutcome(
                    e.target.value as 'WORKING' | 'NEEDS_MAINTENANCE' | 'DAMAGED'
                  )
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
              >
                <option value="WORKING">{INSPECTION_LABELS.WORKING}</option>
                <option value="NEEDS_MAINTENANCE">{INSPECTION_LABELS.NEEDS_MAINTENANCE}</option>
                <option value="DAMAGED">{INSPECTION_LABELS.DAMAGED}</option>
              </select>
            </div>

            {inspectionOutcome !== 'WORKING' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  وصف العطل أو الضرر
                </label>
                <input
                  type="text"
                  value={faultDescription}
                  onChange={(e) => setFaultDescription(e.target.value)}
                  placeholder="وصف موجز لسبب التحويل للصيانة أو التلف..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ملاحظات الاستلام
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-1.5 text-xs">
              <div className="font-bold">
                المشمول بالإرجاع ({selectedDevicesList.length + consumableLines.length})
              </div>
              {selectedDevicesList.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2">
                  <span>
                    <strong className="font-mono-tabular">{d.inventoryNumber}</strong> · {d.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleDevice(d)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {consumableLines.map((c) => (
                <div key={c.itemId} className="flex items-center justify-between gap-2">
                  <span>
                    <strong className="font-mono-tabular">{c.itemCode}</strong> · {c.itemName} (+
                    {c.quantity})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setConsumableLines((prev) => prev.filter((l) => l.itemId !== c.itemId))
                    }
                    className="text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedPhysicalReceipt}
                onChange={(e) => setConfirmedPhysicalReceipt(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300"
              />
              <span>
                أقر باستلام الأصول المحددة فعلياً وفحص حالتها الفنية والملحقات المرافقة لها.
              </span>
            </label>

            <button
              type="submit"
              disabled={
                submitting ||
                !confirmedPhysicalReceipt ||
                (selectedDevicesList.length === 0 && consumableLines.length === 0)
              }
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-50 min-h-[42px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'جاري التوثيق...' : 'تأكيد الاستلام وإصدار سند الإرجاع'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Recent Return Vouchers */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-slate-100">
          سجل سندات الإرجاع المخزني
        </div>
        {returns.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد سندات إرجاع مسجلة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                  <th className="py-3 px-4">رقم السند</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">المُرجِع</th>
                  <th className="py-3 px-4">نتيجة الفحص</th>
                  <th className="py-3 px-4">البنود</th>
                  <th className="py-3 px-4">السند</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {returns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                      {ret.voucherNumber}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular">{ret.returnDate}</td>
                    <td className="py-3 px-4 font-semibold">{ret.returnedByName}</td>
                    <td className="py-3 px-4">{INSPECTION_LABELS[ret.inspectionOutcome]}</td>
                    <td className="py-3 px-4 font-mono-tabular">{ret.lines?.length || 0} بند</td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewVoucher({
                            voucherNumber: ret.voucherNumber,
                            voucherType: 'RETURN',
                            title: 'سند إرجاع مخزني وفحص فني',
                            date: ret.returnDate,
                            fromLocation: ret.returnedByName,
                            toLocation: INSPECTION_LABELS[ret.inspectionOutcome],
                            recipientName: ret.returnedByName,
                            executedByName: ret.receivedByName,
                            notes: ret.notes,
                            lines: ret.lines || [],
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
