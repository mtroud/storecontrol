import { useState } from 'react';
import {
  AlertCircle,
  Boxes,
  ExternalLink,
  HardDrive,
  QrCode,
  X,
} from 'lucide-react';
import {
  BarcodeLookupResult,
  resolveAssetByScannedCode,
} from '../../services/barcodeService';
import {
  DeviceRecord,
  STORAGE_STATUS_LABELS,
} from '../../services/devicesService';
import { AppRouteId } from '../../types/inventory';
import { LiveCameraScanner } from '../barcode/LiveCameraScanner';
import { DeviceCardModal } from '../devices/DeviceCardModal';

interface QuickScannerModalProps {
  open: boolean;
  onClose: () => void;
  onNavigateToBarcodeCenter: (route: AppRouteId) => void;
}

export function QuickScannerModal({
  open,
  onClose,
  onNavigateToBarcodeCenter,
}: QuickScannerModalProps) {
  const [searching, setSearching] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [result, setResult] = useState<BarcodeLookupResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openedDevice, setOpenedDevice] = useState<{
    device: DeviceRecord;
    categoryName: string;
    departmentName: string;
    unitName: string;
  } | null>(null);

  if (!open) return null;

  const handleScanCode = async (code: string) => {
    setSearching(true);
    setLastQuery(code);
    setNotFound(false);
    setErrorMsg(null);
    setResult(null);

    try {
      const found = await resolveAssetByScannedCode(code);
      if (found) {
        setResult(found);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر البحث عن الرمز في قاعدة البيانات.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-label="ماسح الباركود وQR السريع"
      >
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <div className="relative z-10 w-full max-w-2xl max-h-[92vh] rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                قارئ الباركود وQR السريع
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                متوافق مع الكاميرا الخلفية للهاتف وقارئ الباركود USB المكتبي
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToBarcodeCenter('barcode-center');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>مركز الباركود</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <LiveCameraScanner onScanCode={handleScanCode} searching={searching} />

            {errorMsg && (
              <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {notFound && (
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
                لم يتم العثور على جهاز أو مادة كمية مطابقة للرمز{' '}
                <span dir="ltr" className="font-mono-tabular font-bold">
                  {lastQuery}
                </span>
                . تأكد من رقم الجرد أو الباركود أو الرقم التسلسلي.
              </div>
            )}

            {result?.kind === 'DEVICE' && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#0F2544] text-[#D4AE60] flex items-center justify-center shrink-0">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                        {result.device.inventoryNumber} · {result.categoryName}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                        {result.device.name}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 shrink-0">
                    {STORAGE_STATUS_LABELS[result.device.storageStatus]}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-slate-400">الموقع الحالي</div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {result.device.currentLocation || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">الشعبة / الوحدة</div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {[result.departmentName, result.unitName !== '—' ? result.unitName : '']
                        .filter(Boolean)
                        .join(' / ')}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">المستلم</div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {result.device.recipientName || 'في عهدة المخزن'}
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenedDevice({
                        device: result.device,
                        categoryName: result.categoryName,
                        departmentName: result.departmentName,
                        unitName: result.unitName,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح بطاقة الجهاز الكاملة</span>
                  </button>
                </div>
              </div>
            )}

            {result?.kind === 'CONSUMABLE' && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#0F2544] text-[#D4AE60] flex items-center justify-center shrink-0">
                      <Boxes className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                        {result.item.itemCode} · {result.categoryName}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                        {result.item.name}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono-tabular text-sm font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                    {result.item.currentQuantity} {result.item.unitOfMeasure}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-slate-400">موقع التخزين</div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {result.item.storageLocation || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">الحد الأدنى</div>
                    <div className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {result.item.minStock}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">حد إعادة الطلب</div>
                    <div className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {result.item.reorderPoint}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {openedDevice && (
        <DeviceCardModal
          device={openedDevice.device}
          categoryName={openedDevice.categoryName}
          departmentName={openedDevice.departmentName}
          unitName={openedDevice.unitName}
          onClose={() => setOpenedDevice(null)}
          onEdit={() => {
            setOpenedDevice(null);
            onClose();
            onNavigateToBarcodeCenter('devices');
          }}
        />
      )}
    </>
  );
}
