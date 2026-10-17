import type { FileColumn, FileModel, ModelRow, ModelSheet, RawSheet, SectionGroup, SectionRow, SectionSource, UnresolvedSection } from './types';

/** دوال نقية لفهم ملف الدرجات: صف العناوين، قراءة الدرجة، الأعمدة، الشعب.
 *  بلا React وبلا مكتبات، فتُختبر خارج المتصفح. المبدأ: الأداة تقترح،
 *  والمعلم يؤكد — عند الغموض لا تُختار قيمة. */

/** الشعبة رقم من 1 إلى SECTION_MAX (قيد CHECK في القاعدة) */
export const SECTION_MAX = 50;
/** صف العناوين يُبحث عنه في أول HEADER_SEARCH_ROWS صفوف */
export const HEADER_SEARCH_ROWS = 10;
/** عمود رقمي: هذه النسبة على الأقل من خاناته غير الفارغة أرقام */
const NUMERIC_RATIO = 0.8;
/** «أغلب القيم» */
const MAJORITY = 0.5;

// ---------------------------------------------------------------------------
// الأرقام والدرجة
// ---------------------------------------------------------------------------

/** الأرقام العربية (٠-٩) والفارسية (۰-۹) إلى إنجليزية */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
}

/** كلمات تعني الغياب في خانة الدرجة — تُعامل كالخانة الفارغة */
export const ABSENT_WORDS = ['غ', 'غائب', 'غياب'];

export type ScoreParse =
  | { kind: 'empty' }
  | { kind: 'ok'; score: number; outOf: number | null }
  | { kind: 'invalid' };

/** يقرأ خانة درجة. الفارغة أو «غ/غائب/غياب» = غياب. تُقبل الأرقام العربية
 *  والفارسية، والفاصلة العشرية (24,5 و٢٤٫٥)، وصيغة «18 / 30» (الدرجة 18،
 *  والعظمى المقترحة 30). المسافات (ومنها NBSP) مقبولة في الطرفين وحول «/»
 *  فقط: مسافة بين رقمين («91 18») غير صالحة، فلا يُجمعان في رقم واحد.
 *  غير ذلك (نص، سالب، 1e1) غير صالح. */
export function parseScore(raw: string | undefined): ScoreParse {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '' || ABSENT_WORDS.includes(trimmed)) return { kind: 'empty' };
  const text = normalizeDigits(trimmed).replace(/[٫,]/g, '.');
  const m = /^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?$/.exec(text);
  if (!m) return { kind: 'invalid' };
  const outOf = m[2] !== undefined ? Number(m[2]) : null;
  if (outOf !== null && outOf <= 0) return { kind: 'invalid' };
  return { kind: 'ok', score: Number(m[1]), outOf };
}

/** حضور وغياب وصفوف متجاهلة، بلا حاجة للدرجة العظمى */
export function countPresence(rows: SectionRow[]): { present: number; absent: number; ignored: number } {
  let present = 0, absent = 0, ignored = 0;
  for (const r of rows) {
    const p = parseScore(r.scoreRaw);
    if (p.kind === 'ok') present++;
    else if (p.kind === 'empty') absent++;
    else ignored++;
  }
  return { present, absent, ignored };
}

// ---------------------------------------------------------------------------
// الشعبة
// ---------------------------------------------------------------------------

/** رقم شعبة صالح من نص فيه رقم واحد فقط («شعبة 4»، «٤»، «4-أ»)، أو null */
export function parseSectionValue(value: string): number | null {
  const nums = normalizeDigits(value).match(/\d+/g);
  if (!nums || nums.length !== 1) return null;
  const n = Number(nums[0]);
  return n >= 1 && n <= SECTION_MAX ? n : null;
}

const SECTION_WORD = '(?:ال)?(?:شعبة|فصل)';
const NAME_SEP = '[-–—:|،,]';
/** «شعبة 3 – الاسم» أو «شعبة 3 الاسم» */
const SECTION_IN_NAME_KW = new RegExp(`^\\s*${SECTION_WORD}\\s*(\\d+)\\s*${NAME_SEP}?\\s*(.+)$`);
/** «3 – الاسم» (الفاصل إلزامي بلا كلمة شعبة) */
const SECTION_IN_NAME_NUM = new RegExp(`^\\s*(\\d+)\\s*${NAME_SEP}\\s*(.+)$`);
const HAS_LETTER = /\p{L}/u;

