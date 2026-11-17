import { AppRouteId, UserRole } from '../types/inventory';

export interface NavItemConfig {
  id: AppRouteId;
  label: string;
  group: 'main' | 'inventory' | 'operations' | 'control' | 'admin';
  phase: number;
  phaseImplemented: boolean;
  description: string;
  allowedRoles: UserRole[];
  plannedFeatures: string[];
}

export interface NavGroupConfig {
  id: 'main' | 'inventory' | 'operations' | 'control' | 'admin';
  title: string;
}

export const NAV_GROUPS: NavGroupConfig[] = [
  { id: 'main', title: 'المركز الرئيسي' },
  { id: 'inventory', title: 'دليل الموجودات والجهات' },
  { id: 'operations', title: 'العمليات المخزنية' },
  { id: 'control', title: 'الرقابة والجرد والصيانة' },
  { id: 'admin', title: 'التقارير والإدارة' },
];

const ALL_ROLES = [
  UserRole.SYSTEM_ADMIN,
  UserRole.WAREHOUSE_MANAGER,
  UserRole.WAREHOUSE_STAFF,
  UserRole.VIEWER,
];

const STAFF_AND_UP = [
  UserRole.SYSTEM_ADMIN,
  UserRole.WAREHOUSE_MANAGER,
  UserRole.WAREHOUSE_STAFF,
];

const MANAGER_AND_ADMIN = [
  UserRole.SYSTEM_ADMIN,
  UserRole.WAREHOUSE_MANAGER,
];

