import type { AcademicDate, AppState, SectionData, UserProfile } from './types';

// القيمة الافتراضية التي يضعها trigger قاعدة البيانات (handle_new_user) للحسابات
// الجديدة التي لم تُكمّل بياناتها بعد — تُستخدم لتمييز الملف "الناقص" عن "المكتمل".
const UNSET_PLACEHOLDER = 'غير محدد';

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
    points,
    levelId: current.id,
    levelLabel: current.label,
    levelIcon: current.icon,
    nextThreshold: next ? next.min : null,
    pointsToNext,
    progressToNext,
  };
}

export function calculateEvaluation(state: Pick<AppState, 'ev' | 'strats' | 'csubs'>, sections: SectionData[]) {
  let totalEvs = 0;
  let filledSecs = 0;
  sections.forEach(s => {
    let hasEv = false;
    const subs = [...s.subs, ...(state.csubs[s.id] || [])];
    subs.forEach(sub => {
      const cnt = (state.ev[`${s.id}|${sub}`] || []).length;
      totalEvs += cnt;
      if (cnt > 0) hasEv = true;
    });

    if (s.isStrat) {
      state.strats.forEach(sn => {
        const cnt = (state.ev[`${s.id}|strat:${sn}`] || []).length;
        totalEvs += cnt;
        if (cnt > 0) hasEv = true;
      });
    }

    if (hasEv) filledSecs++;
  });

  const secScore = Math.min(50, Math.round((filledSecs / sections.length) * 50));
  const evScore = Math.min(30, Math.round((totalEvs / 15) * 30)); // 15 evidences for full score
  const stratScore = Math.min(20, Math.round((state.strats.length / 4) * 20)); // 4 strategies for full score
  const totalScore = secScore + evScore + stratScore;

  let levelStr = 'قيد الإنجاز';
  let levelIcon = 'ti-clock';
  let levelClass = 'text-[var(--text2)] border-white/10 hover:border-white/30 hover:bg-white/5';
  let isVerified = false;

  if (totalScore >= 85) {
    levelStr = 'معلم متميز';
    levelIcon = 'ti-star-filled';
    levelClass = 'text-[var(--gold)] border-[var(--gold)]/30 hover:bg-[var(--gold)]/10 hover:border-[var(--gold)]/50';
    isVerified = true;
  } else if (totalScore >= 50) {
    levelStr = 'موثّق رسمياً';
    levelIcon = 'ti-shield-check';
    levelClass = 'text-[var(--em8)] border-[var(--em7)]/30 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/50';
    isVerified = true;
  }

  return { totalEvs, filledSecs, secScore, evScore, stratScore, totalScore, levelStr, levelIcon, levelClass, isVerified };
}