/** يفصل الشعبة عن الاسم في «شعبة N – الاسم» أو «N – الاسم»، أو null.
 *  section الرقم كما كُتب (قد يكون خارج 1..50، فيُعرض على المعلم). */
export function splitSectionFromName(value: string): { section: number; name: string } | null {
  const text = normalizeDigits(value);
  const m = SECTION_IN_NAME_KW.exec(text) ?? SECTION_IN_NAME_NUM.exec(text);
  if (!m) return null;
  const name = m[2].trim();
  if (!HAS_LETTER.test(name)) return null;
  return { section: Number(m[1]), name };
}

// ---------------------------------------------------------------------------
// صف العناوين والأعمدة الحساسة
// ---------------------------------------------------------------------------

const isTextCell = (cell: string) => cell.trim() !== '' && parseScore(cell).kind !== 'ok';

/** أول صف من أول 10 فيه 3 خانات نصية متتالية على الأقل؛ وإلا الصف الذي فيه
 *  أكثر خانات نصية؛ وإلا الأول. يُرجع موضعه في الشبكة. */
export function detectHeaderIndex(grid: string[][]): number {
  const limit = Math.min(grid.length, HEADER_SEARCH_ROWS);
  let best = -1, bestCount = 0;
  for (let i = 0; i < limit; i++) {
    let run = 0, maxRun = 0, count = 0;
    for (const cell of grid[i] ?? []) {
      if (isTextCell(cell)) { run++; count++; maxRun = Math.max(maxRun, run); } else run = 0;
    }
    if (maxRun >= 3) return i;
    if (count > bestCount) { best = i; bestCount = count; }
  }
  return best >= 0 ? best : 0;
}

const SENSITIVE_HEADER = /e-?mail|بريد|(^|[^a-z])id([^a-z]|$)|هوية|جوال|phone|mobile|السجل المدني/i;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONG_DIGITS = /^\d{9,}$/;

/** بريد أو معرّف أو جوال: من العنوان، أو أكثر من نصف القيم بريد أو أرقام طويلة */
function isSensitiveColumn(header: string, values: string[]): boolean {
  if (SENSITIVE_HEADER.test(header)) return true;
  const filled = values.filter(v => v !== '');
  if (filled.length === 0) return false;
  const hits = filled.filter(v => EMAIL_VALUE.test(v) || LONG_DIGITS.test(normalizeDigits(v).replace(/\s+/g, ''))).length;
  return hits / filled.length > MAJORITY;
}

// ---------------------------------------------------------------------------
// إحصاء الأعمدة
// ---------------------------------------------------------------------------

interface ValueStats {
  nonEmpty: number;
  ok: number;
  text: number;
}

function valueStats(values: string[]): ValueStats {
  let nonEmpty = 0, ok = 0, text = 0;
  for (const v of values) {
    const p = parseScore(v);
    if (p.kind === 'empty') continue;
    nonEmpty++;
    if (p.kind === 'ok') ok++; else text++;
  }
  return { nonEmpty, ok, text };
}

const isNumericStats = (s: ValueStats) => s.ok > 0 && s.ok / s.nonEmpty >= NUMERIC_RATIO;

/** 1، 2، 3… (أو 0، 1، 2…) بثلاث قيم على الأقل */
function isSequence(values: string[]): boolean {
  const nums: number[] = [];
  for (const v of values) {
    const p = parseScore(v);
    if (p.kind === 'ok') nums.push(p.score); else if (p.kind === 'invalid') return false;
  }
  if (nums.length < 3 || (nums[0] !== 0 && nums[0] !== 1)) return false;
  return nums.every((n, i) => n === nums[0] + i);
}

/** عنوان يُستبعد من اقتراح عمود الدرجة (ويبقى متاحاً للاختيار) */
const SCORE_EXCLUDE_WORDS = ['الإجابات الصحيحة', 'عدد', 'رقم', 'هوية', 'جوال'];
function headerExcludedFromScore(key: string): boolean {
  const h = key.trim();
  return h === 'م' || SCORE_EXCLUDE_WORDS.some(w => h.includes(w)) || /(^|[^a-z])id([^a-z]|$)/i.test(h);
}

// ---------------------------------------------------------------------------
// بناء النموذج
// ---------------------------------------------------------------------------

