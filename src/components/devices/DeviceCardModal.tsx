import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Download,
  Edit3,
  FileDown,
  FileText,
  HardDrive,
  History,
  Paperclip,
  Printer,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import {
  buildDeviceLabelData,
  downloadLabelPng,
  downloadLabelsPdf,
} from '../../services/barcodeService';
import { BarcodePreview } from '../barcode/BarcodePreview';
import {
  PrintDocumentHeader,
  PrintSignatureFooter,
  PrintSignatureTriggerButton,
} from '../common/PrintDocumentHeader';
import { useAuth } from '../../context/AuthContext';
import {
  DeviceAttachmentRecord,
  DeviceHistoryRecord,
  DeviceMaintenanceSummary,
  DeviceMovementSummary,
  DeviceRecord,
  STORAGE_STATUS_LABELS,
  subscribeToDeviceCardDetails,
  uploadDeviceAttachment,
} from '../../services/devicesService';
import {
  DeviceStorageStatus,
  MAINTENANCE_STATUS_LABELS,
  MOVEMENT_TYPE_LABELS,
  UserRole,
} from '../../types/inventory';

interface DeviceCardModalProps {
  device: DeviceRecord;
  categoryName: string;
  departmentName: string;
  unitName: string;
  onClose: () => void;
  onEdit: (device: DeviceRecord) => void;
}

type CardTabId = 'basic' | 'movements' | 'maintenance' | 'attachments' | 'history';

