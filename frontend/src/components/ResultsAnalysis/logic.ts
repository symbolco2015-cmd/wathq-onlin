import type { GradeBand, AnalysisSummary, StudentResult, ResultsAnalysisRow, PublicResultsAnalysisRow, SectionRow, StageCode, TestTypeCode } from './types';
import { AR_STUDENT, countAr, formatDate } from '../../utils';
import { parseScore } from './fileModel';

export { SECTION_MAX } from './fileModel';

/** كل الحدود أدناه نسب مئوية (0-100) لا درجات خام: الدرجة تُحوَّل أولاً إلى
 *  score / full_mark × 100، ثم تُصنَّف. */

/** هامش "منطقة الخطر" حول حد النجاح (60%) — طالب بنسبة ضمن [55,65] يُعتبر في
 *  منطقة خطر. ثابت الآن، قابل للتعديل لاحقاً دون تغيير منطق الحساب. */
export const DANGER_ZONE_MARGIN = 5;
export const DANGER_ZONE_CENTER = 60;

/** عتبتا كشف "تضخم الدرجات": نسبة الطلاب بنسبة ≥95% تتجاوز 50%، أو الانحراف
 *  المعياري للفصل بأكمله أقل من 5 نقاط مئوية (تكدّس شديد للدرجات).
 *  أي منهما كافٍ لإطلاق العلامة، بشرط عيّنة لا تقل عن 5 طلاب (تفادي نتائج
 *  زائفة على فصول صغيرة جداً). */
export const HIGH_SCORE_INFLATION_PCT = 0.5;
export const LOW_STDDEV_INFLATION_THRESHOLD = 5;
export const INFLATION_MIN_SAMPLE = 5;
const HIGH_SCORE_THRESHOLD = 95;

/** الدرجة العظمى حين لا تُعرف (صفوف ولقطات قديمة) */
export const DEFAULT_FULL_MARK = 100;
/** أزرار الدرجة العظمى السريعة في نموذج الرفع */
export const FULL_MARK_PRESETS = [10, 20, 30, 40, 50, 100];

export const STAGE_OPTIONS: { value: StageCode; label: string; grades: number }[] = [
  { value: 'primary', label: 'ابتدائي', grades: 6 },
  { value: 'intermediate', label: 'متوسط', grades: 3 },
  { value: 'secondary', label: 'ثانوي', grades: 3 },
];

const GRADE_ORDINALS = ['أول', 'ثاني', 'ثالث', 'رابع', 'خامس', 'سادس'];

/** label للقائمة، named للاسم المركّب («الفتري الأول»)، numbered: رقم
 *  الاختبار إلزامي له. النهائي وأعمال السنة بلا رقم (يُحفظ null). */
export const TEST_TYPE_OPTIONS: { value: TestTypeCode; label: string; named: string; numbered: boolean }[] = [
  { value: 'midterm', label: 'فتري', named: 'الفتري', numbered: true },
  { value: 'final', label: 'نهائي', named: 'النهائي', numbered: false },
  { value: 'quiz', label: 'قصير', named: 'الاختبار القصير', numbered: true },
  { value: 'oral', label: 'شفهي', named: 'الاختبار الشفهي', numbered: true },
  { value: 'project', label: 'أداء أو مشروع', named: 'الأداء أو المشروع', numbered: true },
  { value: 'coursework', label: 'أعمال سنة', named: 'أعمال السنة', numbered: false },
];

export const TEST_SEQ_LABELS = ['الأول', 'الثاني', 'الثالث', 'الرابع'];

/** هل يلزم رقم الاختبار لهذا النوع */
export function testNeedsSeq(type: string | null | undefined): boolean {
  return TEST_TYPE_OPTIONS.find(t => t.value === type)?.numbered ?? false;
}

export function gradeCountFor(stage: string | null | undefined): number {
  return STAGE_OPTIONS.find(s => s.value === stage)?.grades ?? 0;
}