/** يبني نموذج الملف من الشبكات الخام. headerRowOverride رقم صف Excel يختاره
 *  المعلم لكل الأوراق، أو null للاكتشاف لكل ورقة. قيم الأعمدة الحساسة لا
 *  تدخل النموذج أصلاً. */
export function buildFileModel(raw: RawSheet[], headerRowOverride: number | null): FileModel {
  const sheets: ModelSheet[] = [];
  const hidden = new Set<string>();
  /** قيم كل عمود عبر الأوراق، وقيمه في كل ورقة (للتسلسل) */
  const colValues = new Map<string, string[]>();
  const colPerSheet = new Map<string, string[][]>();
  const order: string[] = [];

  for (const rs of raw) {
    const grid = rs.grid;
    if (grid.length === 0) {
      sheets.push({ name: rs.name, headerRow: rs.firstRow, columns: [], rows: [], hasScoreLikeColumn: false });
      continue;
    }
    const hIdx = headerRowOverride !== null
      ? Math.min(Math.max(headerRowOverride - rs.firstRow, 0), grid.length - 1)
      : detectHeaderIndex(grid);
    const headerCells = grid[hIdx] ?? [];
    const dataRows = grid.slice(hIdx + 1);
    const width = Math.max(headerCells.length, ...dataRows.map(r => r.length));

    const kept: { j: number; key: string; values: string[] }[] = [];
    const seen = new Map<string, number>();
    for (let j = 0; j < width; j++) {
      const values = dataRows.map(r => String(r[j] ?? '').trim());
      const header = String(headerCells[j] ?? '').trim();
      if (header === '' && values.every(v => v === '')) continue;
      const base = header || `عمود ${j + 1}`;
      if (isSensitiveColumn(base, values)) { hidden.add(base); continue; }
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      kept.push({ j, key: n === 1 ? base : `${base} (${n})`, values });
    }

    const rows: ModelRow[] = [];
    dataRows.forEach((r, k) => {
      // صف فارغ كله (ومنه الأعمدة الحساسة) ليس طالباً
      if (r.every(c => String(c ?? '').trim() === '')) return;
      const cells: Record<string, string> = {};
      for (const c of kept) cells[c.key] = c.values[k];
      rows.push({ rowNo: rs.firstRow + hIdx + 1 + k, cells });
    });

    let hasScoreLikeColumn = false;
    for (const c of kept) {
      const sheetVals = rows.map(r => r.cells[c.key]);
      if (!colValues.has(c.key)) { colValues.set(c.key, []); colPerSheet.set(c.key, []); order.push(c.key); }
      colValues.get(c.key)!.push(...sheetVals);
      colPerSheet.get(c.key)!.push(sheetVals);
      if (!hasScoreLikeColumn && isNumericStats(valueStats(sheetVals)) && !headerExcludedFromScore(c.key) && !isSequence(sheetVals)) {
        hasScoreLikeColumn = true;
      }
    }
    sheets.push({ name: rs.name, headerRow: rs.firstRow + hIdx, columns: kept.map(c => c.key), rows, hasScoreLikeColumn });
  }

  const columns: FileColumn[] = order.map(key => {
    const values = colValues.get(key)!;
    const stats = valueStats(values);
    const perSheet = colPerSheet.get(key)!.filter(v => v.filter(x => x !== '').length >= 3);
    const filled = values.filter(v => v !== '');
    const sectionHits = filled.filter(v => splitSectionFromName(v) !== null).length;
    return {
      key,
      numeric: isNumericStats(stats),
      sequence: perSheet.length > 0 && perSheet.every(isSequence),
      textual: stats.text > 0 && stats.text / stats.nonEmpty >= MAJORITY,
      sectionInNameRatio: filled.length > 0 ? sectionHits / filled.length : 0,
      samples: filled.slice(0, 2),
    };
  });

  const firstGrade = sheets.find(s => s.hasScoreLikeColumn) ?? sheets[0];
  return {
    sheets,
    columns,
    headerRow: headerRowOverride ?? firstGrade?.headerRow ?? 1,
    hiddenColumns: hidden.size,
    totalRows: sheets.reduce((n, s) => n + s.rows.length, 0),
  };
}

// ---------------------------------------------------------------------------
// الاقتراحات
// ---------------------------------------------------------------------------