export function DeviceCardModal({
  device,
  categoryName,
  departmentName,
  unitName,
  onClose,
  onEdit,
}: DeviceCardModalProps) {
  const { session } = useAuth();
  const canEdit =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER ||
    session?.role === UserRole.WAREHOUSE_STAFF;

  const [activeTab, setActiveTab] = useState<CardTabId>('basic');
  const [history, setHistory] = useState<DeviceHistoryRecord[]>([]);
  const [attachments, setAttachments] = useState<DeviceAttachmentRecord[]>([]);
  const [movements, setMovements] = useState<DeviceMovementSummary[]>([]);
  const [maintenance, setMaintenance] = useState<DeviceMaintenanceSummary[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToDeviceCardDetails(
      device.id,
      device.inventoryNumber,
      {
        onHistory: setHistory,
        onAttachments: setAttachments,
        onMovements: setMovements,
        onMaintenance: setMaintenance,
      }
    );
    return () => unsubscribe();
  }, [device.id, device.inventoryNumber]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const isImage = file.type.startsWith('image/');
      await uploadDeviceAttachment(
        device,
        file,
        session?.fullName || 'موظف المخزن',
        isImage && !device.imageUrl
      );
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'تعذر رفع المرفق إلى Firebase Storage.'
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const getStatusClass = (status: DeviceStorageStatus) => {
    switch (status) {
      case DeviceStorageStatus.IN_WAREHOUSE:
        return 'text-emerald-700 dark:text-emerald-400';
      case DeviceStorageStatus.ISSUED:
        return 'text-blue-700 dark:text-blue-400';
      case DeviceStorageStatus.IN_MAINTENANCE:
        return 'text-amber-700 dark:text-amber-400';
      case DeviceStorageStatus.DAMAGED:
        return 'text-red-700 dark:text-red-400';
      default:
        return 'text-slate-500 dark:text-slate-400';
    }
  };

  const tabs: Array<{ id: CardTabId; label: string; icon: typeof FileText; count?: number }> = [
    { id: 'basic', label: 'المعلومات الأساسية', icon: FileText },
    { id: 'movements', label: 'سجل الحركات', icon: Activity, count: movements.length },
    { id: 'maintenance', label: 'سجل الصيانة', icon: Wrench, count: maintenance.length },
    { id: 'attachments', label: 'المرفقات والصور', icon: Paperclip, count: attachments.length },
    { id: 'history', label: 'سجل التعديلات', icon: History, count: history.length },
  ];

  const formatTimestamp = (val: unknown) => {
    if (!val) return '—';
    if (typeof val === 'object' && val !== null && 'toDate' in val) {
      const fn = (val as { toDate?: () => Date }).toDate;
      if (typeof fn === 'function') {
        return fn().toLocaleString('ar-IQ', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }
    if (typeof val === 'string') return val;
    return '—';
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 print-modal-portal"
      role="dialog"
      aria-modal="true"
      aria-label={`بطاقة الجهاز ${device.inventoryNumber}`}
    >
      <div
        className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px] print:hidden"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-4xl max-h-[92vh] rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden print-modal-sheet">
        {/* Card Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50/70 dark:bg-slate-900/40 print:hidden">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                {device.inventoryNumber}
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                ·
              </span>
              <span className="text-slate-500 dark:text-slate-400">{categoryName}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                ·
              </span>
              <span className={`font-semibold ${getStatusClass(device.storageStatus)}`}>
                {STORAGE_STATUS_LABELS[device.storageStatus]}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 truncate">
              {device.name}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PrintSignatureTriggerButton
              roleLabels={{
                organizer: 'أمين / موظف المخزن',
                reviewer: 'المستلم / الوحدة الفنية',
                approver: 'مصادقة مسؤول الشعبة',
              }}
            />
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة البطاقة</span>
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(device)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>تعديل</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق البطاقة"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 5 Tabs Navigation */}
        <div className="px-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1 overflow-x-auto bg-white dark:bg-[#111C2E] print:hidden">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[#0F2544] text-[#0F2544] dark:border-[#C59B47] dark:text-[#D4AE60]'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span className="font-mono-tabular text-[11px] text-slate-400">
                    ({tab.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 print:hidden">
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {/* Top split: Device Image + Barcode/QR Identification */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pb-5 border-b border-slate-200 dark:border-slate-800">
                <div className="md:col-span-4">
                  {device.imageUrl && !imageLoadFailed ? (
                    <img
                      src={device.imageUrl}
                      alt={device.name}
                      referrerPolicy="no-referrer"
                      onError={() => setImageLoadFailed(true)}
                      className="w-full h-44 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                    />
                  ) : (
                    <div className="w-full h-44 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center gap-2 text-slate-400">
                      <HardDrive className="w-8 h-8" />
                      <span className="text-xs">لا توجد صورة مرفقة للجهاز</span>
                    </div>
                  )}
                </div>

                <div className="md:col-span-8 space-y-3">
                  <BarcodePreview
                    barcodeValue={device.barcode || device.inventoryNumber}
                    qrValue={device.qrCodeValue || `SAYEDMART:DEV:${device.id}`}
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void downloadLabelPng(
                          buildDeviceLabelData(device, categoryName),
                          'thermal_70x40'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تحميل ملصق PNG</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void downloadLabelsPdf(
                          [buildDeviceLabelData(device, categoryName)],
                          'thermal_70x40'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>تحميل ملصق PDF</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* All 22 Fields Clean Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-xs">
                {[
                  { label: '1. رقم الجرد', value: device.inventoryNumber, mono: true },
                  { label: '2. اسم الجهاز', value: device.name },
                  { label: '3. التصنيف', value: categoryName },
                  { label: '4. الشركة المصنعة', value: device.manufacturer || '—' },
                  { label: '5. الموديل', value: device.model || '—' },
                  { label: '6. الرقم التسلسلي (S/N)', value: device.serialNumber || '—', mono: true },
                  { label: '7. تاريخ الشراء', value: device.purchaseDate || '—', mono: true },
                  { label: '8. تاريخ الاستلام', value: device.receivedDate || '—', mono: true },
                  { label: '9. مصدر التجهيز / سبب الإضافة', value: device.acquisitionSource || '—' },
                  { label: '10. الحالة الفنية', value: device.technicalStatus || '—' },
                  { label: '11. الحالة المخزنية', value: STORAGE_STATUS_LABELS[device.storageStatus] },
                  { label: '12. الموقع الحالي', value: device.currentLocation || '—' },
                  { label: '13. الشعبة المستفيدة', value: departmentName || '—' },
                  { label: '14. الوحدة المستفيدة', value: unitName || '—' },
                  { label: '15. اسم المستلم', value: device.recipientName || '—' },
                  { label: '16. تاريخ الصرف', value: device.issuedDate || '—', mono: true },
                  { label: '17. تاريخ الإرجاع', value: device.returnedDate || '—', mono: true },
                  { label: '18. مدة الضمان', value: device.warrantyPeriod || '—' },
                ].map((field) => (
                  <div
                    key={field.label}
                    className="pb-2.5 border-b border-slate-100 dark:border-slate-800/80"
                  >
                    <div className="text-slate-400 dark:text-slate-500">{field.label}</div>
                    <div
                      className={`mt-1 font-semibold text-slate-900 dark:text-slate-100 ${
                        field.mono ? 'font-mono-tabular' : ''
                      }`}
                    >
                      {field.value}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-xs text-slate-400 dark:text-slate-500">22. الملاحظات</div>
                <p className="mt-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {device.notes || 'لا توجد ملاحظات مسجلة لهذا الجهاز.'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'movements' && (
            <div>
              {movements.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  لا توجد حركات مخزنية مسجلة لهذا الجهاز بعد. ستظهر هنا تلقائياً عمليات الإدخال والصرف والإرجاع والنقل.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2.5 px-3">رقم الحركة</th>
                        <th className="py-2.5 px-3">النوع</th>
                        <th className="py-2.5 px-3">من / إلى</th>
                        <th className="py-2.5 px-3">المستلم</th>
                        <th className="py-2.5 px-3">السند</th>
                        <th className="py-2.5 px-3">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {movements.map((mv) => (
                        <tr key={mv.id}>
                          <td className="py-2.5 px-3 font-mono-tabular font-semibold">
                            {mv.movementNumber}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">
                            {MOVEMENT_TYPE_LABELS[mv.type]}
                          </td>
                          <td className="py-2.5 px-3">
                            {mv.previousLocation || '—'} ← {mv.newLocation || '—'}
                          </td>
                          <td className="py-2.5 px-3">{mv.recipientName || '—'}</td>
                          <td className="py-2.5 px-3 font-mono-tabular">
                            {mv.voucherNumber || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono-tabular text-slate-500">
                            {formatTimestamp(mv.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div>
              {maintenance.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  لا توجد تذاكر أو سجلات صيانة مسجلة لهذا الجهاز.
                </div>
              ) : (
                <div className="space-y-3">
                  {maintenance.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {rec.faultType}
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 mt-1">
                          {rec.problemDescription || rec.notes || '—'}
                        </p>
                        <div className="text-slate-400 mt-1 font-mono-tabular">
                          تاريخ الإرسال: {rec.sentDate || '—'}
                        </div>
                      </div>
                      <span className="font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                        {MAINTENANCE_STATUS_LABELS[rec.status]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'attachments' && (
            <div className="space-y-4">
              {canEdit && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      رفع صورة أو مستند رسمي إلى Firebase Storage
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      يُسمح بالصور وملفات PDF بحد أقصى 10 ميجابايت لكل ملف.
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>{uploading ? 'جاري الرفع...' : 'اختيار ملف ورفعه'}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={uploading}
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
              )}

              {uploadError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                  {uploadError}
                </div>
              )}

              {attachments.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  لا توجد مرفقات إضافية محفوظة لهذا الجهاز.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#0F2544]/40 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {att.fileName}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 font-mono-tabular">
                          {(att.sizeBytes / 1024).toFixed(0)} KB · {att.uploadedByName}
                        </div>
                      </div>
                      <span className="text-[#0F2544] dark:text-[#D4AE60] font-semibold shrink-0">
                        فتح
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {history.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  لا توجد تعديلات مسجلة بعد.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.summary}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          بواسطة: {item.actorName}
                        </div>
                      </div>
                      <span className="font-mono-tabular text-slate-400">
                        {formatTimestamp(item.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Complete Institutional Print-Only Asset Dossier (A4) */}
        <div className="hidden print:block print-modal-body space-y-4 text-slate-900">
          <PrintDocumentHeader
            title={`بطاقة تعريف أصل / جهاز تقني: ${device.name}`}
            subtitle={`التصنيف: ${categoryName} · الحالة المخزنية: ${STORAGE_STATUS_LABELS[device.storageStatus]}`}
            docCode={device.inventoryNumber}
            metaItems={[
              { label: 'رقم الجرد', value: device.inventoryNumber },
              { label: 'الرقم التسلسلي', value: device.serialNumber || '—' },
              { label: 'المسؤول', value: session?.fullName || 'مسؤول النظام' },
            ]}
          />

          <div className="grid grid-cols-12 gap-4 items-center pb-3 border-b border-slate-300 print-avoid-break">
            {device.imageUrl && !imageLoadFailed ? (
              <div className="col-span-4">
                <img
                  src={device.imageUrl}
                  alt={device.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-32 object-cover rounded border border-slate-300"
                />
              </div>
            ) : null}
            <div className={device.imageUrl && !imageLoadFailed ? 'col-span-8' : 'col-span-12'}>
              <BarcodePreview
                barcodeValue={device.barcode || device.inventoryNumber}
                qrValue={device.qrCodeValue || `SAYEDMART:DEV:${device.id}`}
              />
            </div>
          </div>

          <div className="print-avoid-break">
            <h2 className="text-xs font-bold text-[#0F2544] mb-2">
              أولاً: المواصفات الفنية وبيانات العهدة
            </h2>
            <table className="w-full text-right border-collapse text-xs">
              <tbody>
                {[
                  ['رقم الجرد', device.inventoryNumber, 'اسم الجهاز', device.name],
                  ['التصنيف', categoryName, 'الشركة المصنعة', device.manufacturer || '—'],
                  ['الموديل', device.model || '—', 'الرقم التسلسلي (S/N)', device.serialNumber || '—'],
                  ['الحالة الفنية', device.technicalStatus || '—', 'الحالة المخزنية', STORAGE_STATUS_LABELS[device.storageStatus]],
                  ['الموقع الحالي', device.currentLocation || '—', 'مصدر التجهيز', device.acquisitionSource || '—'],
                  ['الشعبة المستفيدة', departmentName || '—', 'الوحدة المستفيدة', unitName || '—'],
                  ['اسم المستلم', device.recipientName || '—', 'مدة الضمان', device.warrantyPeriod || '—'],
                  ['تاريخ الشراء', device.purchaseDate || '—', 'تاريخ الاستلام', device.receivedDate || '—'],
                  ['تاريخ الصرف', device.issuedDate || '—', 'تاريخ الإرجاع', device.returnedDate || '—'],
                ].map(([l1, v1, l2, v2]) => (
                  <tr key={l1}>
                    <th className="w-1/6 bg-slate-100 text-slate-700 font-semibold">{l1}</th>
                    <td className="w-1/3 font-semibold">{v1}</td>
                    <th className="w-1/6 bg-slate-100 text-slate-700 font-semibold">{l2}</th>
                    <td className="w-1/3 font-semibold">{v2}</td>
                  </tr>
                ))}
                <tr>
                  <th className="bg-slate-100 text-slate-700 font-semibold">الملاحظات</th>
                  <td colSpan={3}>{device.notes || 'لا توجد ملاحظات مسجلة لهذا الجهاز.'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {movements.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-[#0F2544] mb-1.5">
                ثانياً: سجل الحركات المخزنية ({movements.length})
              </h2>
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr>
                    <th>رقم الحركة</th>
                    <th>النوع</th>
                    <th>المسار (من ← إلى)</th>
                    <th>المستلم</th>
                    <th>السند</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.slice(0, 15).map((mv) => (
                    <tr key={mv.id}>
                      <td className="font-mono-tabular font-semibold">{mv.movementNumber}</td>
                      <td>{MOVEMENT_TYPE_LABELS[mv.type]}</td>
                      <td>
                        {mv.previousLocation || '—'} ← {mv.newLocation || '—'}
                      </td>
                      <td>{mv.recipientName || '—'}</td>
                      <td className="font-mono-tabular">{mv.voucherNumber || '—'}</td>
                      <td className="font-mono-tabular">{formatTimestamp(mv.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {maintenance.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-[#0F2544] mb-1.5">
                ثالثاً: سجل الصيانة والأعطال ({maintenance.length})
              </h2>
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr>
                    <th>نوع العطل</th>
                    <th>الوصف / الملاحظات</th>
                    <th>تاريخ الإرسال</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.slice(0, 15).map((rec) => (
                    <tr key={rec.id}>
                      <td className="font-semibold">{rec.faultType}</td>
                      <td>{rec.problemDescription || rec.notes || '—'}</td>
                      <td className="font-mono-tabular">{rec.sentDate || '—'}</td>
                      <td>{MAINTENANCE_STATUS_LABELS[rec.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <PrintSignatureFooter
            rightRole="أمين / موظف المخزن"
            centerRole="المستلم / الوحدة الفنية"
            leftRole="مصادقة مسؤول الشعبة"
          />
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