export function gradeOrdinal(grade: number): string {
  return GRADE_ORDINALS[grade - 1] ?? String(grade);
}

/** الدرجة العظمى الفعلية لصف — 100 لو غابت أو لم تكن موجبة */
export function fullMarkOf(fullMark: number | null | undefined): number {
  return typeof fullMark === 'number' && fullMark > 0 ? fullMark : DEFAULT_FULL_MARK;
}

export function toPct(score: number, fullMark: number): number {
  return (score / fullMark) * 100;
}

/** نسبة الطالب المحفوظة، أو محسوبة من الدرجة الخام لصف قديم بلا pct */
export function studentPct(s: StudentResult, fullMark: number): number {
  return typeof s.pct === 'number' ? s.pct : toPct(s.score, fullMark);
}

/** متوسط التحليل بالنسبة — من averagePct، أو من average لصف قديم */
export function analysisAveragePct(row: ResultsAnalysisRow): number {
  const { averagePct, average } = row.summary;
  return typeof averagePct === 'number' ? averagePct : toPct(average, fullMarkOf(row.full_mark));
}

export function isDangerZone(pct: number): boolean {
  return Math.abs(pct - DANGER_ZONE_CENTER) <= DANGER_ZONE_MARGIN;
}

/** يطابق نسبة الطالب بفئة من grade_bands: أعلى فئة يكون pct ≥ حدها الأدنى.
 *  max_score لا يُستعمل في المطابقة، لأن الحدود أعداد صحيحة والنسبة عشرية
 *  (89.5% تقع بين «جيد جداً» 80–89 و«ممتاز» 90–100، فتذهب إلى «جيد جداً»).
 *  نسبة تحت كل الحدود (غير متوقعة، الأدنى 0) تذهب إلى الفئة الأدنى. */
export function matchBand(pct: number, bands: GradeBand[]): GradeBand | null {
  if (bands.length === 0) return null;
  const byMinDesc = [...bands].sort((a, b) => b.min_score - a.min_score);
  return byMinDesc.find(b => pct >= b.min_score) ?? byMinDesc[byMinDesc.length - 1];
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
  /** صفوف شعبة واحدة بعد التقسيم (splitSections في fileModel.ts) */
  rows: SectionRow[];
  bands: GradeBand[];
  fullMark: number;
  /** صفوف الشعبة من أكثر من ورقة — يُذكر اسم الورقة مع رقم الصف */
  multiSheet?: boolean;
}

export interface ComputeSummaryResult {
  summary: AnalysisSummary;
  /** الصفوف (رقم Excel) التي درجتها أعلى من الدرجة العظمى — غير فارغة تعني منع الحفظ */
  overMaxRows: string[];
  /** صفوف درجتها نص غير رقمي — تُستبعد وتُذكر */
  ignoredRows: string[];
  /** أعلى درجة خام بين الحاضرين، أو null */
  maxScore: number | null;
  /** الاسم مكتوب في الملف (لا ترقيم اصطناعي) */
  hasNames: boolean;
}

/** يبني AnalysisSummary لشعبة واحدة — منطق حسابي بحت، صفر AI. التصنيف كله
 *  بالنسبة؛ الغائبون (خانة فارغة أو «غ/غائب/غياب») خارج students وكل الحسابات. */
