import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Building2,
  CheckCircle2,
  Edit3,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  Search,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  createDepartment,
  createUnit,
  DepartmentInput,
  DepartmentRecord,
  subscribeToDepartments,
  subscribeToUnits,
  toggleDepartmentStatus,
  toggleUnitStatus,
  UnitInput,
  UnitRecord,
  updateDepartment,
  updateUnit,
} from '../services/departmentsService';
import { UserRole } from '../types/inventory';

type StatusFilter = 'all' | 'active' | 'archived';

export function DepartmentsPage() {
  const { session } = useAuth();
  const canManage =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER;

  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Department Modal State
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentRecord | null>(null);
  const [deptForm, setDeptForm] = useState<DepartmentInput>({
    name: '',
    managerName: '',
    phone: '',
    location: '',
    notes: '',
    isActive: true,
  });
  const [savingDept, setSavingDept] = useState(false);

  // Unit Modal State
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitRecord | null>(null);
  const [unitForm, setUnitForm] = useState<UnitInput>({
    departmentId: '',
    name: '',
    supervisorName: '',
    phone: '',
    location: '',
    notes: '',
    isActive: true,
  });
  const [savingUnit, setSavingUnit] = useState(false);

  useEffect(() => {
    setLoading(true);
    let deptLoaded = false;
    let unitLoaded = false;

    const checkReady = () => {
      if (deptLoaded && unitLoaded) setLoading(false);
    };

    const unsubDepts = subscribeToDepartments(
      (list) => {
        setDepartments(list);
        deptLoaded = true;
        checkReady();
      },
      (err) => {
        setLoading(false);
        setFeedback({ type: 'error', message: `تعذر تحميل الشعب: ${err.message}` });
      }
    );

    const unsubUnits = subscribeToUnits(
      (list) => {
        setUnits(list);
        unitLoaded = true;
        checkReady();
      },
      (err) => {
        setLoading(false);
        setFeedback({ type: 'error', message: `تعذر تحميل الوحدات: ${err.message}` });
      }
    );

    return () => {
      unsubDepts();
      unsubUnits();
    };
  }, []);

  const deptMap = useMemo(() => {
    const map = new Map<string, DepartmentRecord>();
    departments.forEach((d) => map.set(d.id, d));
    return map;
  }, [departments]);

  const unitsByDept = useMemo(() => {
    const map = new Map<string, UnitRecord[]>();
    units.forEach((u) => {
      const existing = map.get(u.departmentId) || [];
      existing.push(u);
      map.set(u.departmentId, existing);
    });
    return map;
  }, [units]);

  const filteredDepartments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return departments.filter((dept) => {
      if (statusFilter === 'active' && !dept.isActive) return false;
      if (statusFilter === 'archived' && dept.isActive) return false;
      if (!q) return true;
      const deptMatches =
        dept.name.toLowerCase().includes(q) ||
        (dept.managerName || '').toLowerCase().includes(q) ||
        (dept.location || '').toLowerCase().includes(q);
      const childUnits = unitsByDept.get(dept.id) || [];
      const anyUnitMatches = childUnits.some(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.supervisorName || '').toLowerCase().includes(q)
      );
      return deptMatches || anyUnitMatches;
    });
  }, [departments, unitsByDept, searchQuery, statusFilter]);

  const filteredUnits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return units.filter((unit) => {
      if (selectedDeptId !== 'all' && unit.departmentId !== selectedDeptId) {
        return false;
      }
      if (statusFilter === 'active' && !unit.isActive) return false;
      if (statusFilter === 'archived' && unit.isActive) return false;
      if (!q) return true;
      const parentName = deptMap.get(unit.departmentId)?.name || '';
      return (
        unit.name.toLowerCase().includes(q) ||
        parentName.toLowerCase().includes(q) ||
        (unit.supervisorName || '').toLowerCase().includes(q) ||
        (unit.location || '').toLowerCase().includes(q)
      );
    });
  }, [units, deptMap, selectedDeptId, statusFilter, searchQuery]);

  // Department handlers
  const openCreateDeptModal = () => {
    setEditingDept(null);
    setDeptForm({
      name: '',
      managerName: '',
      phone: '',
      location: '',
      notes: '',
      isActive: true,
    });
    setDeptModalOpen(true);
  };

  const openEditDeptModal = (dept: DepartmentRecord) => {
    setEditingDept(dept);
    setDeptForm({
      name: dept.name,
      managerName: dept.managerName || '',
      phone: dept.phone || '',
      location: dept.location || '',
      notes: dept.notes || '',
      isActive: dept.isActive,
    });
    setDeptModalOpen(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSavingDept(true);
    try {
      if (editingDept) {
        await updateDepartment(editingDept.id, deptForm, departments);
        setFeedback({
          type: 'success',
          message: `تم تحديث بيانات الشعبة "${deptForm.name.trim()}" بنجاح.`,
        });
      } else {
        await createDepartment(deptForm, departments);
        setFeedback({
          type: 'success',
          message: `تمت إضافة الشعبة "${deptForm.name.trim()}" بنجاح.`,
        });
      }
      setDeptModalOpen(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر حفظ بيانات الشعبة.',
      });
    } finally {
      setSavingDept(false);
    }
  };

  const handleToggleDeptStatus = async (dept: DepartmentRecord) => {
    setFeedback(null);
    try {
      await toggleDepartmentStatus(dept);
      setFeedback({
        type: 'success',
        message: dept.isActive
          ? `تمت أرشفة الشعبة "${dept.name}".`
          : `تم إعادة تفعيل الشعبة "${dept.name}".`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تحديث حالة الشعبة.',
      });
    }
  };

  // Unit handlers
  const openCreateUnitModal = (preselectedDeptId?: string) => {
    const defaultDeptId =
      preselectedDeptId ||
      (selectedDeptId !== 'all' ? selectedDeptId : departments[0]?.id || '');
    setEditingUnit(null);
    setUnitForm({
      departmentId: defaultDeptId,
      name: '',
      supervisorName: '',
      phone: '',
      location: '',
      notes: '',
      isActive: true,
    });
    setUnitModalOpen(true);
  };

  const openEditUnitModal = (unit: UnitRecord) => {
    setEditingUnit(unit);
    setUnitForm({
      departmentId: unit.departmentId,
      name: unit.name,
      supervisorName: unit.supervisorName || '',
      phone: unit.phone || '',
      location: unit.location || '',
      notes: unit.notes || '',
      isActive: unit.isActive,
    });
    setUnitModalOpen(true);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSavingUnit(true);
    try {
      if (editingUnit) {
        await updateUnit(editingUnit.id, unitForm, units);
        setFeedback({
          type: 'success',
          message: `تم تحديث بيانات الوحدة "${unitForm.name.trim()}" بنجاح.`,
        });
      } else {
        await createUnit(unitForm, units);
        setFeedback({
          type: 'success',
          message: `تمت إضافة الوحدة "${unitForm.name.trim()}" وربطها بالشعبة بنجاح.`,
        });
      }
      setUnitModalOpen(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر حفظ بيانات الوحدة.',
      });
    } finally {
      setSavingUnit(false);
    }
  };

  const handleToggleUnitStatus = async (unit: UnitRecord) => {
    setFeedback(null);
    try {
      await toggleUnitStatus(unit);
      setFeedback({
        type: 'success',
        message: unit.isActive
          ? `تمت أرشفة الوحدة "${unit.name}".`
          : `تم إعادة تفعيل الوحدة "${unit.name}".`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تحديث حالة الوحدة.',
      });
    }
  };

  const activeDeptsCount = departments.filter((d) => d.isActive).length;
  const activeUnitsCount = units.filter((u) => u.isActive).length;

  return (
    <div className="space-y-5">
      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>الشعب المسجلة: {departments.length} (فعّالة: {activeDeptsCount})</span>
            <span aria-hidden="true">·</span>
            <span>الوحدات المرتبطة: {units.length} (فعّالة: {activeUnitsCount})</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            دليل الجهات المستفيدة التابعة لمجمع سيد الشهداء (عليه السلام) الخدمي لاختيارها في سندات الصرف والنقل.
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openCreateUnitModal()}
              disabled={departments.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap min-h-[40px]"
            >
              <Plus className="w-4 h-4 text-[#0F2544] dark:text-[#D4AE60]" />
              <span>إضافة وحدة تابعة</span>
            </button>

            <button
              type="button"
              onClick={openCreateDeptModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] dark:hover:bg-[#D4AE60] transition-colors whitespace-nowrap min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة شعبة جديدة</span>
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
              : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="إغلاق الرسالة"
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Status Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث باسم الشعبة، الوحدة، المسؤول، أو الموقع..."
            className="w-full pr-10 pl-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
          />
        </div>

        <div
          role="group"
          aria-label="تصفية الجهات حسب الحالة"
          className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 self-start sm:self-auto"
        >
          {(
            [
              { id: 'all', label: 'الكل' },
              { id: 'active', label: 'الفعّالة' },
              { id: 'archived', label: 'المؤرشفة' },
            ] as Array<{ id: StatusFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60] font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Two-Column Directory Layout: Departments List + Linked Units Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Departments Column */}
        <div className="lg:col-span-5 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/40">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              الشعب المسجلة
            </h2>
            {selectedDeptId !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedDeptId('all')}
                className="text-xs font-semibold text-[#0F2544] dark:text-[#D4AE60] hover:underline"
              >
                عرض جميع الوحدات
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800/60"
                />
              ))}
            </div>
          ) : filteredDepartments.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Building2 className="w-8 h-8 mx-auto text-slate-400" />
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                لا توجد شعب مسجلة
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ابدأ بإضافة الشعب التابعة لمجمع سيد الشهداء (ع) الخدمي ثم أضف الوحدات المرتبطة بها.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredDepartments.map((dept) => {
                const unitCount = (unitsByDept.get(dept.id) || []).length;
                const isSelected = selectedDeptId === dept.id;
                return (
                  <div
                    key={dept.id}
                    className={`p-4 transition-colors ${
                      isSelected
                        ? 'bg-[#0F2544]/5 dark:bg-[#C59B47]/10'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedDeptId(isSelected ? 'all' : dept.id)
                        }
                        className="text-right min-w-0 flex-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {dept.name}
                          </span>
                          <span className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400 shrink-0">
                            ({unitCount} وحدات)
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          {dept.managerName && (
                            <span className="inline-flex items-center gap-1">
                              <User className="w-3.5 h-3.5" />
                              <span>{dept.managerName}</span>
                            </span>
                          )}
                          {dept.phone && (
                            <span className="inline-flex items-center gap-1 font-mono-tabular">
                              <Phone className="w-3.5 h-3.5" />
                              <span dir="ltr">{dept.phone}</span>
                            </span>
                          )}
                          {dept.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              <span>{dept.location}</span>
                            </span>
                          )}
                        </div>
                        {dept.notes && (
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                            {dept.notes}
                          </p>
                        )}
                      </button>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span
                          className={`text-[11px] font-semibold ${
                            dept.isActive
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {dept.isActive ? 'فعّالة' : 'مؤرشفة'}
                        </span>

                        {canManage && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openCreateUnitModal(dept.id)}
                              title="إضافة وحدة لهذه الشعبة"
                              aria-label={`إضافة وحدة لشعبة ${dept.name}`}
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditDeptModal(dept)}
                              title="تعديل الشعبة"
                              aria-label={`تعديل شعبة ${dept.name}`}
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleDeptStatus(dept)}
                              title={dept.isActive ? 'أرشفة الشعبة' : 'تفعيل الشعبة'}
                              aria-label={dept.isActive ? `أرشفة ${dept.name}` : `تفعيل ${dept.name}`}
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {dept.isActive ? (
                                <Archive className="w-3.5 h-3.5" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Units Table Column */}
        <div className="lg:col-span-7 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/40">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {selectedDeptId === 'all'
                  ? 'جميع الوحدات المرتبطة بالشعب'
                  : `وحدات: ${deptMap.get(selectedDeptId)?.name || ''}`}
              </h2>
            </div>
            <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
              {filteredUnits.length} وحدة
            </span>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded bg-slate-100 dark:bg-slate-800/60"
                />
              ))}
            </div>
          ) : filteredUnits.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                لا توجد وحدات مسجلة ضمن هذا العرض
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يمكنك ربط وحدة واحدة أو أكثر بكل شعبة لتحديد جهة الصرف والاستلام بدقة.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4 whitespace-nowrap">الوحدة</th>
                    <th className="py-3 px-4 whitespace-nowrap">الشعبة التابعة</th>
                    <th className="py-3 px-4 whitespace-nowrap">المسؤول والهاتف</th>
                    <th className="py-3 px-4 whitespace-nowrap">الموقع</th>
                    <th className="py-3 px-4 whitespace-nowrap">الحالة</th>
                    {canManage && <th className="py-3 px-4 whitespace-nowrap">الإجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {filteredUnits.map((unit) => {
                    const parentDept = deptMap.get(unit.departmentId);
                    return (
                      <tr
                        key={unit.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {unit.name}
                          </div>
                          {unit.notes && (
                            <div className="text-[11px] text-slate-400 mt-0.5 max-w-[200px] truncate">
                              {unit.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {parentDept?.name || '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          <div>{unit.supervisorName || '—'}</div>
                          {unit.phone && (
                            <div
                              dir="ltr"
                              className="text-[11px] text-slate-400 font-mono-tabular text-right"
                            >
                              {unit.phone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {unit.location || '—'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {unit.isActive ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>فعّالة</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400">
                              <Archive className="w-3.5 h-3.5" />
                              <span>مؤرشفة</span>
                            </span>
                          )}
                        </td>
                        {canManage && (
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditUnitModal(unit)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>تعديل</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleUnitStatus(unit)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {unit.isActive ? (
                                  <>
                                    <Archive className="w-3.5 h-3.5" />
                                    <span>أرشفة</span>
                                  </>
                                ) : (
                                  <>
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>تفعيل</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Department Modal */}
      {deptModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingDept ? 'تعديل الشعبة' : 'إضافة شعبة جديدة'}
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setDeptModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingDept ? 'تعديل بيانات الشعبة' : 'إضافة شعبة جديدة'}
              </h2>
              <button
                type="button"
                onClick={() => setDeptModalOpen(false)}
                aria-label="إغلاق"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDept} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="dept-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  اسم الشعبة <span className="text-red-500">*</span>
                </label>
                <input
                  id="dept-name"
                  type="text"
                  required
                  value={deptForm.name}
                  onChange={(e) =>
                    setDeptForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="مثال: شعبة السيطرة والإنترنت"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="dept-manager"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    اسم المسؤول
                  </label>
                  <input
                    id="dept-manager"
                    type="text"
                    value={deptForm.managerName}
                    onChange={(e) =>
                      setDeptForm((prev) => ({ ...prev, managerName: e.target.value }))
                    }
                    placeholder="الاسم الثلاثي للمسؤول"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="dept-phone"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    رقم الهاتف (إن توفر)
                  </label>
                  <input
                    id="dept-phone"
                    type="text"
                    dir="ltr"
                    value={deptForm.phone}
                    onChange={(e) =>
                      setDeptForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="07700000000"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="dept-location"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  الموقع
                </label>
                <input
                  id="dept-location"
                  type="text"
                  value={deptForm.location}
                  onChange={(e) =>
                    setDeptForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  placeholder="مثال: البناية الرئيسية — الطابق الثاني"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                />
              </div>

              <div>
                <label
                  htmlFor="dept-notes"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  الملاحظات
                </label>
                <textarea
                  id="dept-notes"
                  rows={2}
                  maxLength={400}
                  value={deptForm.notes}
                  onChange={(e) =>
                    setDeptForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deptForm.isActive}
                  onChange={(e) =>
                    setDeptForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-slate-300 text-[#0F2544]"
                />
                <span>الجهة فعّالة ومتاحة لاختيارها في سندات الصرف</span>
              </label>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeptModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingDept}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-60"
                >
                  {savingDept ? 'جاري الحفظ...' : editingDept ? 'حفظ التعديلات' : 'إضافة الشعبة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unit Modal */}
      {unitModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingUnit ? 'تعديل الوحدة' : 'إضافة وحدة جديدة'}
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setUnitModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingUnit ? 'تعديل بيانات الوحدة' : 'إضافة وحدة تابعة لشعبة'}
              </h2>
              <button
                type="button"
                onClick={() => setUnitModalOpen(false)}
                aria-label="إغلاق"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUnit} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="unit-dept"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  الشعبة التابعة لها <span className="text-red-500">*</span>
                </label>
                <select
                  id="unit-dept"
                  required
                  value={unitForm.departmentId}
                  onChange={(e) =>
                    setUnitForm((prev) => ({ ...prev, departmentId: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                >
                  <option value="">اختر الشعبة...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {!d.isActive ? '(مؤرشفة)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="unit-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  اسم الوحدة <span className="text-red-500">*</span>
                </label>
                <input
                  id="unit-name"
                  type="text"
                  required
                  value={unitForm.name}
                  onChange={(e) =>
                    setUnitForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="مثال: وحدة الشبكات والإنترنت"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="unit-supervisor"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    اسم المسؤول
                  </label>
                  <input
                    id="unit-supervisor"
                    type="text"
                    value={unitForm.supervisorName}
                    onChange={(e) =>
                      setUnitForm((prev) => ({
                        ...prev,
                        supervisorName: e.target.value,
                      }))
                    }
                    placeholder="مسؤول الوحدة"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="unit-phone"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    رقم الهاتف (إن توفر)
                  </label>
                  <input
                    id="unit-phone"
                    type="text"
                    dir="ltr"
                    value={unitForm.phone}
                    onChange={(e) =>
                      setUnitForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="07700000000"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="unit-location"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  الموقع
                </label>
                <input
                  id="unit-location"
                  type="text"
                  value={unitForm.location}
                  onChange={(e) =>
                    setUnitForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  placeholder="مثال: مجمع سيد الشهداء — القاعة الشرقية"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                />
              </div>

              <div>
                <label
                  htmlFor="unit-notes"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  الملاحظات
                </label>
                <textarea
                  id="unit-notes"
                  rows={2}
                  maxLength={400}
                  value={unitForm.notes}
                  onChange={(e) =>
                    setUnitForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={unitForm.isActive}
                  onChange={(e) =>
                    setUnitForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-slate-300 text-[#0F2544]"
                />
                <span>الوحدة فعّالة ومتاحة لاختيارها في سندات الصرف</span>
              </label>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUnitModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingUnit}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-60"
                >
                  {savingUnit ? 'جاري الحفظ...' : editingUnit ? 'حفظ التعديلات' : 'إضافة الوحدة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
