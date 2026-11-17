import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  KeyRound,
  Mail,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  createAuthorizedUserOrInvite,
  deleteUserInvite,
  subscribeToUserInvites,
  subscribeToUsers,
  updateUserProfileByAdmin,
  UserInviteRecord,
} from '../services/adminService';
import { FirestoreUserProfile } from '../services/authService';
import { USER_ROLE_LABELS, UserRole } from '../types/inventory';

function formatIsoDateTime(val?: string): string {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return val;
  return d.toLocaleString('ar-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function UsersPage() {
  const { session } = useAuth();
  const isAdmin = session?.role === UserRole.SYSTEM_ADMIN;

  const [users, setUsers] = useState<FirestoreUserProfile[]>([]);
  const [invites, setInvites] = useState<UserInviteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');

  // Create User/Invite Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [provisionMode, setProvisionMode] = useState<'GOOGLE_INVITE' | 'EMAIL_PASSWORD'>(
    'GOOGLE_INVITE'
  );
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.WAREHOUSE_STAFF);
  const [newDepartment, setNewDepartment] = useState(
    'شعبة السيطرة والإنترنت — مجمع سيد الشهداء (عليه السلام)'
  );
  const [savingCreate, setSavingCreate] = useState(false);

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<FirestoreUserProfile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editRole, setEditRole] = useState<UserRole>(UserRole.VIEWER);
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const unsubUsers = subscribeToUsers(
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        setErrorMsg(err.message);
        setLoading(false);
      }
    );

    const unsubInvites = subscribeToUserInvites(
      (list) => setInvites(list),
      () => {}
    );

    return () => {
      unsubUsers();
      unsubInvites();
    };
  }, [isAdmin]);

  const roleCounts = useMemo(() => {
    return {
      total: users.length,
      admins: users.filter((u) => u.role === UserRole.SYSTEM_ADMIN).length,
      managers: users.filter((u) => u.role === UserRole.WAREHOUSE_MANAGER).length,
      staff: users.filter((u) => u.role === UserRole.WAREHOUSE_STAFF).length,
      viewers: users.filter((u) => u.role === UserRole.VIEWER).length,
    };
  }, [users]);

  const registeredEmails = useMemo(
    () => new Set(users.map((u) => u.email.toLowerCase())),
    [users]
  );

  const pendingInvites = useMemo(
    () => invites.filter((inv) => !registeredEmails.has(inv.email.toLowerCase())),
    [invites, registeredEmails]
  );

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.departmentName || '').toLowerCase().includes(q)
      );
    });
  }, [users, roleFilter, searchQuery]);

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-red-200 dark:border-red-900/60 p-10 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 mx-auto text-red-600 dark:text-red-400" />
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          وصول مقصور على مدير النظام
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          إدارة حسابات الموظفين وتعيين الصلاحيات الأربعة مخصصة حصرياً لدور «مدير النظام».
        </p>
      </div>
    );
  }

  const handleOpenCreate = () => {
    setErrorMsg('');
    setSuccessMsg('');
    setProvisionMode('GOOGLE_INVITE');
    setNewEmail('');
    setNewPassword('');
    setNewFullName('');
    setNewUsername('');
    setNewRole(UserRole.WAREHOUSE_STAFF);
    setNewDepartment('شعبة السيطرة والإنترنت — مجمع سيد الشهداء (عليه السلام)');
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSavingCreate(true);
    try {
      const res = await createAuthorizedUserOrInvite({
        mode: provisionMode,
        email: newEmail,
        password: newPassword,
        fullName: newFullName,
        username: newUsername,
        role: newRole,
        departmentName: newDepartment,
      });
      setCreateOpen(false);
      setSuccessMsg(res.message);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إنشاء الحساب أو التخويل.');
    } finally {
      setSavingCreate(false);
    }
  };

  const handleOpenEdit = (u: FirestoreUserProfile) => {
    setErrorMsg('');
    setSuccessMsg('');
    setEditingUser(u);
    setEditFullName(u.fullName);
    setEditUsername(u.username || '');
    setEditDepartment(u.departmentName || '');
    setEditRole(u.role);
    setEditActive(u.isActive);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (editingUser.uid === session?.uid && !editActive) {
      setErrorMsg('لا يمكنك إيقاف تفعيل حسابك الشخصي أثناء تسجيل الدخول.');
      return;
    }

    setSavingEdit(true);
    setErrorMsg('');
    try {
      await updateUserProfileByAdmin(editingUser, {
        fullName: editFullName,
        username: editUsername,
        departmentName: editDepartment,
        role: editRole,
        isActive: editActive,
      });
      setSuccessMsg(`تم تحديث صلاحيات وبيانات الحساب (${editingUser.email}) بنجاح.`);
      setEditingUser(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحديث بيانات المستخدم.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteInvite = async (invite: UserInviteRecord) => {
    setErrorMsg('');
    try {
      await deleteUserInvite(invite);
      setSuccessMsg(`تم إلغاء تخويل البريد (${invite.email}).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إلغاء الدعوة.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            إدارة المستخدمين والصلاحيات (RBAC)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            إنشاء وتخويل حسابات الموظفين حصرياً عبر مدير النظام ومتابعة آخر تسجيل دخول وخروج ونشاط.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة / تخويل مستخدم</span>
        </button>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 text-xs sm:text-sm flex items-center justify-between gap-2"
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
          className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm flex items-center justify-between gap-2"
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

      {/* Role Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'إجمالي الحسابات', val: roleCounts.total, cls: 'text-slate-900 dark:text-slate-100' },
          { label: 'مدير النظام', val: roleCounts.admins, cls: 'text-[#0F2544] dark:text-[#D4AE60]' },
          { label: 'مسؤول المخزن', val: roleCounts.managers, cls: 'text-blue-700 dark:text-blue-400' },
          { label: 'موظف المخزن', val: roleCounts.staff, cls: 'text-emerald-700 dark:text-emerald-400' },
          { label: 'مستخدم مشاهدة', val: roleCounts.viewers, cls: 'text-slate-600 dark:text-slate-300' },
        ].map((r) => (
          <div
            key={r.label}
            className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4"
          >
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{r.label}</div>
            <div className={`text-xl font-bold font-mono-tabular mt-1 ${r.cls}`}>{r.val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، البريد الإلكتروني، اسم المستخدم، أو الشعبة..."
            className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'ALL' | UserRole)}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
        >
          <option value="ALL">جميع الصلاحيات</option>
          {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((r) => (
            <option key={r} value={r}>
              {USER_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {/* Active Users Table */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">
            جاري تحميل حسابات المستخدمين...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="w-8 h-8 mx-auto text-slate-400" />
            <div className="text-sm font-bold">لا توجد حسابات مطابقة</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                  <th className="py-3 px-3">الاسم الكامل</th>
                  <th className="py-3 px-3">البريد الإلكتروني</th>
                  <th className="py-3 px-3">الدور / الصلاحية</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3">آخر دخول</th>
                  <th className="py-3 px-3">آخر نشاط</th>
                  <th className="py-3 px-3">آخر خروج</th>
                  <th className="py-3 px-3">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {u.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        @{u.username || 'user'} · {u.departmentName || 'شعبة السيطرة والإنترنت'}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono-tabular text-[11px]" dir="ltr">
                      {u.email}
                    </td>
                    <td className="py-3 px-3 font-semibold text-[#0F2544] dark:text-[#D4AE60] whitespace-nowrap">
                      {USER_ROLE_LABELS[u.role]}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[11px] font-semibold ${
                          u.isActive
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'
                        }`}
                      >
                        {u.isActive ? 'نشط' : 'موقوف'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono-tabular text-[11px] text-slate-500 whitespace-nowrap">
                      {formatIsoDateTime(u.lastLoginAt)}
                    </td>
                    <td className="py-3 px-3 font-mono-tabular text-[11px] text-slate-500 whitespace-nowrap">
                      {formatIsoDateTime(u.lastActivityAt)}
                    </td>
                    <td className="py-3 px-3 font-mono-tabular text-[11px] text-slate-500 whitespace-nowrap">
                      {formatIsoDateTime(u.lastLogoutAt)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px]"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل الصلاحية</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Pre-authorized Invites */}
      {pendingInvites.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
              <UserCheck className="w-4 h-4 text-[#C59B47]" />
              <span>حسابات مخولة بانتظار تسجيل الدخول الأول ({pendingInvites.length})</span>
            </div>
            <span className="text-[11px] text-slate-500">
              تُفعّل تلقائياً فور دخول الموظف بحساب Google المعتمد
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                  <th className="py-2.5 px-3">الاسم الكامل</th>
                  <th className="py-2.5 px-3">البريد الإلكتروني المخول</th>
                  <th className="py-2.5 px-3">الصلاحية المعينة</th>
                  <th className="py-2.5 px-3">إلغاء التخويل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pendingInvites.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 px-3 font-semibold">{inv.fullName}</td>
                    <td className="py-2.5 px-3 font-mono-tabular" dir="ltr">
                      {inv.email}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-[#0F2544] dark:text-[#D4AE60]">
                      {USER_ROLE_LABELS[inv.role]}
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => void handleDeleteInvite(inv)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>إلغاء</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User / Invite Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="إضافة مستخدم جديد"
        >
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                إضافة / تخويل مستخدم جديد
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
              {/* Mode selector */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setProvisionMode('GOOGLE_INVITE')}
                  className={`py-2 px-3 rounded-md font-semibold flex items-center justify-center gap-1.5 ${
                    provisionMode === 'GOOGLE_INVITE'
                      ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60]'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>تخويل بريد Google</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProvisionMode('EMAIL_PASSWORD')}
                  className={`py-2 px-3 rounded-md font-semibold flex items-center justify-center gap-1.5 ${
                    provisionMode === 'EMAIL_PASSWORD'
                      ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60]'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>حساب بريد وكلمة مرور</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  الاسم الكامل للموظف <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="مثال: كرار حسين الموسوي"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    البريد الإلكتروني <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="staff@domain.iq"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">اسم المستخدم</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="karrar.h"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              {provisionMode === 'EMAIL_PASSWORD' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    كلمة المرور المبدئية (8 أحرف على الأقل){' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    dir="ltr"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">الدور والصلاحية</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {USER_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الشعبة / القسم</label>
                  <input
                    type="text"
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
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
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {savingCreate
                      ? 'جاري التنفيذ...'
                      : provisionMode === 'GOOGLE_INVITE'
                        ? 'حفظ التخويل'
                        : 'إنشاء الحساب'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Role / Status Modal */}
      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تعديل صلاحيات المستخدم"
        >
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setEditingUser(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  تعديل صلاحيات المستخدم
                </h3>
                <div className="text-xs font-mono-tabular text-slate-500 mt-0.5" dir="ltr">
                  {editingUser.email}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">اسم المستخدم</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الدور / الصلاحية</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {USER_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">الشعبة / القسم</label>
                <input
                  type="text"
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <label className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />
                <span>الحساب مفعل ومسموح له بتسجيل الدخول</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingEdit ? 'جاري الحفظ...' : 'حفظ التغييرات'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
