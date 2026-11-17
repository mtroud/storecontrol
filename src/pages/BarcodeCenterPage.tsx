import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Download,
  ExternalLink,
  FileDown,
  HardDrive,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { BarcodePreview } from '../components/barcode/BarcodePreview';
import { LiveCameraScanner } from '../components/barcode/LiveCameraScanner';
import { QrCodeUtilityPanel } from '../components/barcode/QrCodeUtilityPanel';
import { PrintDocumentHeader } from '../components/common/PrintDocumentHeader';
import { DeviceCardModal } from '../components/devices/DeviceCardModal';
import {
  AssetLabelData,
  BarcodeLookupResult,
  buildConsumableLabelData,
  buildDeviceLabelData,
  checkBarcodeAvailability,
  downloadLabelPng,
  downloadLabelsPdf,
  LabelLayoutMode,
  LabelSizePreset,
  renderStickerCanvas,
  resolveAssetByScannedCode,
} from '../services/barcodeService';
import { CategoryRecord, subscribeToCategories } from '../services/categoriesService';
import {
  ConsumableRecord,
  generateNextItemCode,
  subscribeToConsumablesWithBalances,
} from '../services/consumablesService';
import {
  DepartmentRecord,
  subscribeToDepartments,
  subscribeToUnits,
  UnitRecord,
} from '../services/departmentsService';
import {
  DeviceRecord,
  generateNextInventoryNumber,
  STORAGE_STATUS_LABELS,
  subscribeToDevices,
} from '../services/devicesService';

type BarcodeTabId = 'labels' | 'qr-utility' | 'scanner' | 'generator';

