/** يطابق صفوف جدول grade_bands في Supabase — قراءة عامة، كتابة أدمن فقط.
 *  حدودها من 100، فتُطابَق عليها النسبة المئوية لا الدرجة الخام. */
export interface GradeBand {
  id: string;
  label: string;
  min_score: number;
  max_score: number;
  color: string;
  display_order: number;
  stage: string | null;
}

/** رموز results_analysis.stage (قيد CHECK في القاعدة) */
export type StageCode = 'primary' | 'intermediate' | 'secondary';
/** رموز results_analysis.test_type (قيد CHECK في القاعدة) */
export type TestTypeCode = 'midterm' | 'final' | 'quiz' | 'oral' | 'project' | 'coursework';

export interface StudentResult {
  name: string;
  /** الدرجة الخام كما في الملف */
  score: number;
  /** score / full_mark × 100 — غيابه (صف قديم) يعني الحساب من 100 */
  pct?: number;
  /** صفوف قديمة فقط — لم يعد يُكتب (كل تحليل شعبة واحدة) */
  section?: string;
  bandId: string;
  bandLabel: string;
  inDangerZone: boolean;
}

/** الشكل المخزَّن في عمود results_analysis.summary (JSONB) — يحوي كل نتائج
 *  التحليل بما فيها أسماء الطلاب؛ هذا الجدول داخلي فقط (RLS: المالك وحده).
 *  students للحاضرين فقط: الغائب (خانة فارغة) يُعدّ في absentCount وحده. */
export interface AnalysisSummary {
  students: StudentResult[];
  /** عدد الطلاب لكل فئة، مفتاحها GradeBand.id */
  bandCounts: Record<string, number>;
  /** متوسط الدرجات الخام */
  average: number;
  /** متوسط النسب (0-100) — غيابه (صف قديم) يعني average نفسه */
  averagePct?: number;
  /** الانحراف المعياري بمقياس النسبة (نقاط مئوية) */
  stdDev: number;
  /** نسبة الطلاب بنسبة ≥95% من الحاضرين (0-1) */
  highScorePct: number;
  inflationDetected: boolean;
  /** صفوف قديمة فقط — لم يعد يُكتب */
  sectionAverages?: { section: string; average: number; count: number }[];
  /** الحاضرون */
  totalStudents: number;
  /** الخانات الفارغة في عمود الدرجة */
  absentCount?: number;
  /** صفوف استُبعدت لأن درجتها نص غير رقمي أو سالبة */
  skippedRows: number;
}

/** يطابق صفوف جدول results_analysis في Supabase. */
export interface ResultsAnalysisRow {
  id: string;
  portfolio_id: string;
  subject: string;
  stage: StageCode | null;
  grade_level: number | null;
  class_section: number | null;
  test_type: TestTypeCode | null;
  test_seq: number | null;
  /** الدرجة العظمى — NOT NULL DEFAULT 100 في القاعدة */
  full_mark: number | null;
  summary: AnalysisSummary;
  student_names_included: boolean;
  created_at: string;
  /** مخفي من الصفحة العامة (والمعاينة وتقرير الحصاد الجديد). غيابه قبل
   *  تنفيذ migration الإخفاء يعني «ظاهر». */
  hidden_public?: boolean;
}

/** حقول التعريف التي يكتبها نموذج الرفع مع كل تحليل */
export interface AnalysisMeta {
  subject: string;
  stage: StageCode;
  grade_level: number;
  class_section: number;
  test_type: TestTypeCode;
  test_seq: number | null;
  full_mark: number;
}

/** ورقة كما قرأها parseFile: شبكة خلايا نصية كاملة. firstRow رقم صف
 *  Excel لأول صف في الشبكة (الصفوف الفارغة باقية فيها حتى تطابق الأرقام). */
export interface RawSheet {
  name: string;
  firstRow: number;
  grid: string[][];
}

