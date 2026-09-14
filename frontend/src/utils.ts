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

export const getCompletionColor = (pct: number): string => {
  if (pct >= 70) return '#1D9E75';
  if (pct >= 35) return '#BA7517';
  return '#D85A30';
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

// calculateEvaluation() حُذفت (14 سبتمبر 2026) — كانت تحسب شارة "معلم متميز/موثّق
// رسمياً/قيد الإنجاز" من state.ev القديم (نظام تخزين مهجور)، بالتوازي مع
// overallPct الجديد من get_portfolio_completion (evidence.indicator_id) — نفس
// الشاشة كانت تعرض رقمين متضاربين لنفس المفهوم. القرار: مصدر حقيقة واحد
// لمفهوم "جاهزية/اعتماد الملف" = overallPct فقط. الشارة الشهرية التحفيزية
// (calculatePointsLevel أدناه، من monthly_progress) نظام منفصل تماماً ولم
// يُمس — تقيس زخم/استمرارية التوثيق، لا اعتماداً رسمياً.
