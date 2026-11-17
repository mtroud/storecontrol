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
}

export function PrintSignatureFooter({
  rightRole = 'منظم السجل / أمين المخزن',
  centerRole = 'التدقيق الفني / شعبة السيطرة',
  leftRole = 'مصادقة مسؤول الشعبة',
  rightName = 'الاسم والتوقيع',
  centerName = 'التوقيع والتاريخ',
  leftName = 'الختم والتوقيع',
}: PrintSignatureFooterProps) {
  return (
    <footer className="hidden print:grid grid-cols-3 gap-6 pt-6 mt-6 border-t border-slate-300 text-center text-[11px] text-slate-800 print-avoid-break">
      <div className="space-y-8">
        <div className="font-bold text-[#0F2544]">{rightRole}</div>
        <div className="border-t border-slate-400 pt-1 text-slate-500">
          {rightName}
        </div>
      </div>
      <div className="space-y-8">
        <div className="font-bold text-[#0F2544]">{centerRole}</div>
        <div className="border-t border-slate-400 pt-1 text-slate-500">
          {centerName}
        </div>
      </div>
      <div className="space-y-8">
        <div className="font-bold text-[#0F2544]">{leftRole}</div>
        <div className="border-t border-slate-400 pt-1 text-slate-500">
          {leftName}
        </div>
      </div>
    </footer>
  );
}
