import type { GradeBand, AnalysisSummary, BandCount, StudentResult, ResultsAnalysisRow, PublicResultsAnalysisRow, SectionRow, StageCode, TestTypeCode } from './types';
import { AR_STUDENT, countAr, formatDate } from '../../utils';
import { parseScore } from './fileModel';

export { SECTION_MAX } from './fileModel';

/** كل الحدود أدناه نسب مئوية (0-100) لا درجات خام: الدرجة تُحوَّل أولاً إلى
 *  score / full_mark × 100، ثم تُصنَّف. */

/** هامش "منطقة الخطر" حول حد النجاح (60%) — طالب بنسبة ضمن [55,65] يُعتبر في
 *  منطقة خطر. ثابت الآن، قابل للتعديل لاحقاً دون تغيير منطق الحساب. */
export const DANGER_ZONE_MARGIN = 5;
export const DANGER_ZONE_CENTER = 60;
/** حد النجاح — pass_count في get_shared_results_analysis يستعمل 60 نفسها */
export const PASS_PCT = DANGER_ZONE_CENTER;

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

// ---------------------------------------------------------------------------
// أسماء المواد: الاقتراح والمطابقة القريبة
// ---------------------------------------------------------------------------

/** للمقارنة فقط، لا للحفظ: بلا تشكيل ولا تطويل، وأ إ آ ٱ ← ا، ى ← ي،
 *  ة ← ه، و«ال» محذوفة من أول كل كلمة، ومسافة واحدة بين الكلمات. */
export function normalizeSubject(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => (w.startsWith('ال') && w.length - 2 >= 2 ? w.slice(2) : w))
    .join(' ')
    .toLowerCase();
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** أطول اسم مختصر يُقبل أن يبدأ به اسم آخر */
const SUBJECT_PREFIX_MIN = 4;
/** أكبر مسافة تحرير كلية بين اسمين قريبين */
const SUBJECT_MAX_DISTANCE = 2;

/** قريبان إن: تطابقا بعد التطبيع؛ أو بدأ أحدهما بالآخر والأقصر 4 أحرف
 *  فأكثر؛ أو تساوى عدد الكلمات، والمسافة الكلية ≤ 2، وكل كلمة مختلفة
 *  مسافتها ≤ ربع طول الأطول منهما (فلا تُخلط «تربية فنية» و«تربية بدنية»). */
export function isSimilarSubject(a: string, b: string): boolean {
  const na = normalizeSubject(a);
  const nb = normalizeSubject(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= SUBJECT_PREFIX_MIN && long.startsWith(short)) return true;
  const wa = na.split(' ');
  const wb = nb.split(' ');
  if (wa.length !== wb.length) return false;
  let total = 0;
  for (let i = 0; i < wa.length; i++) {
    if (wa[i] === wb[i]) continue;
    const d = editDistance(wa[i], wb[i]);
    if (d > Math.floor(Math.max(wa[i].length, wb[i].length) / 4)) return false;
    total += d;
  }
  return total <= SUBJECT_MAX_DISTANCE;
}

