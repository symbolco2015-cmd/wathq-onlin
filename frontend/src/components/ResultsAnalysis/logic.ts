import type { GradeBand, AnalysisSummary, StudentResult, ColumnDetectionResult, ParsedFile, ResultsAnalysisRow, PublicResultsAnalysisRow } from './types';

/** هامش "منطقة الخطر" حول حد النجاح (60) — طالب بدرجة ضمن [55,65] يُعتبر في
 *  منطقة خطر. ثابت الآن، قابل للتعديل لاحقاً دون تغيير منطق الحساب. */
export const DANGER_ZONE_MARGIN = 5;
export const DANGER_ZONE_CENTER = 60;

/** عتبتا كشف "تضخم الدرجات": نسبة الطلاب بدرجة ≥95 تتجاوز 50%، أو الانحراف
 *  المعياري للفصل بأكمله أقل من 5 (على مقياس 0-100 — تكدّس شديد للدرجات).
 *  أي منهما كافٍ لإطلاق العلامة، بشرط عيّنة لا تقل عن 5 طلاب (تفادي نتائج
 *  زائفة على فصول صغيرة جداً). */
export const HIGH_SCORE_INFLATION_PCT = 0.5;
export const LOW_STDDEV_INFLATION_THRESHOLD = 5;
export const INFLATION_MIN_SAMPLE = 5;
const HIGH_SCORE_THRESHOLD = 95;

export function isDangerZone(score: number): boolean {
  return Math.abs(score - DANGER_ZONE_CENTER) <= DANGER_ZONE_MARGIN;
}

/** يطابق درجة الطالب بأقرب فئة من grade_bands. المطابقة الأساسية عبر المدى
 *  [min_score, max_score]؛ لو لم تقع الدرجة ضمن أي مدى (بيانات غير نظيفة رغم
 *  القص المسبق لـ[0,100]) نرجع لأقرب فئة بالمسافة المطلقة كحل احتياطي. */
export function matchBand(score: number, bands: GradeBand[]): GradeBand | null {
  if (bands.length === 0) return null;
  const exact = bands.find(b => score >= b.min_score && score <= b.max_score);
  if (exact) return exact;
  let nearest = bands[0];
  let nearestDist = Infinity;
  for (const b of bands) {
    const dist = score < b.min_score ? b.min_score - score : score - b.max_score;
    if (dist < nearestDist) { nearest = b; nearestDist = dist; }
  }
  return nearest;
}

const normalizeHeader = (h: string) => h.trim();

/** يبحث عن عمود وحيد يحوي الكلمة المفتاحية ضمن اسمه — تعدد المطابقات يُعامَل
 *  كفشل اكتشاف (غموض)، وليس تخميناً؛ الواجهة تعرض حينها اختياراً يدوياً. */
function findColumn(headers: string[], keywords: string[]): string | null {
  const matches = headers.filter(h => keywords.some(k => h.includes(k)));
  return matches.length === 1 ? matches[0] : null;
}

export function detectColumns(headers: string[]): ColumnDetectionResult {
  const normalized = headers.map(normalizeHeader);
  return {
    scoreCol: findColumn(normalized, ['درجة']),
    nameCol: findColumn(normalized, ['اسم']),
    sectionCol: findColumn(normalized, ['شعبة', 'فصل']),
    subjectCol: findColumn(normalized, ['مادة']),
  };
}

/** يحوّل نص خام إلى درجة رقمية ضمن [0,100]، أو null لو غير صالحة. */
function parseScore(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length === 0) return 0;
  const variance = mean(values.map(v => (v - avg) ** 2));
  return Math.sqrt(variance);
}

export interface ComputeSummaryOptions {
  parsed: ParsedFile;
  bands: GradeBand[];
  scoreCol: string;
  /** اختياري — غيابه لا يستبعد أي صف، فقط يستبدل الاسم الحقيقي بترقيم
   *  اصطناعي؛ الدرجة تبقى جزءاً كاملاً من المتوسط والتوزيع والتصنيف. */
  nameCol?: string | null;
  sectionCol?: string | null;
}

