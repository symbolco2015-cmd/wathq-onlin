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

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
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
}

export interface ColumnDetectionResult {
  /** إلزامي — بدونه لا يمكن حساب أي تحليل */
  scoreCol: string | null;
  /** اختياري — غيابه لا يمنع التحليل، فقط يمنع عرض الأسماء (الطلاب يظهرون
   *  حينها بترقيم اصطناعي "طالب 1"، "طالب 2"... لكن درجاتهم تدخل الحساب كاملة) */
  nameCol: string | null;
  sectionCol: string | null;
  subjectCol: string | null;
}
