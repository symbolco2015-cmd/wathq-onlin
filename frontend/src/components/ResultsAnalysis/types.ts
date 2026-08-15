/** يطابق صفوف جدول grade_bands في Supabase — قراءة عامة، كتابة أدمن فقط. */
export interface GradeBand {
  id: string;
  label: string;
  min_score: number;
  max_score: number;
  color: string;
  display_order: number;
  stage: string | null;
}

export interface StudentResult {
  name: string;
  score: number;
  section?: string;
  bandId: string;
  bandLabel: string;
  inDangerZone: boolean;
}

/** الشكل المخزَّن في عمود results_analysis.summary (JSONB) — يحوي كل نتائج
 *  التحليل بما فيها أسماء الطلاب؛ هذا الجدول داخلي فقط (RLS: المالك وحده). */
export interface AnalysisSummary {
  students: StudentResult[];
  /** عدد الطلاب لكل فئة، مفتاحها GradeBand.id */
  bandCounts: Record<string, number>;
  average: number;
  stdDev: number;
  /** نسبة الطلاب بدرجة ≥95 من إجمالي الفصل (0-1) */
  highScorePct: number;
  inflationDetected: boolean;
  /** متوسط كل شعبة — يظهر فقط لو الملف يحوي أكثر من قيمة شعبة واحدة */
  sectionAverages?: { section: string; average: number; count: number }[];
  totalStudents: number;
  /** صفوف استُبعدت لعدم احتواء درجة رقمية صالحة (0-100) */
  skippedRows: number;
}

/** يطابق صفوف جدول results_analysis في Supabase. */
export interface ResultsAnalysisRow {
  id: string;
  portfolio_id: string;
  subject: string;
  stage: string | null;
  class_section: string | null;
  summary: AnalysisSummary;
  student_names_included: boolean;
  created_at: string;
}

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
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