/** يبني AnalysisSummary كاملاً من الصفوف المحلَّلة — منطق حسابي بحت، صفر AI. */
export function computeSummary({ parsed, bands, scoreCol, sectionCol, nameCol }: ComputeSummaryOptions): AnalysisSummary {
  const students: StudentResult[] = [];
  let skippedRows = 0;

  parsed.rows.forEach((row) => {
    const score = parseScore(row[scoreCol]);
    if (score === null) { skippedRows++; return; }
    const band = matchBand(score, bands);
    if (!band) { skippedRows++; return; }
    const section = sectionCol ? row[sectionCol]?.trim() || undefined : undefined;
    const name = (nameCol ? row[nameCol]?.trim() : '') || `طالب ${students.length + 1}`;
    students.push({
      name,
      score,
      section,
      bandId: band.id,
      bandLabel: band.label,
      inDangerZone: isDangerZone(score),
    });
  });

  const bandCounts: Record<string, number> = {};
  for (const b of bands) bandCounts[b.id] = 0;
  for (const s of students) bandCounts[s.bandId] = (bandCounts[s.bandId] ?? 0) + 1;

  const scores = students.map(s => s.score);
  const average = mean(scores);
  const stdDev = stddev(scores, average);
  const totalStudents = students.length;
  const highScoreCount = students.filter(s => s.score >= HIGH_SCORE_THRESHOLD).length;
  const highScorePct = totalStudents > 0 ? highScoreCount / totalStudents : 0;

  const inflationDetected = totalStudents >= INFLATION_MIN_SAMPLE &&
    (highScorePct > HIGH_SCORE_INFLATION_PCT || stdDev < LOW_STDDEV_INFLATION_THRESHOLD);

  let sectionAverages: AnalysisSummary['sectionAverages'];
  const distinctSections = new Set(students.map(s => s.section).filter(Boolean) as string[]);
  if (distinctSections.size > 1) {
    sectionAverages = Array.from(distinctSections).map(sec => {
      const inSec = students.filter(s => s.section === sec);
      return { section: sec, average: mean(inSec.map(s => s.score)), count: inSec.length };
    });
  }

  return {
    students,
    bandCounts,
    average,
    stdDev,
    highScorePct,
    inflationDetected,
    sectionAverages,
    totalStudents,
    skippedRows,
  };
}

/** يبني قيمة class_section الافتراضية لصف results_analysis: قيمة موحّدة فقط
 *  لو كل الطلاب بنفس الشعبة، وإلا null (التفصيل يبقى في summary.sectionAverages). */
export function deriveUniformClassSection(summary: AnalysisSummary): string | null {
  const sections = new Set(summary.students.map(s => s.section).filter(Boolean) as string[]);
  return sections.size === 1 ? Array.from(sections)[0] : null;
}

/** يبني قيمة "المادة" المقترحة من عمود مادة مكتشف، فقط لو كانت موحّدة عبر كل الصفوف. */
export function deriveUniformSubject(parsed: ParsedFile, subjectCol: string | null): string {
  if (!subjectCol) return '';
  const values = new Set(parsed.rows.map(r => r[subjectCol]?.trim()).filter(Boolean));
  return values.size === 1 ? Array.from(values)[0]! : '';
}

/** عتبة "القرب من النجاح" ضمن التجميع العلاجي — طالب بدرجة [50, 60) يُعتبر
 *  "قريباً من النجاح"، وأقل من 50 "فجوة أكبر". ثابت تقريبي قابل للتعديل لاحقاً
 *  دون تغيير منطق الحساب (نفس روح DANGER_ZONE_MARGIN أعلاه). */
export const REMEDIAL_NEAR_SUCCESS_THRESHOLD = 50;

export interface RemedialGroups {
  /** درجة ضمن [50, 60) — قريبون من حد النجاح */
  nearSuccess: StudentResult[];
  /** درجة أقل من 50 — فجوة أكبر تحتاج خطة أكثر تكثيفاً */
  largerGap: StudentResult[];
}

/** يجمّع الطلاب "الأحوج لعلاج" (فئة "ضعيف" الأدنى، أو ضمن منطقة الخطر) إلى
 *  مجموعتين حسب مسافتهم عن حد النجاح (60). طالب ضمن منطقة الخطر لكن بدرجة
 *  ≥60 (أي نجح فعلاً) لا يقع في أي من المجموعتين عمداً — التجميع العلاجي
 *  لطلاب لم ينجحوا بعد فقط، وليس تنبيه منطقة الخطر العام (مؤشر منفصل). */
export function groupRemedialStudents(students: StudentResult[], weakBandId: string | undefined): RemedialGroups {
  const relevant = students.filter(s => s.bandId === weakBandId || s.inDangerZone);
  return {
    nearSuccess: relevant.filter(s => s.score >= REMEDIAL_NEAR_SUCCESS_THRESHOLD && s.score < DANGER_ZONE_CENTER),
    largerGap: relevant.filter(s => s.score < REMEDIAL_NEAR_SUCCESS_THRESHOLD),
  };
}

/** مؤشر الفجوة: الفرق بين أعلى وأدنى درجة ضمن التحليل (skippedRows مُستبعدة
 *  أصلاً من summary.students وقت الحساب، فلا حاجة لاستبعاد إضافي هنا). */
