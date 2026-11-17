import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  FileCode2,
  FileDown,
  Printer,
  QrCode,
  ScanLine,
  Search,
} from 'lucide-react';
import {
  AssetLabelData,
  downloadLabelPng,
  downloadLabelsPdf,
  downloadQrPng,
  downloadQrSvg,
  formatAssetQrPayload,
  generateQrDataUrl,
  LabelSizePreset,
  QrErrorCorrectionLevel,
  QrPayloadFormat,
  renderStickerCanvas,
} from '../../services/barcodeService';
import { PrintDocumentHeader, PrintSignatureFooter } from '../common/PrintDocumentHeader';

interface QrCodeUtilityPanelProps {
  labels: AssetLabelData[];
  loading: boolean;
  onTestScan: (qrPayload: string) => void;
}

const FORMAT_DESCRIPTIONS: Record<
  QrPayloadFormat,
  { title: string; subtitle: string }
> = {
  INSTITUTIONAL_ID: {
    title: 'المعرّف المؤسسي الموحد (SAYEDMART)',
    subtitle: 'SAYEDMART:DEV/CON:<Firestore_ID> — موصى به للمسح الميداني',
  },
  RAW_DB_ID: {
    title: 'معرّف قاعدة البيانات المباشر (DB ID)',
    subtitle: 'يخزن معرف المستند الفريد في Firestore مباشرة بدون بادئات',
  },
  JSON_METADATA: {
    title: 'بيانات JSON المهيكلة',
    subtitle: 'يضم النظام والنوع ومعرف القاعدة ورقم الجرد للتكامل البرمجي',
  },
};

const ECC_OPTIONS: Array<{ value: QrErrorCorrectionLevel; label: string; hint: string }> = [
  { value: 'L', label: 'L (7%)', hint: 'كثافة منخفضة' },
  { value: 'M', label: 'M (15%)', hint: 'متوازن (قياسي)' },
  { value: 'Q', label: 'Q (25%)', hint: 'تحمّل عالٍ للخدش' },
  { value: 'H', label: 'H (30%)', hint: 'أقصى حماية ميدانية' },
];

