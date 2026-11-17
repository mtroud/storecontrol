import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, ImageUp, Search, Video } from 'lucide-react';

interface LiveCameraScannerProps {
  onScanCode: (code: string) => void;
  searching?: boolean;
  autoFocusInput?: boolean;
}

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

export function LiveCameraScanner({
  onScanCode,
  searching = false,
  autoFocusInput = true,
}: LiveCameraScannerProps) {
  const rawId = useId().replace(/:/g, '');
  const containerId = `sayed-scanner-${rawId}`;

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const mountedRef = useRef(true);

  const [cameraActive, setCameraActive] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  const stopCamera = useCallback(async () => {
    const instance = scannerRef.current;
    if (!instance) return;
    try {
      if (instance.isScanning) {
        await instance.stop();
      }
      instance.clear();
    } catch {
      // Ignore cleanup errors if stream already closed
    } finally {
      scannerRef.current = null;
      if (mountedRef.current) {
        setCameraActive(false);
        setStartingCamera(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopCamera();
    };
  }, [stopCamera]);

  const emitScan = useCallback(
    (decodedText: string) => {
      const clean = decodedText.trim();
      if (!clean) return;
      const now = Date.now();
      if (
        lastScannedRef.current.value === clean &&
        now - lastScannedRef.current.at < 1800
      ) {
        return;
      }
      lastScannedRef.current = { value: clean, at: now };
      setManualCode(clean);
      onScanCode(clean);
    },
    [onScanCode]
  );

  const startCamera = async (preferredId?: string) => {
    setCameraError(null);
    setStartingCamera(true);
    await stopCamera();

    try {
      const available = await Html5Qrcode.getCameras().catch(() => []);
      if (mountedRef.current && available.length > 0) {
        setCameras(available);
      }

      const instance = new Html5Qrcode(containerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      scannerRef.current = instance;

      const cameraConfig: string | MediaTrackConstraints =
        preferredId || selectedCameraId
          ? preferredId || selectedCameraId
          : { facingMode: 'environment' };

      await instance.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 240, height: 150 },
          aspectRatio: 1.6,
        },
        (decodedText) => {
          emitScan(decodedText);
        },
        () => {
          // Ignore per-frame decode misses
        }
      );

      if (mountedRef.current) {
        setCameraActive(true);
        setStartingCamera(false);
      }
    } catch (err) {
      await stopCamera();
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setCameraError(
          'تم رفض إذن الوصول إلى الكاميرا. يرجى السماح للمتصفح باستخدام الكاميرا من شريط العنوان ثم المحاولة مجدداً.'
        );
      } else if (msg.includes('NotFoundError') || msg.includes('no camera')) {
        setCameraError(
          'لم يتم العثور على كاميرا متصلة بهذا الجهاز. يمكنك استخدام قارئ الباركود USB أو رفع صورة الملصق أو الإدخال اليدوي أدناه.'
        );
      } else {
        setCameraError(
          'تعذر تشغيل الكاميرا في هذا المتصفح. يمكنك استخدام قارئ الباركود USB أو رفع صورة للملصق.'
        );
      }
    }
  };

  const handleImageScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCameraError(null);

    try {
      const tempScanner = new Html5Qrcode(containerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      const result = await tempScanner.scanFile(file, false);
      tempScanner.clear();
      emitScan(result);
    } catch {
      setCameraError('لم يتم العثور على رمز Barcode أو QR واضح داخل الصورة المرفوعة.');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    onScanCode(trimmed);
  };

  return (
    <div className="space-y-4">
      {/* Camera Viewport + Controls */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-[#111C2E]">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <Video className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60]" />
            <span>الماسح الضوئي المباشر (Barcode / QR)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {cameras.length > 1 && (
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCameraId(id);
                  if (cameraActive) void startCamera(id);
                }}
                aria-label="اختيار الكاميرا"
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="">الكاميرا الخلفية الافتراضية</option>
                {cameras.map((cam, idx) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.label || `كاميرا ${idx + 1}`}
                  </option>
                ))}
              </select>
            )}

            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer min-h-[36px]">
              <ImageUp className="w-3.5 h-3.5" />
              <span>قراءة من صورة</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageScan}
                className="sr-only"
              />
            </label>

            {cameraActive ? (
              <button
                type="button"
                onClick={() => void stopCamera()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors min-h-[36px]"
              >
                <CameraOff className="w-3.5 h-3.5" />
                <span>إيقاف الكاميرا</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={startingCamera}
                onClick={() => void startCamera()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-60 transition-colors min-h-[36px]"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{startingCamera ? 'جاري تشغيل الكاميرا...' : 'تشغيل الكاميرا'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-4">
          <div
            id={containerId}
            className={`w-full max-w-md mx-auto rounded-lg overflow-hidden bg-slate-950 ${
              cameraActive ? 'min-h-[240px]' : 'hidden'
            }`}
          />

          {!cameraActive && (
            <div className="py-6 text-center space-y-2">
              <div className="w-11 h-11 mx-auto rounded-lg bg-[#0F2544]/10 dark:bg-[#C59B47]/15 text-[#0F2544] dark:text-[#D4AE60] flex items-center justify-center">
                <Camera className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                اضغط «تشغيل الكاميرا» لمسح ملصق الجهاز بالكاميرا الخلفية، أو وجّه قارئ الباركود USB إلى الحقل أدناه.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                يدعم قراءة Code 128، Code 39، EAN، ورمز QR المشفّر للنظام (SAYEDMART).
              </p>
            </div>
          )}

          {cameraError && (
            <div className="mt-3 p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              {cameraError}
            </div>
          )}
        </div>
      </div>

      {/* USB Hardware Scanner / Manual Entry Input */}
      <form onSubmit={handleManualSubmit} className="space-y-2">
        <label
          htmlFor={`manual-${rawId}`}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
        >
          قارئ الباركود USB أو البحث اليدوي (رقم الجرد / الباركود / الرقم التسلسلي / رمز QR)
        </label>
        <div className="flex gap-2">
          <input
            id={`manual-${rawId}`}
            type="text"
            dir="ltr"
            autoFocus={autoFocusInput}
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="SM-SW-0001 أو SAYEDMART:DEV:..."
            className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
          />
          <button
            type="submit"
            disabled={searching || !manualCode.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
          >
            <Search className="w-4 h-4" />
            <span>{searching ? 'جاري البحث...' : 'بحث فوري'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
