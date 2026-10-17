import type { AcademicDate, AppState, SectionData, UserProfile } from './types';
import type { EvidenceType } from './hooks/useSupabaseEvidence';

// القيمة الافتراضية التي يضعها trigger قاعدة البيانات (handle_new_user) للحسابات
// الجديدة التي لم تُكمّل بياناتها بعد — تُستخدم لتمييز الملف "الناقص" عن "المكتمل".
const UNSET_PLACEHOLDER = 'غير محدد';

// نص الموافقة الموحّد لكل ميزات الذكاء الاصطناعي التجريبية (اقتراح الصورة،
// التوثيق الصوتي، ...) — يظهر مرة واحدة فقط لكل حساب (aiSuggestConsentAt في
// AppState) بصرف النظر عن أي ميزة استدعته أولاً.
export const AI_CONSENT_TEXT =
  'هذه ميزة تجريبية (Beta) تستخدم نموذج ذكاء اصطناعي خارجي (Google Gemini) لمعالجة الملفات التي ترفعها ضمن هذه الميزة. ' +
  'يرجى توخي الحذر عند الرفع وعدم تضمين أي معلومات أو صور أو تسجيلات صوتية تحتوي على بيانات تعريفية لطلاب.';

export const isProfileIncomplete = (profile: UserProfile): boolean => {
  return (
    !profile.name?.trim() ||
    !profile.role?.trim() || profile.role.trim() === UNSET_PLACEHOLDER ||
    !profile.school?.trim() || profile.school.trim() === UNSET_PLACEHOLDER
  );
};

export const getCompletionLabel = (pct: number): string => {
  if (pct >= 70) return 'متقدم';
  if (pct >= 35) return 'في التقدم';
  return 'يحتاج عمل';
};

/** true إذا كان تاريخ اليوم ضمن آخر 5 أيام من الشهر الميلادي الحالي */
export const isLastDaysOfMonth = (): boolean => {
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return lastDayOfMonth - today.getDate() < 5;
};