export function computeSummary({ rows, bands, fullMark, multiSheet = false }: ComputeSummaryOptions): ComputeSummaryResult {
  const students: StudentResult[] = [];
  const overMaxRows: string[] = [];
  const ignoredRows: string[] = [];
  let absentCount = 0;
  let maxScore: number | null = null;
  let hasNames = false;

  for (const row of rows) {
    const label = multiSheet ? `${row.sheet} ${row.rowNo}` : String(row.rowNo);
    const cell = parseScore(row.scoreRaw);
    if (cell.kind === 'empty') { absentCount++; continue; }
    if (cell.kind === 'invalid') { ignoredRows.push(label); continue; }
    if (cell.score > fullMark) { overMaxRows.push(label); continue; }
    const pct = toPct(cell.score, fullMark);
    const band = matchBand(pct, bands);
    if (!band) { ignoredRows.push(label); continue; }
    if (row.name) hasNames = true;
    maxScore = maxScore === null ? cell.score : Math.max(maxScore, cell.score);
    students.push({
      name: row.name || `طالب ${students.length + 1}`,
      score: cell.score,
      pct,
      bandId: band.id,
      bandLabel: band.label,
      inDangerZone: isDangerZone(pct),
    });
  }

  const bandCounts: Record<string, number> = {};
  for (const b of bands) bandCounts[b.id] = 0;
  for (const s of students) bandCounts[s.bandId] = (bandCounts[s.bandId] ?? 0) + 1;

  const pcts = students.map(s => studentPct(s, fullMark));
  const averagePct = mean(pcts);
  const stdDev = stddev(pcts, averagePct);
  const totalStudents = students.length;
  const highScoreCount = pcts.filter(p => p >= HIGH_SCORE_THRESHOLD).length;
  const highScorePct = totalStudents > 0 ? highScoreCount / totalStudents : 0;

  const inflationDetected = totalStudents >= INFLATION_MIN_SAMPLE &&
    (highScorePct > HIGH_SCORE_INFLATION_PCT || stdDev < LOW_STDDEV_INFLATION_THRESHOLD);

  return {
    summary: {
      students,
      bandCounts,
      average: mean(students.map(s => s.score)),
      averagePct,
      stdDev,
      highScorePct,
      inflationDetected,
      totalStudents,
      absentCount,
      skippedRows: ignoredRows.length,
    },
    overMaxRows,
    ignoredRows,
    maxScore,
    hasNames,
  };
}

// ---------------------------------------------------------------------------
// الفحص قبل الحفظ
// ---------------------------------------------------------------------------

/** أكثر عدد من أرقام الصفوف يُذكر في رسالة */
const MAX_LISTED_ROWS = 10;
/** نسبة الغياب التي يُنبَّه فوقها */
const ABSENT_WARN_RATIO = 0.3;
/** فرق عدد الطلاب عن آخر تحليل للشعبة الذي يُنبَّه فوقه */
const COUNT_CHANGE_WARN_RATIO = 0.3;

/** نص تنبيه تضخم الدرجات كما كان في نافذة الرفع. الشرط inflationDetected
 *  في computeSummary: 5 حاضرين على الأقل، و(أكثر من نصفهم بنسبة ≥95%، أو
 *  الانحراف المعياري أقل من 5 نقاط مئوية). تنبيه لا يمنع الحفظ. */
export const INFLATION_WARNING = 'مؤشرات على تضخم في الدرجات — نسبة عالية من الدرجات المرتفعة جداً أو تكدّس ضعيف. يُنصح بتنويع أدوات التقييم لقياس الفروق الفردية بدقة أكبر.';

export function listRows(rows: string[]): string {
  const shown = rows.slice(0, MAX_LISTED_ROWS).join('، ');
  return rows.length > MAX_LISTED_ROWS ? `${shown}، و${rows.length - MAX_LISTED_ROWS} غيرها` : shown;
}

export interface SectionCheck {
  /** يمنع حفظ هذه الشعبة */
  blockers: string[];
  /** يقرأه المعلم ولا يمنع */
  warnings: string[];
}

/** موانع الحفظ وتنبيهاته لشعبة واحدة. previousCount: عدد الحاضرين في آخر
 *  تحليل للمادة والمرحلة والصف والشعبة نفسها، أو null. */
