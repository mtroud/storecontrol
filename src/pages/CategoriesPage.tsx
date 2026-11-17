import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Edit3,
  FolderTree,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  CategoryInput,
  CategoryRecord,
  createCategory,
  initializeOfficialCategoriesPreset,
  subscribeToCategories,
  toggleCategoryStatus,
  updateCategory,
} from '../services/categoriesService';
import { UserRole } from '../types/inventory';

type StatusFilter = 'all' | 'active' | 'archived';

export function CategoriesPage() {
  const { session } = useAuth();
  const canManage =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER;

  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null>(null);
  const [formState, setFormState] = useState<CategoryInput>({
    name: '',
    codePrefix: '',
    description: '',
    isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [presetLoading, setPresetLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToCategories(
      (list) => {
        setCategories(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setFeedback({
          type: 'error',
          message: `تعذر تحميل التصنيفات: ${err.message}`,
        });
      }
    );
    return () => unsubscribe();
  }, []);

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return categories.filter((cat) => {
      if (statusFilter === 'active' && !cat.isActive) return false;
      if (statusFilter === 'archived' && cat.isActive) return false;
      if (!q) return true;
      return (
        cat.name.toLowerCase().includes(q) ||
        cat.codePrefix.toLowerCase().includes(q) ||
        (cat.description || '').toLowerCase().includes(q)
      );
    });
  }, [categories, searchQuery, statusFilter]);

  const activeCount = categories.filter((c) => c.isActive).length;
  const archivedCount = categories.length - activeCount;

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormState({
      name: '',
      codePrefix: '',
      description: '',
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (cat: CategoryRecord) => {
    setEditingCategory(cat);
    setFormState({
      name: cat.name,
      codePrefix: cat.codePrefix,
      description: cat.description || '',
      isActive: cat.isActive,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, formState, categories);
        setFeedback({
          type: 'success',
          message: `تم تحديث بيانات التصنيف "${formState.name.trim()}" بنجاح.`,
        });
      } else {
        await createCategory(formState, categories);
        setFeedback({
          type: 'success',
          message: `تمت إضافة التصنيف "${formState.name.trim()}" بنجاح.`,
        });
      }
      setModalOpen(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (cat: CategoryRecord) => {
    setFeedback(null);
    try {
      await toggleCategoryStatus(cat);
      setFeedback({
        type: 'success',
        message: cat.isActive
          ? `تمت أرشفة التصنيف "${cat.name}".`
          : `تم إعادة تفعيل التصنيف "${cat.name}".`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تغيير حالة التصنيف.',
      });
    }
  };

  const handleLoadOfficialPreset = async () => {
    setFeedback(null);
    setPresetLoading(true);
    try {
      const addedCount = await initializeOfficialCategoriesPreset(categories);
      setFeedback({
        type: 'success',
        message:
          addedCount > 0
            ? `تمت إضافة ${addedCount} تصنيفاً رسمياً معتمداً إلى قاعدة البيانات بنجاح.`
            : 'جميع التصنيفات الرسمية الـ 18 موجودة مسبقاً.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تهيئة التصنيفات الرسمية.',
      });
    } finally {
      setPresetLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>إجمالي التصنيفات: {categories.length}</span>
            <span aria-hidden="true">·</span>
            <span>فعّالة: {activeCount}</span>
            <span aria-hidden="true">·</span>
            <span>مؤرشفة: {archivedCount}</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            تنظيم تصنيفات الأجهزة والمعدات والمواد الاستهلاكية مع رمز البادئة لأرقام الجرد.
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadOfficialPreset}
              disabled={presetLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap min-h-[40px]"
            >
              <Sparkles className="w-4 h-4 text-[#B88E3F] dark:text-[#D4AE60]" />
              <span>
                {presetLoading
                  ? 'جاري تهيئة التصنيفات...'
                  : 'تهيئة التصنيفات الرسمية (18)'}
              </span>
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] dark:hover:bg-[#D4AE60] transition-colors whitespace-nowrap min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة تصنيف جديد</span>
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

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث باسم التصنيف، البادئة، أو الوصف..."
            className="w-full pr-10 pl-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
          />
        </div>

        <div
          role="group"
          aria-label="تصفية حسب الحالة"
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

      {/* Categories Table */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded bg-slate-100 dark:bg-slate-800/60"
              />
            ))}
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
              <FolderTree className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {categories.length === 0
                ? 'لا توجد تصنيفات مسجلة في قاعدة البيانات بعد'
                : 'لا توجد تصنيفات مطابقة لمعايير البحث'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              {categories.length === 0
                ? 'يمكنك تحميل قائمة التصنيفات الرسمية الـ 18 المعتمدة بضغطة واحدة أو إضافة تصنيف مخصص جديد.'
                : 'جرّب تغيير كلمة البحث أو التبديل بين التصنيفات الفعّالة والمؤرشفة.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 whitespace-nowrap">#</th>
                  <th className="py-3 px-4 whitespace-nowrap">رمز البادئة</th>
                  <th className="py-3 px-4 whitespace-nowrap">اسم التصنيف</th>
                  <th className="py-3 px-4 whitespace-nowrap">الوصف</th>
                  <th className="py-3 px-4 whitespace-nowrap">الحالة</th>
                  {canManage && <th className="py-3 px-4 whitespace-nowrap">الإجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs sm:text-sm">
                {filteredCategories.map((cat, idx) => (
                  <tr
                    key={cat.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono-tabular text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-[#0F2544] dark:text-[#D4AE60] whitespace-nowrap">
                      {cat.codePrefix}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {cat.name}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-md">
                      {cat.description || '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {cat.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>فعّال</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                          <Archive className="w-3.5 h-3.5" />
                          <span>مؤرشف</span>
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(cat)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(cat)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            {cat.isActive ? (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingCategory ? 'تعديل التصنيف' : 'إضافة تصنيف جديد'}
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingCategory ? 'تعديل بيانات التصنيف' : 'إضافة تصنيف جديد'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="إغلاق"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="cat-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  اسم التصنيف <span className="text-red-500">*</span>
                </label>
                <input
                  id="cat-name"
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="مثال: السويتشات"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                />
              </div>

              <div>
                <label
                  htmlFor="cat-prefix"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  رمز البادئة في رقم الجرد (إنجليزي) <span className="text-red-500">*</span>
                </label>
                <input
                  id="cat-prefix"
                  type="text"
                  required
                  dir="ltr"
                  maxLength={12}
                  value={formState.codePrefix}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      codePrefix: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="SW"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                />
              </div>

              <div>
                <label
                  htmlFor="cat-desc"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  الوصف والملاحظات
                </label>
                <textarea
                  id="cat-desc"
                  rows={3}
                  maxLength={300}
                  value={formState.description}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="وصف مختصر للأجهزة والمعدات ضمن هذا التصنيف..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2544] dark:focus:ring-[#C59B47]"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.isActive}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-slate-300 text-[#0F2544]"
                />
                <span>التصنيف فعّال ومتاح عند تسجيل الأجهزة والمواد</span>
              </label>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-60"
                >
                  {saving ? 'جاري الحفظ...' : editingCategory ? 'حفظ التعديلات' : 'إضافة التصنيف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
