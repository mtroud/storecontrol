import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  Eye,
  HardDrive,
  Layers,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { VoucherPreviewModal } from '../components/operations/VoucherPreviewModal';
import { useAuth } from '../context/AuthContext';
import {
  CategoryRecord,
  initializeOfficialCategoriesPreset,
  subscribeToCategories,
} from '../services/categoriesService';
import {
  ConsumableRecord,
  subscribeToConsumablesWithBalances,
} from '../services/consumablesService';
import {
  DeviceRecord,
  generateNextInventoryNumber,
  subscribeToDevices,
} from '../services/devicesService';
import {
  ConsumableReplenishLine,
  executeStockEntry,
  generateVoucherNumber,
  NewDeviceEntryLine,
  PrintableVoucherData,
  StockEntryVoucherRecord,
  subscribeToStockEntries,
} from '../services/operationsService';
import { uploadAssetAttachment } from '../services/storageService';
import { UserRole } from '../types/inventory';

export function StockEntryPage() {
  const { session } = useAuth();
  const canExecute =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER ||
    session?.role === UserRole.WAREHOUSE_STAFF;

  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [consumables, setConsumables] = useState<ConsumableRecord[]>([]);
  const [entries, setEntries] = useState<StockEntryVoucherRecord[]>([]);

  const [voucherNumber, setVoucherNumber] = useState(() => generateVoucherNumber('ENT'));
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState('تجهيز مركزي — العتبة الحسينية المقدسة');
  const [officialDocRef, setOfficialDocRef] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [notes, setNotes] = useState('');

  // Draft new device line
  const [devCatId, setDevCatId] = useState('');
  const [devInv, setDevInv] = useState('');
  const [devName, setDevName] = useState('');
  const [devManufacturer, setDevManufacturer] = useState('');
  const [devModel, setDevModel] = useState('');
  const [devSerial, setDevSerial] = useState('');
  const [devWarranty, setDevWarranty] = useState('');
  const [devLocation, setDevLocation] = useState('المخزن الرئيسي');
  const [devQuantity, setDevQuantity] = useState(1);
  const [newDevices, setNewDevices] = useState<NewDeviceEntryLine[]>([]);
  const [preparingBatch, setPreparingBatch] = useState(false);

  // Draft consumable replenish line
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
    const unsubCats = subscribeToCategories((cats) => {
      setCategories(cats);
      if (cats.length > 0) setDevCatId((prev) => prev || cats[0].id);
    }, () => {});
    const unsubDevs = subscribeToDevices(setDevices, () => {});
    const unsubItems = subscribeToConsumablesWithBalances((list) => {
      const active = list.filter((i) => !i.isArchived);
      setConsumables(active);
      if (active.length > 0) setSelectedItemId((prev) => prev || active[0].id);
    }, () => {});
    const unsubEntries = subscribeToStockEntries(setEntries, () => {});

    return () => {
      unsubCats();
      unsubDevs();
      unsubItems();
      unsubEntries();
    };
  }, []);

  const categoryMap = useMemo(() => {
    const m = new Map<string, CategoryRecord>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const computeSuggestedInv = (catId: string, queued: NewDeviceEntryLine[]) => {
    const prefix = categoryMap.get(catId)?.codePrefix || 'DEV';
    const virtualDevices: DeviceRecord[] = [
      ...devices,
      ...queued.map((q, idx) => ({
        id: `queued_${idx}`,
        inventoryNumber: q.inventoryNumber,
        name: q.name,
        categoryId: q.categoryId,
        storageStatus: devices[0]?.storageStatus,
        isArchived: false,
      })),
    ] as DeviceRecord[];
    return generateNextInventoryNumber(prefix, virtualDevices);
  };

  useEffect(() => {
    if (devCatId && !devInv) {
      setDevInv(computeSuggestedInv(devCatId, newDevices));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devCatId, devices.length]);

  const generateSequentialBatchNumbers = (
    startCode: string,
    count: number,
    usedSet: Set<string>
  ): string[] => {
    const cleanStart = startCode.trim().toUpperCase();
    const match = cleanStart.match(/^(.*?)(\d+)$/);
    const prefixPart = match ? match[1] : `${cleanStart}-`;
    let seq = match ? parseInt(match[2], 10) : 1;
    const width = match ? Math.max(4, match[2].length) : 4;

    const results: string[] = [];
    while (results.length < count) {
      const candidate = `${prefixPart}${String(seq).padStart(width, '0')}`;
      seq += 1;
      if (!usedSet.has(candidate)) {
        usedSet.add(candidate);
        results.push(candidate);
      }
    }
    return results;
  };

  const handleAddDeviceLine = () => {
    setFeedback(null);
    if (!devCatId || !devInv.trim() || !devName.trim()) {
      setFeedback({
        type: 'error',
        message: 'يرجى تحديد التصنيف ورقم الجرد واسم الجهاز قبل إضافته للسند.',
      });
      return;
    }
    const qty = Math.min(200, Math.max(1, Math.floor(Number(devQuantity) || 1)));
    const usedSet = new Set<string>([
      ...devices.map((d) => d.inventoryNumber.toUpperCase()),
      ...newDevices.map((d) => d.inventoryNumber.toUpperCase()),
    ]);

    const cleanInv = devInv.trim().toUpperCase();
    if (qty === 1 && usedSet.has(cleanInv)) {
      setFeedback({
        type: 'error',
        message: `رقم الجرد ${cleanInv} مستخدم أو مضاف مسبقاً.`,
      });
      return;
    }

    const allocatedNumbers =
      qty === 1
        ? [cleanInv]
        : generateSequentialBatchNumbers(cleanInv, qty, usedSet);

    const addedLines: NewDeviceEntryLine[] = allocatedNumbers.map((invCode, idx) => ({
      inventoryNumber: invCode,
      name: devName.trim(),
      categoryId: devCatId,
      manufacturer: devManufacturer.trim(),
      model: devModel.trim(),
      serialNumber:
        qty === 1 ? devSerial.trim() : devSerial.trim() ? `${devSerial.trim()}-${idx + 1}` : '',
      warrantyPeriod: devWarranty.trim(),
      storageLocation: devLocation.trim() || 'المخزن الرئيسي',
      receivedDate: entryDate,
    }));

    const nextQueued: NewDeviceEntryLine[] = [...newDevices, ...addedLines];
    setNewDevices(nextQueued);
    setDevName('');
    setDevSerial('');
    setDevQuantity(1);
    setDevInv(computeSuggestedInv(devCatId, nextQueued));
  };

  const handlePrepare2012PhonesBatch = async () => {
    setFeedback(null);
    setPreparingBatch(true);
    try {
      let targetCat = categories.find(
        (c) =>
          c.id === 'cat-telecom' ||
          c.codePrefix.toUpperCase() === 'COM' ||
          c.name.includes('اتصالات') ||
          c.name.includes('هواتف')
      );

      if (
        !targetCat &&
        (session?.role === UserRole.SYSTEM_ADMIN ||
          session?.role === UserRole.WAREHOUSE_MANAGER)
      ) {
        await initializeOfficialCategoriesPreset(categories);
        targetCat = {
          id: 'cat-telecom',
          name: 'أجهزة الاتصالات والبدالات',
          codePrefix: 'COM',
          isActive: true,
        };
      }

      const effectiveCatId = targetCat?.id || devCatId || categories[0]?.id || '';
      const effectivePrefix = targetCat?.codePrefix || categoryMap.get(effectiveCatId)?.codePrefix || 'COM';
      if (!effectiveCatId) {
        setFeedback({
          type: 'error',
          message: 'يرجى إنشاء تصنيف واحد على الأقل من صفحة التصنيفات قبل إدراج الأجهزة.',
        });
        return;
      }

      const usedSet = new Set<string>([
        ...devices.map((d) => d.inventoryNumber.toUpperCase()),
        ...newDevices.map((d) => d.inventoryNumber.toUpperCase()),
      ]);
      const startInv = generateNextInventoryNumber(effectivePrefix, [
        ...devices,
        ...newDevices.map((d, idx) => ({
          id: `queued_${idx}`,
          inventoryNumber: d.inventoryNumber,
          name: d.name,
          categoryId: d.categoryId,
          storageStatus: devices[0]?.storageStatus,
          isArchived: false,
        })),
      ] as DeviceRecord[]);

      const allocated = generateSequentialBatchNumbers(startInv, 63, usedSet);
      const batchDate = '2012-01-01';
      const batchNote = 'موجود في المخزن الرئيسي منذ عام 2012';

      const avayaLines: NewDeviceEntryLine[] = allocated.slice(0, 30).map((inv) => ({
        inventoryNumber: inv,
        name: 'هاتف شبكي Avaya',
        categoryId: effectiveCatId,
        manufacturer: 'Avaya',
        model: 'IP Phone',
        storageLocation: 'المخزن الرئيسي',
        receivedDate: batchDate,
        notes: batchNote,
      }));

      const yeastarLines: NewDeviceEntryLine[] = allocated.slice(30, 63).map((inv) => ({
        inventoryNumber: inv,
        name: 'هاتف شبكي Yeastar',
        categoryId: effectiveCatId,
        manufacturer: 'Yeastar',
        model: 'IP Phone (Yeaster)',
        storageLocation: 'المخزن الرئيسي',
        receivedDate: batchDate,
        notes: batchNote,
      }));

      const nextQueued = [...newDevices, ...avayaLines, ...yeastarLines];
      setDevCatId(effectiveCatId);
      setEntryDate(batchDate);
      setSource('رصيد مخزني سابق (منذ عام 2012)');
      setNotes('توثيق 30 هاتف Avaya و33 هاتف Yeastar الموجودة في المخزن منذ عام 2012');
      setNewDevices(nextQueued);
      setDevInv(computeSuggestedInv(effectiveCatId, nextQueued));
      setFeedback({
        type: 'success',
        message:
          'تم تجهيز 63 جهازاً في السند (30 هاتف Avaya + 33 هاتف Yeastar بتاريخ 2012-01-01). راجع البنود ثم اضغط «اعتماد سند الإدخال» لحفظها في قاعدة البيانات.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تجهيز دفعة الهواتف.',
      });
    } finally {
      setPreparingBatch(false);
    }
  };

  const handleAddConsumableLine = () => {
    setFeedback(null);
    const item = consumables.find((c) => c.id === selectedItemId);
    if (!item) return;
    if (itemQty <= 0) {
      setFeedback({ type: 'error', message: 'يجب أن تكون الكمية المدخلة أكبر من صفر.' });
      return;
    }

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

  const handleUploadMemo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingDoc(true);
    try {
      const res = await uploadAssetAttachment('entries', voucherNumber, file);
      setAttachmentUrl(res.downloadUrl);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر رفع المستند الرسمي.',
      });
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      const created = await executeStockEntry({
        voucherNumber,
        entryDate,
        source,
        officialDocRef,
        attachmentUrl,
        notes,
        actorName: session?.fullName || 'موظف المخزن',
        newDevices,
        consumableLines,
      });

      setFeedback({
        type: 'success',
        message: `تم اعتماد سند الإدخال رقم ${created.voucherNumber} وتحديث المخزن وسجل الحركات بنجاح.`,
      });
      setPreviewVoucher({
        voucherNumber: created.voucherNumber,
        voucherType: 'ENTRY',
        title: 'سند إدخال مخزني',
        date: created.entryDate,
        officialDocRef: created.officialDocRef,
        fromLocation: created.source,
        toLocation: 'المخزن الرئيسي — شعبة السيطرة والإنترنت',
        executedByName: created.recordedByName,
        notes: created.notes,
        lines: created.lines,
      });

      setNewDevices([]);
      setConsumableLines([]);
      setOfficialDocRef('');
      setAttachmentUrl('');
      setNotes('');
      setVoucherNumber(generateVoucherNumber('ENT'));
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تنفيذ سند الإدخال المخزني.',
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
            إضافة الموجودات والأرصدة للمخزن
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            توثيق استلام أجهزة جديدة (مع إنشاء بطاقة مستقلة لكل جهاز) أو تعزيز أرصدة المواد الاستهلاكية.
          </p>
        </div>
        <div className="text-xs font-mono-tabular text-slate-500">
          سندات الإدخال الأخيرة: {entries.length}
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
        <form
          onSubmit={handleSubmitEntry}
          className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-6"
        >
          {/* Voucher Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                رقم سند الإدخال
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={voucherNumber}
                onChange={(e) => setVoucherNumber(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                تاريخ الإدخال
              </label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                مصدر التجهيز / الجهة المسلّمة
              </label>
              <input
                type="text"
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                رقم الكتاب الرسمي (اختياري)
              </label>
              <input
                type="text"
                value={officialDocRef}
                onChange={(e) => setOfficialDocRef(e.target.value)}
                placeholder="مثال: 1425 / م.س / 2026"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
              />
            </div>
          </div>

          {/* Section A: Add Individual or Batch Devices */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0F2544] dark:text-[#D4AE60]">
                <HardDrive className="w-4 h-4" />
                <span>أولاً: إضافة أجهزة فردية أو دفعة أجهزة متماثلة (يُنشأ لكل جهاز بطاقة ورقم جرد فريد)</span>
              </div>
              <button
                type="button"
                disabled={preparingBatch}
                onClick={() => void handlePrepare2012PhonesBatch()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#C59B47] text-[#0F2544] dark:text-[#D4AE60] bg-[#C59B47]/10 hover:bg-[#C59B47]/20 disabled:opacity-50"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {preparingBatch
                    ? 'جاري تجهيز الدفعة...'
                    : 'تجهيز دفعة هواتف 2012 (30 Avaya + 33 Yeastar)'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  التصنيف
                </label>
                <select
                  value={devCatId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setDevCatId(cid);
                    setDevInv(computeSuggestedInv(cid, newDevices));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.codePrefix})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  رقم الجرد الفريد (البداية)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={devInv}
                  onChange={(e) => setDevInv(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  اسم الجهاز
                </label>
                <input
                  type="text"
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                  placeholder="مثال: هاتف شبكي Avaya"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  العدد (إدراج جماعي متسلسل)
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={devQuantity}
                  onChange={(e) =>
                    setDevQuantity(Math.min(200, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  الشركة المصنعة
                </label>
                <input
                  type="text"
                  value={devManufacturer}
                  onChange={(e) => setDevManufacturer(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  الموديل
                </label>
                <input
                  type="text"
                  value={devModel}
                  onChange={(e) => setDevModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  الرقم التسلسلي (S/N)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={devSerial}
                  onChange={(e) => setDevSerial(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    موقع التخزين
                  </label>
                  <input
                    type="text"
                    value={devLocation}
                    onChange={(e) => setDevLocation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddDeviceLine}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>{devQuantity > 1 ? `إدراج (${devQuantity})` : 'إدراج'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section B: Replenish Consumables */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0F2544] dark:text-[#D4AE60]">
              <Boxes className="w-4 h-4" />
              <span>ثانياً: تعزيز أرصدة المواد الكمية والاستهلاكية</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
              <div className="sm:col-span-7">
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  aria-label="اختيار المادة الكمية"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                >
                  {consumables.length === 0 ? (
                    <option value="">لا توجد مواد كمية مسجلة في الدليل</option>
                  ) : (
                    consumables.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.itemCode} — {item.name} (الرصيد الحالي: {item.currentQuantity}{' '}
                        {item.unitOfMeasure})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="sm:col-span-3">
                <input
                  type="number"
                  min={1}
                  value={itemQty}
                  onChange={(e) => setItemQty(Math.max(1, Number(e.target.value)))}
                  aria-label="الكمية المضافة"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={consumables.length === 0}
                  onClick={handleAddConsumableLine}
                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة</span>
                </button>
              </div>
            </div>
          </div>

          {/* Pending Voucher Lines Summary */}
          {(newDevices.length > 0 || consumableLines.length > 0) && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 text-xs font-bold text-slate-800 dark:text-slate-200 flex flex-wrap items-center justify-between gap-2">
                <span>
                  البنود المدرجة في السند ({newDevices.length + consumableLines.length} بند —{' '}
                  {newDevices.length} جهاز، {consumableLines.length} مادة كمية)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNewDevices([]);
                    setConsumableLines([]);
                    if (devCatId) setDevInv(computeSuggestedInv(devCatId, []));
                  }}
                  className="text-[11px] font-semibold text-red-600 hover:underline"
                >
                  تفريغ جميع البنود
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {newDevices.map((d, idx) => (
                  <div
                    key={d.inventoryNumber}
                    className="px-4 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                        {d.inventoryNumber}
                      </span>{' '}
                      · <span className="font-semibold">{d.name}</span>{' '}
                      {d.manufacturer && (
                        <span className="text-slate-500">({d.manufacturer})</span>
                      )}{' '}
                      <span className="text-slate-400">
                        · {categoryMap.get(d.categoryId)?.name || 'أجهزة الاتصالات والبدالات'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNewDevices((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="حذف"
                      className="text-red-600 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {consumableLines.map((c) => (
                  <div
                    key={c.itemId}
                    className="px-4 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                        {c.itemCode}
                      </span>{' '}
                      · <span className="font-semibold">{c.itemName}</span>{' '}
                      <span className="font-mono-tabular font-bold text-emerald-700 dark:text-emerald-400">
                        (+{c.quantity} {c.unitOfMeasure})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setConsumableLines((prev) =>
                          prev.filter((l) => l.itemId !== c.itemId)
                        )
                      }
                      aria-label="حذف"
                      className="text-red-600 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes + Official Document Upload + Submit */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            <div className="lg:col-span-6">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ملاحظات سند الإدخال
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات إضافية عن حالة الاستلام أو الضمان..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="inline-flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 cursor-pointer hover:bg-slate-100 min-h-[38px]">
                <Upload className="w-4 h-4" />
                <span>
                  {uploadingDoc
                    ? 'جاري الرفع...'
                    : attachmentUrl
                      ? 'تم إرفاق الكتاب ✓'
                      : 'إرفاق كتاب / وصل'}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={uploadingDoc}
                  onChange={handleUploadMemo}
                  className="sr-only"
                />
              </label>
            </div>

            <div className="lg:col-span-3">
              <button
                type="submit"
                disabled={
                  submitting ||
                  uploadingDoc ||
                  (newDevices.length === 0 && consumableLines.length === 0)
                }
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-50 min-h-[40px]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'جاري التنفيذ...' : 'اعتماد سند الإدخال'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Recent Stock Entry Vouchers */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-slate-100">
          سجل سندات الإدخال المخزني
        </div>
        {entries.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد سندات إدخال مسجلة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                  <th className="py-3 px-4">رقم السند</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">المصدر</th>
                  <th className="py-3 px-4">البنود</th>
                  <th className="py-3 px-4">المسجّل</th>
                  <th className="py-3 px-4">السند</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {entries.map((ent) => (
                  <tr key={ent.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                      {ent.voucherNumber}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular">{ent.entryDate}</td>
                    <td className="py-3 px-4">{ent.source}</td>
                    <td className="py-3 px-4 font-mono-tabular">{ent.lines?.length || 0} بند</td>
                    <td className="py-3 px-4">{ent.recordedByName}</td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewVoucher({
                            voucherNumber: ent.voucherNumber,
                            voucherType: 'ENTRY',
                            title: 'سند إدخال مخزني',
                            date: ent.entryDate,
                            officialDocRef: ent.officialDocRef,
                            fromLocation: ent.source,
                            toLocation: 'المخزن الرئيسي',
                            executedByName: ent.recordedByName,
                            notes: ent.notes,
                            lines: ent.lines || [],
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
