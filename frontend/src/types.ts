export type PageType = 'auth' | 'dashboard' | 'public' | 'admin';

export interface Evidence {
  type: 'pdf' | 'img' | 'doc' | 'vid';
  name: string;
  date: string;
  sub?: string;
  url?: string;
  // ── حقول سياقية إضافية، تُحفظ فقط للأدلة المرتبطة باستراتيجية تدريس
  // (sub يبدأ بـ "strat:") — اختيارية بالكامل، الأدلة القديمة لا تملكها ───
  stratDate?: string;
  stratStage?: 'ابتدائي' | 'متوسط' | 'ثانوي';
  stratGrade?: string;
  stratPeriod?: number;
  stratSubject?: string;
}

export interface SectionData {
  id: number;
  ttl: string;
  icon: string;
  subs: string[];
  isStrat?: boolean;
  strats?: string[];
}

export interface UserProfile {
  name: string;
  role: string;
  school: string;
  phone: string;
  email: string;
  twitter: string;
  linkedin: string;
  youtube: string;
  avatar: string;
  yearsOfExperience: number;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: 'tech' | 'admin' | 'urgent';
  attachment_url?: string;
  created_at: string;
  created_by?: string;
}

export interface AcademicDate {
  id: string;
  title: string;
  date: string;
  hijri_label?: string;
  created_at: string;
  created_by?: string;
}

export interface AppState {
  ev: Record<string, Evidence[]>;
  strats: string[];
  csubs: Record<number, string[]>;
  notes: Record<string, string>;
  profile: UserProfile;
  readAnnouncements?: string[];
  yearStartMonth?: number; // 1–12، الافتراضي 9 (سبتمبر)
  /** تاريخ إضافة كل استراتيجية (ISO) — يُستخدم لحساب "استراتيجيات مستخدمة هذا
   * الشهر" في لوحة التحكم. اختياري بالكامل؛ الاستراتيجيات القديمة بلا تاريخ
   * مسجَّل تُستثنى من عدّ الشهر الحالي دون أي كسر. */
  stratDates?: Record<string, string>;
  /** تاريخ موافقة الحساب (ISO) على تحذير خصوصية ميزة "اقتراح تلقائي من
   * الصورة" (Beta) — وجوده يمنع تكرار عرض التحذير لهذا الحساب. */
  aiSuggestConsentAt?: string;
}

/** الحقول التي تُعرض فعلياً في واجهة المشاركة العامة — وحدها ما تُرجعه get_shared_portfolio() */
export type PublicPortfolioState = Pick<AppState, 'ev' | 'strats' | 'csubs' | 'profile'> & {
  /** ملخص عام مولَّد بالذكاء الاصطناعي (عمود ai_summary في portfolios) — غائب
   * أو null قبل أول توليد أو لملف بلا شواهد مصنَّفة؛ الصفحة تتدهور بأمان لسلوكها
   * الحالي بدون هذا الحقل. */
  ai_summary?: string | null;
  /** معرّف الشاهد الذي اختاره الذكاء الاصطناعي كأبرز إنجاز (عمود
   * ai_top_achievement_evidence_id) — يُطابَق مقابل مصفوفة evidence المجلوبة من
   * get_shared_evidence()؛ غائب أو null يعني الرجوع لمنطق heuristic القسم الأعلى اكتمالاً. */
  ai_top_achievement_evidence_id?: string | null;
};

/** مؤشر الاستمرارية عبر الزمن — بداية السنة الدراسية + الأشهر التي فيها
 * توثيق فعلي (أي قسم)، لعرضها في Public.tsx. يُبنى من get_shared_monthly_progress()
 * في العرض العام، أو مباشرة من monthlyProgress.rows في معاينة المالك لملفه. */
export interface ContinuityData {
  yearStartMonth: number;
  /** evidenceCount: مجموع evidence_count عبر كل الأقسام لهذا الشهر (بصرف النظر
   * عن القسم) — اختياري لأن الاستمرارية القديمة لا تحتاجه، يُستخدم فقط من
   * calculatePointsLevel في Public.tsx لحساب نقاط/مستوى الملف العام. */
  activeMonths: { year: number; month: number; evidenceCount?: number }[];
}