const SCORE_KEYWORDS = ['درجة', 'المجموع', 'مجموع', 'total points', 'score', 'النتيجة', 'total'];
const NAME_KEYWORDS = ['اسم', 'الطالب', 'name'];
const SECTION_KEYWORDS = ['شعبة', 'فصل', 'section'];
const OUT_OF = /من\s*(\d+(?:[.,]\d+)?)|\/\s*(\d+(?:[.,]\d+)?)/;

/** «الدرجة من 30» أو «Score /30» ← 30 */
export function fullMarkFromHeader(key: string): number | null {
  const m = OUT_OF.exec(normalizeDigits(key));
  if (!m) return null;
  const n = Number((m[1] ?? m[2]).replace(',', '.'));
  return n > 0 ? n : null;
}

export function isScoreExcluded(col: FileColumn): boolean {
  return headerExcludedFromScore(col.key) || col.sequence;
}

/** عمود الدرجة المقترح، أو null عند الغموض. انظر الخطة: المرشحون الأعمدة
 *  الرقمية غير المستبعدة التي في عنوانها كلمة درجة؛ ويُفضَّل منها «من N»
 *  أو Total؛ ولا اختيار إن بقي أكثر من واحد. */
export function suggestScoreColumn(model: FileModel): string | null {
  const keyword = model.columns.filter(c => c.numeric && !isScoreExcluded(c) &&
    SCORE_KEYWORDS.some(k => c.key.toLowerCase().includes(k)));
  const preferred = keyword.filter(c => fullMarkFromHeader(c.key) !== null || /total/i.test(c.key));
  if (preferred.length === 1) return preferred[0].key;
  if (preferred.length === 0 && keyword.length === 1) return keyword[0].key;
  return null;
}

/** عمود الاسم المقترح. أولاً: عمود نصي أكثر من نصف قيمه «شعبة N – الاسم»
 *  (يُفحص على كل الأعمدة النصية، فيُحسم به تعدد أعمدة الاسم كما في Forms)،
 *  ومعه sectionInName. وإلا: العمود النصي الوحيد الذي في عنوانه كلمة اسم. */
export function suggestNameColumn(model: FileModel, scoreCol: string | null): { nameCol: string | null; sectionInName: boolean } {
  const text = model.columns.filter(c => c.textual && c.key !== scoreCol);
  const withSection = text.filter(c => c.sectionInNameRatio > MAJORITY).sort((a, b) => b.sectionInNameRatio - a.sectionInNameRatio);
  if (withSection.length > 0) return { nameCol: withSection[0].key, sectionInName: true };
  const keyword = text.filter(c => NAME_KEYWORDS.some(k => c.key.toLowerCase().includes(k)));
  return { nameCol: keyword.length === 1 ? keyword[0].key : null, sectionInName: false };
}

/** أعمدة يمكن أن تكون الشعبة (عنوانها فيه شعبة/فصل/Section)، بلا الدرجة والاسم */
export function sectionColumnCandidates(model: FileModel, scoreCol: string | null, nameCol: string | null): string[] {
  return model.columns
    .filter(c => c.key !== scoreCol && c.key !== nameCol && SECTION_KEYWORDS.some(k => c.key.toLowerCase().includes(k)))
    .map(c => c.key);
}

export interface SheetStatus {
  name: string;
  included: boolean;
  /** سبب التخطي، أو null */
  reason: string | null;
  rows: number;
}

/** الورقة تدخل إن كان فيها عمود الدرجة المختار (ولو فارغاً كله). وإلا
 *  تُذكر بسببها: لا درجات أصلاً، أو لا يوجد فيها العمود المختار. قبل اختيار
 *  عمود الدرجة: ورقة فيها عمود رقمي صالح تُعدّ ورقة درجات. */
export function sheetStatuses(model: FileModel, scoreCol: string | null): SheetStatus[] {
  return model.sheets.map(s => {
    const base = { name: s.name, rows: s.rows.length };
    if (scoreCol && s.columns.includes(scoreCol)) return { ...base, included: true, reason: null };
    if (!s.hasScoreLikeColumn) return { ...base, included: false, reason: 'لا درجات' };
    if (scoreCol) return { ...base, included: false, reason: `لا يوجد عمود «${scoreCol}» في هذه الورقة` };
    return { ...base, included: true, reason: null };
  });
}