/** أقرب موعد دراسي قادم ضمن daysAhead يوماً من اليوم، أو null إن لم يوجد */
export const upcomingAcademicDate = (dates: AcademicDate[], daysAhead = 7): AcademicDate | null => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + daysAhead);

  const upcoming = dates
    .filter(d => {
      const dDate = new Date(d.date);
      return dDate >= today && dDate <= horizon;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return upcoming[0] ?? null;
};

/** صف شهري خام (بصرف النظر عن القسم) — يُستخدم كمدخل موحّد لـcalculatePointsLevel
 * سواء أتى من useMonthlyProgress.rows (لوحة التحكم) أو من ContinuityData.activeMonths
 * (صفحة المشاركة عبر get_shared_monthly_progress). التكرار عبر أقسام لنفس الشهر
 * غير مشكلة — الدالة تجمع كل الصفوف ضمن نافذة الأشهر الثلاثة بصرف النظر عن مصدرها. */
export interface MonthlyPointsEntry {
  year: number;
  month: number;
  evidenceCount: number;
}

export type PointsLevelId = 'steady' | 'confident' | 'exemplary';

export interface PointsLevelInfo {
  points: number;
  levelId: PointsLevelId;
  levelLabel: string;
  levelIcon: string;
  /** الحد الأدنى للمستوى التالي، أو null إن كان في أعلى مستوى بالفعل */
  nextThreshold: number | null;
  pointsToNext: number | null;
  /** 0-100، أو null في أعلى مستوى */
  progressToNext: number | null;
}

// حدود المستويات محسومة تصميمياً: 1-100 خطوة ثابتة، 100-200 مسيرة واثقة، 200+ قدوة متميزة
const POINTS_LEVELS: { id: PointsLevelId; min: number; label: string; icon: string }[] = [
  { id: 'steady',    min: 0,   label: 'خطوة ثابتة',  icon: 'ti-footprints' },
  { id: 'confident', min: 100, label: 'مسيرة واثقة',  icon: 'ti-trending-up' },
  { id: 'exemplary', min: 200, label: 'قدوة متميزة', icon: 'ti-crown' },
];

/** يحسب اللقب/العتبة التالية لعدد نقاط جاهز مسبقاً — مستخرجة من
 * calculatePointsLevel لإعادة استخدامها في calculatePointsLevelFromTotal
 * (تقرير الحصاد الفصلي) بلا أي تكرار لجدول العتبات نفسه. */
function levelForPoints(points: number): Omit<PointsLevelInfo, 'points'> {
  let current = POINTS_LEVELS[0];
  let next: typeof POINTS_LEVELS[number] | null = null;
  for (let i = POINTS_LEVELS.length - 1; i >= 0; i--) {
    if (points >= POINTS_LEVELS[i].min) {
      current = POINTS_LEVELS[i];
      next = POINTS_LEVELS[i + 1] ?? null;
      break;
    }
  }

  const pointsToNext = next ? Math.max(0, next.min - points) : null;
  const progressToNext = next
    ? Math.min(100, Math.round(((points - current.min) / (next.min - current.min)) * 100))
    : null;

  return {
    levelId: current.id,
    levelLabel: current.label,
    levelIcon: current.icon,
    nextThreshold: next ? next.min : null,
    pointsToNext,
    progressToNext,
  };
}

/** نقاط ومستوى الملف — نافذة متحركة لآخر 3 أشهر تقويمية (الحالي + السابقين).
 * الأشهر التي لا صفوف لها (معلم جديد لم يكمل 3 أشهر بعد) تساهم بصفر تلقائياً
 * دون أي حالة خاصة — الجمع يعمل فقط على ما هو متاح فعلياً في monthlyEntries. */
export function calculatePointsLevel(monthlyEntries: MonthlyPointsEntry[]): PointsLevelInfo {
  const now = new Date();
  const currentFlat = now.getFullYear() * 12 + (now.getMonth() + 1);
  const windowFlats = new Set([currentFlat, currentFlat - 1, currentFlat - 2]);

  const points = monthlyEntries
    .filter(e => windowFlats.has(e.year * 12 + e.month))
    .reduce((sum, e) => sum + (e.evidenceCount || 0), 0);

  return { points, ...levelForPoints(points) };
}

/** نفس جدول عتبات calculatePointsLevel، لكن على مجموع نقاط جاهز مسبقاً بدل
 * نافذة "آخر 3 أشهر تقويمية" — تُستخدم حصرياً لتقرير الحصاد الفصلي (Dashboard.tsx)
 * حيث تُحسب النقاط من شواهد المدى المختار فقط، لا مِن الشهر الحالي. لا تُستخدم
 * في أي مسار حي آخر، وبالتالي لا تغيّر سلوك calculatePointsLevel القائم. */
export function calculatePointsLevelFromTotal(points: number): PointsLevelInfo {
  return { points, ...levelForPoints(points) };
}

/** يحوّل نوع شاهد جدول evidence الغني إلى نوع Evidence القديم الأربعة الأنواع
 * — نسخة طبق الأصل من toLocalType المحلية في EvidenceForm.tsx (غير مصدَّرة من
 * هناك)، مُصدَّرة هنا لإعادة استخدامها عند بناء لقطة تقرير الحصاد الفصلي. */
export function supabaseEvidenceTypeToLocal(t: EvidenceType): 'pdf' | 'img' | 'doc' | 'vid' {
  if (t === 'image') return 'img';
  if (t === 'video') return 'vid';
  if (t === 'file') return 'pdf';
  return 'doc';
}

/** الامتداد الفعلي (بحروف صغيرة) من مسار رابط ملف — يميّز PDF عن مستندات
 * Office، خلافاً لـsupabaseEvidenceTypeToLocal التي تحوّل كليهما إلى 'pdf'. */
export function extensionFromUrl(url: string): string {
  try { return new URL(url).pathname.split('.').pop()?.toLowerCase() ?? ''; } catch { return ''; }
}

// مصدر حقيقة واحد لمفهوم "جاهزية/اعتماد الملف" = overallPct فقط، من
// get_portfolio_completion (evidence.indicator_id). الشارة الشهرية التحفيزية
// (calculatePointsLevel أدناه، من monthly_progress) نظام منفصل تماماً ولم
// يُمس — تقيس زخم/استمرارية التوثيق، لا اعتماداً رسمياً.

// ── تنسيق التواريخ الموحّد ──
// 'ar-SA' وحده قد يعرض التاريخ هجرياً وبأرقام عربية هندية حسب المتصفح،
// لذلك يُحدَّد التقويم والأرقام صراحةً (DESIGN.md: التواريخ والأرقام).
const GREGORY_LOCALE = 'ar-SA-u-ca-gregory-nu-latn';
const HIJRI_LOCALE = 'ar-SA-u-ca-islamic-umalqura-nu-latn';

type DateStyle = 'short' | 'long' | 'dayMonth' | 'monthYear' | 'weekday';

const DATE_STYLE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short:     { year: 'numeric', month: 'numeric', day: 'numeric' }, // 29/9/2026
  long:      { year: 'numeric', month: 'long', day: 'numeric' },    // 29 سبتمبر 2026
  dayMonth:  { month: 'short', day: 'numeric' },                    // 29 سبتمبر
  monthYear: { month: 'long', year: 'numeric' },                    // سبتمبر 2026
  weekday:   { weekday: 'short' },                                  // الثلاثاء
};

const toValidDate = (value: string | Date): Date | null => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function formatDate(value: string | Date, style: DateStyle = 'long'): string {
  const d = toValidDate(value);
  return d ? d.toLocaleDateString(GREGORY_LOCALE, DATE_STYLE_OPTIONS[style]) : '';
}