export function checkSection(result: ComputeSummaryResult, fullMark: number, previousCount: number | null): SectionCheck {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const { summary, overMaxRows, maxScore } = result;
  const absent = summary.absentCount ?? 0;

  if (overMaxRows.length > 0) {
    blockers.push(`درجة أعلى من ${fmtNum(fullMark)} في ${overMaxRows.length === 1 ? 'الصف' : 'الصفوف'} ${listRows(overMaxRows)}`);
  }
  if (summary.totalStudents === 0 && overMaxRows.length === 0) {
    blockers.push('لا حاضرين في هذه الشعبة');
  }

  if (summary.inflationDetected) warnings.push(INFLATION_WARNING);
  if (maxScore !== null && maxScore < fullMark / 2) {
    warnings.push(`أعلى درجة ${fmtNum(maxScore)} والاختبار من ${fmtNum(fullMark)}. هل الدرجة العظمى صحيحة؟`);
  }
  const listed = summary.totalStudents + absent + overMaxRows.length;
  if (listed > 0 && absent / listed > ABSENT_WARN_RATIO) {
    warnings.push(`${absent} من ${listed} بلا درجة. هل هم غائبون؟`);
  }
  if (result.hasNames) {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const s of summary.students) {
      const n = s.name.replace(/\s+/g, ' ').trim();
      if (seen.has(n)) dups.add(n); else seen.add(n);
    }
    if (dups.size > 0) warnings.push(`اسم مكرر في الشعبة: ${Array.from(dups).slice(0, 3).map(n => `«${n}»`).join('، ')}`);
  }
  if (previousCount !== null && previousCount > 0 &&
      Math.abs(summary.totalStudents - previousCount) / previousCount > COUNT_CHANGE_WARN_RATIO) {
    warnings.push(`في هذا الملف ${countAr(summary.totalStudents, AR_STUDENT)}، وفي آخر تحليل لهذه الشعبة في المادة ${countAr(previousCount, AR_STUDENT)}.`);
  }
  return { blockers, warnings };
}

const normSubject = (s: string) => s.trim().toLowerCase();

/** عدد الحاضرين في آخر تحليل للمادة والمرحلة والصف والشعبة (أي اختبار).
 *  analyses مرتبة الأحدث أولاً. */
export function previousSectionCount(
  analyses: ResultsAnalysisRow[],
  key: { subject: string; stage: string; grade: number | null; section: number },
): number | null {
  const hit = analyses.find(a =>
    normSubject(a.subject) === normSubject(key.subject) &&
    a.stage === key.stage &&
    a.grade_level === key.grade &&
    a.class_section === key.section);
  return hit ? hit.summary.totalStudents : null;
}

/** تحليل محفوظ بالمفتاح نفسه (مادة، مرحلة، صف، شعبة، نوع، رقم) — يطابق
 *  الفهرس الفريد results_analysis_unique_test في القاعدة. */
export function findDuplicateAnalysis(
  analyses: ResultsAnalysisRow[],
  key: { subject: string; stage: string; grade: number | null; section: number; testType: string; testSeq: number | null },
): ResultsAnalysisRow | null {
  return analyses.find(a =>
    normSubject(a.subject) === normSubject(key.subject) &&
    a.stage === key.stage &&
    a.grade_level === key.grade &&
    a.class_section === key.section &&
    a.test_type === key.testType &&
    (a.test_seq ?? 0) === (key.testSeq ?? 0)) ?? null;
}

/** يبحث عن آخر تحليل للاختبار نفسه (مادة، مرحلة، صف، نوع، ترتيب) في شعبة
 *  أخرى، لملء الدرجة العظمى تلقائياً. analyses مرتبة الأحدث أولاً. */