/** المصادر المتاحة للشعبة */
export function sectionSourceAvailability(model: FileModel, scoreCol: string | null, nameCol: string | null): Record<SectionSource, boolean> {
  const included = sheetStatuses(model, scoreCol).filter(s => s.included);
  const nameColumn = model.columns.find(c => c.key === nameCol);
  return {
    column: model.columns.some(c => c.key !== scoreCol),
    name: !!nameColumn && nameColumn.sectionInNameRatio > MAJORITY,
    sheets: included.length > 1 && included.every(s => parseSectionValue(s.name) !== null),
    single: true,
  };
}

/** المصدر المقترح: داخل الاسم، ثم عمود شعبة، ثم أسماء الأوراق، ثم شعبة واحدة */
export function suggestSectionSource(model: FileModel, scoreCol: string | null, nameCol: string | null): { source: SectionSource; column: string | null } {
  const avail = sectionSourceAvailability(model, scoreCol, nameCol);
  if (avail.name) return { source: 'name', column: null };
  const cols = sectionColumnCandidates(model, scoreCol, nameCol);
  if (cols.length > 0) return { source: 'column', column: cols[0] };
  if (avail.sheets) return { source: 'sheets', column: null };
  return { source: 'single', column: null };
}

/** الدرجة العظمى من الملف نفسه: من عنوان عمود الدرجة، وإلا أكثر قاسم
 *  تكراراً في خانات «18 / 30». */
export function fileFullMark(model: FileModel, scoreCol: string | null): { value: number; source: 'header' | 'cells' } | null {
  if (!scoreCol) return null;
  const fromHeader = fullMarkFromHeader(scoreCol);
  if (fromHeader !== null) return { value: fromHeader, source: 'header' };
  const counts = new Map<number, number>();
  for (const s of model.sheets) {
    if (!s.columns.includes(scoreCol)) continue;
    for (const r of s.rows) {
      const p = parseScore(r.cells[scoreCol]);
      if (p.kind === 'ok' && p.outOf !== null) counts.set(p.outOf, (counts.get(p.outOf) ?? 0) + 1);
    }
  }
  let best: number | null = null, bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best !== null ? { value: best, source: 'cells' } : null;
}

// ---------------------------------------------------------------------------
// التقسيم إلى شعب
// ---------------------------------------------------------------------------

export interface SplitOptions {
  scoreCol: string;
  nameCol: string | null;
  source: SectionSource;
  sectionCol: string | null;
  singleSection: number | null;
  /** رقم الشعبة الذي حدده المعلم لكل قيمة غير مفهومة (UnresolvedSection.key) */
  manual: Record<string, number>;
}

/** يقسّم صفوف الأوراق المشمولة إلى شعب. صف الطالب: فيه اسم أو درجة (أو، بلا
 *  عمود اسم، أي خانة غير عمود تسلسل). الاسم يُنظَّف من «شعبة N –» دائماً. */
export function splitSections(model: FileModel, opts: SplitOptions): { groups: SectionGroup[]; unresolved: UnresolvedSection[] } {
  const groups = new Map<number, SectionGroup>();
  const unresolved = new Map<string, UnresolvedSection>();
  const seqCols = new Set(model.columns.filter(c => c.sequence).map(c => c.key));
  if (opts.source === 'single' && opts.singleSection === null) return { groups: [], unresolved: [] };

  for (const sheet of model.sheets) {
    if (!sheet.columns.includes(opts.scoreCol)) continue;
    for (const row of sheet.rows) {
      const scoreRaw = row.cells[opts.scoreCol] ?? '';
      const rawName = opts.nameCol ? (row.cells[opts.nameCol] ?? '').trim() : '';
      if (opts.nameCol) {
        if (rawName === '' && scoreRaw.trim() === '') continue;
      } else if (!Object.entries(row.cells).some(([k, v]) => v.trim() !== '' && !seqCols.has(k))) {
        continue;
      }

      const split = rawName ? splitSectionFromName(rawName) : null;
      const name = split ? split.name : rawName;
      let section: number | null = null;
      let key = '';
      let label = '';
      if (opts.source === 'column') {
        const v = opts.sectionCol ? (row.cells[opts.sectionCol] ?? '').trim() : '';
        section = parseSectionValue(v);
        key = `c:${v}`; label = v || '(فارغة)';
      } else if (opts.source === 'name') {
        if (split) {
          section = split.section >= 1 && split.section <= SECTION_MAX ? split.section : null;
          key = `n#${split.section}`; label = `شعبة ${split.section}`;
        } else {
          key = `n:${rawName}`; label = rawName || '(بلا اسم)';
        }
      } else if (opts.source === 'sheets') {
        section = parseSectionValue(sheet.name);
        key = `s:${sheet.name}`; label = sheet.name;
      } else {
        section = opts.singleSection;
      }

      if (section === null) section = opts.manual[key] ?? null;
      if (section === null) {
        const u = unresolved.get(key) ?? { key, label, count: 0 };
        u.count++;
        unresolved.set(key, u);
        continue;
      }
      const g = groups.get(section) ?? { section, rows: [], sheets: [] };
      g.rows.push({ rowNo: row.rowNo, sheet: sheet.name, name, scoreRaw } satisfies SectionRow);
      if (!g.sheets.includes(sheet.name)) g.sheets.push(sheet.name);
      groups.set(section, g);
    }
  }
  return {
    groups: Array.from(groups.values()).sort((a, b) => a.section - b.section),
    unresolved: Array.from(unresolved.values()),
  };
}

