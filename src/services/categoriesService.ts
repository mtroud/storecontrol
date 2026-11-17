import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';

export interface CategoryRecord {
  id: string;
  name: string;
  codePrefix: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CategoryInput {
  name: string;
  codePrefix: string;
  description?: string;
  isActive: boolean;
}

export const OFFICIAL_CATEGORIES_PRESET: Array<{
  id: string;
  name: string;
  codePrefix: string;
  description: string;
}> = [
  { id: 'cat-pc', name: 'أجهزة الحاسوب', codePrefix: 'PC', description: 'حواسيب مكتبية ومحطات عمل' },
  { id: 'cat-laptop', name: 'أجهزة اللابتوب', codePrefix: 'LP', description: 'حواسيب محمولة للاستخدام الميداني والإداري' },
  { id: 'cat-network', name: 'أجهزة الشبكات', codePrefix: 'NET', description: 'معدات الشبكة العامة ونقاط الوصول' },
  { id: 'cat-switch', name: 'السويتشات', codePrefix: 'SW', description: 'مبدلات الشبكة السلكية والضوئية' },
  { id: 'cat-router', name: 'الراوترات', codePrefix: 'RTR', description: 'أجهزة التوجيه والربط الشبكي' },
  { id: 'cat-internet', name: 'أجهزة الإنترنت', codePrefix: 'INT', description: 'أجهزة البث والاستقبال وخطوط الإنترنت' },
  { id: 'cat-telecom', name: 'أجهزة الاتصالات والبدالات', codePrefix: 'COM', description: 'البدالات والهواتف الشبكية والداخلية' },
  { id: 'cat-paging', name: 'أجهزة النداء', codePrefix: 'PAG', description: 'منظومات النداء واللاسلكي' },
  { id: 'cat-audio', name: 'أجهزة الصوتيات', codePrefix: 'AUD', description: 'المضخمات والمايكروفونات والسماعات' },
  { id: 'cat-display', name: 'أجهزة العرض والشاشات', codePrefix: 'DSP', description: 'الشاشات وأجهزة العرض الضوئي' },
  { id: 'cat-printer', name: 'الطابعات', codePrefix: 'PRT', description: 'الطابعات الليزرية والماسحات الضوئية' },
  { id: 'cat-camera', name: 'الكاميرات', codePrefix: 'CAM', description: 'كاميرات المراقبة ومنظومات التسجيل' },
  { id: 'cat-ups', name: 'أجهزة UPS', codePrefix: 'UPS', description: 'مجهزات القدرة غير المنقطعة والبطاريات' },
  { id: 'cat-cables', name: 'الكابلات والملحقات', codePrefix: 'CBL', description: 'كابلات الشبكة والـ HDMI والتوصيلات' },
  { id: 'cat-electrical', name: 'معدات كهربائية', codePrefix: 'ELC', description: 'القواطع والموزعات والمعدات الكهربائية' },
  { id: 'cat-tools', name: 'أدوات فنية', codePrefix: 'TLS', description: 'عدد الفحص والصيانة واللحام والتركيب' },
  { id: 'cat-spare', name: 'قطع غيار', codePrefix: 'SPR', description: 'القطع البديلة ومستلزمات الصيانة' },
  { id: 'cat-other', name: 'أخرى', codePrefix: 'OTH', description: 'موجودات تقنية وخدمية متنوعة' },
];

function generateCategoryId(): string {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function logCategoryAudit(action: string, targetId: string, details: string) {
  const user = auth.currentUser;
  if (!user) return;
  const logId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      id: logId,
      actorUid: user.uid,
      actorEmail: user.email || '',
      action,
      targetCollection: 'categories',
      targetId,
      details: details.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Category audit log skipped:', err);
  }
}

export function subscribeToCategories(
  onData: (categories: CategoryRecord[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CategoryRecord, 'id'>),
      }));
      onData(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'categories');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createCategory(
  input: CategoryInput,
  existingCategories: CategoryRecord[]
): Promise<string> {
  const cleanName = input.name.trim();
  const cleanPrefix = input.codePrefix.trim().toUpperCase();
  const cleanDesc = (input.description || '').trim();

  if (cleanName.length < 2 || cleanName.length > 100) {
    throw new Error('يجب أن يكون اسم التصنيف بين حرفين و100 حرف.');
  }
  if (!/^[A-Z0-9]{2,12}$/.test(cleanPrefix)) {
    throw new Error('رمز البادئة يجب أن يتكون من 2 إلى 12 حرفاً/رقماً إنجليزياً فقط (مثل SW أو UPS).');
  }

  const duplicateName = existingCategories.some(
    (c) => c.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicateName) {
    throw new Error('يوجد تصنيف مسجل بهذا الاسم مسبقاً.');
  }

  const duplicatePrefix = existingCategories.some(
    (c) => c.codePrefix.trim().toUpperCase() === cleanPrefix
  );
  if (duplicatePrefix) {
    throw new Error('رمز البادئة مستخدم في تصنيف آخر. يرجى اختيار رمز فريد.');
  }

  const id = generateCategoryId();
  const nowIso = new Date().toISOString();
  const payload: CategoryRecord = {
    id,
    name: cleanName,
    codePrefix: cleanPrefix,
    isActive: input.isActive,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  if (cleanDesc) {
    payload.description = cleanDesc.slice(0, 300);
  }

  try {
    await setDoc(doc(db, 'categories', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `categories/${id}`);
  }

  await logCategoryAudit('CREATE_CATEGORY', id, `إضافة تصنيف: ${cleanName} (${cleanPrefix})`);
  return id;
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
  existingCategories: CategoryRecord[]
): Promise<void> {
  const cleanName = input.name.trim();
  const cleanPrefix = input.codePrefix.trim().toUpperCase();
  const cleanDesc = (input.description || '').trim();

  if (cleanName.length < 2 || cleanName.length > 100) {
    throw new Error('يجب أن يكون اسم التصنيف بين حرفين و100 حرف.');
  }
  if (!/^[A-Z0-9]{2,12}$/.test(cleanPrefix)) {
    throw new Error('رمز البادئة يجب أن يتكون من 2 إلى 12 حرفاً/رقماً إنجليزياً فقط.');
  }

  const duplicateName = existingCategories.some(
    (c) => c.id !== id && c.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicateName) {
    throw new Error('يوجد تصنيف آخر مسجل بهذا الاسم.');
  }

  const duplicatePrefix = existingCategories.some(
    (c) => c.id !== id && c.codePrefix.trim().toUpperCase() === cleanPrefix
  );
  if (duplicatePrefix) {
    throw new Error('رمز البادئة مستخدم في تصنيف آخر.');
  }

  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    id,
    name: cleanName,
    codePrefix: cleanPrefix,
    isActive: input.isActive,
    description: cleanDesc ? cleanDesc.slice(0, 300) : '',
    updatedAt: nowIso,
  };

  try {
    await updateDoc(doc(db, 'categories', id), updatePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `categories/${id}`);
  }

  await logCategoryAudit('UPDATE_CATEGORY', id, `تعديل تصنيف: ${cleanName} (${cleanPrefix})`);
}

export async function toggleCategoryStatus(category: CategoryRecord): Promise<void> {
  const nextStatus = !category.isActive;
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'categories', category.id), {
      isActive: nextStatus,
      updatedAt: nowIso,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `categories/${category.id}`);
  }

  await logCategoryAudit(
    nextStatus ? 'ACTIVATE_CATEGORY' : 'ARCHIVE_CATEGORY',
    category.id,
    `${nextStatus ? 'تفعيل' : 'أرشفة'} التصنيف: ${category.name}`
  );
}

export async function initializeOfficialCategoriesPreset(
  existingCategories: CategoryRecord[]
): Promise<number> {
  const existingIds = new Set(existingCategories.map((c) => c.id));
  const existingNames = new Set(
    existingCategories.map((c) => c.name.trim().toLowerCase())
  );
  const toCreate = OFFICIAL_CATEGORIES_PRESET.filter(
    (preset) =>
      !existingIds.has(preset.id) && !existingNames.has(preset.name.toLowerCase())
  );

  if (toCreate.length === 0) return 0;

  const batch = writeBatch(db);
  const nowIso = new Date().toISOString();

  toCreate.forEach((preset) => {
    batch.set(doc(db, 'categories', preset.id), {
      id: preset.id,
      name: preset.name,
      codePrefix: preset.codePrefix,
      description: preset.description,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'categories');
  }

  await logCategoryAudit(
    'INITIALIZE_CATEGORIES_PRESET',
    'preset',
    `تهيئة ${toCreate.length} تصنيفاً رسمياً معتمداً.`
  );
  return toCreate.length;
}
