import { useEffect, useState } from 'react';
import {
  generateBarcodeDataUrl,
  generateQrDataUrl,
} from '../../services/barcodeService';

interface BarcodePreviewProps {
  barcodeValue: string;
  qrValue: string;
  compact?: boolean;
}

export function BarcodePreview({
  barcodeValue,
  qrValue,
  compact = false,
}: BarcodePreviewProps) {
  const [barcodeSrc, setBarcodeSrc] = useState<string>('');
  const [qrSrc, setQrSrc] = useState<string>('');

  useEffect(() => {
    let active = true;
    try {
      const bc = generateBarcodeDataUrl(barcodeValue, {
        width: compact ? 1.5 : 2,
        height: compact ? 40 : 54,
        displayValue: true,
        lineColor: '#0F2544',
      });
      if (active) setBarcodeSrc(bc);
    } catch {
      if (active) setBarcodeSrc('');
    }

    generateQrDataUrl(qrValue, compact ? 120 : 160)
      .then((url) => {
        if (active) setQrSrc(url);
      })
      .catch(() => {
        if (active) setQrSrc('');
      });

    return () => {
      active = false;
    };
  }, [barcodeValue, qrValue, compact]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-1.5">
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 self-start">
          الباركود (Code 128)
        </div>
        {barcodeSrc ? (
          <img
            src={barcodeSrc}
            alt={`باركود ${barcodeValue}`}
            className="max-w-full h-auto max-h-20 bg-white rounded p-1"
          />
        ) : (
          <div className="py-4 font-mono-tabular text-slate-400">{barcodeValue}</div>
        )}
      </div>

      <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            رمز الاستجابة السريعة (QR)
          </div>
          <div
            dir="ltr"
            className="text-xs font-mono-tabular font-semibold text-slate-900 dark:text-slate-100 mt-1 truncate"
          >
            {qrValue}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            جاهز للمسح الفوري بالكاميرا
          </div>
        </div>
        {qrSrc && (
          <img
            src={qrSrc}
            alt={`QR ${qrValue}`}
            className="w-20 h-20 rounded bg-white p-1 border border-slate-200 shrink-0"
          />
        )}
      </div>
    </div>
  );
}