export function findSameTestFullMark(
  analyses: ResultsAnalysisRow[],
  key: { subject: string; stage: string; grade: number | null; testType: string; testSeq: number | null; section: number | null },
): { fullMark: number; section: number | null } | null {
  if (!key.subject.trim() || !key.stage || !key.grade || !key.testType) return null;
  const hit = analyses.find(a =>
    a.subject.trim() === key.subject.trim() &&
    a.stage === key.stage &&
    a.grade_level === key.grade &&
    a.test_type === key.testType &&
    (a.test_seq ?? null) === key.testSeq &&
    a.class_section !== key.section &&
    typeof a.full_mark === 'number' && a.full_mark > 0);
  return hit ? { fullMark: hit.full_mark as number, section: hit.class_section } : null;
}

// ---------------------------------------------------------------------------
// التنسيق
// ---------------------------------------------------------------------------

/** منزلة عشرية واحدة، بلا «.0» */
export function fmtNum(n: number): string {
  return String(Math.round(n * 10) / 10);
}

// عزل اتجاه النص داخل السلسلة نفسها (LRI … PDI)، وهو ما يفعله <bdi dir="ltr">،
// لكنه يبقى نصاً، فيعمل في title والتلميحات وصورة التحويل إلى شاهد بلا JSX.
// بدونه تظهر «%73.8» داخل سطر عربي.
const LRI = '⁦';
const PDI = '⁩';
/** مسافة لا ينكسر عندها السطر — تُبقي «27 من 30» كتلة واحدة */
const NBSP = ' ';

/** «73.8%» معزولة الاتجاه، لا تنكسر ولا تنقلب */
export function fmtPct(n: number): string {
  return `${LRI}${fmtNum(n)}%${PDI}`;
}

/** «+5.2%» أو «-3%» معزولة الاتجاه — الإشارة تبقى قبل الرقم */
export function fmtSignedPct(n: number): string {
  return `${LRI}${n >= 0 ? '+' : ''}${fmtNum(n)}%${PDI}`;
}

/** «±5» معزولة الاتجاه */
export function fmtPm(n: number): string {
  return `${LRI}±${fmtNum(n)}${PDI}`;
}

/** «27 من 30 · 90%» — «27 من 30» و«90%» كتلتان لا تنكسران من الداخل،
 *  والانكسار ممكن عند «·» فقط. */
export function formatScore(raw: number, fullMark: number): string {
  return `${LRI}${fmtNum(raw)}${PDI}${NBSP}من${NBSP}${LRI}${fmtNum(fullMark)}${PDI} · ${fmtPct(toPct(raw, fullMark))}`;
}

/** «ثاني متوسط · شعبة 3» — يُسقط الأجزاء الفارغة */
export function formatClass(stage: string | null | undefined, grade: number | null | undefined, section: number | string | null | undefined): string {
  const stageLabel = STAGE_OPTIONS.find(s => s.value === stage)?.label ?? stage ?? '';
  const parts: string[] = [];
  if (stageLabel) parts.push(grade ? `${gradeOrdinal(grade)} ${stageLabel}` : stageLabel);
  if (section !== null && section !== undefined && String(section).trim() !== '') parts.push(`شعبة ${section}`);
  return parts.join(' · ');
}

/** «الفتري الأول» — فارغ لو لم يُحدَّد النوع */
export function formatTest(type: string | null | undefined, seq: number | null | undefined): string {
  const named = TEST_TYPE_OPTIONS.find(t => t.value === type)?.named;
  if (!named) return '';
  return seq ? `${named} ${TEST_SEQ_LABELS[seq - 1] ?? seq}` : named;
}

interface LabelSource {
  subject: string;
  stage: string | null;
  grade_level?: number | null;
  class_section: number | string | null;
  test_type?: string | null;
  test_seq?: number | null;
}

/** «رياضيات · ثاني متوسط · شعبة 3 · الفتري الأول» */
export function analysisSourceLabel(row: LabelSource): string {
  return [row.subject, formatClass(row.stage, row.grade_level, row.class_section), formatTest(row.test_type, row.test_seq)]
    .filter(Boolean)
    .join(' · ');
}

