import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { PrintableVoucherData } from '../../services/operationsService';
import { InstitutionalEmblem } from '../brand/InstitutionalEmblem';

interface VoucherPreviewModalProps {
  voucher: PrintableVoucherData | null;
  onClose: () => void;
}

export function VoucherPreviewModal({
  voucher,
  onClose,
}: VoucherPreviewModalProps) {
  if (!voucher) return null;

  const modalNode = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 print-modal-portal"
      role="dialog"
      aria-modal="true"
      aria-label={`معاينة ${voucher.title}`}
    >
      <div
        className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px] print:hidden"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-3xl max-h-[92vh] rounded-xl bg-white text-slate-900 border border-slate-200 shadow-2xl flex flex-col overflow-hidden print-modal-sheet">
        {/* Modal Actions */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="text-sm font-bold text-[#0F2544]">
            {voucher.title} — <span className="font-mono-tabular">{voucher.voucherNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560]"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة السند A4</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable A4 Sheet Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-white text-slate-900 print-modal-body">
          {/* Official Letterhead */}
          <div className="pb-4 border-b-2 border-[#0F2544] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <InstitutionalEmblem size="md" showText={false} />
              <div>
                <div className="text-xs font-semibold text-slate-600">
                  الأمانة العامة للعتبة الحسينية المقدسة
                </div>
                <div className="text-sm font-bold text-[#0F2544]">
                  قسم مجمع سيد الشهداء (عليه السلام) الخدمي
                </div>
                <div className="text-xs text-slate-600">
                  شعبة السيطرة والإنترنت — إدارة المخزن والموجودات
                </div>
              </div>
            </div>
            <div className="text-left text-xs space-y-1">
              <div className="font-bold text-base text-[#0F2544]">{voucher.title}</div>
              <div className="font-mono-tabular font-semibold">
                رقم السند: {voucher.voucherNumber}
              </div>
              <div className="font-mono-tabular text-slate-600">
                التاريخ: {voucher.date}
              </div>
            </div>
          </div>

          {/* Metadata Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
            {voucher.departmentName && (
              <div>
                <div className="text-slate-500">الشعبة المستفيدة</div>
                <div className="font-bold text-slate-900 mt-0.5">{voucher.departmentName}</div>
              </div>
            )}
            {voucher.unitName && (
              <div>
                <div className="text-slate-500">الوحدة</div>
                <div className="font-bold text-slate-900 mt-0.5">{voucher.unitName}</div>
              </div>
            )}
            {voucher.fromLocation && (
              <div>
                <div className="text-slate-500">من الجهة / الموقع</div>
                <div className="font-bold text-slate-900 mt-0.5">{voucher.fromLocation}</div>
              </div>
            )}
            {voucher.toLocation && (
              <div>
                <div className="text-slate-500">إلى الجهة / الموقع</div>
                <div className="font-bold text-slate-900 mt-0.5">{voucher.toLocation}</div>
              </div>
            )}
            {voucher.recipientName && (
              <div>
                <div className="text-slate-500">المستلم / المعني</div>
                <div className="font-bold text-slate-900 mt-0.5">{voucher.recipientName}</div>
              </div>
            )}
            {voucher.officialDocRef && (
              <div>
                <div className="text-slate-500">الكتاب / المرجع الرسمي</div>
                <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
                  {voucher.officialDocRef}
                </div>
              </div>
            )}
            <div>
              <div className="text-slate-500">منفّذ العملية</div>
              <div className="font-bold text-slate-900 mt-0.5">{voucher.executedByName}</div>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-[#0F2544] text-white">
                  <th className="py-2.5 px-3 w-10">#</th>
                  <th className="py-2.5 px-3">رقم الجرد / الرمز</th>
                  <th className="py-2.5 px-3">اسم الجهاز / المادة</th>
                  <th className="py-2.5 px-3">النوع</th>
                  <th className="py-2.5 px-3">الكمية</th>
                  <th className="py-2.5 px-3">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {voucher.lines.map((line, idx) => (
                  <tr key={`${line.code}-${idx}`}>
                    <td className="py-2.5 px-3 font-mono-tabular">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-mono-tabular font-semibold text-[#0F2544]">
                      {line.code}
                    </td>
                    <td className="py-2.5 px-3 font-semibold">{line.name}</td>
                    <td className="py-2.5 px-3">
                      {line.kind === 'DEVICE' ? 'جهاز فردي' : 'مادة كمية'}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular font-bold">
                      {line.quantity} {line.unit}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{line.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {voucher.notes && (
            <div className="text-xs border border-slate-200 rounded-lg p-3 bg-slate-50">
              <span className="font-bold text-slate-700">ملاحظات السند: </span>
              <span className="text-slate-600">{voucher.notes}</span>
            </div>
          )}

          {/* Signature Footer */}
          <div className="pt-8 grid grid-cols-3 gap-6 text-center text-xs">
            <div className="space-y-8">
              <div className="font-bold text-slate-800">أمين / موظف المخزن</div>
              <div className="border-t border-slate-400 pt-1 text-slate-500">
                {voucher.executedByName}
              </div>
            </div>
            <div className="space-y-8">
              <div className="font-bold text-slate-800">المستلم / الطرف الثاني</div>
              <div className="border-t border-slate-400 pt-1 text-slate-500">
                {voucher.recipientName || 'التوقيع والختم'}
              </div>
            </div>
            <div className="space-y-8">
              <div className="font-bold text-slate-800">مصادقة مسؤول الشعبة</div>
              <div className="border-t border-slate-400 pt-1 text-slate-500">
                التوقيع والتاريخ
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
}
