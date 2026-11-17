import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  Eye,
  QrCode,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { VoucherPreviewModal } from '../components/operations/VoucherPreviewModal';
import { useAuth } from '../context/AuthContext';
import { resolveAssetByScannedCode } from '../services/barcodeService';
import {
  DepartmentRecord,
  subscribeToDepartments,
  subscribeToUnits,
  UnitRecord,
} from '../services/departmentsService';
import { DeviceRecord, subscribeToDevices } from '../services/devicesService';
import {
  AssetTransferVoucherRecord,
  executeAssetTransfer,
  generateVoucherNumber,
  PrintableVoucherData,
  subscribeToAssetTransfers,
} from '../services/operationsService';
import { DeviceStorageStatus, UserRole } from '../types/inventory';

export function AssetTransferPage() {
  const { session } = useAuth();
  const canTransfer =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER;

  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [transfers, setTransfers] = useState<AssetTransferVoucherRecord[]>([]);

  const [scanInput, setScanInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const [voucherNumber, setVoucherNumber] = useState(() => generateVoucherNumber('TRN'));
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDepartmentId, setToDepartmentId] = useState('');
  const [toUnitId, setToUnitId] = useState('');
  const [toRecipientName, setToRecipientName] = useState('');
  const [reason, setReason] = useState('إعادة توزيع العهدة حسب حاجة العمل');
  const [officialDocRef, setOfficialDocRef] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [previewVoucher, setPreviewVoucher] = useState<PrintableVoucherData | null>(null);

  useEffect(() => {
    const unsubDevs = subscribeToDevices(setDevices, () => {});
    const unsubDepts = subscribeToDepartments((list) => {
      const active = list.filter((d) => d.isActive);
      setDepartments(active);
      if (active.length > 0) setToDepartmentId((prev) => prev || active[0].id);
    }, () => {});
    const unsubUnits = subscribeToUnits(setUnits, () => {});
    const unsubTransfers = subscribeToAssetTransfers(setTransfers, () => {});

    return () => {
      unsubDevs();
      unsubDepts();
      unsubUnits();
      unsubTransfers();
    };
  }, []);

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

  const issuedDevices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return devices.filter((d) => {
      if (d.isArchived || d.storageStatus !== DeviceStorageStatus.ISSUED) return false;
      if (!q) return true;
      return (
        d.inventoryNumber.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        (d.recipientName || '').toLowerCase().includes(q) ||
        (d.currentLocation || '').toLowerCase().includes(q)
      );
    });
  }, [devices, searchQuery]);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) || null,
    [devices, selectedDeviceId]
  );

  const targetUnits = useMemo(
    () => units.filter((u) => u.departmentId === toDepartmentId && u.isActive),
    [units, toDepartmentId]
  );

  const handleScanLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = scanInput.trim();
    if (!code) return;
    setFeedback(null);
    try {
      const res = await resolveAssetByScannedCode(code);
      if (!res || res.kind !== 'DEVICE') {
        setFeedback({ type: 'error', message: `لم يتم العثور على جهاز مطابق للرمز ${code}.` });
        return;
      }
      if (res.device.isArchived || res.device.storageStatus !== DeviceStorageStatus.ISSUED) {
        setFeedback({
          type: 'error',
          message: `الجهاز ${res.device.inventoryNumber} غير مصروف حالياً لنقل عهدته.`,
        });
        return;
      }
      setSelectedDeviceId(res.device.id);
      setScanInput('');
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر البحث عن الجهاز.',
      });
    }
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
    setFeedback(null);
    setSubmitting(true);

    const fromDeptName = selectedDevice.departmentId
      ? deptMap.get(selectedDevice.departmentId)?.name || selectedDevice.currentLocation || 'الجهة السابقة'
      : selectedDevice.currentLocation || 'الجهة السابقة';
    const fromUnitName = selectedDevice.unitId ? unitMap.get(selectedDevice.unitId)?.name || '' : '';

    const toDeptName = deptMap.get(toDepartmentId)?.name || '';
    const toUnitName = toUnitId ? unitMap.get(toUnitId)?.name || '' : '';

    try {
      const created = await executeAssetTransfer({
        voucherNumber,
        transferDate,
        deviceId: selectedDevice.id,
        fromDepartmentName: fromDeptName,
        fromUnitName,
        toDepartmentId,
        toDepartmentName: toDeptName,
        toUnitId,
        toUnitName,
        toRecipientName,
        reason,
        officialDocRef,
        notes,
        actorName: session?.fullName || 'مسؤول المخزن',
      });

      setFeedback({
        type: 'success',
        message: `تم نقل عهدة الجهاز ${created.inventoryNumber} إلى ${created.toDepartmentName} بسند رقم ${created.voucherNumber}.`,
      });

      setPreviewVoucher({
        voucherNumber: created.voucherNumber,
        voucherType: 'TRANSFER',
        title: 'سند نقل عهدة جهاز بين الجهات',
        date: created.transferDate,
        officialDocRef: created.officialDocRef,
        fromLocation: [created.fromDepartmentName, created.fromUnitName]
          .filter(Boolean)
          .join(' / '),
        toLocation: [created.toDepartmentName, created.toUnitName]
          .filter(Boolean)
          .join(' / '),
        recipientName: created.toRecipientName,
        executedByName: created.executedByName,
        notes: `${created.reason}${created.notes ? ` · ${created.notes}` : ''}`,
        lines: [
          {
            kind: 'DEVICE',
            code: created.inventoryNumber,
            name: created.deviceName,
            quantity: 1,
            unit: 'جهاز',
            note: `المستلم السابق: ${created.fromRecipientName || '—'}`,
          },
        ],
      });

      setSelectedDeviceId('');
      setToRecipientName('');
      setOfficialDocRef('');
      setNotes('');
      setVoucherNumber(generateVoucherNumber('TRN'));
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تنفيذ نقل العهدة.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            نقل الأجهزة بين الشعب والوحدات
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تحويل عهدة الأجهزة المصروفة من جهة إلى أخرى مع الاحتفاظ بسند الصرف الأصلي وسلسلة المستلمين السابقين.
          </p>
        </div>
        <div className="text-xs font-mono-tabular text-slate-500">
          عمليات النقل المسجلة: {transfers.length}
        </div>
      </div>

      {!canTransfer && (
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            تنفيذ عمليات نقل العهدة محصور بصلاحيات مسؤول المخزن أو مدير النظام. يمكنك استعراض سجل النقل أدناه.
          </span>
        </div>
      )}

      {feedback && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
              : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {canTransfer && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Device Picker */}
          <div className="xl:col-span-6 space-y-4">
            <form
              onSubmit={handleScanLookup}
              className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap gap-2 items-center"
            >
              <QrCode className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60] shrink-0" />
              <input
                type="text"
                dir="ltr"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="امسح باركود الجهاز المراد نقله..."
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
              >
                تحديد الجهاز
              </button>
            </form>

            <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  اختر الجهاز المصروف لنقل عهدته
                </span>
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="تصفية..."
                    className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>

              {issuedDevices.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  لا توجد أجهزة مصروفة حالياً لدى الشعب لنقلها.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {issuedDevices.map((dev) => {
                    const active = selectedDeviceId === dev.id;
                    return (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => setSelectedDeviceId(dev.id)}
                        className={`w-full text-right px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                          active
                            ? 'bg-slate-100 dark:bg-slate-800/70'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                            {dev.inventoryNumber}
                          </div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {dev.name}
                          </div>
                        </div>
                        <div className="text-left text-[11px] text-slate-500 shrink-0">
                          <div>{dev.currentLocation || '—'}</div>
                          <div>المستلم الحالي: {dev.recipientName || '—'}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Transfer Form */}
          <form
            onSubmit={handleSubmitTransfer}
            className="xl:col-span-6 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-5 space-y-4 self-start"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <ArrowLeftRight className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60]" />
              <span>تفاصيل نقل العهدة</span>
            </div>

            {selectedDevice ? (
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                  {selectedDevice.inventoryNumber} — {selectedDevice.name}
                </div>
                <div className="text-slate-600 dark:text-slate-300">
                  الجهة الحالية: {selectedDevice.currentLocation || '—'} · المستلم الحالي:{' '}
                  {selectedDevice.recipientName || '—'}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 text-center">
                اختر جهازاً من القائمة المجاورة لعرض عهدته الحالية وتحديد الجهة الجديدة.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  رقم سند النقل
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={voucherNumber}
                  onChange={(e) => setVoucherNumber(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  تاريخ النقل
                </label>
                <input
                  type="date"
                  required
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  الشعبة المنقول إليها <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={toDepartmentId}
                  onChange={(e) => {
                    setToDepartmentId(e.target.value);
                    setToUnitId('');
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                >
                  <option value="">اختر الشعبة الجديدة...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  الوحدة المنقول إليها
                </label>
                <select
                  value={toUnitId}
                  onChange={(e) => setToUnitId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                >
                  <option value="">على مستوى الشعبة مباشرة</option>
                  {targetUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  المستلم الجديد <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={toRecipientName}
                  onChange={(e) => setToRecipientName(e.target.value)}
                  placeholder="اسم المستلم الجديد للعهدة"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  رقم الموافقة / الكتاب
                </label>
                <input
                  type="text"
                  value={officialDocRef}
                  onChange={(e) => setOfficialDocRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                سبب النقل
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ملاحظات إضافية
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedDevice}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-50 min-h-[42px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'جاري النقل...' : 'اعتماد نقل العهدة وإصدار السند'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Transfer Vouchers History Table */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-slate-100">
          سجل سندات نقل الأجهزة بين الجهات
        </div>
        {transfers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد عمليات نقل مسجلة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                  <th className="py-3 px-4">رقم السند</th>
                  <th className="py-3 px-4">الجهاز</th>
                  <th className="py-3 px-4">من الجهة</th>
                  <th className="py-3 px-4">إلى الجهة</th>
                  <th className="py-3 px-4">المستلم الجديد</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">السند</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transfers.map((tr) => (
                  <tr key={tr.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60]">
                      {tr.voucherNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono-tabular font-semibold">{tr.inventoryNumber}</span> ·{' '}
                      {tr.deviceName}
                    </td>
                    <td className="py-3 px-4">
                      {[tr.fromDepartmentName, tr.fromUnitName].filter(Boolean).join(' / ')}
                    </td>
                    <td className="py-3 px-4 font-semibold">
                      {[tr.toDepartmentName, tr.toUnitName].filter(Boolean).join(' / ')}
                    </td>
                    <td className="py-3 px-4">{tr.toRecipientName}</td>
                    <td className="py-3 px-4 font-mono-tabular">{tr.transferDate}</td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewVoucher({
                            voucherNumber: tr.voucherNumber,
                            voucherType: 'TRANSFER',
                            title: 'سند نقل عهدة جهاز بين الجهات',
                            date: tr.transferDate,
                            officialDocRef: tr.officialDocRef,
                            fromLocation: [tr.fromDepartmentName, tr.fromUnitName]
                              .filter(Boolean)
                              .join(' / '),
                            toLocation: [tr.toDepartmentName, tr.toUnitName]
                              .filter(Boolean)
                              .join(' / '),
                            recipientName: tr.toRecipientName,
                            executedByName: tr.executedByName,
                            notes: `${tr.reason}${tr.notes ? ` · ${tr.notes}` : ''}`,
                            lines: [
                              {
                                kind: 'DEVICE',
                                code: tr.inventoryNumber,
                                name: tr.deviceName,
                                quantity: 1,
                                unit: 'جهاز',
                                note: `المستلم السابق: ${tr.fromRecipientName || '—'}`,
                              },
                            ],
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>عرض / طباعة</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <VoucherPreviewModal
        voucher={previewVoucher}
        onClose={() => setPreviewVoucher(null)}
      />
    </div>
  );
}
