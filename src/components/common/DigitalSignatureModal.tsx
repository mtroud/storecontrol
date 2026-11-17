import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Eraser,
  PenLine,
  ShieldCheck,
  Stamp,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSignatures } from '../../context/SignatureContext';
import { USER_ROLE_LABELS } from '../../types/inventory';
import {
  generateSignatureVerificationCode,
  renderElectronicStampDataUrl,
  renderTypedSignatureDataUrl,
  SignatureMethod,
  SignatureSlotId,
} from '../../types/signature';

const SLOT_ORDER: SignatureSlotId[] = ['organizer', 'reviewer', 'approver'];

export function DigitalSignatureModal() {
  const { session } = useAuth();
  const {
    signatures,
    canSign,
    isModalOpen,
    activeSlot,
    roleLabels,
    setActiveSlot,
    closeSignatureModal,
    saveSignature,
    clearSignature,
    clearAllSignatures,
  } = useSignatures();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  const [method, setMethod] = useState<SignatureMethod>('drawn');
  const [signerName, setSignerName] = useState('');
  const [signerRoleLabel, setSignerRoleLabel] = useState('');
  const [hasDrawnInk, setHasDrawnInk] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Sync modal fields when opened or switching slot
  useEffect(() => {
    if (!isModalOpen) return;
    setFormError(null);
    setSavedNotice(null);

    const existing = signatures[activeSlot];
    if (existing) {
      setMethod(existing.method);
      setSignerName(existing.signerName);
      setSignerRoleLabel(existing.signerRoleLabel);
    } else {
      setMethod('drawn');
      setSignerName(
        activeSlot === 'organizer' ? session?.fullName || '' : session?.fullName || ''
      );
      setSignerRoleLabel(
        activeSlot === 'organizer' && session
          ? USER_ROLE_LABELS[session.role]
          : roleLabels[activeSlot]
      );
    }
    setHasDrawnInk(false);
  }, [isModalOpen, activeSlot, signatures, session, roleLabels]);

  // Initialize high-DPI canvas pad whenever drawn tab is active
  useEffect(() => {
    if (!isModalOpen || method !== 'drawn') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const displayW = 520;
    const displayH = 170;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#0F2544';
    ctx.clearRect(0, 0, displayW, displayH);

    // Subtle baseline guide
    ctx.save();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(24, displayH - 34);
    ctx.lineTo(displayW - 24, displayH - 34);
    ctx.stroke();
    ctx.restore();

    const existing = signatures[activeSlot];
    if (existing?.method === 'drawn' && existing.signatureImageDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, displayW, displayH);
        setHasDrawnInk(true);
      };
      img.src = existing.signatureImageDataUrl;
    } else {
      setHasDrawnInk(false);
    }
  }, [isModalOpen, method, activeSlot, signatures]);

  useEffect(() => {
    if (!isModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSignatureModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isModalOpen, closeSignatureModal]);

  if (!isModalOpen) return null;

  const getPointerCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = 520 / rect.width;
    const scaleY = 170 / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canSign) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getPointerCoords(e);
    ctx.strokeStyle = '#0F2544';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingRef.current = true;
    setFormError(null);
    setSavedNotice(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { x, y } = getPointerCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawnInk(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, 520, 170);
    ctx.save();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(24, 170 - 34);
    ctx.lineTo(520 - 24, 170 - 34);
    ctx.stroke();
    ctx.restore();
    setHasDrawnInk(false);
    setSavedNotice(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSign) {
      setFormError('صلاحية التوقيع الإلكتروني مخصصة لموظفي المخزن والمسؤولين المخولين فقط.');
      return;
    }

    const cleanName = signerName.trim();
    const cleanRole = signerRoleLabel.trim() || roleLabels[activeSlot];
    if (cleanName.length < 2) {
      setFormError('يرجى إدخال اسم الشخص المخول بالتوقيع.');
      return;
    }

    const signedAtIso = new Date().toISOString();
    const verificationCode = generateSignatureVerificationCode(session?.uid, activeSlot);
    let imageDataUrl = '';

    if (method === 'drawn') {
      if (!hasDrawnInk || !canvasRef.current) {
        setFormError('يرجى رسم التوقيع داخل اللوحة أولاً أو اختيار التوقيع الاسمي / الختم الإلكتروني.');
        return;
      }
      imageDataUrl = canvasRef.current.toDataURL('image/png');
    } else if (method === 'typed') {
      imageDataUrl = renderTypedSignatureDataUrl(cleanName, cleanRole);
    } else {
      imageDataUrl = renderElectronicStampDataUrl({
        signerName: cleanName,
        signerRoleLabel: cleanRole,
        verificationCode,
        signedAtIso,
      });
    }

    saveSignature({
      slotId: activeSlot,
      signerName: cleanName,
      signerRoleLabel: cleanRole,
      signerEmail: session?.email,
      signerUid: session?.uid,
      method,
      signatureImageDataUrl: imageDataUrl,
      verificationCode,
      signedAt: signedAtIso,
    });

    setFormError(null);
    setSavedNotice(
      `تم اعتماد التوقيع الرقمي لحقل «${roleLabels[activeSlot]}» بكود التحقق ${verificationCode}.`
    );
  };

  const previewTypedOrStamp =
    method === 'typed'
      ? renderTypedSignatureDataUrl(
          signerName || session?.fullName || 'الاسم المعتمد',
          signerRoleLabel || roleLabels[activeSlot]
        )
      : method === 'electronic_stamp'
      ? renderElectronicStampDataUrl({
          signerName: signerName || session?.fullName || 'الاسم المعتمد',
          signerRoleLabel: signerRoleLabel || roleLabels[activeSlot],
          verificationCode:
            signatures[activeSlot]?.verificationCode || 'SM-PREVIEW-AUTH',
          signedAtIso: new Date().toISOString(),
        })
      : '';

  const modalContent = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="إدارة التوقيع الرقمي للمصادقة على التقارير"
    >
      <div
        className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
        onClick={closeSignatureModal}
      />

      <div className="relative z-10 w-full max-w-2xl max-h-[92vh] rounded-xl bg-white dark:bg-[#111C2E] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#0F2544] text-[#D4AE60] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                التوقيع الرقمي ومصادقة المسؤولين المخولين
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يُدرج تلقائياً في أسفل جميع التقارير المطبوعة وملفات PDF الرسمية
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSignatureModal}
            aria-label="إغلاق نافذة التوقيع الرقمي"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-5">
          {!canSign && (
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
              حسابك الحالي بصلاحية «مشاهدة فقط». يقتصر اعتماد التوقيع الرقمي على موظفي المخزن أو مسؤولي الشعبة المخولين.
            </div>
          )}

          {/* 3 Authorization Slots Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              1. اختر خانة المصادقة في ذيل التقرير
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SLOT_ORDER.map((slot) => {
                const isActive = activeSlot === slot;
                const isSigned = Boolean(signatures[slot]);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setActiveSlot(slot)}
                    className={`p-3 rounded-lg border text-right transition-colors ${
                      isActive
                        ? 'border-[#0F2544] dark:border-[#C59B47] bg-[#0F2544]/5 dark:bg-[#C59B47]/10'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-slate-500 dark:text-slate-400">
                        {slot === 'organizer'
                          ? 'الخانة الأولى (يمين)'
                          : slot === 'reviewer'
                          ? 'الخانة الثانية (وسط)'
                          : 'الخانة الثالثة (يسار)'}
                      </span>
                      {isSigned && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1 line-clamp-1">
                      {roleLabels[slot]}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {isSigned ? signatures[slot]?.signerName : 'بانتظار التوقيع'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Signer Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                اسم المخوّل بالتوقيع
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                disabled={!canSign}
                placeholder="الاسم الكامل للمسؤول أو الموظف"
                className="w-full px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                الصفة الوظيفية / المنصب المعتمد
              </label>
              <input
                type="text"
                value={signerRoleLabel}
                onChange={(e) => setSignerRoleLabel(e.target.value)}
                disabled={!canSign}
                placeholder={roleLabels[activeSlot]}
                className="w-full px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm disabled:opacity-60"
              />
            </div>
          </div>

          {/* Signing Method Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              2. أسلوب التوقيع الإلكتروني
            </label>
            <div className="inline-flex w-full p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {(
                [
                  { id: 'drawn', label: 'توقيع يدوي بالرسم', icon: PenLine },
                  { id: 'typed', label: 'توقيع اسمي معتمد', icon: Type },
                  { id: 'electronic_stamp', label: 'ختم مصادقة إلكتروني', icon: Stamp },
                ] as Array<{ id: SignatureMethod; label: string; icon: typeof PenLine }>
              ).map((opt) => {
                const Icon = opt.icon;
                const active = method === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMethod(opt.id)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60] shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Signature Capture / Preview Surface */}
          {method === 'drawn' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  ارسم توقيعك داخل المربع الأبيض باستخدام الفأرة أو اللمس:
                </span>
                <button
                  type="button"
                  onClick={handleClearCanvas}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>مسح اللوحة</span>
                </button>
              </div>

              <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white overflow-hidden">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="w-full h-[170px] block touch-none cursor-crosshair bg-white"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                معاينة التوقيع كما سيظهر على النسخة الورقية وملف PDF:
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white flex items-center justify-center min-h-[170px]">
                {previewTypedOrStamp ? (
                  <img
                    src={previewTypedOrStamp}
                    alt="معاينة التوقيع الإلكتروني"
                    className="max-w-full max-h-[145px] object-contain"
                  />
                ) : null}
              </div>
            </div>
          )}

          {formError && (
            <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {formError}
            </div>
          )}

          {savedNotice && (
            <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{savedNotice}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {signatures[activeSlot] && (
                <button
                  type="button"
                  onClick={() => {
                    clearSignature(activeSlot);
                    setSavedNotice(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg text-xs font-semibold border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>إزالة توقيع الخانة</span>
                </button>
              )}

              {Object.keys(signatures).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearAllSignatures();
                    setSavedNotice(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-red-600"
                >
                  <span>مسح جميع التواقيع</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeSignatureModal}
                className="px-4 py-2 min-h-[40px] rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                إغلاق
              </button>
              {canSign && (
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>اعتماد وحفظ التوقيع</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
