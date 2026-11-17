import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Edit3,
  Plus,
  Printer,
  QrCode,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import {
  PrintDocumentHeader,
  PrintSignatureFooter,
  PrintSignatureTriggerButton,
} from '../components/common/PrintDocumentHeader';
import { useAuth } from '../context/AuthContext';
import { resolveAssetByScannedCode } from '../services/barcodeService';
import {
  createMaintenanceTicket,
  MaintenanceTicketRecord,
  subscribeToMaintenanceRecords,
  updateMaintenanceTicket,
} from '../services/controlService';
import { DeviceRecord, subscribeToDevices } from '../services/devicesService';
import {
  MAINTENANCE_STATUS_LABELS,
  MaintenanceStatus,
  UserRole,
} from '../types/inventory';

type StatusFilter = 'ALL' | MaintenanceStatus;

export function MaintenancePage() {
  const { session } = useAuth();
  const canEdit =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER ||
    session?.role === UserRole.WAREHOUSE_STAFF;

  const [tickets, setTickets] = useState<MaintenanceTicketRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // Create Ticket Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [faultType, setFaultType] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [assignedUnit, setAssignedUnit] = useState('ورشة الصيانة التقنية — شعبة السيطرة');
  const [sentDate, setSentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [initialStatus, setInitialStatus] = useState<MaintenanceStatus>(
    MaintenanceStatus.IN_PROGRESS
  );
  const [createNotes, setCreateNotes] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);

  // Update Ticket Modal state
  const [editingTicket, setEditingTicket] = useState<MaintenanceTicketRecord | null>(null);
  const [nextStatus, setNextStatus] = useState<MaintenanceStatus>(MaintenanceStatus.COMPLETED);
  const [completedDate, setCompletedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [repairCost, setRepairCost] = useState('0');
  const [returnToDept, setReturnToDept] = useState(false);
  const [updateNotes, setUpdateNotes] = useState('');
  const [savingUpdate, setSavingUpdate] = useState(false);

  useEffect(() => {
    const unsubTickets = subscribeToMaintenanceRecords(
      (list) => {
        setTickets(list);
        setLoading(false);
      },
      (err) => {
        setErrorMsg(err.message);
        setLoading(false);
      }
    );

    const unsubDevices = subscribeToDevices(
      (list) => setDevices(list),
      () => {}
    );

    return () => {
      unsubTickets();
      unsubDevices();
    };
  }, []);

  const activeDevices = useMemo(
    () => devices.filter((d) => !d.isArchived),
    [devices]
  );

  const selectedDevice = useMemo(
    () => activeDevices.find((d) => d.id === selectedDeviceId) || null,
    [activeDevices, selectedDeviceId]
  );

  const editingDeviceHasDepartment = useMemo(() => {
    if (!editingTicket) return false;
    const dev = devices.find((d) => d.id === editingTicket.deviceId);
    return Boolean(dev?.departmentId);
  }, [editingTicket, devices]);

  const counts = useMemo(() => {
    return {
      total: tickets.length,
      needs: tickets.filter((t) => t.status === MaintenanceStatus.NEEDS_MAINTENANCE).length,
      inProgress: tickets.filter((t) => t.status === MaintenanceStatus.IN_PROGRESS).length,
      completed: tickets.filter((t) => t.status === MaintenanceStatus.COMPLETED).length,
      unrepairable: tickets.filter((t) => t.status === MaintenanceStatus.UNREPAIRABLE).length,
    };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.inventoryCode.toLowerCase().includes(q) ||
        t.deviceName.toLowerCase().includes(q) ||
        t.faultType.toLowerCase().includes(q) ||
        (t.assignedUnit || '').toLowerCase().includes(q)
      );
    });
  }, [tickets, statusFilter, searchQuery]);

  const handleScanLookup = async () => {
    const code = scanInput.trim();
    if (!code) return;
    setScanBusy(true);
    setErrorMsg('');
    try {
      const res = await resolveAssetByScannedCode(code);
      if (res && res.kind === 'DEVICE') {
        if (res.device.isArchived) {
          setErrorMsg('الجهاز الممسوح مؤرشف ولا يمكن فتح تذكرة صيانة له.');
        } else {
          setSelectedDeviceId(res.device.id);
          setScanInput('');
        }
      } else {
        setErrorMsg(`لم يتم العثور على جهاز مسجل بالرمز: ${code}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر البحث عن الرمز.');
    } finally {
      setScanBusy(false);
    }
  };

  const handleOpenCreateModal = () => {
    setErrorMsg('');
    setSuccessMsg('');
    setSelectedDeviceId('');
    setScanInput('');
    setFaultType('');
    setProblemDescription('');
    setAssignedUnit('ورشة الصيانة التقنية — شعبة السيطرة');
    setSentDate(new Date().toISOString().slice(0, 10));
    setInitialStatus(MaintenanceStatus.IN_PROGRESS);
    setCreateNotes('');
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) {
      setErrorMsg('يرجى اختيار الجهاز المطلوب صيانته.');
      return;
    }
    if (!faultType.trim()) {
      setErrorMsg('يرجى تحديد نوع العطل.');
      return;
    }

    setSavingCreate(true);
    setErrorMsg('');
    try {
      const ticketId = await createMaintenanceTicket({
        device: selectedDevice,
        faultType,
        problemDescription,
        sentDate,
        assignedUnit,
        initialStatus,
        notes: createNotes,
        actorName: session?.fullName || 'موظف المخزن',
      });
      setCreateOpen(false);
      setSuccessMsg(
        `تم فتح تذكرة الصيانة (${ticketId}) وتحديث حالة الجهاز ${selectedDevice.inventoryNumber}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تسجيل تذكرة الصيانة.');
    } finally {
      setSavingCreate(false);
    }
  };

  const openUpdateModal = (ticket: MaintenanceTicketRecord) => {
    setErrorMsg('');
    setSuccessMsg('');
    setEditingTicket(ticket);
    setNextStatus(
      ticket.status === MaintenanceStatus.NEEDS_MAINTENANCE
        ? MaintenanceStatus.IN_PROGRESS
        : MaintenanceStatus.COMPLETED
    );
    setCompletedDate(ticket.completedDate || new Date().toISOString().slice(0, 10));
    setRepairCost(String(ticket.cost ?? 0));
    setReturnToDept(false);
    setUpdateNotes(ticket.notes || '');
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;

    setSavingUpdate(true);
    setErrorMsg('');
    try {
      const parsedCost = Number(repairCost);
      await updateMaintenanceTicket({
        ticket: editingTicket,
        nextStatus,
        completedDate:
          nextStatus === MaintenanceStatus.COMPLETED ? completedDate : undefined,
        cost: Number.isNaN(parsedCost) || parsedCost < 0 ? 0 : parsedCost,
        notes: updateNotes,
        returnToDepartment: returnToDept,
        actorName: session?.fullName || 'موظف المخزن',
      });
      setSuccessMsg(
        `تم تحديث حالة تذكرة الصيانة للجهاز ${editingTicket.inventoryCode} إلى «${MAINTENANCE_STATUS_LABELS[nextStatus]}».`
      );
      setEditingTicket(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحديث تذكرة الصيانة.');
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'رقم التذكرة',
      'رقم الجرد',
      'اسم الجهاز',
      'نوع العطل',
      'وصف المشكلة',
      'الجهة المنفذة / الورشة',
      'تاريخ الإرسال',
      'الحالة',
      'تاريخ الإنجاز',
      'التكلفة (د.ع)',
      'الملاحظات',
    ];
    const rows = filteredTickets.map((t) => [
      t.id,
      t.inventoryCode,
      t.deviceName,
      t.faultType,
      t.problemDescription || '',
      t.assignedUnit || '',
      t.sentDate || '',
      MAINTENANCE_STATUS_LABELS[t.status],
      t.completedDate || '',
      String(t.cost ?? 0),
      t.notes || '',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `maintenance-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusStyle = (status: MaintenanceStatus) => {
    switch (status) {
      case MaintenanceStatus.NEEDS_MAINTENANCE:
        return 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case MaintenanceStatus.IN_PROGRESS:
        return 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case MaintenanceStatus.COMPLETED:
        return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case MaintenanceStatus.UNREPAIRABLE:
        return 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800';
    }
  };

  return (
    <div className="space-y-5">
      <PrintDocumentHeader
        title="سجل صيانة الأجهزة والمعدات التقنية"
        subtitle={
          statusFilter === 'ALL'
            ? 'كشف شامل بتذاكر الأعطال والصيانة وحالات الإنجاز والتكاليف'
            : `تذاكر الصيانة المصفاة حسب الحالة: ${MAINTENANCE_STATUS_LABELS[statusFilter]}`
        }
        docCode="MNT-LOG"
        metaItems={[
          { label: 'عدد السجلات الظاهرة', value: filteredTickets.length },
          { label: 'قيد الانتظار/الصيانة', value: counts.needs + counts.inProgress },
          { label: 'منجزة', value: counts.completed },
          { label: 'المُصدِر', value: session?.fullName || 'مسؤول النظام' },
        ]}
      />

      {/* Header */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            إدارة صيانة الأجهزة والمعدات
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            فتح تذاكر الأعطال، متابعة الأجهزة المرسلة للورش الفنية، وتحديث حالتها المخزنية والفنية فور الإنجاز.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>
          <PrintSignatureTriggerButton
            roleLabels={{
              organizer: 'مسؤول وحدة الصيانة',
              reviewer: 'التدقيق الفني / شعبة السيطرة',
              approver: 'مصادقة مسؤول الشعبة',
            }}
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة</span>
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل عطل / إرسال للصيانة</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback banners */}
      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 text-xs sm:text-sm flex items-center justify-between gap-2 print:hidden"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg('')} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm flex items-center justify-between gap-2 print:hidden"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg('')} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 print:hidden">
        {[
          { label: 'إجمالي التذاكر', value: counts.total, cls: 'text-slate-900 dark:text-slate-100' },
          { label: 'بانتظار الصيانة', value: counts.needs, cls: 'text-amber-700 dark:text-amber-400' },
          { label: 'قيد الصيانة', value: counts.inProgress, cls: 'text-blue-700 dark:text-blue-400' },
          { label: 'تمت الصيانة', value: counts.completed, cls: 'text-emerald-700 dark:text-emerald-400' },
          { label: 'غير قابل للإصلاح', value: counts.unrepairable, cls: 'text-red-700 dark:text-red-400' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4"
          >
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {item.label}
            </div>
            <div className={`text-xl font-bold font-mono-tabular mt-1 ${item.cls}`}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الجرد، اسم الجهاز، نوع العطل، أو الورشة..."
            className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
          />
        </div>

        <div className="inline-flex flex-wrap p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
          {(
            [
              { id: 'ALL', label: 'الكل' },
              { id: MaintenanceStatus.NEEDS_MAINTENANCE, label: 'يحتاج صيانة' },
              { id: MaintenanceStatus.IN_PROGRESS, label: 'قيد الصيانة' },
              { id: MaintenanceStatus.COMPLETED, label: 'تمت الصيانة' },
              { id: MaintenanceStatus.UNREPAIRABLE, label: 'غير قابل للإصلاح' },
            ] as Array<{ id: StatusFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60] font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Maintenance Table */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">
            جاري تحميل تذاكر الصيانة...
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Wrench className="w-8 h-8 mx-auto text-slate-400" />
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
              لا توجد تذاكر صيانة مطابقة
            </div>
            <p className="text-xs text-slate-500">
              يمكنك تسجيل عطل جديد وإرسال الجهاز للصيانة عبر الزر المخصص في الأعلى.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                  <th className="py-3 px-3">رقم الجرد</th>
                  <th className="py-3 px-3">الجهاز</th>
                  <th className="py-3 px-3">نوع العطل</th>
                  <th className="py-3 px-3">الجهة المنفذة / الورشة</th>
                  <th className="py-3 px-3">تاريخ الإرسال</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3">تاريخ الإنجاز</th>
                  <th className="py-3 px-3">التكلفة</th>
                  {canEdit && <th className="py-3 px-3 print:hidden">إجراء</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-3 font-mono-tabular font-bold text-[#0F2544] dark:text-[#D4AE60] whitespace-nowrap">
                      {t.inventoryCode}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {t.deviceName}
                      </div>
                      {t.problemDescription && (
                        <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
                          {t.problemDescription}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 font-medium">{t.faultType}</td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {t.assignedUnit || '—'}
                    </td>
                    <td className="py-3 px-3 font-mono-tabular whitespace-nowrap">
                      {t.sentDate || '—'}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[11px] font-semibold ${getStatusStyle(
                          t.status
                        )}`}
                      >
                        {MAINTENANCE_STATUS_LABELS[t.status]}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono-tabular whitespace-nowrap">
                      {t.completedDate || '—'}
                    </td>
                    <td className="py-3 px-3 font-mono-tabular whitespace-nowrap">
                      {typeof t.cost === 'number' && t.cost > 0
                        ? `${t.cost.toLocaleString('en-US')} د.ع`
                        : '—'}
                    </td>
                    {canEdit && (
                      <td className="py-3 px-3 print:hidden whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openUpdateModal(t)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تحديث الحالة</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PrintSignatureFooter
        rightRole="منظم سجل الصيانة"
        centerRole="فني / ورشة الصيانة"
        leftRole="مصادقة مسؤول الشعبة"
      />

      {/* Create Maintenance Ticket Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تسجيل عطل وإرسال للصيانة"
        >
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative z-10 w-full max-w-xl rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تسجيل عطل / فتح تذكرة صيانة
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateSubmit}
              className="p-5 space-y-4 overflow-y-auto text-xs sm:text-sm"
            >
              {/* Quick Barcode Scan Lookup */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-semibold">
                  بحث سريع بالباركود أو رقم الجرد أو الرقم التسلسلي
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleScanLookup();
                      }
                    }}
                    placeholder="امسح الرمز أو اكتب رقم الجرد..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
                  />
                  <button
                    type="button"
                    disabled={scanBusy}
                    onClick={() => void handleScanLookup()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0F2544] text-white dark:bg-[#C59B47] dark:text-[#0B1220] text-xs font-semibold"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>{scanBusy ? 'بحث...' : 'تحديد'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  الجهاز <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">-- اختر الجهاز --</option>
                  {activeDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      [{d.inventoryNumber}] {d.name} — ({d.currentLocation || 'المخزن الرئيسي'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    نوع العطل <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={faultType}
                    onChange={(e) => setFaultType(e.target.value)}
                    placeholder="مثال: عطل مزود طاقة / توقف منفذ شبكة"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">تاريخ الإرسال</label>
                  <input
                    type="date"
                    required
                    value={sentDate}
                    onChange={(e) => setSentDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    الجهة المنفذة / ورشة الصيانة
                  </label>
                  <input
                    type="text"
                    required
                    value={assignedUnit}
                    onChange={(e) => setAssignedUnit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الحالة الابتدائية</label>
                  <select
                    value={initialStatus}
                    onChange={(e) =>
                      setInitialStatus(e.target.value as MaintenanceStatus)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value={MaintenanceStatus.NEEDS_MAINTENANCE}>
                      يحتاج إلى صيانة
                    </option>
                    <option value={MaintenanceStatus.IN_PROGRESS}>قيد الصيانة</option>
                    <option value={MaintenanceStatus.UNREPAIRABLE}>
                      غير قابل للإصلاح (تالف)
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">وصف العطل التفصيلي</label>
                <textarea
                  rows={2}
                  value={problemDescription}
                  onChange={(e) => setProblemDescription(e.target.value)}
                  placeholder="تشخيص المشكلة والأعراض الظاهرة..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">ملاحظات إضافية</label>
                <input
                  type="text"
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingCreate}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
                >
                  <Wrench className="w-4 h-4" />
                  <span>{savingCreate ? 'جاري الحفظ...' : 'حفظ وتحديث حالة الجهاز'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Ticket Status Modal */}
      {editingTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تحديث حالة تذكرة الصيانة"
        >
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setEditingTicket(null)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  تحديث حالة الصيانة
                </h3>
                <div className="text-xs font-mono-tabular text-[#0F2544] dark:text-[#D4AE60] mt-0.5">
                  {editingTicket.inventoryCode} — {editingTicket.deviceName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTicket(null)}
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold mb-1">الحالة الجديدة</label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as MaintenanceStatus)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value={MaintenanceStatus.NEEDS_MAINTENANCE}>
                    يحتاج إلى صيانة
                  </option>
                  <option value={MaintenanceStatus.IN_PROGRESS}>قيد الصيانة</option>
                  <option value={MaintenanceStatus.COMPLETED}>
                    تمت الصيانة (إعادة للخدمة/المخزن)
                  </option>
                  <option value={MaintenanceStatus.UNREPAIRABLE}>
                    غير قابل للإصلاح (تالف)
                  </option>
                </select>
              </div>

              {nextStatus === MaintenanceStatus.COMPLETED && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        تاريخ إتمام الصيانة
                      </label>
                      <input
                        type="date"
                        value={completedDate}
                        onChange={(e) => setCompletedDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        كلفة الإصلاح (د.ع)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={repairCost}
                        onChange={(e) => setRepairCost(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-tabular"
                      />
                    </div>
                  </div>

                  {editingDeviceHasDepartment && (
                    <label className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={returnToDept}
                        onChange={(e) => setReturnToDept(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>
                        إعادة الجهاز مباشرة إلى عهدة الشعبة المستفيدة السابقة (بدلاً من إيداعه في المخزن الرئيسي)
                      </span>
                    </label>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">
                  ملاحظات الإجراء / التقرير الفني
                </label>
                <textarea
                  rows={3}
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTicket(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingUpdate}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingUpdate ? 'جاري التحديث...' : 'حفظ التحديث'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