// ---------------------------------------------------------------------------
// الإدخال السريع (لصق أو كتابة)
// ---------------------------------------------------------------------------

/** عمودا النموذج الذي يبنيه الإدخال السريع — يمر بعدها بمسار الملف نفسه */
export const QUICK_NAME_COL = 'الاسم';
export const QUICK_SCORE_COL = 'الدرجة';

const QUICK_SEP = /[\t,،\-–—\s]/;

/** يقسم سطراً إلى اسم ودرجة. الدرجة: الجزء الأخير الذي تقرؤه parseScore
 *  كاملاً (رقم أو كلمة غياب)، ويسبقه فاصل (Tab، فاصلة، شرطة، مسافة) وقبله
 *  حرف. تُجرَّب الفواصل من أول السطر، ويُؤخذ أول فاصل يجعل ما بعده درجة.
 *  بلا ذلك: Tab أخير بعده فراغ = اسم غائب (لصق Excel)، وإلا السطر كله درجة. */
export function splitQuickLine(line: string): { name: string; scoreRaw: string } {
  const text = line.trim();
  const cleanName = (s: string) => s.split('\t').map(c => c.trim()).filter(c => HAS_LETTER.test(c)).join(' ')
    .replace(/[\s,،\-–—]+$/, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < text.length; i++) {
    if (!QUICK_SEP.test(text[i])) continue;
    const left = text.slice(0, i);
    const right = text.slice(i + 1).trim();
    if (!right || !HAS_LETTER.test(left)) continue;
    if (parseScore(right).kind !== 'invalid') return { name: cleanName(left), scoreRaw: right };
  }
  const lastTab = line.lastIndexOf('\t');
  if (lastTab >= 0 && line.slice(lastTab + 1).trim() === '' && HAS_LETTER.test(line.slice(0, lastTab))) {
    return { name: cleanName(line.slice(0, lastTab)), scoreRaw: '' };
  }
  return { name: '', scoreRaw: text };
}

/** نموذج ملف من مربع النص: ورقة واحدة، صف عناوين ثم سطر لكل سطر، فرقم
 *  الصف هو رقم السطر، والسطر الفارغ يسقط في buildFileModel. */
export function quickEntryModel(text: string): FileModel {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const grid = [[QUICK_NAME_COL, QUICK_SCORE_COL], ...lines.map(l => {
    if (l.trim() === '') return ['', ''];
    const { name, scoreRaw } = splitQuickLine(l);
    return [name, scoreRaw];
  })];
  return buildFileModel([{ name: '', firstRow: 0, grid }], 0);
}

/** سطر الحالة تحت المربع: الدرجات، والغائبون، والأسطر المتجاهلة */
export function quickEntryStatus(model: FileModel): { present: number; absent: number; ignoredLines: string[] } {
  let present = 0, absent = 0;
  const ignoredLines: string[] = [];
  for (const s of model.sheets) {
    for (const r of s.rows) {
      const p = parseScore(r.cells[QUICK_SCORE_COL]);
      if (p.kind === 'ok') present++;
      else if (p.kind === 'empty') absent++;
      else ignoredLines.push(String(r.rowNo));
    }
  }
  return { present, absent, ignoredLines };
}
