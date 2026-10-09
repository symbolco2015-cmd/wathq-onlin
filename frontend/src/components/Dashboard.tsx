import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { AppState, SectionData, SectionIndicator, Announcement, AcademicDate } from '../types';
import { findIndicatorByName } from '../indicators';
import Sidebar, { type SidebarCoreItem, type SidebarSpecialItem } from './Sidebar';
import { MonthCard, CumulativeCard } from './SummaryCards';
import EvidenceList from './EvidenceList';
import BottomSheet from './BottomSheet';
import EvidenceForm from './EvidenceForm';
import type { EvidenceFormHandle } from './EvidenceForm';
import EvidenceModal from './EvidenceModal';
import SectionView, { nEv, sectionLevel, LevelBadge, BTN_PRI_SM, BTN_GH_SM, BTN_SM, BTN_DNG, type Level, type SectionSummary, type IndicatorHandlers, type EvHighlightActions } from './SectionView';
import { IndivDiffView, StrategiesView, AnalysisView, ImprovementView } from './SpecialSectionViews';
import { calculatePointsLevel, isLastDaysOfMonth, upcomingAcademicDate, AI_CONSENT_TEXT, formatDate, formatHijri } from '../utils';
import { useQuickCapture, VOICE_CAPTURE_ENABLED, VOICE_CAPTURE_DISABLED_MESSAGE } from '../hooks/useQuickCapture';
import type { MonthlyProgressRow } from '../hooks/useMonthlyProgress';
import type { OnEvidenceSavedFn } from '../hooks/useSaveEvidence';
import type { PortfolioCompletion } from '../hooks/usePortfolioCompletion';
import { supabase } from '../supabaseClient';
import BulkImportPicker from './BulkImportPicker';
import BulkImportReview from './BulkImportReview';
import HarvestReportSheet from './HarvestReportSheet';
import { AnalysisSectionBody } from './ResultsAnalysis/AnalysisSectionCard';
import { ImprovementActionsBody, countImprovementActions } from './ResultsAnalysis/ImprovementActionsCard';
import { SpecCard, SpecGrid } from './SpecGrid';
import { useResultsAnalysis } from './ResultsAnalysis/useResultsAnalysis';
import ToolsSheet, { type ArchiveMonth } from './ToolsSheet';
import NotificationsSheet, { type NotificationItem } from './NotificationsSheet';
import WelcomeCard from './WelcomeCard';
import Hint from './Hint';
import { SectionPickList, IndicatorPickStep } from './SectionIndicatorPicker';

const ARCHIVE_MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** حدث يرسله زر «البنود» في شريط الجوال (Nav): يغلق أي شاشة ويمرّر إلى البطاقات */
export const SHOW_SECTIONS_EVENT = 'wathq:show-sections';
/** حدث يرسله زر «أدوات» في الشريط العلوي (Nav): يفتح قائمة الأدوات */
export const OPEN_TOOLS_EVENT = 'wathq:open-tools';
/** حدث يرسله زر الجرس في الشريط العلوي (Nav): يفتح لوحة الإشعارات */
export const OPEN_NOTIFICATIONS_EVENT = 'wathq:open-notifications';
/** حدث يرسله Dashboard بعدد الإشعارات غير المقروءة (detail: number) */
export const NOTIF_COUNT_EVENT = 'wathq:notif-count';
/** حدث ترسله Nav عند تركيبها لتطلب العدد الحالي، فلا يضيع إرسال سبق تسجيل مستمعها */
export const REQUEST_NOTIF_COUNT_EVENT = 'wathq:request-notif-count';
/** أقصى عدد تعاميم في الجرس */
const NOTIF_ANNOUNCEMENTS_LIMIT = 20;

/** الشاشة المفتوحة فوق الرئيسية — قسم عادي برقمه، أو أحد الأقسام الخاصة، أو أرشيف شهر سابق */
type OpenScreen =
  | { kind: 'core'; id: number }
  | { kind: 'strat' } | { kind: 'indiv' } | { kind: 'analysis' } | { kind: 'improvement' }
  | { kind: 'archive'; month: ArchiveMonth };
/** history.state لكل مدخل شاشة؛ wathqDepth = عدد الشاشات فوق الرئيسية (1 فأكثر) */
type ScreenHistoryState = { wathqScreen: OpenScreen; wathqDepth: number };

const SPECIAL_KINDS = ['strat', 'indiv', 'analysis', 'improvement'] as const;

/** يقرأ history.state بأمان — أي شكل غير معروف يُعامَل كأنه لا شاشة مفتوحة */
function readScreenState(s: unknown): ScreenHistoryState | null {
  if (!s || typeof s !== 'object') return null;
  const { wathqScreen, wathqDepth } = s as { wathqScreen?: unknown; wathqDepth?: unknown };
  if (typeof wathqDepth !== 'number' || wathqDepth < 1 || !wathqScreen || typeof wathqScreen !== 'object') return null;
  const scr = wathqScreen as { kind?: unknown; id?: unknown };
  if (scr.kind === 'core' && typeof scr.id === 'number') return { wathqScreen: { kind: 'core', id: scr.id }, wathqDepth };
  if (scr.kind === 'archive') {
    // اسم الشهر يُعاد بناؤه من رقمه، لا يُؤخذ من المخزّن
    const m = (wathqScreen as { month?: { year?: unknown; month?: unknown } }).month;
    if (m && typeof m.year === 'number' && typeof m.month === 'number' && m.month >= 1 && m.month <= 12) {
      return { wathqScreen: { kind: 'archive', month: { year: m.year, month: m.month, label: ARCHIVE_MONTHS_AR[m.month - 1] } }, wathqDepth };
    }
    return null;
  }
  const special = SPECIAL_KINDS.find(k => k === scr.kind);
  return special ? { wathqScreen: { kind: special }, wathqDepth } : null;
}

const DESKTOP_QUERY = '(min-width: 1024px)';

/** سطح المكتب (lg) — عمود الملخص ونافذة المنتقي؛ تحته الورقة السفلية */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

const sameScreen = (a: OpenScreen, b: OpenScreen) => {
  if (a.kind === 'core') return b.kind === 'core' && a.id === b.id;
  if (a.kind === 'archive') return b.kind === 'archive' && a.month.year === b.month.year && a.month.month === b.month.month;
  return a.kind === b.kind;
};

type SupabaseEvidenceHook =ReturnType<typeof import('../hooks/useSupabaseEvidence').useSupabaseEvidence>;

export interface MonthlyProgressData {
  /** صفوف monthly_progress الخام لكل قسم/شهر — تُستخدم في calculatePointsLevel
   * لحساب نقاط الملف العام (نافذة آخر 3 أشهر، بصرف النظر عن القسم) */
  rows: MonthlyProgressRow[];
  currentMonthTotal: number;
  currentMonthName: string;
  currentYear: number;
  currentMonth: number;
  monthlyAvg: number;
  yearTotal: number;
  monthsElapsed: number;
  getSectionMonthCount: (sectionId: number) => number;
  getSectionYearTotal: (sectionId: number) => number;
  /** تعريف السنة الدراسية نفسه الذي يستعمله getSectionYearTotal */
  isInAcademicYear: (r: { year: number; month: number }) => boolean;
}

type DashboardProps = {
  state: AppState;
  sections: SectionData[];
  supabaseEv?: SupabaseEvidenceHook;
  onAddEvClick: (sid: number, sub: string, strategyId?: string, indicatorId?: string) => void;
  onDeleteEv: (evidenceId: string) => void;
  /** يفتح نموذج الشاهد في وضع التعديل — من شاشة القسم العادي فقط */
  onEditEv: (sectionId: number, ev: SupabaseEvidenceHook['evidence'][number]) => void;
  /** يفتح تدفّق "إضافة استراتيجية" (اختيار من الكتالوج أو إنشاء جديدة، ثم
   *  فتح نموذج الدليل الإجباري) — انظر openAddStrategyModal في App.tsx. */
  onAddStrategyClick: () => void;
  /** اسم كل استراتيجية تدريس (id → name_ar) لحلّ evidence[].strategy_id إلى
   *  اسم معروض ببطاقة القسم 4 — من useTeachingStrategies في App.tsx. */
  strategyNames: Record<string, string>;
  announcements?: Announcement[];
  /** يعلّم تعاميم مقروءة ومفاتيح إشعارات أخرى مرئية في كتابة واحدة — markNotificationsSeen في useAppStore */
  onMarkNotificationsSeen?: (announcementIds: string[], keys: string[]) => void;
  /** يفتح نافذة إعدادات الملف الشخصي (فيها الصورة والتواصل ومفتاح المشاركة) — openProfileSettings في App */
  onOpenProfileSettings?: () => void;
  /** share_enabled من useAppStore — شرط خطوة «شارك صفحتك» في بطاقة الترحيب */
  shareEnabled?: boolean;
  /** يكتب state.welcome / state.welcomeNoAvatar — updateWelcome في useAppStore */
  onUpdateWelcome?: (patch: { welcome?: 'active' | 'dismissed'; welcomeNoAvatar?: true }) => void;
  /** يضيف مفتاح تلميح إلى state.seenHints — markHintSeen في useAppStore */
  onMarkHintSeen?: (key: string) => void;
  /** تاريخ إنشاء الحساب (auth user.created_at) — التعميم الأقدم منه يُعامَل مقروءاً */
  accountCreatedAt?: string;
  academicDates?: AcademicDate[];
  monthlyProgress?: MonthlyProgressData;
  /** نسبة الجاهزية العامة التراكمية — من usePortfolioCompletion في App.tsx */
  completion?: PortfolioCompletion | null;
  completionError?: boolean;
  /** الحقول التالية تُستخدم فقط لعرض BottomSheet إضافة الشاهد على الجوال */
  userId?: string;
  /** يسجّل الشاهد في عدّاد الشهر بعد نجاح إدراجه — انظر onEvidenceSaved في App.tsx */
  onEvidenceSaved?: OnEvidenceSavedFn;
  onToast?: (msg: string, icon?: string) => void;
  aiConsentGiven?: boolean;
  onGiveAiConsent?: () => void;
  /** «أبرز إنجاز» و«اللمحات» في قائمة ⋯ للشاهد — المنفّذ في App.tsx */
  highlight?: EvHighlightActions;
  /** اقتراح الذكاء الاصطناعي غير المعتمد (ai_top_achievement_evidence_id)، أو null */
  topSuggestionId?: string | null;
  onApproveTopSuggestion?: (evidenceId: string) => void;
  onDismissTopSuggestion?: (evidenceId: string) => void;
} & Partial<IndicatorHandlers>

interface SectionReclassifyDropdownProps {
  sections: SectionData[];
  isOpen: boolean;
  isBusy: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (sectionId: string) => void;
  /** اسم القسم المختار — يُعرض على الزر بدل «اختر القسم» إن وُجد */
  selectedLabel?: string;
}

// بديل مخصّص لـ <select>/<option> الأصليين — Safari/iOS يتجاهل تنسيق <option>
// بالكامل تقريباً (خلفية بيضاء ثابتة من النظام)، فلا يمكن مطابقة الهوية
// البصرية الداكنة عبر CSS وحده على كل المتصفحات المستهدفة.
//
// القائمة تُعرض عبر createPortal إلى document.body بموضع fixed محسوب من
// getBoundingClientRect بدل absolute داخل الشجرة — BottomSheet.tsx يحمل
// overflow-hidden وحاوية القائمة الأب overflow-y-auto، وكلاهما يقصّان أي
// absolute متجاوز لحدودهما (نفس حل أرشيف الأشهر السابقة في هذا الملف).
const RECLASSIFY_MENU_MAX_H = 240;

