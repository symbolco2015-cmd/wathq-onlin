import type { SupabaseEvidence } from './hooks/useSupabaseEvidence';
import type { PublicResultsAnalysisRow } from './components/ResultsAnalysis/types';
import type { ComparisonPoint } from './components/ResultsAnalysis/logic';

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
  /** بند 5 (تحسين نتائج المتعلمين) أو بند 10 (تحليل نتائج المتعلمين) — محتواهما
   * بالكامل واجهة أداة تحليل النتائج المخصّصة (ResultsAnalysis)، لا مؤشرات
   * فرعية عادية. نفس معاملة isStrat: مُستبعدان من شبكة الأقسام/النسب/منتقيات
   * القسم العامة، ولهما بطاقتان مثبّتتان دائماً بدلاً من ذلك. */
  isResultsSection?: boolean;
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
  /** طرف الفصل الدراسي الذي يمثله هذا الموعد (بداية/نهاية) — يُستخدم لبناء
   * أزواج المدى الزمني لتقرير الحصاد الفصلي. اختياري بالكامل؛ المواعيد
   * القديمة بلا هذا الحقل لا تظهر في قائمة "الفصول المتاحة" بالتقرير فقط. */
  semester_boundary?: 'start' | 'end' | null;
  /** رقم الفصل الدراسي (١/٢/٣) المقابل — يُطابَق بين موعدي البداية/النهاية
   * لنفس الفصل عند بناء أزواج المدى. */
  semester_number?: 1 | 2 | 3 | null;
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

/** نسخة مجمَّدة من PointsLevelInfo (utils.ts) وقت توليد تقرير الحصاد الفصلي —
 * مكرَّرة هنا عمداً (بدل استيراد النوع من utils.ts) لتفادي أي اعتماد دائري
 * بين types.ts وutils.ts؛ الحقول مطابقة تماماً لما يُرجعه calculatePointsLevel. */
export interface FrozenPointsLevel {
  points: number;
  levelId: 'steady' | 'confident' | 'exemplary';
  levelLabel: string;
  levelIcon: string;
}

/** لقطة ثابتة لتقرير حصاد فصلي — تُبنى مرة واحدة وقت التوليد في Dashboard.tsx
 * وتُحفظ كما هي في عمود harvest_reports.snapshot؛ Public.tsx يعرضها مباشرة
 * بلا أي إعادة حساب حي (خلافاً لمسار ?share=). */
export interface HarvestSnapshot {
  /** نفس شكل PublicPortfolioState الذي يستهلكه Public.tsx حالياً — ev/csubs
   * هنا مبنيان فقط من شواهد الفترة المختارة (وليس كامل الملف)، انظر التعليق
   * في Dashboard.tsx لتفاصيل بناء مفاتيح ev الاصطناعية من section_indicators. */
  state: PublicPortfolioState;
  /** مؤشر الاستمرارية، محسوب من monthly_progress ضمن المدى المختار فقط. */
  continuity: ContinuityData;
  /** شواهد جدول evidence الغني ضمن المدى المختار — impact/self_reflection
   * مُفرَّغة دائماً (null) بنفس منطق الخصوصية في get_shared_evidence، لأن هذا
   * التقرير قابل للقراءة العامة عبر id (انظر RLS على harvest_reports). */
  evidence: SupabaseEvidence[];
  /** شارة اللقب/النقاط محسوبة مرة واحدة وقت التوليد من شواهد المدى المختار
   * فقط (وليس نافذة آخر 3 أشهر التقويمية المعتادة) — Public.tsx يعرضها كما
   * هي في وضع التقرير بدل إعادة حسابها حياً من continuity. */
  pointsLevel: FrozenPointsLevel;
  /** بند 10 (تحليل نتائج المتعلمين) ضمن المدى المختار — الشكل المبسَّط الآمن
   * فقط (مطابق تماماً لما تُرجعه get_shared_results_analysis)، بلا summary/
   * students إطلاقاً: هذا التقرير قابل للقراءة العامة عبر id، فلا اسم طالب
   * واحد يصل لهذا الحقل بأي مسار (نفس مبدأ evidence أعلاه). */
  resultsAnalysis: PublicResultsAnalysisRow[];
  /** عناصر المقارنة لبند 10 (لكل مادة بتحليلين فأكثر ضمن المدى) — محسوبة
   * ومخبوزة مرة واحدة وقت التوليد من resultsAnalysis أعلاه (نفس منطق
   * groupAnalysesBySubject/comparisonDelta المستخدَم بالعرض الحي)، وليست
   * مُعادة الحساب وقت العرض؛ Public.tsx يعرضها كما هي في وضع التقرير. */
  resultsComparisons: { subject: string; series: ComparisonPoint[] }[];
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  generatedAt: string;
}

export interface HarvestReport {
  id: string;
  portfolio_id: string;
  period_label: string;
  period_from: string;
  period_to: string;
  snapshot: HarvestSnapshot;
  generated_at: string;
}

