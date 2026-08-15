import type { GradeBand, AnalysisSummary, StudentResult, ColumnDetectionResult, ParsedFile } from './types';

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