export function QrCodeUtilityPanel({
  labels,
  loading,
  onTestScan,
}: QrCodeUtilityPanelProps) {
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'devices' | 'consumables'>('all');
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [payloadFormat, setPayloadFormat] = useState<QrPayloadFormat>('INSTITUTIONAL_ID');
  const [errorCorrection, setErrorCorrection] = useState<QrErrorCorrectionLevel>('H');
  const [labelPreset, setLabelPreset] = useState<LabelSizePreset>('thermal_70x40');

  const [standaloneQrUrl, setStandaloneQrUrl] = useState<string>('');
  const [stickerPreviewUrl, setStickerPreviewUrl] = useState<string>('');
  const [copiedField, setCopiedField] = useState<'id' | 'payload' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return labels.filter((lbl) => {
      if (kindFilter === 'devices' && lbl.kind !== 'DEVICE') return false;
      if (kindFilter === 'consumables' && lbl.kind !== 'CONSUMABLE') return false;
      if (!q) return true;
      return (
        lbl.id.toLowerCase().includes(q) ||
        lbl.code.toLowerCase().includes(q) ||
        lbl.title.toLowerCase().includes(q) ||
        lbl.barcodeValue.toLowerCase().includes(q) ||
        lbl.subtitle.toLowerCase().includes(q)
      );
    });
  }, [labels, kindFilter, search]);

  const selectedLabel = useMemo(() => {
    if (selectedKey) {
      const match = labels.find((l) => `${l.kind}:${l.id}` === selectedKey);
      if (match) return match;
    }
    return filtered[0] || labels[0] || null;
  }, [selectedKey, labels, filtered]);

  const encodedPayload = useMemo(() => {
    if (!selectedLabel) return '';
    return formatAssetQrPayload(selectedLabel, payloadFormat);
  }, [selectedLabel, payloadFormat]);

  useEffect(() => {
    let active = true;
    if (!selectedLabel || !encodedPayload) {
      setStandaloneQrUrl('');
      setStickerPreviewUrl('');
      return;
    }

    const effectivePreset: LabelSizePreset =
      labelPreset === 'a4_sheet' ? 'thermal_70x40' : labelPreset;

    Promise.all([
      generateQrDataUrl(encodedPayload, 280, errorCorrection),
      renderStickerCanvas(selectedLabel, effectivePreset, {
        layoutMode: 'qr_focus',
        qrErrorCorrection: errorCorrection,
        qrValueOverride: encodedPayload,
      }).then((canvas) => canvas.toDataURL('image/png')),
    ])
      .then(([qrUrl, stickerUrl]) => {
        if (!active) return;
        setStandaloneQrUrl(qrUrl);
        setStickerPreviewUrl(stickerUrl);
      })
      .catch(() => {
        if (!active) return;
        setStandaloneQrUrl('');
        setStickerPreviewUrl('');
      });

    return () => {
      active = false;
    };
  }, [selectedLabel, encodedPayload, errorCorrection, labelPreset]);

  const handleCopy = async (text: string, field: 'id' | 'payload') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      setFeedback('تعذر النسخ التلقائي إلى الحافظة.');
    }
  };

  const handleDownloadQrPng = async () => {
    if (!selectedLabel || !encodedPayload) return;
    setExporting(true);
    setFeedback(null);
    try {
      await downloadQrPng(encodedPayload, `qr-${selectedLabel.code}-${selectedLabel.id}`, {
        size: 640,
        errorCorrectionLevel: errorCorrection,
      });
      setFeedback(`تم تحميل صورة QR PNG للأصل ${selectedLabel.code} بنجاح.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'تعذر تحميل صورة QR PNG.');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadQrSvg = async () => {
    if (!selectedLabel || !encodedPayload) return;
    setExporting(true);
    setFeedback(null);
    try {
      await downloadQrSvg(
        encodedPayload,
        `qr-${selectedLabel.code}-${selectedLabel.id}`,
        errorCorrection
      );
      setFeedback(`تم تحميل ملف QR المتجهي SVG للأصل ${selectedLabel.code} بنجاح.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'تعذر تحميل ملف SVG.');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadStickerPng = async () => {
    if (!selectedLabel || !encodedPayload) return;
    setExporting(true);
    setFeedback(null);
    try {
      const effectivePreset: LabelSizePreset =
        labelPreset === 'a4_sheet' ? 'thermal_70x40' : labelPreset;
      await downloadLabelPng(selectedLabel, effectivePreset, {
        layoutMode: 'qr_focus',
        qrErrorCorrection: errorCorrection,
        qrValueOverride: encodedPayload,
      });
      setFeedback(`تم تحميل ملصق QR الكامل PNG للرمز ${selectedLabel.code} بنجاح.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'تعذر تحميل ملصق QR.');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadStickerPdf = async () => {
    if (!selectedLabel || !encodedPayload) return;
    setExporting(true);
    setFeedback(null);
    try {
      await downloadLabelsPdf([selectedLabel], labelPreset, {
        layoutMode: 'qr_focus',
        qrErrorCorrection: errorCorrection,
        qrValueOverride: encodedPayload,
      });
      setFeedback(`تم تصدير ملصق QR بصيغة PDF للأصل ${selectedLabel.code} بنجاح.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'تعذر تصدير ملف PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3 print:hidden">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline"
          >
            إخفاء
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 print:hidden">
        {/* Asset Selector by Name, Inventory Code, or Database ID */}
        <div className="xl:col-span-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#C59B47]" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  اختيار الأصل من قاعدة البيانات
                </h2>
              </div>
              <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                {filtered.length} / {labels.length}
              </span>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم، رقم الجرد، أو معرّف القاعدة (DB ID)..."
                className="w-full pr-9 pl-3 py-2 min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
              />
            </div>

            <div className="inline-flex w-full p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'devices', label: 'الأجهزة الفردية' },
                  { id: 'consumables', label: 'المواد الكمية' },
                ] as Array<{ id: 'all' | 'devices' | 'consumables'; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setKindFilter(tab.id)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    kindFilter === tab.id
                      ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60] font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800/60"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <QrCode className="w-8 h-8 mx-auto text-slate-400" />
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                لا توجد أصول مطابقة للبحث
              </div>
              <p>جرّب البحث باسم الجهاز أو رقم الجرد أو معرّف المستند في Firestore.</p>
            </div>
          ) : (
            <div className="max-h-[580px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((lbl) => {
                const key = `${lbl.kind}:${lbl.id}`;
                const isActive =
                  selectedLabel && `${selectedLabel.kind}:${selectedLabel.id}` === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`w-full px-4 py-3 text-right transition-colors flex flex-col gap-1 ${
                      isActive
                        ? 'bg-[#0F2544]/5 dark:bg-[#C59B47]/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs font-bold text-[#0F2544] dark:text-[#D4AE60]">
                        {lbl.code}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {lbl.kind === 'DEVICE' ? 'جهاز فردي' : 'مادة كمية'}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {lbl.title}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="truncate">{lbl.subtitle}</span>
                      <span
                        dir="ltr"
                        className="font-mono-tabular text-[11px] text-slate-600 dark:text-slate-300 shrink-0"
                        title="معرف قاعدة البيانات"
                      >
                        ID: {lbl.id}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* QR Code Generator Studio */}
        <div className="xl:col-span-7 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-5">
          {!selectedLabel ? (
            <div className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">
              اختر أصلاً من القائمة لإنشاء رمز QR الفريد الخاص به من معرف قاعدة البيانات.
            </div>
          ) : (
            <>
              {/* Asset Identity & Unique Firestore ID */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {selectedLabel.kind === 'DEVICE'
                        ? 'أصل تقني مسجل · أجهزة'
                        : 'مادة كمية مسجلة · مخزن'}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {selectedLabel.title}
                    </h3>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {selectedLabel.subtitle} · {selectedLabel.location || 'المخزن الرئيسي'}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      رقم الجرد / الصنف
                    </div>
                    <div
                      dir="ltr"
                      className="font-mono-tabular text-sm font-bold text-[#0F2544] dark:text-[#D4AE60]"
                    >
                      {selectedLabel.code}
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <Database className="w-3.5 h-3.5 text-[#C59B47]" />
                    <span>معرّف قاعدة البيانات الفريد (Firestore ID):</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code
                      dir="ltr"
                      className="px-2.5 py-1 rounded bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-700 font-mono-tabular text-xs font-bold text-[#0F2544] dark:text-[#D4AE60]"
                    >
                      {selectedLabel.id}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopy(selectedLabel.id, 'id')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {copiedField === 'id' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ المعرّف</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Encoding Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    صيغة ترميز QR
                  </label>
                  <select
                    value={payloadFormat}
                    onChange={(e) => setPayloadFormat(e.target.value as QrPayloadFormat)}
                    className="w-full px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    <option value="INSTITUTIONAL_ID">المعرف المؤسسي الموحد</option>
                    <option value="RAW_DB_ID">معرّف القاعدة الخام (ID)</option>
                    <option value="JSON_METADATA">كائن بيانات JSON</option>
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {FORMAT_DESCRIPTIONS[payloadFormat].subtitle}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    مستوى تصحيح الخطأ (ECC)
                  </label>
                  <select
                    value={errorCorrection}
                    onChange={(e) =>
                      setErrorCorrection(e.target.value as QrErrorCorrectionLevel)
                    }
                    className="w-full px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    {ECC_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.hint}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    يسمح بقراءة الرمز حتى مع التلف الجزئي للملصق.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    قياس الملصق والطباعة
                  </label>
                  <select
                    value={labelPreset}
                    onChange={(e) => setLabelPreset(e.target.value as LabelSizePreset)}
                    className="w-full px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    <option value="thermal_50x30">ملصق حراري 50×30 مم</option>
                    <option value="thermal_70x40">ملصق حراري 70×40 مم</option>
                    <option value="a4_sheet">ورقة A4 للطباعة المباشرة</option>
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    تخطيط مركز على رمز QR ومعرّف قاعدة البيانات.
                  </p>
                </div>
              </div>

              {/* Dual Live Previews */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                {/* Standalone QR Preview */}
                <div className="md:col-span-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-between gap-3">
                  <div className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>رمز QR الصافي</span>
                    <span className="font-mono-tabular text-[11px] text-slate-500">
                      ECC: {errorCorrection}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                    {standaloneQrUrl ? (
                      <img
                        src={standaloneQrUrl}
                        alt={`QR Code for ${selectedLabel.id}`}
                        className="w-40 h-40 object-contain"
                      />
                    ) : (
                      <div className="w-40 h-40 flex items-center justify-center text-xs text-slate-400">
                        جاري التوليد...
                      </div>
                    )}
                  </div>

                  <div className="w-full text-center text-[11px] text-slate-500 dark:text-slate-400">
                    جاهز للمسح الفوري بالكاميرا أو الماسح الضوئي
                  </div>
                </div>

                {/* Full QR Focus Sticker Preview */}
                <div className="md:col-span-7 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-between gap-3">
                  <div className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>معاينة الملصق الميداني (QR + DB ID)</span>
                    <span className="font-mono-tabular text-[11px] text-slate-500">
                      {labelPreset === 'thermal_50x30' ? '50×30 مم' : '70×40 مم'}
                    </span>
                  </div>

                  <div className="w-full flex-1 flex items-center justify-center">
                    {stickerPreviewUrl ? (
                      <img
                        src={stickerPreviewUrl}
                        alt={`ملصق QR ${selectedLabel.code}`}
                        className="max-w-full max-h-52 h-auto rounded-lg border border-slate-200 bg-white shadow-sm"
                      />
                    ) : (
                      <div className="py-12 text-xs text-slate-400">
                        جاري تجهيز معاينة الملصق...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Encoded Payload Box */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">
                  النص الفعلي المشفّر داخل الرمز:
                </span>
                <div className="flex items-center gap-2 min-w-0 max-w-full">
                  <code
                    dir="ltr"
                    className="font-mono-tabular text-xs text-slate-800 dark:text-slate-200 truncate max-w-[360px]"
                    title={encodedPayload}
                  >
                    {encodedPayload}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopy(encodedPayload, 'payload')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                  >
                    {copiedField === 'payload' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>نُسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Action & Export Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleDownloadQrPng()}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[40px] rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>تنزيل QR صافي (PNG)</span>
                </button>

                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleDownloadQrSvg()}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[40px] rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <FileCode2 className="w-4 h-4" />
                  <span>تنزيل QR متجهي (SVG)</span>
                </button>

                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleDownloadStickerPng()}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[40px] rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل ملصق QR (PNG)</span>
                </button>

                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleDownloadStickerPdf()}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[40px] rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-50"
                >
                  <FileDown className="w-4 h-4" />
                  <span>تصدير الملصق (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={() => onTestScan(encodedPayload)}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[40px] rounded-lg text-xs font-semibold bg-[#C59B47] text-[#0B1220] hover:bg-[#D4AE60]"
                >
                  <ScanLine className="w-4 h-4" />
                  <span>اختبار المسح الفوري</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[40px] rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة ورقة QR</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Print-Friendly A4 QR Asset Label Sheet */}
      {selectedLabel && (
        <section className="hidden print:block text-slate-900">
          <PrintDocumentHeader
            title="بطاقة تعريف الأصل ورمز الاستجابة السريعة (QR Label)"
            subtitle="مولّد رموز QR المرتبطة بالمعرّف الفريد في قاعدة بيانات Firestore"
            docCode={selectedLabel.code}
            metaItems={[
              { label: 'نوع الأصل', value: selectedLabel.kind === 'DEVICE' ? 'جهاز فردي' : 'مادة كمية' },
              { label: 'معرّف القاعدة', value: selectedLabel.id },
              { label: 'مستوى التصحيح', value: errorCorrection },
            ]}
          />

          <div className="grid grid-cols-2 gap-6 items-start border border-slate-300 rounded-xl p-5 print-avoid-break">
            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-slate-500">اسم الأصل</div>
                <div className="text-base font-bold text-[#0F2544]">{selectedLabel.title}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-200">
                <div>
                  <div className="text-slate-500">رقم الجرد / الصنف</div>
                  <div dir="ltr" className="font-mono-tabular font-bold text-right">
                    {selectedLabel.code}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">التصنيف والموقع</div>
                  <div className="font-semibold">
                    {selectedLabel.subtitle} · {selectedLabel.location || 'المخزن الرئيسي'}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 text-xs">
                <div className="text-slate-500">معرّف قاعدة البيانات (Firestore ID)</div>
                <div dir="ltr" className="font-mono-tabular font-bold text-right mt-0.5">
                  {selectedLabel.id}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 text-xs">
                <div className="text-slate-500">البيانات المشفّرة داخل QR</div>
                <div dir="ltr" className="font-mono-tabular text-[11px] text-right break-all mt-0.5">
                  {encodedPayload}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4">
              {standaloneQrUrl && (
                <div className="p-2 border border-slate-300 rounded-lg bg-white">
                  <img
                    src={standaloneQrUrl}
                    alt={`QR ${selectedLabel.code}`}
                    className="w-40 h-40 object-contain"
                  />
                </div>
              )}
              {stickerPreviewUrl && (
                <img
                  src={stickerPreviewUrl}
                  alt={`ملصق ${selectedLabel.code}`}
                  className="max-w-full max-h-40 object-contain border border-slate-300 rounded"
                />
              )}
            </div>
          </div>

          <PrintSignatureFooter />
        </section>
      )}
    </div>
  );
}