export function computeScoreGap(students: StudentResult[]): number {
  if (students.length === 0) return 0;
  const scores = students.map(s => s.score);
  return Math.max(...scores) - Math.min(...scores);
}

export interface ComparisonPoint {
  id: string;
  label: string;
  average: number;
  createdAt: string;
}

/** يبني سلسلة المقارنة الزمنية لكل التحليلات المشتركة بنفس قيمة subject
 *  (تطابق نصي تام) — مرتبة تصاعدياً بالتاريخ. لا فائدة من سلسلة بعنصر واحد،
 *  فالمستدعي (AnalysisSectionCard) هو من يقرر إظهار تبويب المقارنة أصلاً فقط
 *  عند وجود عنصرين فأكثر؛ هذه الدالة تبني السلسلة بصرف النظر عن طولها. */
export function buildComparisonSeries(analyses: ResultsAnalysisRow[], subject: string): ComparisonPoint[] {
  return analyses
    .filter(a => a.subject === subject)
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(a => ({
      id: a.id,
      label: new Date(a.created_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
      average: a.summary.average,
      createdAt: a.created_at,
    }));
}

/** فرق نصي بين آخر نقطتين في سلسلة مقارنة — "تحسّن +X" أو "تراجع -X"، أو null
 *  لو أقل من نقطتين (لا فرق لحسابه). */
export function comparisonDelta(series: ComparisonPoint[]): { diff: number; improved: boolean } | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].average;
  const prev = series[series.length - 2].average;
  const diff = Math.round((last - prev) * 10) / 10;
  return { diff, improved: diff >= 0 };
}

/** يجمّع التحليلات حسب subject (تطابق نصي) — يُستخدم لتحديد أي المواد تستحق
 *  تبويب "مقارنة" تلقائياً (عنصران فأكثر). */
export function groupAnalysesBySubject(analyses: ResultsAnalysisRow[]): Map<string, ResultsAnalysisRow[]> {
  const map = new Map<string, ResultsAnalysisRow[]>();
  for (const a of analyses) {
    const list = map.get(a.subject) ?? [];
    list.push(a);
    map.set(a.subject, list);
  }
  return map;
}

/** يحوّل صفاً داخلياً كاملاً (يحوي أسماء الطلاب عبر summary.students) إلى
 *  الشكل المبسَّط الآمن للعرض العام — لمعاينة المالك لصفحته فقط (state.ev
 *  محلي أصلاً، لا يعبر الشبكة بشكل مختلف). أدنى/أعلى درجة تُحسبان هنا بنفس
 *  الطريقة التي تحسبها get_shared_results_analysis() داخل SQL لنمط ?share=،
 *  حتى يتطابق العرض بين النمطين. */
export function toPublicResultsAnalysisRow(row: ResultsAnalysisRow): PublicResultsAnalysisRow {
  const scores = row.summary.students.map(s => s.score);
  return {
    id: row.id,
    subject: row.subject,
    stage: row.stage,
    class_section: row.class_section,
    created_at: row.created_at,
    total_students: row.summary.totalStudents,
    average: row.summary.average,
    min_score: scores.length > 0 ? Math.min(...scores) : 0,
    max_score: scores.length > 0 ? Math.max(...scores) : 0,
  };
}

/** نسخة عامة من groupAnalysesBySubject تعمل على الشكل المبسَّط — الشكلان غير
 *  متوافقين بنيوياً (average مباشر هنا، summary.average هناك) فتعذّر إعادة
 *  استخدام الدالة الأصلية مباشرة دون تحويل وسيط. */
export function groupPublicAnalysesBySubject(rows: PublicResultsAnalysisRow[]): Map<string, PublicResultsAnalysisRow[]> {
  const map = new Map<string, PublicResultsAnalysisRow[]>();
  for (const r of rows) {
    const list = map.get(r.subject) ?? [];
    list.push(r);
    map.set(r.subject, list);
  }
  return map;
}

/** نسخة عامة من buildComparisonSeries تعمل على الشكل المبسَّط — تُنتج نفس
 *  ComparisonPoint[] فتبقى comparisonDelta أعلاه قابلة لإعادة الاستخدام
 *  حرفياً بلا أي تكرار (هي أصلاً عامة، لا تعتمد على ResultsAnalysisRow). */
export function buildPublicComparisonSeries(rows: PublicResultsAnalysisRow[], subject: string): ComparisonPoint[] {
  return rows
    .filter(r => r.subject === subject)
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(r => ({
      id: r.id,
      label: new Date(r.created_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
      average: r.average,
      createdAt: r.created_at,
    }));
}