/** «رياضيات · ثاني متوسط · شعبة 3» — عنوان مجموعة المقارنة */
export function classGroupLabel(row: LabelSource): string {
  return [row.subject, formatClass(row.stage, row.grade_level, row.class_section)].filter(Boolean).join(' · ');
}

export function classGroupKey(row: LabelSource): string {
  return [row.subject, row.stage ?? '', row.grade_level ?? '', row.class_section ?? ''].join('|');
}

// ---------------------------------------------------------------------------
// التجميع العلاجي والفجوة
// ---------------------------------------------------------------------------

/** عتبة "القرب من النجاح" ضمن التجميع العلاجي — طالب بنسبة [50, 60) يُعتبر
 *  "قريباً من النجاح"، وأقل من 50 "فجوة أكبر". ثابت تقريبي قابل للتعديل لاحقاً
 *  دون تغيير منطق الحساب (نفس روح DANGER_ZONE_MARGIN أعلاه). */
export const REMEDIAL_NEAR_SUCCESS_THRESHOLD = 50;

export interface RemedialGroups {
  /** نسبة ضمن [50, 60) — قريبون من حد النجاح */
  nearSuccess: StudentResult[];
  /** نسبة أقل من 50 — فجوة أكبر تحتاج خطة أكثر تكثيفاً */
  largerGap: StudentResult[];
}

/** يجمّع الطلاب "الأحوج لعلاج" (فئة "ضعيف" الأدنى، أو ضمن منطقة الخطر) إلى
 *  مجموعتين حسب مسافتهم عن حد النجاح (60%). طالب ضمن منطقة الخطر لكن بنسبة
 *  ≥60 (أي نجح فعلاً) لا يقع في أي من المجموعتين عمداً — التجميع العلاجي
 *  لطلاب لم ينجحوا بعد فقط، وليس تنبيه منطقة الخطر العام (مؤشر منفصل). */
export function groupRemedialStudents(students: StudentResult[], weakBandId: string | undefined, fullMark: number): RemedialGroups {
  const relevant = students.filter(s => s.bandId === weakBandId || s.inDangerZone);
  return {
    nearSuccess: relevant.filter(s => {
      const p = studentPct(s, fullMark);
      return p >= REMEDIAL_NEAR_SUCCESS_THRESHOLD && p < DANGER_ZONE_CENTER;
    }),
    largerGap: relevant.filter(s => studentPct(s, fullMark) < REMEDIAL_NEAR_SUCCESS_THRESHOLD),
  };
}

/** مؤشر الفجوة: الفرق الخام بين أعلى وأدنى درجة بين الحاضرين. */
export function computeScoreGap(students: StudentResult[]): number {
  if (students.length === 0) return 0;
  const scores = students.map(s => s.score);
  return Math.max(...scores) - Math.min(...scores);
}

// ---------------------------------------------------------------------------
// المقارنة
// ---------------------------------------------------------------------------

export interface ComparisonPoint {
  id: string;
  label: string;
  /** متوسط النسب (0-100) */
  average: number;
  createdAt: string;
}

/** تسمية نقطة المقارنة: اسم الاختبار إن وُجد، وإلا التاريخ */
function pointLabel(row: { test_type?: string | null; test_seq?: number | null; created_at: string }): string {
  return formatTest(row.test_type, row.test_seq) || formatDate(row.created_at, 'dayMonth');
}

/** يجمّع التحليلات بالمادة والشعبة معاً (مادة + مرحلة + صف + شعبة) — تبويب
 *  "مقارنة" يظهر لكل مجموعة فيها عنصران فأكثر. */
export function groupAnalysesByClass(analyses: ResultsAnalysisRow[]): Map<string, ResultsAnalysisRow[]> {
  const map = new Map<string, ResultsAnalysisRow[]>();
  for (const a of analyses) {
    const key = classGroupKey(a);
    const list = map.get(key) ?? [];
    list.push(a);
    map.set(key, list);
  }
  return map;
}