/** عمود في نموذج الملف. key فريد في الورقة (العنوان، وعند تكراره يُضاف
 *  رقم). الأعمدة الحساسة (بريد، معرّف، جوال) لا تصل إلى هنا. */
export interface FileColumn {
  key: string;
  /** ≥80% من الخانات غير الفارغة أرقام، وفيه رقم واحد على الأقل */
  numeric: boolean;
  /** قيمه تسلسل 1، 2، 3… */
  sequence: boolean;
  /** نصف الخانات غير الفارغة أو أكثر نص غير رقمي */
  textual: boolean;
  /** نسبة القيم المطابقة لنمط «شعبة N – الاسم» من الخانات غير الفارغة */
  sectionInNameRatio: number;
  /** أول قيمتين غير فارغتين */
  samples: string[];
}

export interface ModelRow {
  /** رقم الصف في Excel */
  rowNo: number;
  cells: Record<string, string>;
}

export interface ModelSheet {
  name: string;
  /** رقم صف العناوين في Excel */
  headerRow: number;
  columns: string[];
  rows: ModelRow[];
  /** فيها عمود رقمي صالح غير مستبعد من اقتراح الدرجة */
  hasScoreLikeColumn: boolean;
}

/** نموذج الملف بعد القراءة — هو وحده ما يبقى في حالة النافذة */
export interface FileModel {
  sheets: ModelSheet[];
  columns: FileColumn[];
  /** صف العناوين المعروض: المقترح لأول ورقة درجات، أو ما اختاره المعلم */
  headerRow: number;
  /** عدد الأعمدة الحساسة التي حُذفت قيمها عند القراءة */
  hiddenColumns: number;
  totalRows: number;
}

export type SectionSource = 'column' | 'name' | 'sheets' | 'single';

/** صف طالب واحد بعد التقسيم إلى شعب */
export interface SectionRow {
  rowNo: number;
  sheet: string;
  /** الاسم بعد فصل الشعبة عنه، أو '' */
  name: string;
  scoreRaw: string;
}

export interface SectionGroup {
  section: number;
  rows: SectionRow[];
  /** أسماء الأوراق التي جاءت منها صفوف هذه الشعبة */
  sheets: string[];
}

/** قيمة شعبة لم يُستخرج منها رقم — يحدد المعلم رقمها */
export interface UnresolvedSection {
  key: string;
  label: string;
  count: number;
}

/** الشكل المبسَّط الآمن للعرض العام (بند 10 على ?share=) — يطابق حرفياً ما
 *  تُرجعه get_shared_results_analysis()، ويطابق أيضاً ما يُبنى محلياً لمعاينة
 *  المالك عبر toPublicResultsAnalysisRow في logic.ts. عمداً بلا summary/
 *  students: لا اسم طالب واحد يصل لهذا الشكل بأي مسار.
 *  min_score/max_score = أدنى/أعلى درجة خام بين الحاضرين. الحقول بعدها
 *  اختيارية: لقطات تقارير الحصاد القديمة لا تحويها، وتُقرأ حينها من 100. */
export interface PublicResultsAnalysisRow {
  id: string;
  subject: string;
  stage: string | null;
  /** نص في لقطات الحصاد القديمة، ورقم بعد ذلك */
  class_section: number | string | null;
  created_at: string;
  total_students: number;
  average: number;
  min_score: number;
  max_score: number;
  grade_level?: number | null;
  test_type?: string | null;
  test_seq?: number | null;
  full_mark?: number | null;
  absent_count?: number | null;
  average_pct?: number | null;
  min_pct?: number | null;
  max_pct?: number | null;
  /** الحاضرون بنسبة ≥ 60% — غائب في اللقطات القبلية لج1 */
  pass_count?: number | null;
  /** عدد الطلاب في كل فئة بترتيب display_order — غائب في اللقطات القبلية لج1 */
  band_counts?: BandCount[] | null;
}

export interface BandCount {
  label: string;
  count: number;
}