export const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'لوحة التحكم',
    group: 'main',
    phase: 1,
    phaseImplemented: true,
    description: 'الملخص التنفيذي، الإحصائيات اللحظية، الرسوم البيانية، وآخر الحركات المخزنية.',
    allowedRoles: ALL_ROLES,
    plannedFeatures: [
      'إحصائيات شاملة للأجهزة والمواد الاستهلاكية',
      'رسوم بيانية تفاعلية للتوزيع والحركة الشهرية',
      'اختصارات العمليات السريعة وقائمة الصيانة',
    ],
  },
  {
    id: 'devices',
    label: 'دليل الأجهزة والمعدات',
    group: 'inventory',
    phase: 4,
    phaseImplemented: true,
    description: 'السجل الموحد لجميع الأجهزة الفردية وبطاقة كل جهاز المستقلة مع منع الحذف عند وجود حركات.',
    allowedRoles: ALL_ROLES,
    plannedFeatures: [
      'جدول تفصيلي بأرقام الجرد والرقم التسلسلي والموقع والحالة',
      'بطاقة جهاز فردية بـ 5 تبويبات (الأساسية، الحركات، الصيانة، المرفقات، التعديلات)',
      'أرشفة الأجهزة بدلاً من حذفها للحفاظ على الأثر التاريخي',
    ],
  },
  {
    id: 'consumables',
    label: 'المواد الاستهلاكية والكميات',
    group: 'inventory',
    phase: 4,
    phaseImplemented: true,
    description: 'إدارة الكابلات ورؤوس RJ45 والملحقات وقطع الغيار مع تنبيهات الحد الأدنى وإعادة الطلب.',
    allowedRoles: ALL_ROLES,
    plannedFeatures: [
      'متابعة الرصيد الفعلي والحد الأدنى وحد إعادة الطلب والمخزون الاحتياطي',
      'خصم تلقائي عند الصرف ومنع الصرف بأكثر من الرصيد المتوفر',
      'ربط كل مادة كمية بباركود وموقع تخزين محدد',
    ],
  },
  {
    id: 'categories',
    label: 'تصنيفات الأجهزة',
    group: 'inventory',
    phase: 3,
    phaseImplemented: true,
    description: 'تنظيم تصنيفات الموجودات التقنية (الحواسيب، الشبكات، السويتشات، UPS، الكاميرات وغيرها).',
    allowedRoles: MANAGER_AND_ADMIN,
    plannedFeatures: [
      '18 تصنيفاً معتمداً قابلة للإضافة والتعديل',
      'ربط التصنيفات بتقارير التوزيع والجرد',
    ],
  },
  {
    id: 'departments',
    label: 'دليل الشعب والوحدات',
    group: 'inventory',
    phase: 3,
    phaseImplemented: true,
    description: 'سجل الجهات المستفيدة التابعة لمجمع سيد الشهداء (عليه السلام) الخدمي وربط الوحدات بالشعب.',
    allowedRoles: ALL_ROLES,
    plannedFeatures: [
      'ربط عدة وحدات بالشعبة الواحدة مع بيانات المسؤول والموقع',
      'اختيار إلزامي للجهة المستفيدة من الدليل في سندات الصرف',
      'دعم الأرشفة دون فقدان السجلات التاريخية',
    ],
  },
  {
    id: 'stock-entry',
    label: 'إضافة الموجودات للمخزن',
    group: 'operations',
    phase: 6,
    phaseImplemented: true,
    description: 'توثيق استلام أجهزة جديدة أو تعزيز أرصدة المواد الاستهلاكية عبر سندات إدخال رسمية.',
    allowedRoles: STAFF_AND_UP,
    plannedFeatures: [
      'إنشاء بطاقة مستقلة تلقائياً لكل جهاز فردي عند الإدخال',
      'تحديث أرصدة المواد الكمية وتوثيق رقم الكتاب الرسمي والمرفقات',
    ],
  },
  {
    id: 'stock-issue',
    label: 'صرف الموجودات للشعب',
    group: 'operations',
    phase: 6,
    phaseImplemented: true,
    description: 'صرف مباشر للأجهزة والمواد إلى الشعب والوحدات مع التحقق الفوري من التوفر وإصدار سند صرف.',
    allowedRoles: STAFF_AND_UP,
    plannedFeatures: [
      'بحث بالاسم أو رقم الجرد أو الرقم التسلسلي أو مسح الباركود/QR',
      'منع صرف الجهاز نفسه مرتين عبر معاملات Firestore الذرية',
      'إصدار وطباعة سند صرف رسمي',
    ],
  },
  {
    id: 'stock-return',
    label: 'إرجاع الموجودات للمخزن',
    group: 'operations',
    phase: 6,
    phaseImplemented: true,
    description: 'استلام الأجهزة المعادة من الشعب والوحدات وفحص حالتها الفنية وتوجيهها للمخزن أو الصيانة.',
    allowedRoles: STAFF_AND_UP,
    plannedFeatures: [
      'تأكيد الاستلام الفعلي قبل إتمام عملية الإرجاع',
      'تحويل تلقائي للصيانة إذا كانت الحالة الفنية تتطلب إصلاحاً',
    ],
  },
  {
    id: 'asset-transfer',
    label: 'نقل الأجهزة بين الجهات',
    group: 'operations',
    phase: 6,
    phaseImplemented: true,
    description: 'نقل عهدة الأجهزة بين الشعب والوحدات مع الاحتفاظ الكامل بسجل الجهات السابقة.',
    allowedRoles: MANAGER_AND_ADMIN,
    plannedFeatures: [
      'الاحتفاظ بسند الصرف الأصلي وسلسلة المستلمين السابقين',
      'تحديث الموقع الحالي والمستلم الجديد وسبب النقل',
    ],
  },
  {
    id: 'inventory-audit',
    label: 'الجرد المخزني الإلكتروني',
    group: 'control',
    phase: 7,
    phaseImplemented: true,
    description: 'إدارة جلسات الجرد الشامل أو الجزئي عبر مسح الباركود ومقارنة الفعلي مع السجلات.',
    allowedRoles: MANAGER_AND_ADMIN,
    plannedFeatures: [
      'مسح ميداني عبر كاميرا الهاتف الخلفية أو قارئ الباركود',
      'رصد الأجهزة المفقودة أو في موقع غير صحيح أو غير المسجلة',
      'تقرير فروقات الجرد واعتماد المسؤول',
    ],
  },
  {
    id: 'maintenance',
    label: 'صيانة الأجهزة والمعدات',
    group: 'control',
    phase: 7,
    phaseImplemented: true,
    description: 'متابعة الأعطال وتذاكر الصيانة وتواريخ الإرسال والاستلام وسجل الصيانة لكل جهاز.',
    allowedRoles: STAFF_AND_UP,
    plannedFeatures: [
      'تتبع الحالات: يحتاج صيانة، قيد الصيانة، تمت الصيانة، غير قابل للإصلاح',
      'توثيق الجهة المنفذة والتكلفة والملاحظات والمرفقات',
    ],
  },
  {
    id: 'barcode-center',
    label: 'مركز الباركود وQR',
    group: 'control',
    phase: 5,
    phaseImplemented: true,
    description: 'توليد أرقام جرد فريدة وطباعة ملصقات الباركود وQR Code ومسحها مباشرة.',
    allowedRoles: STAFF_AND_UP,
    plannedFeatures: [
      'توليد تلقائي مع منع التكرار عبر فهرس barcodeIndex',
      'تحميل الملصقات بصيغتي PNG وPDF جاهزة للطباعة الحرارية والعادية',
      'ماسح ضوئي متوافق مع الهاتف والكاميرا الخلفية',
    ],
  },
  {
    id: 'movements',
    label: 'سجل حركات الأجهزة',
    group: 'control',
    phase: 7,
    phaseImplemented: true,
    description: 'السجل المركزي غير القابل للتعديل أو الحذف لجميع حركات الإدخال والصرف والإرجاع والنقل.',
    allowedRoles: ALL_ROLES,
    plannedFeatures: [
      'توثيق رقم الحركة والسند المرتبط والموظف المنفذ والجهة السابقة والجديدة',
      'حماية صارمة تمنع التعديل أو الحذف من الواجهة أو قواعد الأمان',
    ],
  },
  {
    id: 'reports',
    label: 'مركز التقارير الرسمية',
    group: 'admin',
    phase: 8,
    phaseImplemented: true,
    description: '18 تقريراً مؤسساتياً بتنسيق A4 الرسمي للعتبة الحسينية المقدسة مع تصدير PDF وExcel.',
    allowedRoles: ALL_ROLES,
    plannedFeatures: [
      'ترويسة رسمية (الأمانة العامة للعتبة الحسينية المقدسة — مجمع سيد الشهداء)',
      'تصفية حسب التاريخ والشعبة والوحدة والتصنيف والمستلم',
      'تصدير مباشر إلى PDF وExcel وطباعة A4 مع خانات التوقيع',
    ],
  },
  {
    id: 'users',
    label: 'المستخدمون والصلاحيات',
    group: 'admin',
    phase: 9,
    phaseImplemented: true,
    description: 'إدارة حسابات الموظفين والأدوار الأربعة الحصرية بواسطة مدير النظام دون تسجيل عام.',
    allowedRoles: [UserRole.SYSTEM_ADMIN],
    plannedFeatures: [
      'إنشاء الحسابات وتعيين الأدوار (مدير النظام، مسؤول المخزن، موظف، مشاهدة)',
      'إنفاذ الصلاحيات عبر Firestore Security Rules وCloud Functions',
    ],
  },
  {
    id: 'audit-logs',
    label: 'سجل التدقيق الأمني',
    group: 'admin',
    phase: 9,
    phaseImplemented: true,
    description: 'مراقبة وتوثيق كافة عمليات الدخول والتعديل والتسوية وإدارة الحسابات بالقيم السابقة والجديدة.',
    allowedRoles: [UserRole.SYSTEM_ADMIN],
    plannedFeatures: [
      'تسجيل وقت الدخول والخروج وآخر نشاط للمستخدم',
      'سجل غير قابل للتعديل للقيم قبل التغيير وبعده',
    ],
  },
  {
    id: 'settings',
    label: 'إعدادات النظام والنسخ الاحتياطي',
    group: 'admin',
    phase: 9,
    phaseImplemented: true,
    description: 'سياسة انتهاء الجلسة، ترويسة التقارير الرسمية، وإدارة النسخ الاحتياطي والاستعادة.',
    allowedRoles: [UserRole.SYSTEM_ADMIN],
    plannedFeatures: [
      'ضبط مهلة الجلسة التلقائية وتنبيهات الحد الأدنى للمخزون',
      'آلية النسخ الاحتياطي الدوري لقاعدة Firestore والاستعادة الآمنة',
    ],
  },
];
