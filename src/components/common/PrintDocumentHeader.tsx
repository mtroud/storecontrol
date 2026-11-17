import { PenLine, ShieldCheck, Trash2 } from 'lucide-react';
import { useOptionalSignatures } from '../../context/SignatureContext';
import { SignatureRoleLabels, SignatureSlotId } from '../../types/signature';
import { InstitutionalEmblem } from '../brand/InstitutionalEmblem';

interface PrintDocumentHeaderProps {
  title: string;
  subtitle?: string;
  docCode?: string;
  metaItems?: Array<{ label: string; value: string | number }>;
}

export function PrintDocumentHeader({
  title,
  subtitle,
  docCode,
  metaItems = [],
}: PrintDocumentHeaderProps) {
  const printDate = new Date().toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const printTime = new Date().toLocaleTimeString('ar-IQ', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <header className="hidden print:block print-letterhead pb-3 mb-4 border-b-2 border-[#0F2544] text-slate-900">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <InstitutionalEmblem size="md" showText={false} />
          <div>
            <div className="text-[11px] font-semibold text-slate-600">
              الأمانة العامة للعتبة الحسينية المقدسة
            </div>
            <div className="text-sm font-bold text-[#0F2544]">
              قسم مجمع سيد الشهداء (عليه السلام) الخدمي
            </div>
            <div className="text-[11px] text-slate-600">
              شعبة السيطرة والإنترنت — نظام إدارة وجرد الأجهزة والمعدات
            </div>
          </div>
        </div>

        <div className="text-left text-[11px] space-y-0.5 text-slate-700">
          {docCode && (
            <div className="font-mono-tabular font-bold text-[#0F2544]">
              رمز الوثيقة: {docCode}
            </div>
          )}
          <div className="font-mono-tabular">تاريخ الطباعة: {printDate}</div>
          <div className="font-mono-tabular text-slate-500">الوقت: {printTime}</div>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-200 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-[#0F2544]">{title}</h1>
          {subtitle && (
            <p className="text-[11px] text-slate-600 mt-0.5">{subtitle}</p>
          )}
        </div>

        {metaItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-700">
            {metaItems.map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <span className="text-slate-500">{item.label}:</span>
                <span className="font-mono-tabular font-bold text-[#0F2544]">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

interface PrintSignatureFooterProps {
  leftRole?: string;
  centerRole?: string;
  rightRole?: string;
  leftName?: string;
  centerName?: string;
  rightName?: string;
  forceVisible?: boolean;
  showInteractiveControls?: boolean;
}

export function PrintSignatureFooter({
  rightRole = 'منظم السجل / أمين المخزن',
  centerRole = 'التدقيق الفني / شعبة السيطرة',
  leftRole = 'مصادقة مسؤول الشعبة',
  rightName = 'الاسم والتوقيع',
  centerName = 'التوقيع والتاريخ',
  leftName = 'الختم والتوقيع',
  forceVisible = false,
  showInteractiveControls = false,
}: PrintSignatureFooterProps) {
  const sigCtx = useOptionalSignatures();

  const roleOverrides: SignatureRoleLabels = {
    organizer: rightRole,
    reviewer: centerRole,
    approver: leftRole,
  };

  const slots: Array<{
    slotId: SignatureSlotId;
    roleTitle: string;
    fallbackName: string;
  }> = [
    { slotId: 'organizer', roleTitle: rightRole, fallbackName: rightName },
    { slotId: 'reviewer', roleTitle: centerRole, fallbackName: centerName },
    { slotId: 'approver', roleTitle: leftRole, fallbackName: leftName },
  ];

  return (
    <footer
      className={`${
        forceVisible ? 'grid' : 'hidden print:grid'
      } grid-cols-1 sm:grid-cols-3 gap-6 pt-6 mt-6 border-t border-slate-300 text-center text-[11px] text-slate-800 print-avoid-break`}
    >
      {slots.map(({ slotId, roleTitle, fallbackName }) => {
        const sig = sigCtx?.signatures[slotId];
        const signedDate = sig
          ? new Date(sig.signedAt).toLocaleDateString('ar-IQ', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
          : '';

        return (
          <div key={slotId} className="flex flex-col justify-between gap-2">
            <div className="font-bold text-[#0F2544]">{roleTitle}</div>

            {sig ? (
              <div className="space-y-1.5 py-1">
                <div className="h-16 flex items-center justify-center">
                  <img
                    src={sig.signatureImageDataUrl}
                    alt={`توقيع ${sig.signerName}`}
                    className="max-h-16 max-w-full object-contain"
                  />
                </div>
                <div className="border-t border-slate-400 pt-1.5 space-y-0.5">
                  <div className="font-bold text-slate-900">{sig.signerName}</div>
                  <div className="text-[10px] text-slate-600">{sig.signerRoleLabel}</div>
                  <div className="text-[9.5px] font-mono-tabular text-slate-500">
                    موثق إلكترونياً · {signedDate} · {sig.verificationCode}
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-8">
                <div className="border-t border-slate-400 pt-1.5 text-slate-500">
                  {fallbackName}
                </div>
              </div>
            )}

            {showInteractiveControls && sigCtx && sigCtx.canSign && (
              <div className="flex items-center justify-center gap-2 pt-1 print:hidden">
                <button
                  type="button"
                  onClick={() => sigCtx.openSignatureModal(slotId, roleOverrides)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-[#0F2544]"
                >
                  <PenLine className="w-3 h-3" />
                  <span>{sig ? 'تعديل التوقيع' : 'توقيع إلكتروني'}</span>
                </button>
                {sig && (
                  <button
                    type="button"
                    onClick={() => sigCtx.clearSignature(slotId)}
                    title="إزالة التوقيع"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-200 bg-red-50 hover:bg-red-100 text-[11px] font-semibold text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>مسح</span>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </footer>
  );
}

interface PrintSignatureTriggerButtonProps {
  roleLabels?: Partial<SignatureRoleLabels>;
  defaultSlot?: SignatureSlotId;
  className?: string;
}

export function PrintSignatureTriggerButton({
  roleLabels,
  defaultSlot = 'organizer',
  className = '',
}: PrintSignatureTriggerButtonProps) {
  const sigCtx = useOptionalSignatures();
  if (!sigCtx) return null;

  return (
    <button
      type="button"
      onClick={() => sigCtx.openSignatureModal(defaultSlot, roleLabels)}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap print:hidden ${className}`}
    >
      <ShieldCheck className="w-4 h-4 text-[#C59B47]" />
      <span>التوقيع الرقمي</span>
      {sigCtx.signedCount > 0 && (
        <span className="font-mono-tabular text-[11px] text-emerald-700 dark:text-emerald-400">
          ({sigCtx.signedCount}/3)
        </span>
      )}
    </button>
  );
}

