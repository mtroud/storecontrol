import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Boxes,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileDown,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { BarcodePreview } from '../components/barcode/BarcodePreview';
import {
  PrintDocumentHeader,
  PrintSignatureFooter,
} from '../components/common/PrintDocumentHeader';
import {
  buildConsumableLabelData,
  downloadLabelPng,
  downloadLabelsPdf,
} from '../services/barcodeService';
import { useAuth } from '../context/AuthContext';
import { CategoryRecord, subscribeToCategories } from '../services/categoriesService';
import {
  ConsumableInput,
  ConsumableRecord,
  createConsumable,
  generateNextItemCode,
  subscribeToConsumablesWithBalances,
  toggleArchiveConsumable,
  UNIT_OF_MEASURE_OPTIONS,
  updateConsumable,
} from '../services/consumablesService';
import { uploadAssetAttachment } from '../services/storageService';
import { UserRole } from '../types/inventory';

type StockHealthFilter = 'all' | 'normal' | 'reorder' | 'out' | 'archived';

export function ConsumablesPage() {
  const { session } = useAuth();
  const canEdit =
    session?.role === UserRole.SYSTEM_ADMIN ||
    session?.role === UserRole.WAREHOUSE_MANAGER ||
    session?.role === UserRole.WAREHOUSE_STAFF;

  const [items, setItems] = useState<ConsumableRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState<StockHealthFilter>('all');

  const [selectedItem, setSelectedItem] = useState<ConsumableRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ConsumableRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [formState, setFormState] = useState<ConsumableInput>({
    itemCode: '',
    name: '',
    categoryId: '',
    unitOfMeasure: UNIT_OF_MEASURE_OPTIONS[0],
    initialQuantity: 0,
    minStock: 5,
    reorderPoint: 15,
    reserveStock: 5,
    storageLocation: 'المخزن الرئيسي',
    barcode: '',
    imageUrl: '',
    notes: '',
  });

  useEffect(() => {
    setLoading(true);
    const unsubItems = subscribeToConsumablesWithBalances(
      (list) => {
        setItems(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setFeedback({ type: 'error', message: `تعذر تحميل المواد: ${err.message}` });
      }
    );
    const unsubCats = subscribeToCategories(setCategories, () => {});
    return () => {
      unsubItems();
      unsubCats();
    };
  }, []);

  const categoryMap = useMemo(() => {
    const m = new Map<string, CategoryRecord>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const getHealthState = (item: ConsumableRecord) => {
    if (item.currentQuantity <= 0) return 'out';
    if (item.currentQuantity <= item.minStock) return 'critical';
    if (item.currentQuantity <= item.reorderPoint) return 'reorder';
    return 'normal';
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (healthFilter === 'archived') {
        if (!item.isArchived) return false;
      } else {
        if (item.isArchived) return false;
        const h = getHealthState(item);
        if (healthFilter === 'normal' && h !== 'normal') return false;
        if (healthFilter === 'reorder' && h !== 'reorder' && h !== 'critical') return false;
        if (healthFilter === 'out' && h !== 'out') return false;
      }

      if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false;

      if (!q) return true;
      return (
        item.itemCode.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.barcode || '').toLowerCase().includes(q) ||
        (item.storageLocation || '').toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery, categoryFilter, healthFilter]);

  const openAddModal = () => {
    const defaultCat =
      categories.find((c) => c.codePrefix === 'CBL') ||
      categories.find((c) => c.isActive) ||
      categories[0];
    const autoCode = generateNextItemCode(defaultCat?.codePrefix || 'CON', items);
    setEditingItem(null);
    setFormState({
      itemCode: autoCode,
      name: '',
      categoryId: defaultCat?.id || '',
      unitOfMeasure: UNIT_OF_MEASURE_OPTIONS[0],
      initialQuantity: 0,
      minStock: 5,
      reorderPoint: 15,
      reserveStock: 5,
      storageLocation: 'المخزن الرئيسي',
      barcode: autoCode,
      imageUrl: '',
      notes: '',
    });
    setFormOpen(true);
  };

  const openEditModal = (item: ConsumableRecord) => {
    setSelectedItem(null);
    setEditingItem(item);
    setFormState({
      itemCode: item.itemCode,
      name: item.name,
      categoryId: item.categoryId,
      unitOfMeasure: item.unitOfMeasure,
      initialQuantity: item.currentQuantity,
      minStock: item.minStock,
      reorderPoint: item.reorderPoint,
      reserveStock: item.reserveStock,
      storageLocation: item.storageLocation || '',
      barcode: item.barcode || item.itemCode,
      imageUrl: item.imageUrl || '',
      notes: item.notes || '',
    });
    setFormOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const folderKey = editingItem?.id || `draft_${Date.now()}`;
      const res = await uploadAssetAttachment('consumables', folderKey, file);
      setFormState((prev) => ({ ...prev, imageUrl: res.downloadUrl }));
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر رفع صورة المادة.',
      });
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      if (editingItem) {
        await updateConsumable(editingItem.id, formState, editingItem);
        setFeedback({
          type: 'success',
          message: `تم تحديث بيانات المادة "${formState.name.trim()}" بنجاح.`,
        });
      } else {
        await createConsumable(formState, items);
        setFeedback({
          type: 'success',
          message: `تمت إضافة المادة "${formState.name.trim()}" (${formState.itemCode}) برصيد ${formState.initialQuantity} ${formState.unitOfMeasure}.`,
        });
      }
      setFormOpen(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر حفظ المادة الاستهلاكية.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async (item: ConsumableRecord) => {
    setFeedback(null);
    try {
      await toggleArchiveConsumable(item);
      setFeedback({
        type: 'success',
        message: item.isArchived
          ? `تمت استعادة المادة ${item.name}.`
          : `تمت أرشفة المادة ${item.name}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تنفيذ العملية.',
      });
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'رمز المادة',
      'اسم المادة',
      'التصنيف',
      'الوحدة',
      'الكمية الحالية',
      'الحد الأدنى',
      'حد إعادة الطلب',
      'المخزون الاحتياطي',
      'موقع التخزين',
      'الباركود',
    ];
    const rows = filteredItems.map((i) => [
      i.itemCode,
      i.name,
      categoryMap.get(i.categoryId)?.name || '',
      i.unitOfMeasure,
      i.currentQuantity,
      i.minStock,
      i.reorderPoint,
      i.reserveStock,
      i.storageLocation || '',
      i.barcode || i.itemCode,
    ]);
    const csv =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        )
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sayed-mart-consumables-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeItems = items.filter((i) => !i.isArchived);
  const lowOrOutCount = activeItems.filter((i) => getHealthState(i) !== 'normal').length;
  const totalUnits = activeItems.reduce((sum, i) => sum + i.currentQuantity, 0);

  return (
    <div className="space-y-5">
      <PrintDocumentHeader
        title="قائمة جرد المواد الكمية والاستهلاكية"
        subtitle="بيان الأرصدة الحالية، حدود الطلب، والاحتياطي المخزني للمواد الاستهلاكية"
        docCode="INV-CON"
        metaItems={[
          { label: 'عدد الأصناف الظاهرة', value: filteredItems.length },
          { label: 'إجمالي الوحدات المتوفرة', value: totalUnits.toLocaleString('en-US') },
          { label: 'تحتاج إعادة طلب / نافدة', value: lowOrOutCount },
          { label: 'المُصدِر', value: session?.fullName || 'مسؤول النظام' },
        ]}
      />

      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>الأصناف الفعّالة: {activeItems.length}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              إجمالي الكميات المتوفرة: {totalUnits.toLocaleString('en-US')}
            </span>
            <span aria-hidden="true">·</span>
            <span className={lowOrOutCount > 0 ? 'text-amber-700 dark:text-amber-400 font-semibold' : ''}>
              تحتاج إعادة طلب / نافدة: {lowOrOutCount}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            إدارة المواد الكمية والاستهلاكية (الكابلات، رؤوس RJ45، الموصلات، وقطع الغيار) ومتابعة حدود الطلب.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredItems.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 min-h-[40px]"
          >
            <Download className="w-4 h-4" />
            <span>تصدير CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[40px]"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] dark:hover:bg-[#D4AE60] transition-colors whitespace-nowrap min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مادة كمية</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 print:hidden ${
            feedback.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
              : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="إغلاق"
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث برمز المادة، الاسم، الباركود، أو موقع التخزين..."
              className="w-full pr-10 pl-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="تصفية بالتصنيف"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C2E] text-xs sm:text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="all">جميع التصنيفات</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div
          role="group"
          aria-label="تصفية حالة الرصيد"
          className="inline-flex flex-wrap items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 self-start"
        >
          {(
            [
              { id: 'all', label: 'الكل' },
              { id: 'normal', label: 'متوفر' },
              { id: 'reorder', label: 'حد إعادة الطلب' },
              { id: 'out', label: 'نافد' },
              { id: 'archived', label: 'الأرشيف' },
            ] as Array<{ id: StockHealthFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setHealthFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                healthFilter === tab.id
                  ? 'bg-white dark:bg-[#111C2E] text-[#0F2544] dark:text-[#D4AE60] font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Consumables Table */}
      <div className="rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-11 rounded bg-slate-100 dark:bg-slate-800/60"
              />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
              <Boxes className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {items.length === 0
                ? 'لا توجد مواد استهلاكية مسجلة بعد'
                : 'لا توجد مواد مطابقة لمعايير التصفية'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              أضف الكابلات ورؤوس الشبكة والموصلات وقطع الغيار مع تحديد الحد الأدنى وحد إعادة الطلب لمتابعة أرصدتها تلقائياً.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-3 whitespace-nowrap">رمز المادة</th>
                  <th className="py-3 px-3 whitespace-nowrap">اسم المادة</th>
                  <th className="py-3 px-3 whitespace-nowrap">التصنيف</th>
                  <th className="py-3 px-3 whitespace-nowrap">الوحدة</th>
                  <th className="py-3 px-3 whitespace-nowrap">الكمية الحالية</th>
                  <th className="py-3 px-3 whitespace-nowrap">الحد الأدنى / الطلب</th>
                  <th className="py-3 px-3 whitespace-nowrap">الاحتياطي</th>
                  <th className="py-3 px-3 whitespace-nowrap">موقع التخزين</th>
                  <th className="py-3 px-3 whitespace-nowrap">الحالة</th>
                  <th className="py-3 px-3 whitespace-nowrap print:hidden">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {filteredItems.map((item) => {
                  const health = getHealthState(item);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-3 font-mono-tabular font-semibold text-[#0F2544] dark:text-[#D4AE60] whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="hover:underline"
                        >
                          {item.itemCode}
                        </button>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100 min-w-[160px]">
                        {item.name}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {categoryMap.get(item.categoryId)?.name || '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {item.unitOfMeasure}
                      </td>
                      <td className="py-3 px-3 font-mono-tabular font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {item.currentQuantity.toLocaleString('en-US')}
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-slate-500 whitespace-nowrap">
                        {item.minStock} / {item.reorderPoint}
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-slate-500 whitespace-nowrap">
                        {item.reserveStock}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {item.storageLocation || '—'}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {health === 'out' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>نافد</span>
                          </span>
                        ) : health === 'critical' || health === 'reorder' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>
                              {health === 'critical' ? 'دون الحد الأدنى' : 'حد إعادة الطلب'}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>متوفر</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap print:hidden">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            title="عرض بطاقة المادة"
                            aria-label={`عرض ${item.itemCode}`}
                            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                title="تعديل المادة"
                                aria-label={`تعديل ${item.itemCode}`}
                                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleArchive(item)}
                                title={item.isArchived ? 'استعادة' : 'أرشفة'}
                                aria-label={
                                  item.isArchived
                                    ? `استعادة ${item.itemCode}`
                                    : `أرشفة ${item.itemCode}`
                                }
                                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {item.isArchived ? (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                ) : (
                                  <Archive className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PrintSignatureFooter />

      {/* Consumable Detail Card Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`بطاقة المادة ${selectedItem.itemCode}`}
        >
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setSelectedItem(null)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono-tabular font-semibold text-[#0F2544] dark:text-[#D4AE60]">
                  {selectedItem.itemCode}
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {selectedItem.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="إغلاق"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {selectedItem.imageUrl && (
                <img
                  src={selectedItem.imageUrl}
                  alt={selectedItem.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-44 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                />
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                {[
                  { label: 'رمز المادة', value: selectedItem.itemCode, mono: true },
                  {
                    label: 'التصنيف',
                    value: categoryMap.get(selectedItem.categoryId)?.name || '—',
                  },
                  { label: 'الوحدة', value: selectedItem.unitOfMeasure },
                  {
                    label: 'الكمية الحالية',
                    value: `${selectedItem.currentQuantity} ${selectedItem.unitOfMeasure}`,
                    mono: true,
                  },
                  { label: 'الحد الأدنى', value: String(selectedItem.minStock), mono: true },
                  {
                    label: 'حد إعادة الطلب',
                    value: String(selectedItem.reorderPoint),
                    mono: true,
                  },
                  {
                    label: 'المخزون الاحتياطي',
                    value: String(selectedItem.reserveStock),
                    mono: true,
                  },
                  {
                    label: 'موقع التخزين',
                    value: selectedItem.storageLocation || '—',
                  },
                  {
                    label: 'الباركود',
                    value: selectedItem.barcode || selectedItem.itemCode,
                    mono: true,
                  },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="pb-2 border-b border-slate-100 dark:border-slate-800"
                  >
                    <div className="text-slate-400">{f.label}</div>
                    <div
                      className={`mt-1 font-semibold text-slate-900 dark:text-slate-100 ${
                        f.mono ? 'font-mono-tabular' : ''
                      }`}
                    >
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-xs text-slate-400">الملاحظات</div>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1">
                  {selectedItem.notes || 'لا توجد ملاحظات مسجلة.'}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <BarcodePreview
                  compact
                  barcodeValue={selectedItem.barcode || selectedItem.itemCode}
                  qrValue={`SAYEDMART:CON:${selectedItem.id}`}
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void downloadLabelPng(
                        buildConsumableLabelData(
                          selectedItem,
                          categoryMap.get(selectedItem.categoryId)?.name || 'مادة كمية'
                        ),
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
                        [
                          buildConsumableLabelData(
                            selectedItem,
                            categoryMap.get(selectedItem.categoryId)?.name || 'مادة كمية'
                          ),
                        ],
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
          </div>
        </div>
      )}

      {/* Add / Edit Consumable Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingItem ? 'تعديل مادة كمية' : 'إضافة مادة كمية'}
        >
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setFormOpen(false)}
          />
          <div className="relative z-10 w-full max-w-2xl max-h-[92vh] rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingItem
                  ? `تعديل المادة: ${editingItem.itemCode}`
                  : 'إضافة مادة استهلاكية / كمية جديدة'}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="إغلاق"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    التصنيف <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formState.categoryId}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, categoryId: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  >
                    <option value="">اختر التصنيف...</option>
                    {categories
                      .filter((c) => c.isActive || c.id === formState.categoryId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    رمز المادة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    disabled={Boolean(editingItem)}
                    value={formState.itemCode}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        itemCode: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الباركود
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formState.barcode}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        barcode: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    اسم المادة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="مثال: رؤوس شبكة RJ45 Cat6 محمية"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    وحدة القياس
                  </label>
                  <select
                    value={formState.unitOfMeasure}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, unitOfMeasure: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                  >
                    {UNIT_OF_MEASURE_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {editingItem ? 'الرصيد الحالي' : 'الكمية الافتتاحية'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={Boolean(editingItem)}
                    value={formState.initialQuantity}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        initialQuantity: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الحد الأدنى
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formState.minStock}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        minStock: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    حد إعادة الطلب
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formState.reorderPoint}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        reorderPoint: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    المخزون الاحتياطي
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formState.reserveStock}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        reserveStock: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  موقع التخزين في المخزن
                </label>
                <input
                  type="text"
                  value={formState.storageLocation}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, storageLocation: e.target.value }))
                  }
                  placeholder="مثال: رف A3 — خزانة الملحقات"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    صورة المادة:
                  </span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    {formState.imageUrl ? 'تم إرفاق صورة بنجاح' : 'اختياري (يُرفع إلى Storage)'}
                  </span>
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer hover:bg-slate-50">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingImage ? 'جاري الرفع...' : 'رفع صورة المادة'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingImage}
                    onChange={handleImageUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  الملاحظات
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={formState.notes}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImage}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#0F2544] text-white hover:bg-[#173560] dark:bg-[#C59B47] dark:text-[#0B1220] disabled:opacity-60"
                >
                  {saving ? 'جاري الحفظ...' : editingItem ? 'حفظ التعديلات' : 'إضافة المادة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