/** المواد التي استعملها المعلم، بلا تكرار، الأحدث أولاً (analyses مرتبة كذلك) */
export function subjectSuggestions(analyses: { subject: string }[]): string[] {
  const out: string[] = [];
  for (const a of analyses) {
    const s = a.subject.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** أول مادة محفوظة قريبة من المكتوب، أو null إن كان فارغاً أو مطابقاً حرفياً لمادة */
export function findSimilarSubject(input: string, subjects: string[]): string | null {
  const t = input.trim();
  if (!t || subjects.some(s => s.trim() === t)) return null;
  return subjects.find(s => isSimilarSubject(t, s)) ?? null;
}

/** تحليلات تحمل اسم المادة نفسه (بمطابقة منع التكرار) */
export function analysesWithSubject(analyses: ResultsAnalysisRow[], subject: string): ResultsAnalysisRow[] {
  return analyses.filter(a => normSubject(a.subject) === normSubject(subject));
}

/** تطبيق اسم جديد على مجموعة تحليلات: أي تحليل خارجها يطابق مفتاح أحدها
 *  بعد التغيير. edited: التحليل المعدَّل بمفتاحه الجديد كاملاً. */
export function findRenameConflicts(
  analyses: ResultsAnalysisRow[],
  group: ResultsAnalysisRow[],
  newSubject: string,
  edited: { id: string; stage: string; grade: number; section: number; testType: string; testSeq: number | null },
): ResultsAnalysisRow[] {
  const ids = new Set(group.map(g => g.id));
  ids.add(edited.id);
  const outside = analyses.filter(a => !ids.has(a.id));
  const conflicts: ResultsAnalysisRow[] = [];
  for (const g of group) {
    const key = g.id === edited.id
      ? { subject: newSubject, stage: edited.stage, grade: edited.grade, section: edited.section, testType: edited.testType, testSeq: edited.testSeq }
      : { subject: newSubject, stage: g.stage ?? '', grade: g.grade_level, section: g.class_section ?? 0, testType: g.test_type ?? '', testSeq: g.test_seq };
    const hit = findDuplicateAnalysis(outside, key);
    if (hit && !conflicts.includes(hit)) conflicts.push(hit);
    // بعد التطبيق يحمل الكل الاسم نفسه، فيتعارض عضو يطابق التحليل المعدَّل
    if (g.id !== edited.id && g.stage === edited.stage && g.grade_level === edited.grade &&
        g.class_section === edited.section && g.test_type === edited.testType &&
        (g.test_seq ?? 0) === (edited.testSeq ?? 0) && !conflicts.includes(g)) {
      conflicts.push(g);
    }
  }
  return conflicts;
}

/** يعيد حساب التحليل بدرجة عظمى جديدة من الدرجات الخام المحفوظة، عبر
 *  computeSummary نفسها. يُمنع إن كانت درجة أعلى من القيمة الجديدة. */
export function recomputeForFullMark(
  summary: AnalysisSummary,
  bands: GradeBand[],
  newFullMark: number,
): { summary: AnalysisSummary } | { error: string } {
  const scores = summary.students.map(s => s.score);
  const maxScore = scores.length > 0 ? Math.max(...scores) : null;
  if (maxScore !== null && maxScore > newFullMark) {
    return { error: `أعلى درجة في هذه الشعبة ${fmtNum(maxScore)}، فلا يمكن أن تكون الدرجة العظمى ${fmtNum(newFullMark)}.` };
  }
  const rows: SectionRow[] = summary.students.map((s, i) => ({ rowNo: i + 1, sheet: '', name: s.name, scoreRaw: String(s.score) }));
  for (let i = 0; i < (summary.absentCount ?? 0); i++) rows.push({ rowNo: rows.length + 1, sheet: '', name: '', scoreRaw: '' });
  const result = computeSummary({ rows, bands, fullMark: newFullMark });
  return { summary: { ...result.summary, skippedRows: summary.skippedRows } };
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
 *  get_shared_results_analysis() داخل SQL لنمط ?share=، حتى يتطابق العرض.
 *  bands: بها يُحسب band_counts (من الدرجة الخام كما في SQL)؛ بدونها يُترك. */
export function toPublicResultsAnalysisRow(row: ResultsAnalysisRow, bands?: GradeBand[]): PublicResultsAnalysisRow {
  const fullMark = fullMarkOf(row.full_mark);
  const scores = row.summary.students.map(s => s.score);
  const hasScores = scores.length > 0;
  const avg = mean(scores);
  const min = hasScores ? Math.min(...scores) : 0;
  const max = hasScores ? Math.max(...scores) : 0;
  let bandCounts: BandCount[] | null = null;
  if (bands && bands.length > 0) {
    const ordered = [...bands].sort((a, b) => a.display_order - b.display_order);
    const counts = new Map<string, number>(ordered.map(b => [b.id, 0]));
    for (const sc of scores) {
      const band = matchBand(toPct(sc, fullMark), ordered);
      if (band) counts.set(band.id, (counts.get(band.id) ?? 0) + 1);
    }
    bandCounts = ordered.map(b => ({ label: b.label, count: counts.get(b.id) ?? 0 }));
  }
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
    pass_count: scores.filter(sc => toPct(sc, fullMark) >= PASS_PCT).length,
    ...(bandCounts ? { band_counts: bandCounts } : {}),
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

// ---------------------------------------------------------------------------
// الصفحة العامة: الاختبار وحدة العرض، ومقارنة الشعب
// ---------------------------------------------------------------------------

/** فرق النقاط بين أعلى شعبة وأدناها الذي يُذكر عنده سطر الفرق */
export const SECTION_GAP_NOTE = 15;

export interface PublicTestSection {
  row: PublicResultsAnalysisRow;
  /** متوسط النسب (0-100) */
  averagePct: number;
  isTop: boolean;
  isBottom: boolean;
}

export interface PublicTestSummary {
  present: number;
  absent: number;
  /** متوسط مرجّح بعدد الحاضرين: Σ(nᵢ × pᵢ) ÷ Σ nᵢ */
  averagePct: number;
  /** null إن غاب pass_count عن أي شعبة (لقطة قديمة) */
  passPct: number | null;
  /** null إن غاب band_counts عن أي شعبة */
  bands: BandCount[] | null;
  /** max(pᵢ) − min(pᵢ) مقرَّباً */
  gap: number;
}

export interface PublicTestGroup {
  key: string;
  /** المادة كما كُتبت في أحدث شعبة */
  subject: string;
  stage: string | null;
  grade: number | null;
  testType: string | null;
  testSeq: number | null;
  /** الدرجة العظمى إن اتفقت كل الشعب، وإلا null */
  fullMark: number | null;
  latest: string;
  /** مرتبة برقم الشعبة */
  sections: PublicTestSection[];
  /** null لاختبار بشعبة واحدة */
  comparison: PublicTestSummary | null;
}

const sectionNumber = (r: PublicResultsAnalysisRow) => {
  const n = Number(r.class_section);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

/** أرقام «كل الشعب» لاختبار — مجمّعة من صفوف الشعب وحدها */
export function summarizeTest(rows: PublicResultsAnalysisRow[]): PublicTestSummary {
  const present = rows.reduce((n, r) => n + (r.total_students ?? 0), 0);
  const absent = rows.reduce((n, r) => n + (r.absent_count ?? 0), 0);
  const pcts = rows.map(r => publicPcts(r).average);
  const weighted = present > 0
    ? rows.reduce((s, r, i) => s + (r.total_students ?? 0) * pcts[i], 0) / present
    : 0;
  const hasPass = rows.every(r => typeof r.pass_count === 'number');
  const passPct = hasPass && present > 0
    ? rows.reduce((n, r) => n + (r.pass_count as number), 0) / present * 100
    : null;
  let bands: BandCount[] | null = null;
  if (rows.every(r => Array.isArray(r.band_counts) && r.band_counts.length > 0)) {
    const order: string[] = [];
    const totals = new Map<string, number>();
    for (const r of rows) {
      for (const b of r.band_counts as BandCount[]) {
        if (!totals.has(b.label)) { order.push(b.label); totals.set(b.label, 0); }
        totals.set(b.label, (totals.get(b.label) ?? 0) + (Number(b.count) || 0));
      }
    }
    bands = order.map(label => ({ label, count: totals.get(label) ?? 0 }));
  }
  const gap = pcts.length > 0 ? Math.round(Math.max(...pcts) - Math.min(...pcts)) : 0;
  return { present, absent, averagePct: weighted, passPct, bands, gap };
}

/** يجمّع صفوف الصفحة العامة في اختبارات: المادة (normalizeSubject) + المرحلة
 *  + الصف + نوع الاختبار + رقمه. الأحدث أولاً؛ والشعب برقمها. */
export function groupPublicTests(rows: PublicResultsAnalysisRow[]): PublicTestGroup[] {
  const map = new Map<string, PublicResultsAnalysisRow[]>();
  for (const r of rows) {
    const key = [normalizeSubject(r.subject), r.stage ?? '', r.grade_level ?? '', r.test_type ?? '', r.test_seq ?? ''].join('|');
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  const time = (r: PublicResultsAnalysisRow) => new Date(r.created_at).getTime();
  return Array.from(map.entries()).map(([key, list]) => {
    const newest = list.reduce((a, b) => (time(b) > time(a) ? b : a));
    const sorted = [...list].sort((a, b) => sectionNumber(a) - sectionNumber(b));
    const marks = new Set(sorted.map(r => fullMarkOf(r.full_mark)));
    const pcts = sorted.map(r => publicPcts(r).average);
    const multi = sorted.length >= 2;
    const hi = Math.max(...pcts);
    const lo = Math.min(...pcts);
    const distinct = multi && hi !== lo;
    return {
      key,
      subject: newest.subject,
      stage: newest.stage,
      grade: newest.grade_level ?? null,
      testType: newest.test_type ?? null,
      testSeq: newest.test_seq ?? null,
      fullMark: marks.size === 1 ? Array.from(marks)[0] : null,
      latest: newest.created_at,
      sections: sorted.map((row, i) => ({
        row,
        averagePct: pcts[i],
        isTop: distinct && pcts[i] === hi,
        isBottom: distinct && pcts[i] === lo,
      })),
      comparison: multi ? summarizeTest(sorted) : null,
    };
  }).sort((a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime());
}

/** «ثالث ثانوي · الفتري الأول · من 30» — الرأس بعد اسم المادة. «من N» فقط
 *  إن اتفقت الدرجة العظمى في كل الشعب. */
export function publicTestMeta(g: PublicTestGroup): string {
  return [formatClass(g.stage, g.grade, null), formatTest(g.testType, g.testSeq), g.fullMark !== null ? `من ${fmtNum(g.fullMark)}` : '']
    .filter(Boolean).join(' · ');
}

/** «مهارات بحث · ثالث ثانوي · الفتري الأول · من 30» */
export function publicTestTitle(g: PublicTestGroup): string {
  return [g.subject, publicTestMeta(g)].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// سلّم ألوان الفئات (DESIGN.md): الأخضر بدرجات، ثم --warn، ثم --danger للأضعف
// ---------------------------------------------------------------------------

export interface BandTone {
  /** متغير اللون الكامل */
  base: '--accent' | '--warn' | '--danger';
  /** 1 للكامل، وأقل لدرجات الأخضر */
  opacity: number;
}

/** أدنى شفافية لدرجات الأخضر */
const GREEN_MIN_OPACITY = 0.35;

/** لون الفئة بموضعها (0 = الأقوى). الأخيرة --danger، وقبلها --warn، والباقي
 *  أخضر تتناقص شفافيته بالتساوي من 1 إلى 0.35. */
export function bandTone(index: number, count: number): BandTone {
  if (count <= 1) return { base: '--accent', opacity: 1 };
  if (index >= count - 1) return { base: '--danger', opacity: 1 };
  if (count >= 3 && index === count - 2) return { base: '--warn', opacity: 1 };
  const greens = count >= 3 ? count - 2 : count - 1;
  // الحالة الفعلية (5 فئات): 1 و0.65 و0.35 كما في الخطة
  if (greens === 3) return { base: '--accent', opacity: [1, 0.65, GREEN_MIN_OPACITY][index] };
  const step = greens > 1 ? (1 - GREEN_MIN_OPACITY) / (greens - 1) : 0;
  return { base: '--accent', opacity: Math.round((1 - index * step) * 100) / 100 };
}

/** للـ HTML: var() أو color-mix */
export function bandCss(t: BandTone): string {
  return t.opacity >= 1 ? `var(${t.base})` : `color-mix(in srgb, var(${t.base}) ${Math.round(t.opacity * 100)}%, transparent)`;
}

/** لون نص الدرجة: درجات الأخضر الخافتة ضعيفة التباين نصاً، فتُكتب بـ --t1 */
export function bandTextCss(t: BandTone): string {
  return t.opacity >= 1 ? `var(${t.base})` : 'var(--t1)';
}