/** سلسلة المقارنة الزمنية لمجموعة واحدة بالنسب — مرتبة تصاعدياً بالتاريخ. */
export function buildComparisonSeries(group: ResultsAnalysisRow[]): ComparisonPoint[] {
  return group
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(a => ({
      id: a.id,
      label: pointLabel(a),
      average: analysisAveragePct(a),
      createdAt: a.created_at,
    }));
}

/** فرق بين آخر نقطتين في سلسلة مقارنة (نقاط مئوية)، أو null لو أقل من نقطتين. */
export function comparisonDelta(series: ComparisonPoint[]): { diff: number; improved: boolean } | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].average;
  const prev = series[series.length - 2].average;
  const diff = Math.round((last - prev) * 10) / 10;
  return { diff, improved: diff >= 0 };
}

// ---------------------------------------------------------------------------
// الشكل العام (?share= والمعاينة وتقرير الحصاد)
// ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** يحوّل صفاً داخلياً كاملاً (يحوي أسماء الطلاب عبر summary.students) إلى
 *  الشكل المبسَّط الآمن للعرض العام — لمعاينة المالك لصفحته فقط، ولبناء
 *  لقطة تقرير الحصاد الفصلي. يحسب الحقول كما تحسبها
 *  get_shared_results_analysis() داخل SQL لنمط ?share=، حتى يتطابق العرض. */
export function toPublicResultsAnalysisRow(row: ResultsAnalysisRow): PublicResultsAnalysisRow {
  const fullMark = fullMarkOf(row.full_mark);
  const scores = row.summary.students.map(s => s.score);
  const hasScores = scores.length > 0;
  const avg = mean(scores);
  const min = hasScores ? Math.min(...scores) : 0;
  const max = hasScores ? Math.max(...scores) : 0;
  return {
    id: row.id,
    subject: row.subject,
    stage: row.stage,
    class_section: row.class_section,
    created_at: row.created_at,
    total_students: scores.length,
    average: round2(avg),
    min_score: min,
    max_score: max,
    grade_level: row.grade_level,
    test_type: row.test_type,
    test_seq: row.test_seq,
    full_mark: fullMark,
    absent_count: row.summary.absentCount ?? 0,
    average_pct: round1(toPct(avg, fullMark)),
    min_pct: round1(toPct(min, fullMark)),
    max_pct: round1(toPct(max, fullMark)),
  };
}

/** نسب صف عام — من الحقول المحسوبة، أو من الخام على 100 للقطات القديمة */
export function publicPcts(r: PublicResultsAnalysisRow): { average: number; min: number; max: number; fullMark: number } {
  const fullMark = fullMarkOf(r.full_mark);
  return {
    fullMark,
    average: typeof r.average_pct === 'number' ? r.average_pct : toPct(r.average, fullMark),
    min: typeof r.min_pct === 'number' ? r.min_pct : toPct(r.min_score, fullMark),
    max: typeof r.max_pct === 'number' ? r.max_pct : toPct(r.max_score, fullMark),
  };
}

/** عناصر المقارنة للشكل العام: مجموعة لكل (مادة + مرحلة + صف + شعبة) فيها
 *  تحليلان فأكثر. خاصية subject تحمل عنوان المجموعة الكامل، ويبقى اسمها كما
 *  هو لتوافق frozenResultsComparisons في لقطات الحصاد القديمة. */
export function buildPublicComparisons(rows: PublicResultsAnalysisRow[]): { subject: string; series: ComparisonPoint[] }[] {
  const groups = new Map<string, PublicResultsAnalysisRow[]>();
  for (const r of rows) {
    const key = classGroupKey(r);
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return Array.from(groups.values())
    .filter(list => list.length >= 2)
    .map(list => ({
      subject: classGroupLabel(list[0]),
      series: list
        .slice()
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(r => ({ id: r.id, label: pointLabel(r), average: publicPcts(r).average, createdAt: r.created_at })),
    }));
}