export function formatDateTime(value: string | Date): string {
  const d = toValidDate(value);
  return d
    ? d.toLocaleString(GREGORY_LOCALE, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
}

// ── قفل الأرشيف ─────────────────────────────────────────────────────
/** آخر يوم في الشهر الحالي يُعدَّل ويُحذف فيه شاهد الشهر السابق */
export const ARCHIVE_EDIT_LAST_DAY = 10;

/** هل شواهد الشهر (month 1–12) مقفلة للتعديل والحذف؟ الشهر الحالي (وما بعده)
 *  مفتوح، والسابق مباشرة مفتوح حتى ARCHIVE_EDIT_LAST_DAY، وما قبله مقفل.
 *  بتوقيت الجهاز المحلي، كما يجمّع الأرشيف الشواهد بأشهرها. */
export function isMonthLocked(year: number, month: number, now: Date = new Date()): boolean {
  const monthsAgo = (now.getFullYear() * 12 + now.getMonth() + 1) - (year * 12 + month);
  if (monthsAgo <= 0) return false;
  return !(monthsAgo === 1 && now.getDate() <= ARCHIVE_EDIT_LAST_DAY);
}

/** القاعدة نفسها على شاهد بشهر created_at (توقيت الجهاز المحلي). «أبرز إنجاز»
 *  و«اللمحات» إعدادات عرض لا يمنعها القفل. */
export function isEvidenceLocked(createdAt: string, now?: Date): boolean {
  const d = toValidDate(createdAt);
  return !!d && isMonthLocked(d.getFullYear(), d.getMonth() + 1, now);
}

export function formatHijri(value: string | Date): string {
  const d = toValidDate(value);
  return d ? d.toLocaleDateString(HIJRI_LOCALE, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
}

export function currentHijriYear(): number {
  const year = new Intl.DateTimeFormat(HIJRI_LOCALE, { year: 'numeric' })
    .formatToParts(new Date())
    .find(p => p.type === 'year')?.value;
  return Number(year);
}

// ---------------------------------------------------------------------------
// جمع الأعداد
// ---------------------------------------------------------------------------

/** صيغ كلمة المعدود. one/two تُكتبان بلا رقم («طالب واحد»، «طالبان»)،
 *  few للجمع (3-10)، many للمفرد المنصوب (11-99)، single للمفرد المجرور
 *  (100 وما تنتهي خانتاه بـ 00 أو 01 أو 02، والصفر). twoGen المثنى المجرور
 *  («حفظ تحليلين»)، ويُستعمل بدل two حين يُطلب. */
export interface CountForms {
  one: string;
  two: string;
  twoGen?: string;
  few: string;
  many: string;
  single: string;
}

export const AR_STUDENT: CountForms = { one: 'طالب واحد', two: 'طالبان', twoGen: 'طالبين', few: 'طلاب', many: 'طالباً', single: 'طالب' };
export const AR_ABSENT: CountForms = { one: 'غائب واحد', two: 'غائبان', twoGen: 'غائبين', few: 'غائبين', many: 'غائباً', single: 'غائب' };
export const AR_ANALYSIS: CountForms = { one: 'تحليل واحد', two: 'تحليلان', twoGen: 'تحليلين', few: 'تحليلات', many: 'تحليلاً', single: 'تحليل' };
export const AR_EVIDENCE: CountForms = { one: 'شاهد واحد', two: 'شاهدان', twoGen: 'شاهدين', few: 'شواهد', many: 'شاهداً', single: 'شاهد' };
export const AR_ROW: CountForms = { one: 'صف واحد', two: 'صفان', twoGen: 'صفين', few: 'صفوف', many: 'صفاً', single: 'صف' };
export const AR_TEST: CountForms = { one: 'اختبار واحد', two: 'اختباران', twoGen: 'اختبارين', few: 'اختبارات', many: 'اختباراً', single: 'اختبار' };
export const AR_SCORE: CountForms = { one: 'درجة واحدة', two: 'درجتان', twoGen: 'درجتين', few: 'درجات', many: 'درجة', single: 'درجة' };
export const AR_POINT: CountForms = { one: 'نقطة واحدة', two: 'نقطتان', twoGen: 'نقطتين', few: 'نقاط', many: 'نقطة', single: 'نقطة' };
export const AR_SECTION: CountForms = { one: 'شعبة واحدة', two: 'شعبتان', twoGen: 'شعبتين', few: 'شعب', many: 'شعبة', single: 'شعبة' };
export const AR_SHEET: CountForms = { one: 'ورقة واحدة', two: 'ورقتان', twoGen: 'ورقتين', few: 'أوراق', many: 'ورقة', single: 'ورقة' };

/** كلمة المعدود وحدها لعدد يُكتب بجانبها (بطاقة رقم كبير وتحته الكلمة):
 *  1 ← طالب، 2 ← طالبان، 3-10 ← طلاب، 11-99 ← طالباً، 100 ← طالب. */
export function countWord(n: number, forms: CountForms, opts?: { genitive?: boolean }): string {
  if (n === 2) return opts?.genitive && forms.twoGen ? forms.twoGen : forms.two;
  const r = n % 100;
  if (n === 0 || n === 1 || (n >= 100 && r <= 2)) return forms.single;
  if (r >= 3 && r <= 10) return forms.few;
  return forms.many;
}

/** العدد مع معدوده: «طالب واحد»، «طالبان»، «3 طلاب»، «11 طالباً»، «100 طالب». */
export function countAr(n: number, forms: CountForms, opts?: { genitive?: boolean }): string {
  if (n === 1) return forms.one;
  if (n === 2) return countWord(n, forms, opts);
  return `${n} ${countWord(n, forms)}`;
}