export function BarcodeCenterPage() {
  const [activeTab, setActiveTab] = useState<BarcodeTabId>('labels');

  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [consumables, setConsumables] = useState<ConsumableRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Scanner tab state
  const [searchingScan, setSearchingScan] = useState(false);
  const [scanResult, setScanResult] = useState<BarcodeLookupResult | null>(null);
  const [scanNotFoundCode, setScanNotFoundCode] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<
    Array<{ code: string; title: string; kind: string; at: string }>
  >([]);
  const [openedDeviceCard, setOpenedDeviceCard] = useState<{
    device: DeviceRecord;
    categoryName: string;
    departmentName: string;
    unitName: string;
  } | null>(null);

  // Labels & printing tab state
  const [assetKindFilter, setAssetKindFilter] = useState<'all' | 'devices' | 'consumables'>('all');
  const [labelSearch, setLabelSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusedLabelKey, setFocusedLabelKey] = useState<string>('');
  const [labelPreset, setLabelPreset] = useState<LabelSizePreset>('thermal_70x40');
  const [labelLayoutMode, setLabelLayoutMode] = useState<LabelLayoutMode>('combined');
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [printBatchDataUrls, setPrintBatchDataUrls] = useState<
    Array<{ key: string; code: string; src: string }>
  >([]);
  const [exporting, setExporting] = useState(false);
  const [labelFeedback, setLabelFeedback] = useState<string | null>(null);

  // Code generator & uniqueness checker state
  const [genAssetType, setGenAssetType] = useState<'DEVICE' | 'CONSUMABLE'>('DEVICE');
  const [genCategoryId, setGenCategoryId] = useState('');
  const [customCheckCode, setCustomCheckCode] = useState('');
  const [checkingCode, setCheckingCode] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<{
    checkedCode: string;
    available: boolean;
    existingTargetType?: string;
    existingTargetId?: string;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubDevices = subscribeToDevices(
      (list) => {
        setDevices(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    const unsubItems = subscribeToConsumablesWithBalances(setConsumables, () => {});
    const unsubCats = subscribeToCategories((cats) => {
      setCategories(cats);
      if (cats.length > 0) {
        setGenCategoryId((prev) => prev || cats[0].id);
      }
    }, () => {});
    const unsubDepts = subscribeToDepartments(setDepartments, () => {});
    const unsubUnits = subscribeToUnits(setUnits, () => {});

    return () => {
      unsubDevices();
      unsubItems();
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

  const allLabels = useMemo<AssetLabelData[]>(() => {
    const devLabels = devices
      .filter((d) => !d.isArchived)
      .map((d) => buildDeviceLabelData(d, categoryMap.get(d.categoryId)?.name || 'جهاز تقني'));
    const itemLabels = consumables
      .filter((i) => !i.isArchived)
      .map((i) => buildConsumableLabelData(i, categoryMap.get(i.categoryId)?.name || 'مادة كمية'));
    return [...devLabels, ...itemLabels];
  }, [devices, consumables, categoryMap]);

  const filteredLabels = useMemo(() => {
    const q = labelSearch.trim().toLowerCase();
    return allLabels.filter((lbl) => {
      if (assetKindFilter === 'devices' && lbl.kind !== 'DEVICE') return false;
      if (assetKindFilter === 'consumables' && lbl.kind !== 'CONSUMABLE') return false;
      if (!q) return true;
      return (
        lbl.id.toLowerCase().includes(q) ||
        lbl.code.toLowerCase().includes(q) ||
        lbl.barcodeValue.toLowerCase().includes(q) ||
        lbl.title.toLowerCase().includes(q) ||
        lbl.subtitle.toLowerCase().includes(q)
      );
    });
  }, [allLabels, assetKindFilter, labelSearch]);

  const focusedLabel = useMemo(() => {
    if (focusedLabelKey) {
      const found = allLabels.find((l) => `${l.kind}:${l.id}` === focusedLabelKey);
      if (found) return found;
    }
    return filteredLabels[0] || allLabels[0] || null;
  }, [focusedLabelKey, allLabels, filteredLabels]);

  useEffect(() => {
    let active = true;
    if (!focusedLabel) {
      setPreviewDataUrl('');
      return;
    }
    const effectivePreset: LabelSizePreset =
      labelPreset === 'a4_sheet' ? 'thermal_70x40' : labelPreset;

    renderStickerCanvas(focusedLabel, effectivePreset, { layoutMode: labelLayoutMode })
      .then((canvas) => {
        if (active) setPreviewDataUrl(canvas.toDataURL('image/png'));
      })
      .catch(() => {
        if (active) setPreviewDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [focusedLabel, labelPreset, labelLayoutMode]);

  const selectedLabels = useMemo(() => {
    const keySet = new Set(selectedIds);
    return allLabels.filter((l) => keySet.has(`${l.kind}:${l.id}`));
  }, [allLabels, selectedIds]);

  const printTargets = useMemo(() => {
    if (selectedLabels.length > 0) return selectedLabels;
    return focusedLabel ? [focusedLabel] : [];
  }, [selectedLabels, focusedLabel]);

  useEffect(() => {
    let active = true;
    if (activeTab !== 'labels' || printTargets.length === 0) {
      setPrintBatchDataUrls([]);
      return;
    }
    const effectivePreset: LabelSizePreset =
      labelPreset === 'a4_sheet' ? 'thermal_70x40' : labelPreset;

    Promise.all(
      printTargets.slice(0, 63).map(async (lbl) => {
        const canvas = await renderStickerCanvas(lbl, effectivePreset, {
          layoutMode: labelLayoutMode,
        });
        return {
          key: `${lbl.kind}:${lbl.id}`,
          code: lbl.code,
          src: canvas.toDataURL('image/png'),
        };
      })
    )
      .then((items) => {
        if (active) setPrintBatchDataUrls(items);
      })
      .catch(() => {
        if (active) setPrintBatchDataUrls([]);
      });

    return () => {
      active = false;
    };
  }, [activeTab, printTargets, labelPreset, labelLayoutMode]);

  const toggleSelectLabel = (key: string) => {
    setSelectedIds((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleSelectAllFiltered = () => {
    const filteredKeys = filteredLabels.map((l) => `${l.kind}:${l.id}`);
    const allSelected =
      filteredKeys.length > 0 && filteredKeys.every((k) => selectedIds.includes(k));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((k) => !filteredKeys.includes(k)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredKeys])));
    }
  };

  const handleDownloadSinglePng = async () => {
    if (!focusedLabel) return;
    setExporting(true);
    setLabelFeedback(null);
    try {
      const preset: LabelSizePreset =
        labelPreset === 'a4_sheet' ? 'thermal_70x40' : labelPreset;
      await downloadLabelPng(focusedLabel, preset, { layoutMode: labelLayoutMode });
      setLabelFeedback(`تم تحميل ملصق PNG للرمز ${focusedLabel.code} بنجاح.`);
    } catch (err) {
      setLabelFeedback(err instanceof Error ? err.message : 'تعذر تصدير الملصق PNG.');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadPdf = async (targets: AssetLabelData[]) => {
    if (targets.length === 0) return;
    setExporting(true);
    setLabelFeedback(null);
    try {
      await downloadLabelsPdf(targets, labelPreset, { layoutMode: labelLayoutMode });
      setLabelFeedback(
        `تم إنشاء وتنزيل ملف PDF لعدد ${targets.length} ملصق(ات) بنجاح.`
      );
    } catch (err) {
      setLabelFeedback(err instanceof Error ? err.message : 'تعذر إنشاء ملف PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handleScanCode = async (code: string) => {
    setSearchingScan(true);
    setScanError(null);
    setScanNotFoundCode(null);
    setScanResult(null);

    try {
      const found = await resolveAssetByScannedCode(code);
      if (!found) {
        setScanNotFoundCode(code);
        return;
      }
      setScanResult(found);
      const entry =
        found.kind === 'DEVICE'
          ? {
              code: found.device.inventoryNumber,
              title: found.device.name,
              kind: 'جهاز',
              at: new Date().toLocaleTimeString('ar-IQ', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
            }
          : {
              code: found.item.itemCode,
              title: found.item.name,
              kind: 'مادة كمية',
              at: new Date().toLocaleTimeString('ar-IQ', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
            };
      setScanHistory((prev) => [entry, ...prev].slice(0, 8));
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'حدث خطأ أثناء البحث.');
    } finally {
      setSearchingScan(false);
    }
  };

  const suggestedGeneratedCode = useMemo(() => {
    const cat = categoryMap.get(genCategoryId);
    const prefix = cat?.codePrefix || (genAssetType === 'DEVICE' ? 'DEV' : 'CON');
    return genAssetType === 'DEVICE'
      ? generateNextInventoryNumber(prefix, devices)
      : generateNextItemCode(prefix, consumables);
  }, [genAssetType, genCategoryId, categoryMap, devices, consumables]);

  useEffect(() => {
    if (!customCheckCode) {
      setCustomCheckCode(suggestedGeneratedCode);
    }
  }, [suggestedGeneratedCode, customCheckCode]);

  const handleCheckCodeUniqueness = async (codeToCheck: string) => {
    const trimmed = codeToCheck.trim().toUpperCase();
    if (!trimmed) return;
    setCheckingCode(true);
    setAvailabilityResult(null);
    try {
      const res = await checkBarcodeAvailability(trimmed);
      setAvailabilityResult({
        checkedCode: res.sanitizedKey || trimmed,
        available: res.available,
        existingTargetType: res.existingTargetType,
        existingTargetId: res.existingTargetId,
      });
    } catch (err) {
      setLabelFeedback(err instanceof Error ? err.message : 'تعذر فحص الرمز في Firestore.');
    } finally {
      setCheckingCode(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>الرموز المسجلة: {allLabels.length}</span>
            <span aria-hidden="true">·</span>
            <span>Code 128 + QR Code</span>
            <span aria-hidden="true">·</span>
            <span>فحص التكرار عبر barcodeIndex</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            توليد وطباعة ملصقات الباركود وQR Code، ومسح الموجودات بالكاميرا الخلفية أو قارئ الباركود USB.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="أقسام مركز الباركود"
          className="inline-flex flex-wrap items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 self-start"
        >
          {(
            [
              { id: 'labels', label: 'توليد وطباعة الملصقات', icon: Printer },
              { id: 'qr-utility', label: 'مولد رموز QR للأصول', icon: QrCode },
              { id: 'scanner', label: 'المسح الضوئي والبحث', icon: ScanLine },
              { id: 'generator', label: 'فحص وتوليد الرموز', icon: ShieldCheck },
            ] as Array<{ id: BarcodeTabId; label: string; icon: typeof QrCode }>
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60] shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {labelFeedback && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3 print:hidden">
          <span>{labelFeedback}</span>
          <button
            type="button"
            onClick={() => setLabelFeedback(null)}
            className="text-xs underline"
          >
            إخفاء
          </button>
        </div>
      )}

      {/* TAB 1: Labels Generation & Batch Printing */}
      {activeTab === 'labels' && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 print:hidden">
            {/* Left/Right List of Assets */}
            <div className="xl:col-span-7 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={labelSearch}
                      onChange={(e) => setLabelSearch(e.target.value)}
                      placeholder="ابحث برقم الجرد أو الاسم أو الباركود أو معرّف القاعدة..."
                      className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                    />
                  </div>

                <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
                  {(
                    [
                      { id: 'all', label: 'الكل' },
                      { id: 'devices', label: 'الأجهزة' },
                      { id: 'consumables', label: 'المواد' },
                    ] as Array<{ id: 'all' | 'devices' | 'consumables'; label: string }>
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAssetKindFilter(f.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        assetKindFilter === f.id
                          ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60] font-semibold shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="font-semibold text-[#0F2544] dark:text-[#D4AE60] hover:underline"
                >
                  {filteredLabels.length > 0 &&
                  filteredLabels.every((l) => selectedIds.includes(`${l.kind}:${l.id}`))
                    ? 'إلغاء تحديد الكل'
                    : `تحديد الكل (${filteredLabels.length})`}
                </button>
                <span className="text-slate-500 dark:text-slate-400 font-mono-tabular">
                  المحدد للطباعة الجماعية: {selectedLabels.length}
                </span>
              </div>
            </div>

            {loading ? (
              <div className="p-6 space-y-2">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-11 rounded bg-slate-100 dark:bg-slate-800/60"
                  />
                ))}
              </div>
            ) : filteredLabels.length === 0 ? (
              <div className="p-10 text-center space-y-2 text-xs text-slate-500 dark:text-slate-400">
                <QrCode className="w-8 h-8 mx-auto text-slate-400" />
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  لا توجد أجهزة أو مواد لعرض ملصقاتها
                </div>
                <p>أضف أجهزة أو مواد كمية أولاً لتظهر هنا مع رموزها التلقائية.</p>
              </div>
            ) : (
              <div className="max-h-[540px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLabels.map((lbl) => {
                  const key = `${lbl.kind}:${lbl.id}`;
                  const isFocused =
                    focusedLabel && `${focusedLabel.kind}:${focusedLabel.id}` === key;
                  const isChecked = selectedIds.includes(key);

                  return (
                    <div
                      key={key}
                      className={`px-4 py-3 flex items-center justify-between gap-3 text-xs transition-colors ${
                        isFocused
                          ? 'bg-slate-50 dark:bg-slate-800/60'
                          : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectLabel(key)}
                          aria-label={`تحديد ${lbl.code}`}
                          className="w-4 h-4 rounded border-slate-300 text-[#0F2544] shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => setFocusedLabelKey(key)}
                          className="text-right min-w-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                              {lbl.code}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {lbl.kind === 'DEVICE' ? 'جهاز' : 'مادة كمية'}
                            </span>
                          </div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                            {lbl.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {lbl.subtitle} · {lbl.location}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono-tabular truncate">
                            معرّف القاعدة: <span dir="ltr">{lbl.id}</span>
                          </div>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setFocusedLabelKey(key)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                      >
                        معاينة
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right/Left Sticker Studio & Export */}
          <div className="xl:col-span-5 space-y-4">
            <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  معاينة وتصدير الملصق الرسمي
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={labelLayoutMode}
                    onChange={(e) => setLabelLayoutMode(e.target.value as LabelLayoutMode)}
                    aria-label="نمط تصميم الملصق"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    <option value="combined">باركود + QR مزدوج</option>
                    <option value="qr_focus">تركيز QR + معرّف القاعدة</option>
                  </select>
                  <select
                    value={labelPreset}
                    onChange={(e) => setLabelPreset(e.target.value as LabelSizePreset)}
                    aria-label="حجم الملصق أو ورقة الطباعة"
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    <option value="thermal_50x30">ملصق حراري 50×30 مم</option>
                    <option value="thermal_70x40">ملصق حراري 70×40 مم</option>
                    <option value="a4_sheet">ورقة A4 (21 ملصقاً/صفحة)</option>
                  </select>
                </div>
              </div>

              {focusedLabel ? (
                <>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
                    {previewDataUrl ? (
                      <img
                        src={previewDataUrl}
                        alt={`ملصق ${focusedLabel.code}`}
                        className="max-w-full h-auto rounded shadow-sm border border-slate-200 bg-white"
                      />
                    ) : (
                      <div className="py-12 text-xs text-slate-400">
                        جاري توليد معاينة الملصق...
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 print:hidden">
                    <span>الرمز المشفّر داخل QR:</span>
                    <span dir="ltr" className="font-mono-tabular text-slate-800 dark:text-slate-200">
                      {focusedLabel.qrValue}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 print:hidden">
                    <button
                      type="button"
                      disabled={exporting}
                      onClick={() => void handleDownloadSinglePng()}
                      className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 min-h-[40px]"
                    >
                      <Download className="w-4 h-4" />
                      <span>تحميل الملصق PNG</span>
                    </button>

                    <button
                      type="button"
                      disabled={exporting}
                      onClick={() => void handleDownloadPdf([focusedLabel])}
                      className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-50 min-h-[40px]"
                    >
                      <FileDown className="w-4 h-4" />
                      <span>تصدير الملصق PDF</span>
                    </button>

                    {selectedLabels.length > 0 && (
                      <button
                        type="button"
                        disabled={exporting}
                        onClick={() => void handleDownloadPdf(selectedLabels)}
                        className="sm:col-span-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#C59B47] text-[#0B1220] hover:bg-[#D4AE60] disabled:opacity-50 min-h-[42px]"
                      >
                        <FileDown className="w-4 h-4" />
                        <span>
                          تصدير دفعة محددة PDF ({selectedLabels.length} ملصق)
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="sm:col-span-2 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[40px]"
                    >
                      <Printer className="w-4 h-4" />
                      <span>طباعة مباشرة عبر الطابعة</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  اختر جهازاً أو مادة من القائمة لمعاينة ملصق الباركود وQR.
                </div>
              )}
            </div>
          </div>
        </div>

          {/* Dedicated A4 Batch Printable Sticker Sheet */}
          {printBatchDataUrls.length > 0 && (
            <section className="hidden print:block text-slate-900">
              <PrintDocumentHeader
                title="ورقة ملصقات الباركود ورموز QR للموجودات"
                subtitle="ملصقات تعريفية جاهزة للطباعة واللصق على الأجهزة والمواد المخزنية"
                docCode="LBL-BATCH"
                metaItems={[
                  { label: 'عدد الملصقات', value: printBatchDataUrls.length },
                  {
                    label: 'النمط',
                    value: labelLayoutMode === 'qr_focus' ? 'تركيز QR' : 'باركود + QR',
                  },
                ]}
              />
              <div className="grid grid-cols-3 gap-3">
                {printBatchDataUrls.map((item) => (
                  <div
                    key={item.key}
                    className="border border-slate-300 rounded p-1.5 bg-white print-avoid-break flex items-center justify-center"
                  >
                    <img
                      src={item.src}
                      alt={`ملصق ${item.code}`}
                      className="w-full h-auto object-contain"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* TAB 1B: Dedicated Database-ID QR Code Generation Utility */}
      {activeTab === 'qr-utility' && (
        <QrCodeUtilityPanel
          labels={allLabels}
          loading={loading}
          onTestScan={(qrPayload) => {
            setActiveTab('scanner');
            void handleScanCode(qrPayload);
          }}
        />
      )}

      {/* TAB 2: Live Camera & USB Scanner */}
      {activeTab === 'scanner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <LiveCameraScanner onScanCode={handleScanCode} searching={searchingScan} />

            {scanError && (
              <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scanError}</span>
              </div>
            )}

            {scanNotFoundCode && (
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
                لم يتم العثور على أي أصل مخزني مطابق للرمز{' '}
                <span dir="ltr" className="font-mono-tabular font-bold">
                  {scanNotFoundCode}
                </span>
                .
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                نتيجة المسح والاستعلام
              </h2>

              {!scanResult ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  امسح ملصق الجهاز أو المادة الاستهلاكية لعرض التفاصيل الفورية وفتح بطاقة الجهاز.
                </div>
              ) : scanResult.kind === 'DEVICE' ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#0F2544] text-[#D4AE60] flex items-center justify-center shrink-0">
                        <HardDrive className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-mono-tabular text-xs font-bold text-[#0F2544] dark:text-[#D4AE60]">
                          {scanResult.device.inventoryNumber}
                        </div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {scanResult.device.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {scanResult.categoryName} ·{' '}
                          {STORAGE_STATUS_LABELS[scanResult.device.storageStatus]}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="text-slate-400">الموقع الحالي</div>
                      <div className="font-semibold mt-0.5">
                        {scanResult.device.currentLocation || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">الشعبة / الوحدة</div>
                      <div className="font-semibold mt-0.5">
                        {[
                          scanResult.departmentName,
                          scanResult.unitName !== '—' ? scanResult.unitName : '',
                        ]
                          .filter(Boolean)
                          .join(' / ')}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">المستلم</div>
                      <div className="font-semibold mt-0.5">
                        {scanResult.device.recipientName || 'في المخزن'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">الرقم التسلسلي</div>
                      <div className="font-mono-tabular font-semibold mt-0.5">
                        {scanResult.device.serialNumber || '—'}
                      </div>
                    </div>
                  </div>

                  <BarcodePreview
                    compact
                    barcodeValue={
                      scanResult.device.barcode || scanResult.device.inventoryNumber
                    }
                    qrValue={
                      scanResult.device.qrCodeValue ||
                      `SAYEDMART:DEV:${scanResult.device.id}`
                    }
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setOpenedDeviceCard({
                        device: scanResult.device,
                        categoryName: scanResult.categoryName,
                        departmentName: scanResult.departmentName,
                        unitName: scanResult.unitName,
                      })
                    }
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>فتح بطاقة الجهاز الكاملة (5 تبويبات)</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#0F2544] text-[#D4AE60] flex items-center justify-center shrink-0">
                      <Boxes className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-mono-tabular text-xs font-bold text-[#0F2544] dark:text-[#D4AE60]">
                        {scanResult.item.itemCode}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {scanResult.item.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {scanResult.categoryName} · الرصيد الحالي:{' '}
                        <span className="font-mono-tabular font-bold text-emerald-700 dark:text-emerald-400">
                          {scanResult.item.currentQuantity} {scanResult.item.unitOfMeasure}
                        </span>
                      </div>
                    </div>
                  </div>

                  <BarcodePreview
                    compact
                    barcodeValue={scanResult.item.barcode || scanResult.item.itemCode}
                    qrValue={`SAYEDMART:CON:${scanResult.item.id}`}
                  />
                </div>
              )}
            </div>

            {scanHistory.length > 0 && (
              <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  آخر عمليات المسح في هذه الجلسة
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {scanHistory.map((h, i) => (
                    <button
                      key={`${h.code}-${i}`}
                      type="button"
                      onClick={() => void handleScanCode(h.code)}
                      className="w-full py-2 flex items-center justify-between gap-2 text-right hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded px-1"
                    >
                      <div className="min-w-0">
                        <span className="font-mono-tabular font-semibold text-[#0F2544] dark:text-[#D4AE60]">
                          {h.code}
                        </span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="text-slate-700 dark:text-slate-200 truncate">
                          {h.title}
                        </span>
                      </div>
                      <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                        {h.at}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Unique Code Generator & Firestore Index Check */}
      {activeTab === 'generator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              توليد رقم جرد / باركود فريد والتحقق في Firestore
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              تضمن هذه الأداة عدم تكرار أي رقم جرد أو رمز باركود في قاعدة البيانات عبر فحص فهرس{' '}
              <span dir="ltr" className="font-mono-tabular">
                barcodeIndex
              </span>{' '}
              المباشر.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نوع الأصل
                </label>
                <select
                  value={genAssetType}
                  onChange={(e) => {
                    const nextType = e.target.value as 'DEVICE' | 'CONSUMABLE';
                    setGenAssetType(nextType);
                    const cat = categoryMap.get(genCategoryId);
                    const prefix = cat?.codePrefix || (nextType === 'DEVICE' ? 'DEV' : 'CON');
                    setCustomCheckCode(
                      nextType === 'DEVICE'
                        ? generateNextInventoryNumber(prefix, devices)
                        : generateNextItemCode(prefix, consumables)
                    );
                    setAvailabilityResult(null);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                >
                  <option value="DEVICE">جهاز فردي (SM-...)</option>
                  <option value="CONSUMABLE">مادة كمية / استهلاكية (CON-...)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  التصنيف المعتمد
                </label>
                <select
                  value={genCategoryId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setGenCategoryId(cid);
                    const cat = categoryMap.get(cid);
                    const prefix = cat?.codePrefix || (genAssetType === 'DEVICE' ? 'DEV' : 'CON');
                    setCustomCheckCode(
                      genAssetType === 'DEVICE'
                        ? generateNextInventoryNumber(prefix, devices)
                        : generateNextItemCode(prefix, consumables)
                    );
                    setAvailabilityResult(null);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.codePrefix})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                الرمز المقترح أو المراد فحصه
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={customCheckCode}
                  onChange={(e) => {
                    setCustomCheckCode(e.target.value.toUpperCase());
                    setAvailabilityResult(null);
                  }}
                  className="flex-1 min-w-[180px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono-tabular"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomCheckCode(suggestedGeneratedCode);
                    void handleCheckCodeUniqueness(suggestedGeneratedCode);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>توليد تلقائي</span>
                </button>
                <button
                  type="button"
                  disabled={checkingCode || !customCheckCode.trim()}
                  onClick={() => void handleCheckCodeUniqueness(customCheckCode)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{checkingCode ? 'جاري الفحص...' : 'فحص التوفر'}</span>
                </button>
              </div>
            </div>

            {availabilityResult && (
              <div
                className={`p-3.5 rounded-lg border text-xs flex items-center gap-2.5 ${
                  availabilityResult.available
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                    : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                }`}
              >
                {availabilityResult.available ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      الرمز{' '}
                      <strong dir="ltr" className="font-mono-tabular">
                        {availabilityResult.checkedCode}
                      </strong>{' '}
                      فريد ومتاح للاستخدام ولم يُسجل مسبقاً في قاعدة البيانات.
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      الرمز{' '}
                      <strong dir="ltr" className="font-mono-tabular">
                        {availabilityResult.checkedCode}
                      </strong>{' '}
                      محجوز مسبقاً ({availabilityResult.existingTargetType || 'ASSET'}). يرجى اختيار رمز آخر.
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-6 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              المعاينة الحية للباركود وQR للرمز المولّد
            </h2>
            <BarcodePreview
              barcodeValue={customCheckCode || suggestedGeneratedCode}
              qrValue={`SAYEDMART:PREVIEW:${customCheckCode || suggestedGeneratedCode}`}
            />
          </div>
        </div>
      )}

      {openedDeviceCard && (
        <DeviceCardModal
          device={openedDeviceCard.device}
          categoryName={openedDeviceCard.categoryName}
          departmentName={openedDeviceCard.departmentName}
          unitName={openedDeviceCard.unitName}
          onClose={() => setOpenedDeviceCard(null)}
          onEdit={() => setOpenedDeviceCard(null)}
        />
      )}
    </div>
  );
}