export function SectionReclassifyDropdown({
  sections, isOpen, isBusy, onOpen, onClose, onSelect, selectedLabel,
}: SectionReclassifyDropdownProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; openUpward: boolean }>({ top: 0, left: 0, openUpward: false });

  useLayoutEffect(() => {
    if (!isOpen || !btnRef.current) return;
    const update = () => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < RECLASSIFY_MENU_MAX_H && rect.top > RECLASSIFY_MENU_MAX_H;
      setPos({
        top: openUpward ? rect.top - 6 : rect.bottom + 6,
        left: rect.left,
        openUpward,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        disabled={isBusy}
        onClick={() => (isOpen ? onClose() : onOpen())}
        className="py-2 px-3 text-[12px] font-bold bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40 cursor-pointer disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5"
      >
        {selectedLabel ?? 'اختر القسم'}
        <i className={`ti ti-chevron-down text-[11px] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isBusy && (
        <i className="ti ti-loader animate-spin text-[13px] text-[var(--em8)] absolute -left-6 top-1/2 -translate-y-1/2" />
      )}

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[600]" onClick={onClose} />
          <div
            className="fixed z-[601] min-w-[190px] max-h-[240px] overflow-y-auto rounded-xl border border-[var(--line2)] bg-[var(--surf2)] shadow-[0_12px_32px_rgba(0,0,0,.45)] py-1.5"
            style={{
              top: pos.openUpward ? undefined : pos.top,
              bottom: pos.openUpward ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              animation: 'scaleIn .15s var(--sp) both',
            }}
          >
            {sections.map(sec => (
              <button
                key={sec.id}
                type="button"
                onClick={() => onSelect(String(sec.id))}
                className="w-full text-right px-3.5 py-2.5 text-[12.5px] font-bold text-white hover:bg-[var(--gold)]/10 hover:text-[var(--gold3)] transition-colors cursor-pointer"
              >
                {sec.ttl}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

/** صف قائمة في المنتقي وأوراق الالتقاط — نمط .navs بارتفاع 44px */
/** عنصر قائمة الزر العائم */
const FAB_ITEM = 'h-11 px-3 flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--bd)] bg-[var(--s1)] text-[length:var(--fs-sm)] font-bold text-[var(--t1)] active:scale-95 transition-transform duration-150 cursor-pointer';

/** رأس الورقة أو النافذة — نمط رأس NavPanel */
function SheetHeader({ title, onClose, badge }: { title: string; onClose: () => void; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pb-3 border-b border-[var(--bd)] shrink-0">
      <div className="flex items-center gap-2 min-w-0 text-[length:var(--fs-md)] font-bold text-[var(--t1)]">
        {title}
        {badge && (
          <span className="inline-flex items-center rounded-[var(--r-full)] bg-[var(--s2)] px-2 py-0.5 text-[length:var(--fs-xs)] font-bold text-[var(--t3)] whitespace-nowrap">{badge}</span>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label="إغلاق" className={`${BTN_GH_SM} w-11 h-11 px-0`}>
        <i className="ti ti-x text-[20px]" />
      </button>
    </div>
  );
}

export default function Dashboard({ state, sections, supabaseEv, onAddEvClick, onDeleteEv, onEditEv, onAddStrategyClick, strategyNames, announcements, onMarkNotificationsSeen, onOpenProfileSettings, shareEnabled = false, onUpdateWelcome, onMarkHintSeen, accountCreatedAt, academicDates, monthlyProgress, completion, completionError, userId, onEvidenceSaved, onToast, aiConsentGiven, onGiveAiConsent, onAddIndicator, onRenameIndicator, onDeleteIndicator, highlight, topSuggestionId, onApproveTopSuggestion, onDismissTopSuggestion }: DashboardProps) {
  // تذكيرات الجرس الموسمية — موعد دراسي قادم خلال 7 أيام، ونهاية الشهر (آخر 5 أيام).
  // كل منهما إشعار مستقل بمفتاح يُحفظ في state.seenNotifications.
  const reminders = useMemo(() => {
    const list: { key: string; icon: string; title: string; subtitle: string }[] = [];
    const upcoming = upcomingAcademicDate(academicDates || [], 7);
    if (upcoming) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((new Date(upcoming.date).getTime() - today.getTime()) / 86400000);
      const dateStr = formatDate(upcoming.date, 'long');
      list.push({
        key: `date:${upcoming.id}`,
        icon: 'ti-calendar-event',
        title: upcoming.title,
        subtitle: `${daysLeft <= 0 ? 'اليوم' : `بعد ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`} — ${dateStr}${upcoming.hijri_label ? ` (${upcoming.hijri_label})` : ''}`,
      });
    }
    if (isLastDaysOfMonth()) {
      const now = new Date();
      list.push({
        key: `month-end:${now.getFullYear()}-${now.getMonth() + 1}`,
        icon: 'ti-hourglass-low',
        title: 'الشهر على وشك الانتهاء',
        subtitle: 'لا تنسَ تسجيل شواهدك قبل بداية الشهر القادم لضمان توثيق إنجازك.',
      });
    }
    return list;
  }, [academicDates]);
  // الشاشة المفتوحة فوق الرئيسية (انظر pushScreen بالأسفل) — معرّفة هنا لأن
  // الأرشيف أحد أنواعها، واشتقاقاته التالية تحتاجه
  const [openScreen, setOpenScreen] = useState<OpenScreen | null>(null);

  // ── أرشيف الأشهر السابقة ─────────────────────────────────────────────
  // شاشة في تاريخ المتصفح: تُفتح بـ pushScreen من قائمة «أدوات»، وتُغلق بالرجوع
  const archiveMonth = openScreen?.kind === 'archive' ? openScreen.month : null;
  const [archiveAddTarget, setArchiveAddTarget] = useState<{ open: boolean; sectionId: number; sub: string }>({
    open: false, sectionId: 0, sub: '',
  });

  // أقسام قابلة للاختيار من أي منتقي قسم عام (BottomSheet إضافة شاهد، التقاط
  // سريع، أرشيف الأشهر) — تشمل قسم الاستراتيجيات
  // (له مؤشر فرعي عادي "مراعاة الفروق الفردية" يصح إضافة شاهد له من هنا)
  // لكن تستبعد بندي 5/10 (isResultsSection): لا مؤشرات فرعية عادية متبقية
  // فيهما يمكن الكتابة إليها بلا سياق — لهما مسارات إضافة شاهد مخصّصة بدلاً من ذلك.
  const pickableSections = sections.filter(s => !s.isResultsSection);

  // كل الأشهر التي بها شواهد فعلية في جدول evidence، عدا الشهر الحالي (معروض
  // طبيعياً بدون حاجة للأرشيف) — المصدر هو created_at الحقيقي لكل شاهد، لا
  // حقل date النصي في ev القديم غير القابل للفرز بثقة.
  const archiveMonths = useMemo(() => {
    if (!supabaseEv || !monthlyProgress) return [];
    const seen = new Map<string, ArchiveMonth>();
    for (const e of supabaseEv.evidence) {
      const d = new Date(e.created_at);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      if (year === monthlyProgress.currentYear && month === monthlyProgress.currentMonth) continue;
      const key = `${year}-${month}`;
      if (!seen.has(key)) seen.set(key, { year, month, label: ARCHIVE_MONTHS_AR[month - 1] });
    }
    return Array.from(seen.values()).sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
  }, [supabaseEv, monthlyProgress]);

  // قاعدة نافذة 10 أيام: التعديل مسموح فقط للشهر السابق مباشرة، وفقط خلال
  // أول 10 أيام من الشهر الحالي — أي شهر آخر يُعرض read-only بالكامل
  const isImmediatePrevMonth = !!(archiveMonth && monthlyProgress &&
    (archiveMonth.year * 12 + archiveMonth.month) === (monthlyProgress.currentYear * 12 + monthlyProgress.currentMonth) - 1
  );
  const todayDayOfMonth = new Date().getDate();
  const isArchiveEditable = isImmediatePrevMonth && todayDayOfMonth <= 10;
  const archiveDaysLeft = Math.max(0, 10 - todayDayOfMonth);
  const archiveLockLabel = archiveDaysLeft === 0
    ? 'اليوم'
    : `خلال ${archiveDaysLeft} ${archiveDaysLeft === 1 ? 'يوم' : 'أيام'}`;

  // الشواهد الفعلية للشهر المؤرشَف المختار، مُجمَّعة حسب القسم
  const archiveEvidenceBySection = useMemo(() => {
    const map: Record<number, NonNullable<typeof supabaseEv>['evidence']> = {};
    if (!supabaseEv || !archiveMonth) return map;
    for (const e of supabaseEv.evidence) {
      const d = new Date(e.created_at);
      if (d.getFullYear() !== archiveMonth.year || (d.getMonth() + 1) !== archiveMonth.month) continue;
      if (!map[e.section_id]) map[e.section_id] = [];
      map[e.section_id].push(e);
    }
    return map;
  }, [supabaseEv, archiveMonth]);

  // الشهر القابل للتعديل: تُعرض كل الأقسام (لإتاحة إضافة شاهد لأي قسم حتى لو
  // كان بلا شواهد بعد). الشهر المقفل (read-only): تُعرض فقط الأقسام التي بها
  // شواهد فعلية — لا فائدة من عرض بطاقات قسم فارغة لا يمكن التفاعل معها.
  const archiveSectionsToShow = isArchiveEditable
    ? pickableSections
    : pickableSections.filter(sec => (archiveEvidenceBySection[sec.id]?.length ?? 0) > 0);

  // تاريخ ISO ثابت (اليوم الأول من الشهر المؤرشَف، الساعة 12 ظهراً لتفادي
  // انزلاق التاريخ بفعل المنطقة الزمنية) — يُستخدم لربط أي شاهد جديد يُضاف
  // من الأرشيف بشهره الصحيح في جدول evidence وفي monthly_progress معاً
  const archiveCreatedAt = archiveMonth
    ? new Date(archiveMonth.year, archiveMonth.month - 1, 1, 12, 0, 0).toISOString()
    : undefined;

  // أداة تحليل نتائج المتعلمين — مصدر بيانات مشترك واحد لبطاقتَي بند 10
  // (تحليل) وبند 5 (تحسين)، بدل نسختين مستقلتين من useResultsAnalysis؛ رفع
  // تحليل جديد من بطاقة 10 يظهر فوراً في قائمة إجراءات بطاقة 5 بلا حاجة لإعادة
  // جلب منفصلة. focusAnalysisId يحمل طلب تنقّل "اعرض السياق الكامل" من بطاقة
  // 5 إلى تبويب تحليل محدد في شاشة 10 — بروتوكول استهلاك مرة واحدة (تُصفَّر
  // فوراً بعد أن يستهلكها جسم شاشة 10 عبر onFocusHandled).
  const resultsAnalysis = useResultsAnalysis(userId);
  const [focusAnalysisId, setFocusAnalysisId] = useState<string | null>(null);
  const handleViewInAnalysis = (analysisId: string) => {
    setFocusAnalysisId(analysisId);
    pushScreen({ kind: 'analysis' });
  };

  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  // الخطوة الثانية في المنتقي: القسم المختار (null = الخطوة الأولى)
  const [pickerSection, setPickerSection] = useState<SectionData | null>(null);
  // كل فتح يبدأ من الخطوة الأولى، أياً كانت طريقة الإغلاق السابق
  const openSectionPicker = () => { setPickerSection(null); setSectionPickerOpen(true); };
  const isDesktop = useIsDesktop();
  // نافذة المنتقي على سطح المكتب تُغلق بـ Esc
  useEffect(() => {
    if (!sectionPickerOpen || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSectionPickerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sectionPickerOpen, isDesktop]);
  const [fabExpanded, setFabExpanded] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<{ open: boolean; sectionId: number; sub: string; indicatorId?: string }>({
    open: false, sectionId: 0, sub: '',
  });
  const closeMobileSheet = () => setMobileSheet(prev => ({ ...prev, open: false }));
  // الخلفية والسحب يمرّان عبر requestClose حتى يسأل النموذج قبل تجاهل ما كُتب
  const mobileFormRef = useRef<EvidenceFormHandle>(null);
  const handlePickIndicator = (sec: SectionData, ind: SectionIndicator) => {
    setSectionPickerOpen(false);
    setMobileSheet({ open: true, sectionId: sec.id, sub: ind.name_ar, indicatorId: ind.id });
  };

  // الاستيراد الجماعي — مصدر البيانات bulk_import_queue وليس evidence
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isBulkImportReviewOpen, setIsBulkImportReviewOpen] = useState(false);
  const [bulkImportReadyCount, setBulkImportReadyCount] = useState(0);

  // تقرير حصاد فصلي — مستقل تماماً عن الاستيراد الجماعي أعلاه (مصدر البيانات:
  // evidence/monthly_progress ضمن مدى زمني مختار، وليس bulk_import_queue)
  const [isHarvestReportOpen, setIsHarvestReportOpen] = useState(false);

  const quickCapture = useQuickCapture({
    userId,
    supabaseEv,
    onEvidenceSaved: onEvidenceSaved ?? (() => {}),
    onToast: onToast ?? (() => {}),
    sections,
    aiConsentGiven,
    onGiveAiConsent,
  });

  // بوابة صلاحية ميزة "التوثيق الصوتي" (Beta) — تتحكم بظهور خيار "تسجيل صوتي سريع" في الـ FAB
  const [voiceFeatureEnabled, setVoiceFeatureEnabled] = useState(false);
  useEffect(() => {
    if (!supabase) { setVoiceFeatureEnabled(false); return; }
    let cancelled = false;
    supabase.rpc('is_feature_enabled', { p_feature: 'voice_documentation' }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { console.warn('[Dashboard] تعذّر التحقق من صلاحية ميزة التوثيق الصوتي:', error.message); setVoiceFeatureEnabled(false); return; }
      setVoiceFeatureEnabled(!!data);
    });
    return () => { cancelled = true; };
  }, []);

  // بوابة ميزة "الاستيراد الجماعي" — تتحكم بظهور عنصره في قائمة «أدوات» (الزر العائم لا يتأثر)
  const [bulkImportEnabled, setBulkImportEnabled] = useState(false);
  useEffect(() => {
    if (!supabase) { setBulkImportEnabled(false); return; }
    let cancelled = false;
    supabase.rpc('is_feature_enabled', { p_feature: 'bulk_import' }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { console.warn('[Dashboard] تعذّر التحقق من صلاحية ميزة الاستيراد الجماعي:', error.message); setBulkImportEnabled(false); return; }
      setBulkImportEnabled(!!data);
    });
    return () => { cancelled = true; };
  }, []);

  // عدد ملفات الاستيراد الجماعي الجاهزة للمراجعة (status='classified' أو 'failed'
  // — الفاشل يُصنَّف يدوياً في شاشة المراجعة نفسها، فبدونه لا يصل معلم كل صوره
  // فاشلة إلى المراجعة أبداً) — يُجلب
  // مرة واحدة عند تحميل لوحة التحكم (بنفس توقيت باقي بيانات Dashboard)، ويُعاد
  // جلبه أيضاً بعد اكتمال أي تصنيف بالخلفية (انظر onClassificationSettled بالأسفل)
  // — لا يوجد أي polling/setInterval هنا، التحديث مرتبط بأحداث فعلية فقط
  const refetchBulkImportReadyCount = useCallback(() => {
    if (!supabase || !userId) { setBulkImportReadyCount(0); return; }
    supabase
      .from('bulk_import_queue')
      .select('id', { count: 'exact', head: true })
      .eq('portfolio_id', userId)
      .in('status', ['classified', 'failed'])
      .then(({ count, error }) => {
        if (error) { console.warn('[Dashboard] تعذّر التحقق من صفوف الاستيراد الجماعي الجاهزة:', error.message); return; }
        setBulkImportReadyCount(count ?? 0);
      });
  }, [userId]);

  useEffect(() => {
    refetchBulkImportReadyCount();
  }, [refetchBulkImportReadyCount]);

  // ملخص الملف العام بالذكاء الاصطناعي — حالة أهلية زر "تحديث الملخص الآن".
  // نفس الحقول المستخدمة في شرط الحجز الذري داخل generate-portfolio-summaries
  // (ai_summary_stale + كولداون 7 أيام) بالإضافة إلى share_enabled الذي تفرضه
  // الدالة كفحص منفصل قبل الحجز في مسارها اليدوي — تُحسَب هنا محلياً فقط لعرض
  // نص الزر، لا كبديل عن تحقق الدالة نفسها.
  const [summaryStatus, setSummaryStatus] = useState<{
    shareEnabled: boolean;
    stale: boolean;
    generatedAt: string | null;
  } | null>(null);
  const [summaryRefreshBusy, setSummaryRefreshBusy] = useState(false);

  const refetchSummaryStatus = useCallback(() => {
    if (!supabase || !userId) { setSummaryStatus(null); return; }
    supabase
      .from('portfolios')
      .select('share_enabled, ai_summary_stale, ai_summary_generated_at')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error) { console.warn('[Dashboard] تعذّر جلب حالة ملخص الملف العام:', error.message); return; }
        setSummaryStatus({
          shareEnabled: !!data?.share_enabled,
          stale: data?.ai_summary_stale ?? true,
          generatedAt: data?.ai_summary_generated_at ?? null,
        });
      });
  }, [userId]);

  useEffect(() => {
    refetchSummaryStatus();
  }, [refetchSummaryStatus]);

  // ── بطاقة الترحيب ───────────────────────────────────────────────────
  // إشارة اكتمال التحميل: استعلام عدّ مستقل على evidence، لا supabaseEv.loading
  // (قيمته الأولى false مع قائمة فارغة، وخطؤه يُبتلع إلى []). لا كتابة إلا عند
  // نجاحه. welcome غائب ⇐ كتابة واحدة: 'dismissed' لمعلم له شواهد، وإلا 'active'.
  // allDoneAtLoad يُحفظ لحظة الفحص: البطاقة لا تظهر لمن أكمل الخطوات قبل هذا
  // التحميل، وتبقى ظاهرة لمن أكملها في الجلسة نفسها.
  const welcomeRef = useRef({ welcome: state.welcome, profileDone: false, shareEnabled });
  const avatarDone = !!state.profile.avatar?.trim() || state.welcomeNoAvatar === true;
  welcomeRef.current = { welcome: state.welcome, profileDone: avatarDone, shareEnabled };
  const onUpdateWelcomeRef = useRef(onUpdateWelcome);
  onUpdateWelcomeRef.current = onUpdateWelcome;
  const [welcomeCheck, setWelcomeCheck] = useState<{ hasEvidenceAtLoad: boolean; allDoneAtLoad: boolean } | null>(null);
  useEffect(() => {
    if (!supabase || !userId) return;
    if (welcomeRef.current.welcome === 'dismissed') return;
    let cancelled = false;
    supabase
      .from('evidence')
      .select('id', { count: 'exact', head: true })
      .eq('portfolio_id', userId)
      .then(({ count, error }) => {
        if (cancelled) return;
        if (error) { console.warn('[Dashboard] تعذّر فحص الشواهد لبطاقة الترحيب:', error.message); return; }
        const hasEvidence = (count ?? 0) > 0;
        const cur = welcomeRef.current;
        if (cur.welcome === undefined) onUpdateWelcomeRef.current?.({ welcome: hasEvidence ? 'dismissed' : 'active' });
        setWelcomeCheck({ hasEvidenceAtLoad: hasEvidence, allDoneAtLoad: cur.profileDone && hasEvidence && cur.shareEnabled });
      });
    return () => { cancelled = true; };
  }, [userId]);
  const showWelcome = state.welcome === 'active' && !!welcomeCheck && !welcomeCheck.allDoneAtLoad;
  const welcomeEvidenceDone = (supabaseEv?.evidence.length ?? 0) > 0 || !!welcomeCheck?.hasEvidenceAtLoad;
  const prof = state.profile;
  const showContactNudge = [prof.email, prof.phone, prof.twitter, prof.linkedin, prof.youtube].every(v => !v?.trim());

  // قائمة «أدوات» — تُفتح بحدث من زر الشريط العلوي (OPEN_TOOLS_EVENT)
  const [toolsOpen, setToolsOpen] = useState(false);
  const closeTools = useCallback(() => setToolsOpen(false), []);
  // لوحة الإشعارات (الجرس) — تُفتح بحدث OPEN_NOTIFICATIONS_EVENT. اللوحتان لا تُفتحان معاً.
  const [notifOpen, setNotifOpen] = useState(false);
  const closeNotif = useCallback(() => setNotifOpen(false), []);
  // المستمع مسجّل مرة واحدة، فيقرأ آخر دالة تعليم التلميح من ref
  const onMarkHintSeenRef = useRef(onMarkHintSeen);
  onMarkHintSeenRef.current = onMarkHintSeen;
  useEffect(() => {
    const onOpenTools = () => { setNotifOpen(false); setToolsOpen(true); };
    // فتح الجرس يعلّم تلميحه مرئياً
    const onOpenNotif = () => { setToolsOpen(false); setNotifOpen(true); onMarkHintSeenRef.current?.('hint:bell'); };
    window.addEventListener(OPEN_TOOLS_EVENT, onOpenTools);
    window.addEventListener(OPEN_NOTIFICATIONS_EVENT, onOpenNotif);
    return () => {
      window.removeEventListener(OPEN_TOOLS_EVENT, onOpenTools);
      window.removeEventListener(OPEN_NOTIFICATIONS_EVENT, onOpenNotif);
    };
  }, []);
  // كل فتح يعيد قراءة share_enabled وحالة الملخص، فيتحدث النص بعد تغيير المشاركة من الإعدادات
  useEffect(() => {
    if (toolsOpen) refetchSummaryStatus();
  }, [toolsOpen, refetchSummaryStatus]);
  // أي تغيّر في الشاشة (بما فيه رجوع المتصفح) يغلق القائمتين
  useEffect(() => { setToolsOpen(false); setNotifOpen(false); }, [openScreen]);

  const SUMMARY_COOLDOWN_DAYS = 7;
  const summaryDaysSince = summaryStatus?.generatedAt
    ? Math.floor((Date.now() - new Date(summaryStatus.generatedAt).getTime()) / 86400000)
    : null;
  const summaryCooldownPassed = summaryDaysSince === null || summaryDaysSince >= SUMMARY_COOLDOWN_DAYS;
  const summaryDaysRemaining = summaryDaysSince !== null && !summaryCooldownPassed
    ? SUMMARY_COOLDOWN_DAYS - summaryDaysSince
    : 0;

  let summaryButtonDisabled = summaryRefreshBusy || !summaryStatus;
  let summaryHelperText: string | null = null;
  if (summaryStatus && !summaryStatus.shareEnabled) {
    summaryButtonDisabled = true;
    summaryHelperText = 'فعّل المشاركة العامة من إعدادات الملف الشخصي أولاً';
  } else if (summaryStatus && !summaryStatus.stale) {
    summaryButtonDisabled = true;
    summaryHelperText = 'لا يوجد تغيير جديد منذ آخر ملخص';
  } else if (summaryStatus && !summaryCooldownPassed) {
    summaryButtonDisabled = true;
    summaryHelperText = `آخر تحديث: منذ ${summaryDaysSince} ${summaryDaysSince === 1 ? 'يوم' : 'أيام'} — يمكنك التحديث بعد ${summaryDaysRemaining} ${summaryDaysRemaining === 1 ? 'يوم' : 'أيام'}`;
  }

  // ── عناصر الجرس ─────────────────────────────────────────────────────
  // إشعار الملخص بنفس الشروط التي تجعل زر «تحديث الملخص الآن» مفعّلاً
  const summaryNotifKey = summaryStatus && !summaryButtonDisabled
    ? `summary:${summaryStatus.generatedAt ?? 'none'}`
    : null;
  const accountCreatedMs = accountCreatedAt ? new Date(accountCreatedAt).getTime() : null;
  // اقتراح «أبرز إنجاز»: غير معتمد، ولا تثبيت من المعلم، ولم يُتجاهل، وشاهده محمّل ومصنّف
  const topSuggestionEv = topSuggestionId && highlight && highlight.pinnedId === null
    && state.dismissedTopSuggestion !== topSuggestionId
    ? (supabaseEv?.evidence ?? []).find(e => e.id === topSuggestionId && e.section_id !== null) ?? null
    : null;
  const topSuggestionItem = useMemo<NotificationItem | null>(() => topSuggestionEv ? {
    key: `pending:top-suggestion:${topSuggestionEv.id}`,
    kind: 'top-suggestion',
    evidenceId: topSuggestionEv.id,
    evidenceTitle: topSuggestionEv.title,
    sectionTitle: sections.find(s => s.id === topSuggestionEv.section_id)?.ttl ?? '',
    unread: false,
  } : null, [topSuggestionEv, sections]);
  const notifItems = useMemo<NotificationItem[]>(() => {
    const read = state.readAnnouncements ?? [];
    const seen = state.seenNotifications ?? [];
    const items: NotificationItem[] = [];
    // المعلّق أولاً، ولا يدخل seenNotifications أبداً (unread: false دائماً)
    if (bulkImportReadyCount > 0) items.push({ key: 'pending:bulk-import', kind: 'pending', count: bulkImportReadyCount, unread: false });
    if (topSuggestionItem) items.push(topSuggestionItem);
    if (summaryNotifKey) items.push({ key: summaryNotifKey, kind: 'summary', unread: !seen.includes(summaryNotifKey) });
    for (const r of reminders) items.push({ ...r, kind: 'reminder', unread: !seen.includes(r.key) });
    for (const ann of (announcements ?? []).slice(0, NOTIF_ANNOUNCEMENTS_LIMIT)) {
      // التعميم المنشور قبل إنشاء الحساب يُعامَل مقروءاً (حساب في الواجهة فقط)
      const beforeAccount = accountCreatedMs !== null && new Date(ann.created_at).getTime() < accountCreatedMs;
      items.push({ key: ann.id, kind: 'announcement', announcement: ann, unread: !beforeAccount && !read.includes(ann.id) });
    }
    return items;
  }, [bulkImportReadyCount, topSuggestionItem, summaryNotifKey, reminders, announcements, accountCreatedMs, state.readAnnouncements, state.seenNotifications]);
  // الشارة = غير المقروء + 1 للمعلّق (عدد إشعارات لا عدد ملفات)
  const unreadCount = notifItems.filter(i => i.unread || i.kind === 'pending' || i.kind === 'top-suggestion').length;

  // العدد إلى زر الجرس في Nav: يُرسل عند كل تغيّر، ويُعاد عند طلب Nav (تركيبها بعد Dashboard)
  const unreadCountRef = useRef(unreadCount);
  unreadCountRef.current = unreadCount;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent<number>(NOTIF_COUNT_EVENT, { detail: unreadCount }));
  }, [unreadCount]);
  useEffect(() => {
    const onRequest = () => window.dispatchEvent(new CustomEvent<number>(NOTIF_COUNT_EVENT, { detail: unreadCountRef.current }));
    window.addEventListener(REQUEST_NOTIF_COUNT_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_NOTIF_COUNT_EVENT, onRequest);
  }, []);

  // فتح اللوحة يعلّم كل ما فيها مقروءاً في كتابة واحدة، ويحفظ ما كان جديداً
  // لحظتها فتبقى نقاطه ظاهرة حتى الإغلاق
  const [unreadAtOpen, setUnreadAtOpen] = useState<ReadonlySet<string>>(() => new Set());
  const notifItemsRef = useRef(notifItems);
  notifItemsRef.current = notifItems;
  useEffect(() => {
    if (!notifOpen) { setUnreadAtOpen(new Set()); return; }
    const unread = notifItemsRef.current.filter(i => i.unread);
    setUnreadAtOpen(new Set(unread.map(i => i.key)));
    if (unread.length === 0) return;
    onMarkNotificationsSeen?.(
      unread.filter(i => i.kind === 'announcement').map(i => i.key),
      unread.filter(i => i.kind !== 'announcement').map(i => i.key),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen]);

  const handleRefreshSummary = async () => {
    if (!supabase || summaryRefreshBusy) return;
    setSummaryRefreshBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        onToast?.('يجب تسجيل الدخول أولاً', '⚠️');
        return;
      }
      const { data, error } = await supabase.functions.invoke('generate-portfolio-summaries', {
        body: {},
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) {
        onToast?.('تعذّر تحديث الملخص، حاول مجدداً', '❌');
        return;
      }
      if (data?.updated && data?.summarized) {
        onToast?.('تم تحديث الملخص بنجاح', '✅');
      } else if (data?.reason === 'sharing_disabled') {
        onToast?.('فعّل المشاركة العامة أولاً من إعدادات الملف الشخصي', 'ℹ️');
      } else if (data?.reason === 'no_evidence') {
        onToast?.('لا توجد شواهد مصنَّفة كافية لإنشاء ملخص بعد', 'ℹ️');
      } else {
        onToast?.('الملخص غير مؤهل للتحديث حالياً', 'ℹ️');
      }
      refetchSummaryStatus();
    } catch (err) {
      console.error('[Dashboard] فشل تحديث الملخص:', err);
      onToast?.('تعذّر تحديث الملخص، حاول مجدداً', '❌');
    } finally {
      setSummaryRefreshBusy(false);
    }
  };

  // ملخصات الأقسام العادية — يولّدها المسار الأسبوعي (generate-portfolio-summaries)،
  // والمعلم يغيّر hidden فقط. جلب واحد لكل صفوف المعلم.
  const [sectionSummaries, setSectionSummaries] = useState<Record<number, SectionSummary>>({});

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    supabase
      .from('section_ai_summaries')
      .select('section_id, ai_sentence, generated_at, hidden')
      .eq('portfolio_id', userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.warn('[Dashboard] تعذّر جلب ملخصات الأقسام:', error.message); return; }
        const map: Record<number, SectionSummary> = {};
        for (const row of data ?? []) map[row.section_id] = { ai_sentence: row.ai_sentence, generated_at: row.generated_at, hidden: row.hidden };
        setSectionSummaries(map);
      });
    return () => { cancelled = true; };
  }, [userId]);

  // تحديث متفائل، ويُعاد الوضع السابق إن فشل الطلب
  const toggleSummaryHidden = async (sectionId: number) => {
    const current = sectionSummaries[sectionId];
    if (!supabase || !userId || !current) return;
    const next = !current.hidden;
    setSectionSummaries(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], hidden: next } }));
    const { error } = await supabase
      .from('section_ai_summaries')
      .update({ hidden: next })
      .eq('portfolio_id', userId)
      .eq('section_id', sectionId);
    if (error) {
      console.warn('[Dashboard] تعذّر تحديث إخفاء الملخص:', error.message);
      setSectionSummaries(prev => (prev[sectionId] ? { ...prev, [sectionId]: { ...prev[sectionId], hidden: current.hidden } } : prev));
      onToast?.('تعذّر تحديث الملخص، حاول مجدداً', '❌');
    }
  };

  // إحصاءات الأدلة من جدول evidence مباشرة. bySections يُحسب على pickableSections (يستبعد بندي 5/10
  // مثل بقية النظام)، والمؤشر المغطّى = مؤشر من section_indicators له دليل
  // واحد على الأقل بنفس indicator_id. total شامل لكل الأقسام.
  const allEvidence = supabaseEv?.evidence;
  const evStats = useMemo(() => {
    const list = allEvidence ?? [];
    const coveredIndicators = new Set<string>();
    for (const e of list) {
      if (e.indicator_id) coveredIndicators.add(e.indicator_id);
    }
    // المؤشرات الرسمية فقط — المخصص لا يدخل في نسبة الاكتمال
    const bySections = pickableSections.map(s => {
      const official = s.indicators.filter(ind => !ind.isCustom);
      const filledSubs = official.filter(ind => coveredIndicators.has(ind.id)).length;
      const totalSubs = official.length;
      return {
        sectionId: s.id,
        filledSubs,
        totalSubs,
        completionPct: totalSubs > 0 ? Math.round((filledSubs / totalSubs) * 100) : 0,
      };
    });
    return {
      total: list.length,
      bySections,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvidence, sections]);
  const getSectionStat = (sectionId: number) => evStats.bySections.find(s => s.sectionId === sectionId);

  // قسم "التنويع في استراتيجيات التدريس" مُستبعد من صفوف الأقسام ونسبها —
  // له بطاقة في شبكة الأقسام الخاصة (SpecGrid).
  // نفس الاستبعاد يشمل الآن بندي 5 و10 (isResultsSection) — محتواهما بالكامل
  // واجهة أداة تحليل النتائج، لا مؤشرات فرعية عادية تُحتسب ضمن هذا النظام.
  const stratSection = sections.find(s => s.isStrat) ?? null;
  const resultsSections = sections.filter(s => s.isResultsSection);
  const improvementSection = resultsSections.find(s => s.id === 5) ?? null;
  const analysisSection = resultsSections.find(s => s.id === 10) ?? null;
  // عدد تنبيهات بند 5 — رأس الرئيسية وسطر حالة الشاشة من الحساب نفسه
  const improvementActionCount = useMemo(
    () => countImprovementActions(resultsAnalysis.analyses, resultsAnalysis.gradeBands),
    [resultsAnalysis.analyses, resultsAnalysis.gradeBands],
  );
  const nonStratSections = sections.filter(s => !s.isStrat && !s.isResultsSection);

  // عدّاد بطاقة الاستراتيجيات (شهري + تراكمي) — القسم هجين (استراتيجيات +
  // مؤشر فرعي عادي "مراعاة الفروق الفردية بين المتعلمين")، وmonthlyProgress
  // .getSectionMonthCount/getSectionYearTotal تحسبان section_id بالكامل من
  // monthly_progress بلا أي تمييز بين الاثنين، فتُقحمان أدلة مراعاة الفروق
  // الفردية ضمن رقم الاستراتيجيات خطأً (مثال: 6 فروق فردية + 2 استراتيجيات
  // تظهر كـ8). لذلك نحسب مباشرة من أدلة evidence الحقيقية ذات strategy_id غير
  // الفارغ لقسم 4 — لا فرق بين "الفروق الفردية" والاستراتيجيات لأن الأولى لا
  // تحمل strategy_id إطلاقاً (مؤشر عادي، لا كتالوج).
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const stratEvidence = stratSection
    ? (supabaseEv?.getBySection(stratSection.id) ?? []).filter(e => e.strategy_id)
    : [];
  const stratGroups = useMemo(() => {
    const map = new Map<string, typeof stratEvidence>();
    for (const e of stratEvidence) {
      const id = e.strategy_id as string;
      const arr = map.get(id) ?? [];
      arr.push(e);
      map.set(id, arr);
    }
    return Array.from(map.entries()).map(([id, evs]) => ({
      id,
      name: strategyNames[id] ?? '—',
      evidence: evs,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stratEvidence, strategyNames]);
  const stratsUsedThisMonth = new Set(
    stratEvidence
      .filter(e => {
        const d = new Date(e.created_at);
        return d.getFullYear() === curYear && (d.getMonth() + 1) === curMonth;
      })
      .map(e => e.strategy_id as string)
  ).size;
  const stratEvCount = stratEvidence.length;
  // «شواهد هذا العام» في بطاقة الرئيسية وشاشة الاستراتيجيات: داخل السنة الدراسية
  // الحالية فقط، بتعريف useMonthlyProgress نفسه (شهر created_at المحلي، كما يسجّله recordEvidence)
  const stratEvYearCount = stratEvidence.filter(e => {
    const d = new Date(e.created_at);
    return monthlyProgress?.isInAcademicYear({ year: d.getFullYear(), month: d.getMonth() + 1 }) ?? false;
  }).length;

  // "مراعاة الفروق الفردية بين المتعلمين" — مؤشر فرعي عادي في القسم الهجين،
  // منفصل كلياً عن الاستراتيجيات أعلاه. بطاقة الاستراتيجيات تعرض فقط أدلة
  // strategy_id غير الفارغ (stratGroups)، فهذا المؤشر لا يظهر هناك إطلاقاً رغم
  // كونه جزءاً طبيعياً من subs — له بطاقة حالة مستقلة أدناه بنفس نمط أي مؤشر
  // فرعي عادي (أدلته = evidence ذات indicator_id لهذا المؤشر).
  // المؤشر نفسه يُحدَّد بالاسم لا بالترتيب (subs[0]): ترتيب weight في
  // section_indicators غير مضمون. غير موجود ⇐ console.error وإخفاء البطاقة
  // (الشرط أدناه) لا كسر الصفحة. الحذف بمعرّف الدليل (onDeleteEv(ev.id)).
  const indivDiffIndicator = useMemo(() => findIndicatorByName(stratSection, 'الفروق الفردية'), [stratSection]);
  const indivDiffEvs = indivDiffIndicator
    // شواهد الاستراتيجيات (strategy_id) تُعرض في شاشة الاستراتيجيات وحدها
    ? (supabaseEv?.evidence ?? []).filter(e => e.indicator_id === indivDiffIndicator.id && !e.strategy_id)
    : [];

  // نسبة اكتمال البند بناءً على monthly_progress (عداد الشهر الحالي ÷ 3)
  const getMonthlyPct = (sectionId: number): number =>
    Math.min(100, Math.round(((monthlyProgress?.getSectionMonthCount(sectionId) ?? 0) / 3) * 100));

  // التقدم العام = completion من usePortfolioCompletion (props) — تراكمي عبر تغطية
  // evidence.indicator_id، موحَّد مع نفس الرقم المعروض بالمشاركة العامة
  // (Public.tsx عبر get_shared_portfolio). خطأ الجلب ⇐ 0% + رسالة بدل قيمة وهمية.
  const overallPct = completionError ? 0 : (completion?.overall_pct ?? 0);
  const completedSections = completionError ? 0 : (completion?.completed_sections ?? 0);
  const totalSections = completionError ? 0 : (completion?.total_sections ?? 0);

  // نقاط ومستوى الملف العام (نافذة متحركة لآخر 3 أشهر تقويمية، بصرف النظر عن
  // القسم) — مستقل كلياً عن overallPct/getMonthlyPct، لا يؤثر فيهما ولا يتأثر بهما
  const pointsLevel = monthlyProgress
    ? calculatePointsLevel(monthlyProgress.rows.map(r => ({ year: r.year, month: r.month, evidenceCount: r.evidence_count })))
    : null;

  // البند الأقل اكتمالاً — الخطوة التالية (بناءً على monthly_progress)
  const incompleteSections = nonStratSections.filter(s => getMonthlyPct(s.id) < 100);
  const nextSectionData = incompleteSections.length > 0
    ? incompleteSections.reduce((min, s) => getMonthlyPct(s.id) < getMonthlyPct(min.id) ? s : min)
    : null;

  // شاشة القسم العادي (SectionView) — الحالة هنا لا في App: كل ما تحتاجه
  // الشاشة (sections/supabaseEv/ملخصات بند 6) موجود في Dashboard، وإزالته
  // عند الانتقال لصفحة أخرى تصفّرها تلقائياً. الفتح يضيف مدخلاً في history
  // بالرابط نفسه، فزر الرجوع (المتصفح/الجوال) يغلق الشاشة عبر popstate بدل
  // الخروج من التطبيق. الحالة لا تُقرأ من الرابط، فالتحديث (F5) يعيد اللوحة.
  // كل فتح من شاشة مفتوحة يضيف مدخلاً (wathqDepth يزيد)، فزر المتصفح يرجع
  // خطوة، وزر «البنود» يرجع إلى الرئيسية مباشرة بـ go(-depth).
  // كل الأنواع لها شاشة: core (3.5ب)، strat وindiv (3.5ج)، analysis (3.5د)، improvement (3.5هـ)، archive (4.2).
  // حالة openScreen نفسها معرّفة أعلى المكوّن (قبل اشتقاقات الأرشيف).
  const sectionReturnScrollY = useRef(0);
  // تمرير إلى بداية قائمة الأقسام بعد الرجوع إلى الرئيسية (زر «البنود»)
  const pendingScrollToList = useRef(false);

  useEffect(() => {
    // بعد F5 والشاشة مفتوحة يبقى المدخل المضاف في السجل؛ تفريغه يمنع ضغطة
    // رجوع أولى لا تفعل شيئاً مرئياً (wathqSection مفتاح ما قبل 3.5ب)
    const st = window.history.state as Record<string, unknown> | null;
    if (st?.wathqScreen != null || st?.wathqSection != null) window.history.replaceState(null, '');
    const onPopState = (e: PopStateEvent) => {
      const screen = readScreenState(e.state)?.wathqScreen ?? null;
      setOpenScreen(screen);
      // الرجوع إلى الرئيسية يستعيد موضع التمرير
      if (!screen) {
        const toList = pendingScrollToList.current;
        pendingScrollToList.current = false;
        const y = sectionReturnScrollY.current;
        requestAnimationFrame(() => {
          if (toList) document.getElementById('sections-list')?.scrollIntoView({ behavior: 'smooth' });
          else window.scrollTo({ top: y, behavior: 'instant' });
        });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const pushScreen = (screen: OpenScreen) => {
    const cur = readScreenState(window.history.state);
    if (cur && sameScreen(cur.wathqScreen, screen)) return;
    const depth = (cur?.wathqDepth ?? 0) + 1;
    if (depth === 1) sectionReturnScrollY.current = window.scrollY;
    const next: ScreenHistoryState = { wathqScreen: screen, wathqDepth: depth };
    window.history.pushState(next, '');
    setOpenScreen(screen);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const openSection = (id: number) => pushScreen({ kind: 'core', id });
  /** يرجع إلى الرئيسية مهما كان العمق. يرجع false إن لم تكن شاشة مفتوحة. */
  const closeToHome = () => {
    const depth = readScreenState(window.history.state)?.wathqDepth ?? 0;
    if (depth > 0) window.history.go(-depth);
    return depth > 0;
  };
  /** يغلق أي شاشة مفتوحة ثم يمرّر إلى بداية قائمة الأقسام في الرئيسية */
  const goHomeAndScroll = () => {
    pendingScrollToList.current = true;
    if (closeToHome()) return; // التمرير في popstate
    pendingScrollToList.current = false;
    requestAnimationFrame(() => document.getElementById('sections-list')?.scrollIntoView({ behavior: 'smooth' }));
  };
  const closeSection = () => { closeToHome(); };

  /** يفتح شاشة البند التي يظهر فيها الشاهد — من عنصر اقتراح «أبرز إنجاز» في الجرس */
  const openEvidenceScreen = (evidenceId: string) => {
    const ev = supabaseEv?.evidence.find(e => e.id === evidenceId);
    if (!ev || ev.section_id === null) return;
    setNotifOpen(false);
    if (stratSection && ev.section_id === stratSection.id) {
      const indiv = !!indivDiffIndicator && ev.indicator_id === indivDiffIndicator.id && !ev.strategy_id;
      pushScreen({ kind: indiv ? 'indiv' : 'strat' });
    } else if (analysisSection && ev.section_id === analysisSection.id) {
      pushScreen({ kind: 'analysis' });
    } else if (improvementSection && ev.section_id === improvementSection.id) {
      pushScreen({ kind: 'improvement' });
    } else {
      openSection(ev.section_id);
    }
  };

  // زر «البنود» في شريط الجوال السفلي (Nav في App)
  const goHomeAndScrollRef = useRef(goHomeAndScroll);
  goHomeAndScrollRef.current = goHomeAndScroll;
  useEffect(() => {
    // الأرشيف شاشة، فيُغلق مع غيره عبر closeToHome
    const onShowSections = () => goHomeAndScrollRef.current();
    window.addEventListener(SHOW_SECTIONS_EVENT, onShowSections);
    return () => window.removeEventListener(SHOW_SECTIONS_EVENT, onShowSections);
  }, []);

  const openSectionData = openScreen?.kind === 'core' ? nonStratSections.find(s => s.id === openScreen.id) ?? null : null;
  // ملخص القسم للأقسام العادية فقط
  const openSectionIsCore = !!openSectionData && !openSectionData.isStrat && !openSectionData.isResultsSection;
  // شاشتا القسمين الخاصين — بلا مؤشر الفروق الفردية تُعرض الرئيسية
  const openSpecial = openScreen?.kind === 'strat' && stratSection ? 'strat'
    : openScreen?.kind === 'indiv' && stratSection && indivDiffIndicator ? 'indiv'
    : null;

  // إجمالي الأدلة من Supabase مباشرة — يتزامن بعد كل حذف أو إضافة
  const totalEvs = supabaseEv
    ? sections.reduce((sum, s) => sum + supabaseEv.getBySection(s.id).length, 0)
    : evStats.total;
  // بطاقتا الملخص — تُرسمان في عمود الملخص (سطح المكتب) وأعلى المحتوى (تحت 1024px)
  // بالقيم نفسها: currentMonthTotal، وnextSectionData، وoverallPct، وcompletedSections،
  // وtotalSections، وtotalEvs، وpointsLevel
  const monthCard = monthlyProgress ? (
    <MonthCard
      total={monthlyProgress.currentMonthTotal}
      monthName={monthlyProgress.currentMonthName}
      year={monthlyProgress.currentYear}
      nextSection={nextSectionData}
      onOpenNext={() => { if (nextSectionData) openSection(nextSectionData.id); }}
    />
  ) : null;
  const cumulativeCard = (
    <CumulativeCard
      overallPct={overallPct}
      error={!!completionError}
      completedSections={completedSections}
      totalSections={totalSections}
      totalEvs={totalEvs}
      levelLabel={pointsLevel?.levelLabel ?? null}
    />
  );

  // تنقل عمود الملخص: الأقسام الثمانية بترتيبها الثابت، ونقطة كل قسم بمستواه
  // التراكمي — نفس covered/total/n في رأس SectionView
  const sidebarCoreItems: SidebarCoreItem[] = nonStratSections.map(s => {
    const stat = getSectionStat(s.id);
    const total = stat?.totalSubs ?? s.indicators.filter(ind => !ind.isCustom).length;
    const n = supabaseEv?.getBySection(s.id).length ?? 0;
    return { id: s.id, ttl: s.ttl, icon: s.icon, level: sectionLevel(stat?.filledSubs ?? 0, total, n) };
  });
  const coreLevelById = new Map<number, Level>(sidebarCoreItems.map(it => [it.id, it.level]));
  // الأقسام الخاصة بترتيب الشبكة وشروطها نفسها
  const sidebarSpecialItems: SidebarSpecialItem[] = [];
  if (stratSection) sidebarSpecialItems.push({ key: 'strat', title: stratSection.ttl, icon: stratSection.icon, onOpen: () => pushScreen({ kind: 'strat' }) });
  if (stratSection && indivDiffIndicator) sidebarSpecialItems.push({ key: 'indiv', title: indivDiffIndicator.name_ar, icon: 'ti-users', onOpen: () => pushScreen({ kind: 'indiv' }) });
  if (analysisSection) sidebarSpecialItems.push({ key: 'analysis', title: analysisSection.ttl, icon: analysisSection.icon, onOpen: () => pushScreen({ kind: 'analysis' }) });
  if (improvementSection) sidebarSpecialItems.push({ key: 'improvement', title: improvementSection.ttl, icon: improvementSection.icon, onOpen: () => pushScreen({ kind: 'improvement' }) });
  // العنصر النشط من openScreen؛ الأرشيف والرئيسية بلا عنصر نشط
  const sidebarActiveKey = !openScreen || openScreen.kind === 'archive' ? null
    : openScreen.kind === 'core' ? `core-${openScreen.id}`
    : openScreen.kind;

  // منتقي البند بخطوتين (القسم ثم المؤشر) — محتوى واحد: ورقة سفلية تحت
  // 1024px، ونافذة وسط الشاشة فوقها. المؤشر يُختار قبل فتح النموذج، فيُفتح
  // عليه مختاراً (نموذج App على سطح المكتب، والورقة على الجوال)
  const pickIndicator = (ind: SectionIndicator) => {
    const sec = pickerSection;
    if (!sec) return;
    if (isDesktop) {
      setSectionPickerOpen(false);
      onAddEvClick(sec.id, ind.name_ar, undefined, ind.id);
    } else {
      handlePickIndicator(sec, ind);
    }
  };
  const closeSectionPicker = () => setSectionPickerOpen(false);
  // الرسمية أولاً ثم المخصصة، مع عدد شواهد كل مؤشر من الشواهد المحمّلة
  const pickerItems = pickerSection
    ? [...pickerSection.indicators.filter(ind => !ind.isCustom), ...pickerSection.indicators.filter(ind => ind.isCustom)].map(ind => {
        const count = supabaseEv?.evidence.filter(e => e.indicator_id === ind.id).length ?? 0;
        return { ...ind, sub: count === 0 ? 'لا شواهد بعد' : nEv(count) };
      })
    : [];
  const sectionPickerTitle = pickerSection ? 'اختر المؤشر' : 'اختر البند';
  const sectionPickerBody = (
    <>
      <SheetHeader title={sectionPickerTitle} onClose={closeSectionPicker} />
      <div className="overflow-y-auto flex-1 p-3 pb-6">
        {/* nonStratSections لا pickableSections — قسم 4 (isStrat) يستلزم
            strategy_id إجبارياً الآن، فلا يظهر ضمن منتقي "إضافة شاهد عادي"
            العام؛ له تدفّقه الخاص عبر onAddStrategyClick. وكلها أقسام core،
            فمؤشراتها المخصصة مسموحة */}
        {!pickerSection ? (
          <SectionPickList sections={nonStratSections} levelById={coreLevelById} onPick={setPickerSection} />
        ) : (
          <IndicatorPickStep
            sectionTitle={pickerSection.ttl}
            backLabel="رجوع"
            onBack={() => setPickerSection(null)}
            items={pickerItems}
            onPick={pickIndicator}
          />
        )}
      </div>
    </>
  );

  // ── عرض أرشيف الشهر المختار — صفحة فرعية مستقلة، لا تستبدل لوحة الشهر
  // الحالي بشكل دائم، بل تُستبدل مؤقتاً عند التصفح وتُستعاد بزر "العودة" ──
  const archiveView = archiveMonth && supabaseEv && (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 mb-4">
        <button
          type="button"
          onClick={closeSection}
          className="self-start h-9 px-1 inline-flex items-center gap-2 text-[length:var(--fs-sm)] font-bold text-[var(--t2)] cursor-pointer"
        >
          <i className="ti ti-arrow-right text-[16px]" /> العودة للوحة الرئيسية
        </button>
        <h1 className="flex items-center gap-2 text-[length:var(--fs-lg)] font-bold text-[var(--t1)] leading-[1.4]">
          <i className="ti ti-archive text-[20px] text-[var(--t2)] shrink-0" />
          أرشيف {archiveMonth.label} {archiveMonth.year}
        </h1>
      </div>

      {/* المعدل الشهري — منقول من الرئيسية (4.2)، بنفس مصدر monthlyProgress */}
      {monthlyProgress && (
        <div className="mb-4 p-4 rounded-[var(--r-md)] border border-[var(--bd)] bg-[var(--s1)]">
          <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mb-2">المعدل الشهري</div>
          <div className="flex items-end gap-2 mb-2">
            <div className="text-[length:var(--fs-xl)] font-bold text-[var(--t1)] leading-none">{monthlyProgress.monthlyAvg}</div>
            <div className="text-[length:var(--fs-sm)] text-[var(--t3)]">شاهد / شهر</div>
          </div>
          <div className="text-[length:var(--fs-xs)] text-[var(--t3)]">
            إجمالي <span className="font-bold text-[var(--t1)]">{monthlyProgress.yearTotal}</span> شاهد
            خلال <span className="font-bold text-[var(--t1)]">{monthlyProgress.monthsElapsed}</span>{' '}
            {monthlyProgress.monthsElapsed === 1 ? 'شهر' : 'أشهر'} من بداية السنة
          </div>
        </div>
      )}

      {isArchiveEditable ? (
        <div className="mb-4 p-4 rounded-[var(--r-md)] border border-[var(--bd)] bg-[var(--s1)] flex items-center gap-3">
          <i className="ti ti-clock-hour-4 text-[20px] text-[var(--warn)] shrink-0" />
          <span className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">
            هذا الشهر سيُقفَل للتعديل {archiveLockLabel} — يمكنك الآن إضافة/تعديل/حذف الشواهد المسجَّلة فيه.
          </span>
        </div>
      ) : (
        <div className="mb-4 p-4 rounded-[var(--r-md)] border border-[var(--bd)] bg-[var(--s1)] flex items-center gap-3">
          <i className="ti ti-lock text-[20px] text-[var(--t3)] shrink-0" />
          <span className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">عرض فقط — انتهت نافذة التعديل المسموحة لهذا الشهر.</span>
        </div>
      )}

      <div className="flex flex-col gap-3 pb-[100px] lg:pb-0">
        {archiveSectionsToShow.map(sec => {
          const secEv = archiveEvidenceBySection[sec.id] || [];
          return (
            <div key={sec.id} className="bg-[var(--s1)] rounded-[var(--r-md)] border border-[var(--bd)] overflow-hidden">
              <div className="flex items-center gap-3 py-3 px-3.5">
                <span className="w-10 h-10 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[20px] text-[var(--t2)] shrink-0">
                  <i className={`ti ${sec.icon}`} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)] leading-normal">{sec.ttl}</div>
                  <div className="text-[length:var(--fs-xs)] text-[var(--t3)]">{secEv.length} دليل هذا الشهر</div>
                </div>
                {isArchiveEditable && (
                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setArchiveAddTarget({ open: true, sectionId: sec.id, sub: sec.subs[0] ?? 'عام' })}
                      className={BTN_SM}
                    >
                      <i className="ti ti-plus text-[16px]" /> إضافة شاهد
                    </button>
                  </div>
                )}
              </div>
              <div className="border-t border-[var(--bd)]">
                <EvidenceList
                  sectionId={sec.id}
                  evidence={secEv}
                  loading={false}
                  onDelete={supabaseEv.deleteEvidence}
                  onAddClick={() => setArchiveAddTarget({ open: true, sectionId: sec.id, sub: sec.subs[0] ?? 'عام' })}
                  readOnly={!isArchiveEditable}
                />
              </div>
            </div>
          );
        })}
        {archiveSectionsToShow.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-[var(--r-md)] bg-[var(--s2)] flex items-center justify-center text-[32px] text-[var(--t3)] mb-3">
              <i className="ti ti-archive-off" />
            </div>
            <p className="text-[length:var(--fs-sm)] font-bold text-[var(--t2)]">لا توجد شواهد مسجّلة لهذا الشهر</p>
          </div>
        )}
      </div>
    </div>
  );

  // ── التلميحات ───────────────────────────────────────────────────────
  // تلميح واحد في كل مرة (hint:add ثم hint:bell)، في الرئيسية فقط، ولا شيء
  // مفتوح من أوراق Dashboard. نوافذ App (z-500) تغطيه بخلفيتها.
  const seenHints = state.seenHints ?? [];
  const anyOverlayOpen = sectionPickerOpen || fabExpanded || toolsOpen || notifOpen || mobileSheet.open
    || isBulkImportOpen || isBulkImportReviewOpen || isHarvestReportOpen || archiveAddTarget.open
    || quickCapture.pickerSheetOpen || quickCapture.voiceSheetOpen || quickCapture.voiceConsentPromptOpen;
  const activeHint = openScreen || anyOverlayOpen ? null
    : !seenHints.includes('hint:add') ? 'hint:add'
    : !seenHints.includes('hint:bell') ? 'hint:bell'
    : null;

  return (
    <div className="flex min-h-[calc(100vh-72px)]">
      {activeHint === 'hint:add' && (
        <Hint
          key={isDesktop ? 'add-desk' : 'add-mob'}
          targetId={isDesktop ? 'sidebar-add-ev' : 'fab-add'}
          placement={isDesktop ? 'below' : 'above'}
          text="من هنا تضيف شواهدك في أي بند"
          onDismiss={() => onMarkHintSeen?.('hint:add')}
        />
      )}
      {activeHint === 'hint:bell' && (
        <Hint
          targetId="nav-bell"
          placement="below"
          text="هنا تصلك التعاميم والتذكيرات، وتنبيه ملفات الاستيراد"
          onDismiss={() => onMarkHintSeen?.('hint:bell')}
        />
      )}
      <main className="flex-1 p-3 sm:p-5 md:py-9 md:px-8 min-w-0 overflow-x-hidden">
        {archiveMonth ? archiveView : openSectionData ? (
          <SectionView
            section={openSectionData}
            evidence={supabaseEv?.evidence ?? []}
            onBack={closeSection}
            onAddEvClick={onAddEvClick}
            onDeleteEv={onDeleteEv}
            onEditEv={onEditEv}
            sectionSummary={openSectionIsCore ? sectionSummaries[openSectionData.id] ?? null : null}
            onToggleSummaryHidden={openSectionIsCore ? toggleSummaryHidden : undefined}
            indicatorHandlers={openSectionIsCore && onAddIndicator && onRenameIndicator && onDeleteIndicator
              ? { onAddIndicator, onRenameIndicator, onDeleteIndicator }
              : undefined}
            highlight={highlight}
          />
        ) : openSpecial === 'strat' && stratSection ? (
          <StrategiesView
            icon={stratSection.icon}
            title={stratSection.ttl}
            evCount={stratEvCount}
            yearEvCount={stratEvYearCount}
            monthName={monthlyProgress?.currentMonthName}
            usedThisMonth={stratsUsedThisMonth}
            groups={stratGroups}
            onBack={closeSection}
            onAddForGroup={group => onAddEvClick(stratSection.id, group.name, group.id)}
            onAddStrategy={onAddStrategyClick}
            onDeleteEv={onDeleteEv}
            highlight={highlight}
          />
        ) : openSpecial === 'indiv' && stratSection && indivDiffIndicator ? (
          <IndivDiffView
            title={indivDiffIndicator.name_ar}
            evidence={indivDiffEvs}
            onBack={closeSection}
            onAdd={() => onAddEvClick(stratSection.id, indivDiffIndicator.name_ar, undefined, indivDiffIndicator.id)}
            onDeleteEv={onDeleteEv}
            highlight={highlight}
          />
        ) : openScreen?.kind === 'analysis' && analysisSection ? (
          <AnalysisView
            icon={analysisSection.icon}
            title={analysisSection.ttl}
            analysisCount={resultsAnalysis.analyses.length}
            loading={resultsAnalysis.loading}
            onBack={closeSection}
            sectionId={analysisSection.id}
            indicators={analysisSection.indicators}
            evidence={supabaseEv?.evidence ?? []}
            onEditEv={ev => onEditEv(analysisSection.id, ev)}
            onDeleteEv={onDeleteEv}
            highlight={highlight}
          >
            <AnalysisSectionBody
              sections={sections}
              userId={userId}
              supabaseEv={supabaseEv}
              gradeBands={resultsAnalysis.gradeBands}
              analyses={resultsAnalysis.analyses}
              saveAnalysis={resultsAnalysis.saveAnalysis}
              onEvidenceSaved={onEvidenceSaved}
              onToast={onToast}
              focusAnalysisId={focusAnalysisId}
              onFocusHandled={() => setFocusAnalysisId(null)}
            />
          </AnalysisView>
        ) : openScreen?.kind === 'improvement' && improvementSection ? (
          <ImprovementView
            icon={improvementSection.icon}
            title={improvementSection.ttl}
            actionCount={improvementActionCount}
            loading={resultsAnalysis.loading}
            onBack={closeSection}
            sectionId={improvementSection.id}
            indicators={improvementSection.indicators}
            evidence={supabaseEv?.evidence ?? []}
            onEditEv={ev => onEditEv(improvementSection.id, ev)}
            onDeleteEv={onDeleteEv}
            highlight={highlight}
          >
            <ImprovementActionsBody
              section={improvementSection}
              userId={userId}
              supabaseEv={supabaseEv}
              gradeBands={resultsAnalysis.gradeBands}
              analyses={resultsAnalysis.analyses}
              runSmartCheck={resultsAnalysis.runSmartCheck}
              onEvidenceSaved={onEvidenceSaved}
              onToast={onToast}
              onViewInAnalysis={handleViewInAnalysis}
            />
          </ImprovementView>
        ) : <>
        {/* سطر التحية — بدل الـ hero */}
        <div className="mb-4 px-1">
          <div className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)] leading-tight">مرحباً، {state.profile.name}</div>
          <div className="mt-1 text-[length:var(--fs-xs)] text-[var(--t3)]">{formatHijri(new Date())}</div>
        </div>

        {showWelcome && (
          <WelcomeCard
            profileDone={avatarDone}
            evidenceDone={welcomeEvidenceDone}
            shareDone={shareEnabled}
            showContactNudge={showContactNudge}
            onOpenSettings={() => onOpenProfileSettings?.()}
            onAddEvidence={openSectionPicker}
            onSkipAvatar={() => onUpdateWelcome?.({ welcomeNoAvatar: true })}
            onDismiss={() => onUpdateWelcome?.({ welcome: 'dismissed' })}
          />
        )}

        {/* بطاقتا الملخص — تحت 1024px؛ على سطح المكتب في عمود الملخص (Sidebar) */}
        <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {monthCard}
          {cumulativeCard}
        </div>

        {/* SECTIONS */}
        <div id="sections-list" className="flex flex-col gap-2 pb-[100px] lg:pb-0 scroll-mt-24">
          {/* بترتيب sections الثابت، كتنقل عمود الملخص — .secr في النموذج */}
          {nonStratSections.map(sec => {
            const secStat = getSectionStat(sec.id);
            const filledSubs = secStat?.filledSubs ?? 0;
            const totalSubs = secStat?.totalSubs ?? sec.indicators.filter(ind => !ind.isCustom).length;
            // المستوى نفسه في عمود الملخص ورأس شاشة القسم
            const level = coreLevelById.get(sec.id) ?? 'n';

            return (
              <button
                key={sec.id}
                type="button"
                id={`sc-${sec.id}`}
                onClick={() => openSection(sec.id)}
                className="w-full text-right flex items-center gap-3 px-3.5 py-3 rounded-[var(--r-md)] bg-[var(--s1)] border border-[var(--bd)] hover:border-[var(--bd2)] transition-colors duration-150 cursor-pointer scroll-mt-24 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t2)]"
              >
                <span className="w-10 h-10 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[20px] text-[var(--t2)] shrink-0">
                  <i className={`ti ${sec.icon}`} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <b className="min-w-0 truncate text-[length:var(--fs-md)] font-bold text-[var(--t1)] leading-normal">{sec.ttl}</b>
                    <LevelBadge level={level} />
                  </span>
                  <small className="block mt-0.5 text-[length:var(--fs-xs)] text-[var(--t3)]">
                    {filledSubs} من {totalSubs} مؤشرات
                    {monthlyProgress && ` · ${monthlyProgress.currentMonthName}: ${monthlyProgress.getSectionMonthCount(sec.id)}`}
                  </small>
                  <span className="block mt-2 h-1.5 rounded-[var(--r-full)] bg-[var(--s3)] overflow-hidden">
                    <span
                      className="block h-full rounded-[var(--r-full)] bg-[var(--accent)] transition-[width] duration-350"
                      style={{ width: `${totalSubs > 0 ? (filledSubs / totalSubs) * 100 : 0}%` }}
                    />
                  </span>
                </span>
                <i className="ti ti-chevron-left text-[20px] shrink-0 text-[var(--t3)]" />
              </button>
            );
          })}

          {/* شبكة الأقسام الخاصة (4.1) — كل بطاقة تفتح شاشة قسمها. التمرير عند
              الرجوع يستهدف sections-list لا معرّفات sc-*. بطاقتا 10 و5
              تظهران أثناء تحميل resultsAnalysis بسطر «جارٍ التحميل…» فلا تقفز الشبكة. */}
          <SpecGrid>
            {stratSection && (
              <SpecCard
                id={`sc-${stratSection.id}`}
                icon={stratSection.icon}
                title={stratSection.ttl}
                desc="الاستراتيجيات المفعّلة وأدلتها"
                status={monthlyProgress
                  ? `استراتيجيات ${monthlyProgress.currentMonthName}: ${stratsUsedThisMonth} · شواهد هذا العام: ${stratEvYearCount}`
                  : undefined}
                onOpen={() => pushScreen({ kind: 'strat' })}
              />
            )}
            {stratSection && indivDiffIndicator && (
              <SpecCard
                id="sc-indiv"
                icon="ti-users"
                title={indivDiffIndicator.name_ar}
                desc="شواهد مراعاة الفروق الفردية"
                status={indivDiffEvs.length > 0 ? nEv(indivDiffEvs.length) : 'لم يُوثَّق بعد'}
                // نفس شرط دائرة IndivDiffView
                dot={indivDiffEvs.length >= 2 ? 'over' : indivDiffEvs.length === 1 ? 'basic' : 'idle'}
                onOpen={() => pushScreen({ kind: 'indiv' })}
              />
            )}
            {analysisSection && (
              <SpecCard
                id={`sc-${analysisSection.id}`}
                icon={analysisSection.icon}
                title={analysisSection.ttl}
                desc="رفع كشوف الدرجات ومقارنتها"
                status={resultsAnalysis.loading ? 'جارٍ التحميل…'
                  : resultsAnalysis.analyses.length > 0 ? `تحليلات محفوظة: ${resultsAnalysis.analyses.length}` : 'لا تحليلات بعد'}
                onOpen={() => pushScreen({ kind: 'analysis' })}
              />
            )}
            {improvementSection && (
              <SpecCard
                id={`sc-${improvementSection.id}`}
                icon={improvementSection.icon}
                title={improvementSection.ttl}
                desc="خطط علاجية وتكريم المتفوقين"
                status={resultsAnalysis.loading ? 'جارٍ التحميل…'
                  : improvementActionCount > 0 ? `إجراءات تحتاج متابعة: ${improvementActionCount}` : 'لا إجراءات حالياً'}
                onOpen={() => pushScreen({ kind: 'improvement' })}
              />
            )}
          </SpecGrid>
        </div>
        </>}

        <footer className="mt-12 pt-6 border-t border-[var(--bd)] text-center">
          <p className="text-[length:var(--fs-xs)] text-[var(--t3)]">
            جميع الحقوق محفوظة لدى <span className="inline-flex items-center gap-1 align-middle text-[var(--t2)]"><img src="/brand/mark.svg" alt="" aria-hidden="true" className="h-4 w-auto" />وثق</span> © {new Date().getFullYear()}
          </p>
        </footer>
      </main>

      {/* عمود الملخص — سطح المكتب فقط، يسار المحتوى (RTL) كما في النموذج، ظاهر في كل الشاشات */}
      <Sidebar
        monthCard={monthCard}
        cumulativeCard={cumulativeCard}
        onAddEvidence={() => { onMarkHintSeen?.('hint:add'); openSectionPicker(); }}
        coreItems={sidebarCoreItems}
        onOpenCore={openSection}
        specialItems={sidebarSpecialItems}
        activeKey={sidebarActiveKey}
      />

      {/* FAB Speed Dial — Mobile only */}
      {fabExpanded && (
        <div
          className="lg:hidden fixed inset-0 z-[240] bg-black/55"
          onClick={() => setFabExpanded(false)}
        />
      )}

      <input
        type="file"
        accept="image/*"
        hidden
        ref={quickCapture.fileInputRef}
        onChange={quickCapture.onFileSelected}
      />

      <div className="lg:hidden fixed z-[250] flex flex-col items-end gap-3" style={{ bottom: '80px', left: '16px' }}>
        {fabExpanded && (
          <>
            <button
              type="button"
              className={FAB_ITEM}
              style={{ animation: 'fadeUp .25s var(--sp) both' }}
              onClick={() => { setFabExpanded(false); openSectionPicker(); }}
              title="إضافة شاهد"
            >
              إضافة شاهد
              <i className="ti ti-list-check text-[20px] text-[var(--t2)]" />
            </button>
            <button
              type="button"
              className={FAB_ITEM}
              style={{ animation: 'fadeUp .25s var(--sp) both .04s' }}
              onClick={() => { setFabExpanded(false); quickCapture.openPicker(); }}
              title="التقاط سريع"
            >
              التقاط سريع
              <i className="ti ti-camera text-[20px] text-[var(--t2)]" />
            </button>
            <button
              type="button"
              className={FAB_ITEM}
              style={{ animation: 'fadeUp .25s var(--sp) both .06s' }}
              onClick={() => { setFabExpanded(false); setIsBulkImportOpen(true); }}
              title="استيراد جماعي"
            >
              استيراد جماعي
              <i className="ti ti-photo-up text-[20px] text-[var(--t2)]" />
            </button>
            {voiceFeatureEnabled && (
              <button
                type="button"
                className={FAB_ITEM}
                style={{ animation: 'fadeUp .25s var(--sp) both .08s' }}
                onClick={() => { setFabExpanded(false); quickCapture.startVoiceCapture(); }}
                title="تسجيل صوتي سريع"
              >
                تسجيل صوتي سريع
                <i className="ti ti-microphone text-[20px] text-[var(--t2)]" />
              </button>
            )}
          </>
        )}

        <button
          type="button"
          id="fab-add"
          className="w-14 h-14 flex items-center justify-center rounded-[var(--r-full)] bg-[var(--accent)] text-[var(--bg)] active:scale-95 transition-transform duration-150 cursor-pointer"
          onClick={() => { onMarkHintSeen?.('hint:add'); setFabExpanded(prev => !prev); }}
          title="إضافة شاهد"
        >
          <i
            className="ti ti-plus text-[24px] transition-transform duration-250"
            style={{ transform: fabExpanded ? 'rotate(45deg)' : 'none' }}
          />
        </button>
      </div>

      {/* منتقي البند (الخطوة الأولى) — المحتوى نفسه: ورقة سفلية تحت 1024px، ونافذة وسط الشاشة فوقها */}
      {isDesktop ? (
        sectionPickerOpen && (
          <div
            className="fixed inset-0 bg-black/55 z-[500] flex items-center justify-center p-4"
            style={{ animation: 'fadeIn .25s both' }}
            onClick={e => { if (e.target === e.currentTarget) closeSectionPicker(); }}
          >
            <div role="dialog" aria-label={sectionPickerTitle} className="relative overflow-hidden flex flex-col w-[520px] max-h-[86vh] pt-4 bg-[var(--s1)] border border-[var(--bd2)] rounded-[var(--r-lg)]">
              {sectionPickerBody}
            </div>
          </div>
        )
      ) : (
        <BottomSheet isOpen={sectionPickerOpen} onClose={closeSectionPicker}>
          {sectionPickerBody}
        </BottomSheet>
      )}

      {/* Bottom Sheet — التقاط سريع: اختيار البند ثم المؤشر الفرعي — جوال فقط */}
      <BottomSheet isOpen={quickCapture.pickerSheetOpen} onClose={quickCapture.cancelPending}>
        <SheetHeader title={quickCapture.pendingSection ? 'اختر المؤشر الفرعي' : 'اختر البند'} onClose={quickCapture.cancelPending} />
        <div className="overflow-y-auto flex-1 p-3 pb-6">
          {quickCapture.pendingPreviewUrl && (
            <img
              src={quickCapture.pendingPreviewUrl}
              alt="الصورة المختارة"
              className="w-full max-h-[160px] object-cover rounded-[var(--r-md)] border border-[var(--bd)] mb-3"
            />
          )}
          {!quickCapture.pendingSection ? (
            /* nonStratSections — نفس استبعاد قسم 4 أعلاه، لنفس السبب */
            <SectionPickList sections={nonStratSections} onPick={quickCapture.selectSection} />
          ) : (
            <IndicatorPickStep
              sectionTitle={quickCapture.pendingSection.ttl}
              backLabel="رجوع لاختيار البند"
              onBack={quickCapture.backToSectionPicker}
              loading={quickCapture.indicatorsLoading}
              disabled={quickCapture.saving}
              busy={quickCapture.saving}
              items={quickCapture.sectionIndicators}
              onPick={quickCapture.saveToIndicator}
            />
          )}
        </div>
      </BottomSheet>

      {/* Bottom Sheet — تسجيل صوتي سريع (Beta) — جوال فقط */}
      <BottomSheet isOpen={quickCapture.voiceSheetOpen || quickCapture.voiceConsentPromptOpen} onClose={quickCapture.cancelVoiceCapture}>
        <SheetHeader title="تسجيل صوتي سريع" badge="قيد التطوير" onClose={quickCapture.cancelVoiceCapture} />
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {!VOICE_CAPTURE_ENABLED ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-[var(--r-md)] bg-[var(--s2)] flex items-center justify-center text-[32px] text-[var(--t2)]">
                <i className="ti ti-tools" />
              </div>
              <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed max-w-[260px]">{VOICE_CAPTURE_DISABLED_MESSAGE}</p>
              <div><button type="button" onClick={quickCapture.cancelVoiceCapture} className={BTN_SM}>
                إغلاق
              </button></div>
            </div>
          ) : quickCapture.voiceConsentPromptOpen ? (
            <div className="bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4 space-y-3">
              <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">{AI_CONSENT_TEXT}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={quickCapture.acceptVoiceConsent} className={BTN_PRI_SM}>أوافق ومتابعة</button>
                <button type="button" onClick={quickCapture.cancelVoiceCapture} className={BTN_GH_SM}>إلغاء</button>
              </div>
            </div>
          ) : quickCapture.voiceRecording.error ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <i className="ti ti-alert-circle text-[32px] text-[var(--danger)]" />
              <p className="text-[length:var(--fs-sm)] text-[var(--danger)]">{quickCapture.voiceRecording.error}</p>
              <div><button type="button" onClick={quickCapture.cancelVoiceCapture} className={BTN_SM}>إغلاق</button></div>
            </div>
          ) : quickCapture.voiceSaving ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <i className="ti ti-loader animate-spin text-[32px] text-[var(--t2)]" />
              <p className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">جاري تفريغ التسجيل وحفظ الشاهد...</p>
            </div>
          ) : quickCapture.voiceRecording.isRecording ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-20 h-20 rounded-[var(--r-full)] bg-[var(--s2)] border-2 border-[var(--danger)] flex items-center justify-center text-[32px] text-[var(--danger)] motion-safe:animate-pulse">
                <i className="ti ti-microphone" />
              </div>
              <p className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">جاري التسجيل... {quickCapture.voiceRecording.secondsElapsed}/30 ث</p>
              <button
                type="button"
                onClick={quickCapture.voiceRecording.stopRecording}
                className={`${BTN_DNG} flex-none`}
              >
                <i className="ti ti-player-stop-filled text-[16px]" /> إيقاف التسجيل
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <i className="ti ti-loader animate-spin text-[32px] text-[var(--t2)]" />
              <p className="text-[length:var(--fs-sm)] text-[var(--t2)]">جاري تجهيز التسجيل...</p>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Bottom Sheets — استيراد جماعي: اختيار الصور ثم مراجعة التصنيف */}
      <BulkImportPicker
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        userId={userId}
        onToast={onToast ?? (() => {})}
        onClassificationSettled={refetchBulkImportReadyCount}
      />
      <BulkImportReview
        isOpen={isBulkImportReviewOpen}
        onClose={() => { setIsBulkImportReviewOpen(false); refetchBulkImportReadyCount(); }}
        userId={userId}
        sections={nonStratSections}
        stratSectionId={stratSection?.id}
        supabaseEv={supabaseEv}
        onEvidenceSaved={onEvidenceSaved}
        onToast={onToast}
      />

      <HarvestReportSheet
        isOpen={isHarvestReportOpen}
        onClose={() => setIsHarvestReportOpen(false)}
        userId={userId}
        state={state}
        sections={sections}
        academicDates={academicDates}
        onToast={onToast}
      />

      {/* قائمة «أدوات» — تُفتح من زر الشريط العلوي (OPEN_TOOLS_EVENT) */}
      <ToolsSheet
        isOpen={toolsOpen}
        onClose={closeTools}
        summaryHelperText={summaryHelperText}
        summaryButtonDisabled={summaryButtonDisabled}
        summaryRefreshBusy={summaryRefreshBusy}
        onRefreshSummary={handleRefreshSummary}
        onOpenHarvest={() => { setToolsOpen(false); setIsHarvestReportOpen(true); }}
        onOpenAnalysis={analysisSection ? () => { setToolsOpen(false); pushScreen({ kind: 'analysis' }); } : undefined}
        onOpenBulkImport={bulkImportEnabled ? () => { setToolsOpen(false); setIsBulkImportOpen(true); } : undefined}
        archiveMonths={archiveMonths}
        onPickArchiveMonth={m => { setToolsOpen(false); pushScreen({ kind: 'archive', month: m }); }}
      />

      {/* لوحة الإشعارات — تُفتح من زر الجرس في الشريط العلوي (OPEN_NOTIFICATIONS_EVENT) */}
      <NotificationsSheet
        isOpen={notifOpen}
        onClose={closeNotif}
        items={notifItems}
        unreadAtOpen={unreadAtOpen}
        onOpenSummary={() => { setNotifOpen(false); setToolsOpen(true); }}
        onOpenBulkReview={() => { setNotifOpen(false); setIsBulkImportReviewOpen(true); }}
        onApproveTopSuggestion={id => onApproveTopSuggestion?.(id)}
        onDismissTopSuggestion={id => onDismissTopSuggestion?.(id)}
        onOpenTopSuggestion={openEvidenceScreen}
      />

      {/* Bottom Sheet — إضافة شاهد (الخطوة الثانية) — جوال فقط */}
      {supabaseEv && (
        <BottomSheet isOpen={mobileSheet.open} onClose={() => mobileFormRef.current?.requestClose()}>
          <EvidenceForm
            ref={mobileFormRef}
            isOpen={mobileSheet.open}
            onClose={closeMobileSheet}
            sectionId={mobileSheet.sectionId}
            sub={mobileSheet.sub}
            indicatorId={mobileSheet.indicatorId}
            userId={userId}
            supabaseEv={supabaseEv}
            onEvidenceSaved={onEvidenceSaved ?? (() => {})}
            onToast={onToast ?? (() => {})}
            aiConsentGiven={aiConsentGiven}
            onGiveAiConsent={onGiveAiConsent}
          />
        </BottomSheet>
      )}

      {/* إضافة شاهد من أرشيف شهر سابق — ضمن نافذة التعديل المسموحة فقط */}
      {supabaseEv && archiveAddTarget.open && (
        <EvidenceModal
          isOpen={archiveAddTarget.open}
          onClose={() => setArchiveAddTarget(prev => ({ ...prev, open: false }))}
          sectionId={archiveAddTarget.sectionId}
          sub={archiveAddTarget.sub}
          userId={userId}
          supabaseEv={supabaseEv}
          onEvidenceSaved={onEvidenceSaved ?? (() => {})}
          onToast={onToast ?? (() => {})}
          createdAt={archiveCreatedAt}
          aiConsentGiven={aiConsentGiven}
          onGiveAiConsent={onGiveAiConsent}
        />
      )}
    </div>
  );
}
