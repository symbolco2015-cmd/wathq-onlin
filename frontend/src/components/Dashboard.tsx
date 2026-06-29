import { useMemo, useState } from 'react';
import type { AppState, SectionData, Announcement, AcademicDate } from '../types';
import Sidebar from './Sidebar';
import EvidenceList from './EvidenceList';
import BottomSheet from './BottomSheet';
import EvidenceForm from './EvidenceForm';
import { calculateEvaluation, isLastDaysOfMonth, upcomingAcademicDate } from '../utils';
import { useEvidenceStore } from '../hooks/useEvidenceStore';
import { useQuickCapture } from '../hooks/useQuickCapture';

type SupabaseEvidenceHook = ReturnType<typeof import('../hooks/useSupabaseEvidence').useSupabaseEvidence>;

export interface MonthlyProgressData {
  currentMonthTotal: number;
  currentMonthName: string;
  currentYear: number;
  monthlyAvg: number;
  yearTotal: number;
  monthsElapsed: number;
  getSectionMonthCount: (sectionId: number) => number;
  getSectionYearTotal: (sectionId: number) => number;
}

interface DashboardProps {
  state: AppState;
  sections: SectionData[];
  supabaseEv?: SupabaseEvidenceHook;
  onAddEvClick: (sid: number, sub: string) => void;
  onAddSubClick: (sid: number) => void;
  onToggleStrat: (s: string) => void;
  onUpdateNote: (k: string, v: string) => void;
  onDeleteEv: (sid: number, sub: string, idx: number) => void;
  onAddStratClick: () => void;
  onOpenEvalClick: () => void;
  onDelSub: (sid: number, subName: string) => void;
  announcements?: Announcement[];
  onMarkAsRead?: (id: string) => void;
  academicDates?: AcademicDate[];
  monthlyProgress?: MonthlyProgressData;
  /** الحقول التالية تُستخدم فقط لعرض BottomSheet إضافة الشاهد على الجوال */
  userId?: string;
  onAddEv?: (sid: number, sub: string, type: 'pdf' | 'img' | 'doc' | 'vid', name: string, url?: string) => void;
  onToast?: (msg: string, icon?: string) => void;
}

const EVT_CONFIG: Record<string, {icon: string, cls: string, label: string}> = {
  pdf: {icon: 'ti-file-type-pdf', cls: 'bg-[linear-gradient(135deg,rgba(185,28,28,.2),rgba(185,28,28,.1))] text-[#f87171] border border-[#b91c1c]/20', label: 'PDF'},
  img: {icon: 'ti-photo', cls: 'bg-[linear-gradient(135deg,rgba(29,78,216,.2),rgba(29,78,216,.1))] text-[#93c5fd] border border-[#1d4ed8]/20', label: 'صورة'},
  doc: {icon: 'ti-file-text', cls: 'bg-[linear-gradient(135deg,rgba(109,40,217,.2),rgba(109,40,217,.1))] text-[#c4b5fd] border border-[#6d28d9]/20', label: 'مستند'},
  vid: {icon: 'ti-video', cls: 'bg-[linear-gradient(135deg,rgba(180,83,9,.2),rgba(180,83,9,.1))] text-[#fcd34d] border border-[#b45309]/20', label: 'فيديو'}
};

export default function Dashboard({ state, sections, supabaseEv, onAddEvClick, onAddSubClick, onToggleStrat, onUpdateNote, onDeleteEv, onAddStratClick, onOpenEvalClick, onDelSub, announcements, onMarkAsRead, academicDates, monthlyProgress, userId, onAddEv, onToast }: DashboardProps) {
  const [openSecs, setOpenSecs] = useState<Record<number, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAnn, setActiveAnn] = useState<Announcement | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  // تذكير موسمي — موعد دراسي قادم له الأولوية على التذكير الشهري العام
  const reminderBanner = useMemo(() => {
    const upcoming = upcomingAcademicDate(academicDates || [], 7);
    if (upcoming) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((new Date(upcoming.date).getTime() - today.getTime()) / 86400000);
      const dateStr = new Date(upcoming.date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
      return {
        icon: 'ti-calendar-event',
        title: upcoming.title,
        subtitle: `${daysLeft <= 0 ? 'اليوم' : `بعد ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`} — ${dateStr}${upcoming.hijri_label ? ` (${upcoming.hijri_label})` : ''}`,
      };
    }
    if (isLastDaysOfMonth()) {
      return {
        icon: 'ti-hourglass-low',
        title: 'الشهر على وشك الانتهاء',
        subtitle: 'لا تنسَ تسجيل شواهدك قبل بداية الشهر القادم لضمان توثيق إنجازك.',
      };
    }
    return null;
  }, [academicDates]);
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [fabExpanded, setFabExpanded] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<{ open: boolean; sectionId: number; sub: string }>({
    open: false, sectionId: 0, sub: '',
  });
  const closeMobileSheet = () => setMobileSheet(prev => ({ ...prev, open: false }));
  const handlePickSection = (sec: SectionData) => {
    setSectionPickerOpen(false);
    setMobileSheet({ open: true, sectionId: sec.id, sub: sec.subs[0] ?? 'عام' });
  };

  const quickCapture = useQuickCapture({
    userId,
    supabaseEv,
    onAddEv: onAddEv ?? (() => {}),
    onToast: onToast ?? (() => {}),
  });

  // ربط useEvidenceStore للحصول على نسب الاكتمال الحقيقية
  const { stats: evStats, getSectionStat } = useEvidenceStore({
    ev: state.ev,
    sections,
    csubs: state.csubs,
  });

  // قسم "التنويع في استراتيجيات التدريس" مُستبعد كلياً من نظام النسب/الترتيب/
  // التلوين — له بطاقة مخصّصة مثبّتة دائماً في آخر قائمة الأقسام (انظر أسفل).
  const stratSection = sections.find(s => s.isStrat) ?? null;
  const nonStratSections = sections.filter(s => !s.isStrat);

  // نسبة اكتمال البند بناءً على monthly_progress (عداد الشهر الحالي ÷ 3)
  const getMonthlyPct = (sectionId: number): number =>
    Math.min(100, Math.round(((monthlyProgress?.getSectionMonthCount(sectionId) ?? 0) / 3) * 100));

  // التقدم العام = مجموع شواهد الشهر لكل المجالات الأساسية (بلا الاستراتيجيات) / (عددها × 3) × 100
  // كل بند يساهم بحد أقصى 3 في المجموع (نفس سقف getMonthlyPct)، حتى لا يطغى بند واحد مكدّس على الإجمالي
  const overallPct = nonStratSections.length > 0
    ? Math.min(100, Math.round(
        nonStratSections.reduce((sum, s) => sum + Math.min(3, monthlyProgress?.getSectionMonthCount(s.id) ?? 0), 0)
        / (nonStratSections.length * 3) * 100
      ))
    : 0;

  // البند الأقل اكتمالاً — الخطوة التالية (بناءً على monthly_progress)
  const incompleteSections = nonStratSections.filter(s => getMonthlyPct(s.id) < 100);
  const nextSectionData = incompleteSections.length > 0
    ? incompleteSections.reduce((min, s) => getMonthlyPct(s.id) < getMonthlyPct(min.id) ? s : min)
    : null;

  // عدد الاستراتيجيات المضافة خلال الشهر التقويمي الحالي (نفس منطق التصفية الزمنية لـ useMonthlyProgress)
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const stratsUsedThisMonth = state.strats.filter(name => {
    const iso = state.stratDates?.[name];
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === curYear && (d.getMonth() + 1) === curMonth;
  }).length;
  const stratEvCount = stratSection
    ? state.strats.reduce((acc, name) => acc + (state.ev[`${stratSection.id}|strat:${name}`] || []).length, 0)
    : 0;

  // رسالة تشجيعية حسب نسبة الجاهزية
  const readinessMsg =
    overallPct === 100 ? 'أحسنت! ملفك مكتمل' :
    overallPct >= 71   ? 'اقتربت من الهدف، لا تتوقف الآن' :
    overallPct >= 31   ? 'أنت في المنتصف، واصل الإنجاز' :
                          'ابدأ رحلتك، كل شاهد يقربك من الاكتمال';

  const handleOpenAnnouncementModal = (ann: Announcement) => {
    setActiveAnn(ann);
    if (onMarkAsRead) {
      onMarkAsRead(ann.id);
    }
  };

  const handleCloseAnnModal = () => {
    setActiveAnn(null);
  };

  const toggleSec = (id: number) => {
    setOpenSecs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter sections by search query (قسم الاستراتيجيات مستبعد — له بطاقته المثبّتة دائماً)
  const filteredSections = searchQuery.trim()
    ? nonStratSections.filter(sec => {
        const q = searchQuery.toLowerCase();
        if (sec.ttl.includes(q)) return true;
        const allSubs = [...sec.subs, ...(state.csubs[sec.id] || [])];
        return allSubs.some(s => s.includes(q));
      })
    : nonStratSections;

  // الأقسام مرتبة: الأقل اكتمالاً أولاً (بدون إعادة ترتيب عند البحث)
  const sortedFilteredSections = searchQuery.trim()
    ? filteredSections
    : [...filteredSections].sort((a, b) => getMonthlyPct(a.id) - getMonthlyPct(b.id));

  const stats = calculateEvaluation(state, sections);
  // إجمالي الأدلة من Supabase مباشرة — يتزامن بعد كل حذف أو إضافة
  const totalEvs = supabaseEv
    ? sections.reduce((sum, s) => sum + supabaseEv.getBySection(s.id).length, 0)
    : evStats.total;
  // أقسام موثّقة: عدد البنود التي فيها evidence_count > 0 في monthly_progress للشهر الحالي
  // (يُحسب فقط عبر المجالات الأساسية العشرة — الاستراتيجيات خارج نظام النسب هذا)
  const filledSecs = monthlyProgress
    ? nonStratSections.filter(s => monthlyProgress.getSectionMonthCount(s.id) > 0).length
    : evStats.filledSectionCount;

  return (
    <div className="flex min-h-[calc(100vh-72px)]">
      <Sidebar
        state={state}
        sections={sections}
        filledCount={evStats.filledSectionCount}
        overallPct={overallPct}
        monthlyProgress={monthlyProgress}
      />
      <main className="flex-1 p-3 sm:p-5 md:py-9 md:px-8 min-w-0 overflow-x-hidden">
        {/* بطاقة الملف الشخصي المضغوطة — جوال فقط */}
        <div className="lg:hidden flex items-center gap-3 mb-3 px-1" style={{ animation: 'fadeUp .4s var(--sp) both' }}>
          <div
            className="w-[42px] h-[42px] rounded-full shrink-0 bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white flex items-center justify-center text-[14px] font-black shadow-[0_0_0_2px_rgba(82,196,120,.25)] bg-cover bg-center overflow-hidden"
            style={state.profile.avatar ? { backgroundImage: `url(${state.profile.avatar})` } : {}}
          >
            {!state.profile.avatar && state.profile.name.substring(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-extrabold text-white truncate leading-tight">
              {state.profile.name}
            </div>
            <div className="text-[11px] text-[var(--text4)] truncate mt-0.5">
              {state.profile.role}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1">
            <div className="text-[18px] font-black text-white leading-none font-[var(--font)]">
              {overallPct}<span className="text-[11px] text-[var(--text4)] font-bold">%</span>
            </div>
            <div className="text-[9px] text-[var(--text4)] font-bold tracking-wide">جاهزية</div>
          </div>
        </div>

        {/* HERO BANNER */}
        <div className="hidden lg:block relative overflow-hidden rounded-[20px] sm:rounded-[28px] py-5 sm:py-10 px-4 sm:px-12 mb-4 sm:mb-8 bg-gradient-to-br from-[var(--em1)] via-[var(--em3)] to-[rgba(30,90,50,.8)] border border-[var(--em7)]/15 shadow-[inset_0_2px_0_rgba(82,196,120,.1),0_24px_64px_rgba(0,0,0,.5)]" style={{ animation: 'fadeUp .6s var(--sp) both' }}>
          <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_50%_80%_at_80%_50%,rgba(201,162,39,.08),transparent_60%)]"></div>
          <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--em7)] via-30% via-[var(--gold)] via-50% via-[var(--em7)] via-70% to-transparent opacity-70 z-0"></div>
          
          <div className="absolute border border-[var(--em7)]/5 rounded-full w-[500px] h-[500px] -top-[200px] -left-[150px] z-0 pointer-events-none"></div>
          <div className="absolute border border-[var(--em7)]/5 rounded-full w-[300px] h-[300px] -bottom-[150px] right-[10%] z-0 pointer-events-none"></div>

          <div className="relative z-10 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 sm:gap-8">
            <div>
              <div className="inline-flex items-center gap-2 text-[11.5px] font-bold text-[var(--em8)] tracking-wide uppercase bg-[var(--em7)]/10 border border-[var(--em7)]/20 py-1 px-3.5 rounded-full mb-3.5">
                <i className={`ti ${stats.levelIcon} text-[14px] ${stats.levelClass.includes('gold') ? 'text-[var(--gold)]' : 'text-[var(--em8)]'}`}></i> ملف إنجاز {stats.levelStr}
              </div>
              <div className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight mb-2">{state.profile.name}</div>
              <div className="text-[14.5px] text-[var(--text3)] mb-5.5 leading-relaxed">
                {state.profile.role}<span> — {state.profile.school} · وزارة التعليم</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-1.5 py-1.5 px-4 rounded-full text-[12.5px] font-bold bg-white/5 border border-white/10 text-[var(--text2)] backdrop-blur-md cursor-default transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/30 hover:-translate-y-0.5">
                  <i className="ti ti-calendar text-[14px]"></i> السنة الدراسية 1446
                </div>
                <button className="inline-flex items-center gap-1.5 py-1.5 px-4 rounded-full text-[12.5px] font-bold bg-[var(--em7)]/10 border border-[var(--em7)]/30 text-[var(--em8)] backdrop-blur-md cursor-pointer transition-all duration-250 hover:bg-[var(--em7)]/20 hover:border-[var(--em7)]/50 hover:-translate-y-0.5 shadow-[0_4px_12px_rgba(42,122,68,.2)]" onClick={onOpenEvalClick}>
                  <i className="ti ti-chart-pie text-[14px]"></i> التقييم والتوثيق
                </button>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-center gap-3.5 self-start xl:self-auto">
              <div className="w-[72px] h-[72px] sm:w-[100px] sm:h-[100px] rounded-2xl sm:rounded-3xl bg-white/5 border-[1.5px] border-white/10 flex items-center justify-center text-[34px] sm:text-[50px] text-[var(--em8)] backdrop-blur-md shadow-[0_0_0_1px_rgba(82,196,120,.1),0_8px_32px_rgba(0,0,0,.4),inset_0_1px_0_rgba(255,255,255,.08)]" style={{ animation: 'float 4s ease-in-out infinite' }}>
                <i className="ti ti-school"></i>
              </div>
              <div className="flex gap-2.5">
                <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-center text-white backdrop-blur-md transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/20 hover:-translate-y-0.5">
                  <div className="text-[22px] font-black">{totalEvs}</div>
                  <div className="text-[11px] text-[var(--text3)] mt-0.5">أدلة</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-center text-white backdrop-blur-md transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/20 hover:-translate-y-0.5">
                  <div className="text-[22px] font-black">{filledSecs}</div>
                  <div className="text-[11px] text-[var(--text3)] mt-0.5">أقسام</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SEASONAL REMINDER BANNER */}
        {reminderBanner && !reminderDismissed && (
          <div className="mb-5 rounded-[22px] p-5 sm:p-6 border border-[var(--gold)]/25 bg-gradient-to-br from-[var(--gold)]/10 via-[var(--gold)]/5 to-[var(--surf3)] relative overflow-hidden" style={{ animation: 'fadeUp .55s var(--sp) both 0.02s' }}>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_100%_at_0%_50%,rgba(201,162,39,.08),transparent_70%)]" />
            <div className="absolute top-0 right-0 left-0 h-[1.5px] bg-gradient-to-r from-transparent via-[var(--gold)]/40 to-transparent" />
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-xl shrink-0 bg-[var(--gold)]/10 border border-[var(--gold)]/20 flex items-center justify-center text-[22px] text-[var(--gold)]">
                  <i className={`ti ${reminderBanner.icon}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[var(--gold)]/80 tracking-wider uppercase mb-0.5 flex items-center gap-1.5">
                    <i className="ti ti-bell text-[12px]" /> تذكير
                  </div>
                  <div className="text-[15px] font-extrabold text-white truncate leading-snug">{reminderBanner.title}</div>
                  <div className="text-[12.5px] text-[var(--text3)] mt-1">{reminderBanner.subtitle}</div>
                </div>
              </div>
              <button
                onClick={() => setReminderDismissed(true)}
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text4)] hover:text-white hover:bg-white/10 transition-colors duration-200 cursor-pointer"
                title="إغلاق"
              >
                <i className="ti ti-x text-[16px]" />
              </button>
            </div>
          </div>
        )}

        {/* NEXT STEP CARD */}
        {nextSectionData && (
          <div className="mb-5 rounded-[22px] p-5 sm:p-6 border border-amber-500/25 bg-gradient-to-br from-amber-950/40 via-amber-900/20 to-[var(--surf3)] relative overflow-hidden" style={{ animation: 'fadeUp .55s var(--sp) both 0.05s' }}>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_100%_at_0%_50%,rgba(251,191,36,.06),transparent_70%)]" />
            <div className="absolute top-0 right-0 left-0 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-xl shrink-0 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[22px] text-amber-400">
                  <i className={`ti ${nextSectionData.icon}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-amber-400/80 tracking-wider uppercase mb-0.5 flex items-center gap-1.5">
                    <i className="ti ti-arrow-right text-[12px]" /> الخطوة التالية
                  </div>
                  <div className="text-[15px] font-extrabold text-white truncate leading-snug">{nextSectionData.ttl}</div>
                  <div className="flex items-center gap-2.5 mt-1.5">
                    <div className="h-1.5 w-28 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-700"
                        style={{ width: `${getMonthlyPct(nextSectionData.id)}%` }}
                      />
                    </div>
                    <span className="text-[11.5px] font-bold text-amber-400">{getMonthlyPct(nextSectionData.id)}% مكتمل</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onAddEvClick(nextSectionData.id, nextSectionData.subs[0] ?? 'عام')}
                className="shrink-0 inline-flex items-center gap-2 py-3 px-6 rounded-xl text-[13px] font-bold bg-gradient-to-br from-amber-500 to-amber-600 text-white border border-amber-400/20 hover:from-amber-400 hover:to-amber-500 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(251,191,36,.35)] transition-all duration-250 cursor-pointer font-[var(--font)] active:scale-95"
              >
                <i className="ti ti-plus text-[15px]" /> أضف شاهداً الآن
              </button>
            </div>
          </div>
        )}

        {/* MONTHLY PROGRESS CARDS */}
        {monthlyProgress && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5" style={{ animation: 'fadeUp .5s var(--sp) both 0.08s' }}>

            {/* البطاقة 1 — عداد الشهر الحالي */}
            {(() => {
              const total = monthlyProgress.currentMonthTotal;
              const goal  = 30; // 10 بند × 3 (بلا قسم الاستراتيجيات)
              const pct   = Math.min(100, Math.round((total / goal) * 100));
              const msg   =
                total === 0  ? 'لم تبدأ بعد هذا الشهر' :
                total <= 9   ? 'بداية جيدة، واصل' :
                total <= 20  ? 'أنت في المنتصف' :
                total <= 29  ? 'اقتربت من الهدف' :
                               '✓ أكملت هدف الشهر';
              const barColor =
                pct >= 80 ? 'linear-gradient(90deg,var(--em5),var(--em8))' :
                pct >= 40 ? 'linear-gradient(90deg,#b45309,#fbbf24)' :
                            'linear-gradient(90deg,#9f1239,#f87171)';
              return (
                <div className="rounded-[22px] p-5 bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] border border-[var(--line)] relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_0%_0%,rgba(82,196,120,.04),transparent_70%)]" />
                  <div className="relative z-10 flex items-start justify-between mb-3.5">
                    <div>
                      <div className="text-[10.5px] font-extrabold text-[var(--text4)] tracking-widest uppercase mb-0.5">عداد الشهر الحالي</div>
                      <div className="text-[14px] font-extrabold text-white">{monthlyProgress.currentMonthName} {monthlyProgress.currentYear}</div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-[30px] font-black text-[var(--em8)] leading-none font-[var(--font)]">{total}</div>
                      <div className="text-[10.5px] text-[var(--text4)] mt-0.5 text-right">من {goal} شاهداً</div>
                    </div>
                  </div>
                  <div className="relative z-10 h-3 sm:h-2 bg-white/8 rounded-full overflow-hidden mb-2.5">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="text-[12px] text-[var(--text3)]">{msg}</span>
                    <span className="text-[12px] sm:text-[11px] font-extrabold text-white">{pct}%</span>
                  </div>
                </div>
              );
            })()}

            {/* البطاقة 2 — المعدل الشهري */}
            <div className="rounded-[22px] p-5 bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] border border-[var(--line)] relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_100%_0%,rgba(201,162,39,.04),transparent_70%)]" />
              <div className="relative z-10">
                <div className="text-[10.5px] font-extrabold text-[var(--text4)] tracking-widest uppercase mb-3">المعدل الشهري</div>
                <div className="flex items-end gap-2 mb-3">
                  <div className="text-[38px] font-black text-white leading-none font-[var(--font)]">{monthlyProgress.monthlyAvg}</div>
                  <div className="text-[14px] font-bold text-[var(--text3)] mb-1">شاهد / شهر</div>
                </div>
                <div className="text-[12px] text-[var(--text4)] leading-relaxed">
                  إجمالي <span className="text-white font-bold">{monthlyProgress.yearTotal}</span> شاهد
                  خلال <span className="text-white font-bold">{monthlyProgress.monthsElapsed}</span>{' '}
                  {monthlyProgress.monthsElapsed === 1 ? 'شهر' : 'أشهر'} من بداية السنة
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OVERALL READINESS BAR */}
        <div className="mb-4 sm:mb-8 rounded-[18px] sm:rounded-[22px] p-4 sm:p-6 bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] border border-[var(--line)] relative overflow-hidden" style={{ animation: 'fadeUp .6s var(--sp) both 0.1s' }}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_80%_at_100%_50%,rgba(82,196,120,.04),transparent_60%)]" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-[13.5px] font-bold text-[var(--text3)]">جاهزية ملف الإنجاز</span>
                <span className="text-[34px] font-black text-white font-[var(--font)] leading-none">
                  {overallPct}<span className="text-[18px] text-[var(--text4)] font-bold">%</span>
                </span>
              </div>
              <div className="h-3 bg-white/8 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full relative overflow-hidden"
                  style={{
                    width: `${overallPct}%`,
                    transition: 'width 1200ms cubic-bezier(.16,1,.3,1)',
                    background:
                      overallPct >= 71 ? 'linear-gradient(90deg, var(--em5), var(--em7), var(--em8))' :
                      overallPct >= 31 ? 'linear-gradient(90deg, #b45309, #d97706, #fbbf24)' :
                                         'linear-gradient(90deg, #9f1239, #dc2626, #f87171)',
                    boxShadow:
                      overallPct >= 71 ? '0 0 12px rgba(82,196,120,.45)' :
                      overallPct >= 31 ? '0 0 12px rgba(217,119,6,.35)' : 'none',
                  }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent)] bg-[length:200%_auto]" style={{ animation: 'goldShimmer 2.5s linear infinite' }} />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <i className={`ti text-[15px] ${
                  overallPct === 100 ? 'ti-star-filled text-[var(--gold)]' :
                  overallPct >= 71   ? 'ti-flame text-[var(--em8)]' :
                  overallPct >= 31   ? 'ti-trending-up text-amber-400' :
                                       'ti-seeding text-[var(--em7)]'
                }`} />
                <span className="text-[12.5px] font-semibold text-[var(--text3)]">{readinessMsg}</span>
              </div>
            </div>
            <div className="flex sm:flex-col gap-5 sm:gap-3 shrink-0 sm:border-r sm:border-[var(--line)] sm:pr-6">
              <div className="sm:text-center">
                <div className="text-[11px] font-bold text-[var(--text4)] mb-0.5">أقسام مكتملة</div>
                <div className="text-[24px] font-black text-[var(--em8)] font-[var(--font)] leading-none">
                  {filledSecs}<span className="text-[14px] text-[var(--text4)] font-semibold"> / {nonStratSections.length}</span>
                </div>
              </div>
              <div className="sm:text-center">
                <div className="text-[11px] font-bold text-[var(--text4)] mb-0.5">إجمالي الأدلة</div>
                <div className="text-[24px] font-black text-white font-[var(--font)] leading-none">{totalEvs}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ANNOUNCEMENTS SECTION */}
        {announcements && announcements.length > 0 && (
          <div className="mb-8" style={{ animation: 'fadeUp .55s var(--sp) both 0.1s' }}>
            <div className="flex items-center gap-2 mb-3.5 px-1">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--em7)] shadow-[0_0_8px_rgba(82,196,120,.5)]"></div>
              <h2 className="text-[16px] font-black text-white font-[var(--font)]">آخر التحديثات والتعاميم</h2>
              <span className="text-[11px] bg-[var(--em7)]/15 text-[var(--em8)] px-2 py-0.5 rounded-md font-extrabold">
                {announcements.filter(a => !state.readAnnouncements?.includes(a.id)).length} جديد
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {announcements.slice(0, 3).map((ann) => {
                const isRead = state.readAnnouncements?.includes(ann.id);
                const dateStr = new Date(ann.created_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
                
                // Category styling
                let catLabel = 'تحديث';
                let catClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                let catIcon = 'ti-settings';
                if (ann.category === 'admin') {
                  catLabel = 'تعميم إداري';
                  catClass = 'bg-[var(--gold)]/10 text-[var(--gold)] border-[var(--gold)]/20';
                  catIcon = 'ti-file-text';
                } else if (ann.category === 'urgent') {
                  catLabel = 'تنبيه عاجل';
                  catClass = 'bg-red-500/10 text-red-400 border-red-500/20';
                  catIcon = 'ti-alert-triangle';
                }

                return (
                  <div 
                    key={ann.id} 
                    onClick={() => handleOpenAnnouncementModal(ann)}
                    className="group relative bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] border border-[var(--line)] rounded-[20px] p-5 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-[var(--line2)] hover:shadow-[0_12px_32px_rgba(0,0,0,.4)] overflow-hidden"
                  >
                    {/* Pulsing indicator for unread */}
                    {!isRead && (
                      <span className="absolute top-4 left-4 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </span>
                    )}
                    
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[11px] font-bold border ${catClass}`}>
                        <i className={`ti ${catIcon}`}></i> {catLabel}
                      </span>
                      <span className="text-[11px] text-[var(--text4)]">{dateStr}</span>
                    </div>
                    
                    <h3 className="text-[14px] font-extrabold text-white mb-2 line-clamp-1 group-hover:text-[var(--em8)] transition-colors duration-200">
                      {ann.title}
                    </h3>
                    
                    <p className="text-[12.5px] text-[var(--text3)] line-clamp-2 leading-relaxed mb-1">
                      {ann.content}
                    </p>
                    
                    <div className="text-[11.5px] text-[var(--em8)] font-bold mt-3.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span>اقرأ المزيد</span>
                      <i className="ti ti-arrow-left text-[13px] translate-x-1 group-hover:translate-x-0 transition-transform"></i>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STATS GRID */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4 mb-5 sm:mb-8">
          {[
            { id: 1, val: totalEvs, lbl: 'إجمالي الأدلة', ico: 'ti-files', bIco: 'ti-trending-up', bLbl: 'حي', theme: { bg: 'bg-gradient-to-br from-[var(--em2)]/30 to-[var(--em7)]/15', color: 'text-[var(--em7)]', badgeBg: 'bg-[var(--em7)]/10', badgeColor: 'text-[var(--em8)]' }, dly: '0.05s', sub: `${evStats.byType.pdf} PDF · ${evStats.byType.img} صور` },
            { id: 2, val: nonStratSections.length, lbl: 'مجالات أساسية', ico: 'ti-layout-grid', bIco: 'ti-check', bLbl: `${filledSecs} موثّق`, theme: { bg: 'bg-gradient-to-br from-[#1d4ed8]/30 to-[#93c5fd]/15', color: 'text-[#93c5fd]', badgeBg: 'bg-[#93c5fd]/10', badgeColor: 'text-[#93c5fd]' }, dly: '0.1s', sub: `${evStats.byType.doc} مستندات · ${evStats.byType.vid} فيديو` },
            { id: 3, val: state.strats.length, lbl: 'استراتيجيات مفعّلة', ico: 'ti-bulb', bIco: 'ti-star', bLbl: 'نشطة', theme: { bg: 'bg-gradient-to-br from-[#b45309]/30 to-[#fcd34d]/15', color: 'text-[#fcd34d]', badgeBg: 'bg-[#fcd34d]/10', badgeColor: 'text-[#fcd34d]' }, dly: '0.15s', sub: null },
            { id: 4, val: filledSecs, lbl: 'أقسام موثّقة', ico: 'ti-trophy', bIco: 'ti-chart-bar', bLbl: `من ${nonStratSections.length}`, theme: { bg: 'bg-gradient-to-br from-[#c0399a]/30 to-[#f472b6]/15', color: 'text-[#f472b6]', badgeBg: 'bg-[#f472b6]/10', badgeColor: 'text-[#f472b6]' }, dly: '0.2s', sub: `${Math.round((filledSecs / nonStratSections.length) * 100)}% اكتمال` },
          ].map(st => (
            <div key={st.id} className="group bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[16px] sm:rounded-[20px] p-3 sm:p-6 border border-[var(--line)] relative overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:border-[var(--line2)] hover:shadow-[0_20px_50px_rgba(0,0,0,.5)] cursor-default" style={{ animation: `fadeUp .5s var(--sp) both ${st.dly}` }}>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,.03),transparent_60%)]"></div>
              <div className="flex justify-between items-start mb-2 sm:mb-4.5 relative z-10">
                <div className={`w-[38px] h-[38px] sm:w-[54px] sm:h-[54px] rounded-xl sm:rounded-2xl flex items-center justify-center text-[18px] sm:text-[26px] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-8deg] relative ${st.theme.bg}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent rounded-xl sm:rounded-2xl"></div>
                   <i className={`ti ${st.ico} relative z-10 ${st.theme.color}`}></i>
                </div>
                <div className={`text-[9px] sm:text-[11px] font-bold py-0.5 sm:py-1 px-1.5 sm:px-2.5 rounded-md sm:rounded-lg flex items-center gap-1 ${st.theme.badgeBg} ${st.theme.badgeColor}`}>
                  <i className={`ti ${st.bIco}`}></i><span className="hidden sm:inline"> {st.bLbl}</span>
                </div>
              </div>
              <div className="text-[26px] sm:text-[36px] font-black leading-none text-white transition-all duration-300 font-[var(--font)] group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-[linear-gradient(135deg,var(--em7),var(--gold))] relative z-10">{st.val}</div>
              <div className="text-[11px] sm:text-[13px] text-[var(--text3)] mt-1 sm:mt-1.5 font-medium relative z-10">{st.lbl}</div>
              {st.sub && <div className="hidden sm:block text-[11px] text-[var(--text4)] mt-1 font-medium relative z-10">{st.sub}</div>}
            </div>
          ))}
        </div>

        {/* SEARCH BAR */}
        <div className="relative mb-5" style={{ animation: 'fadeUp .4s var(--sp) both 0.25s' }}>
          <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
            <i className="ti ti-search text-[18px] text-[var(--text4)]"></i>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث عن قسم أو قسم فرعي..."
            className="w-full py-3.5 pr-12 pl-5 bg-white/5 border border-[var(--line2)] rounded-2xl text-[14px] font-[var(--font)] text-white outline-none transition-all duration-250 placeholder-[var(--text4)] focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/40 focus:shadow-[0_0_0_4px_rgba(42,122,68,.1)]"
          />
          {searchQuery && (
            <button
              className="absolute inset-y-0 left-4 flex items-center text-[var(--text4)] hover:text-white transition-colors"
              onClick={() => setSearchQuery('')}
            >
              <i className="ti ti-x text-[16px]"></i>
            </button>
          )}
        </div>

        {/* No results */}
        {filteredSections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-[28px] text-[var(--text4)] mb-3">
              <i className="ti ti-search-off"></i>
            </div>
            <p className="text-[var(--text3)] text-[15px] font-bold">لا توجد نتائج لـ "{searchQuery}"</p>
            <p className="text-[var(--text4)] text-[13px] mt-1">جرب كلمة بحث مختلفة</p>
          </div>
        )}

        {/* SECTIONS */}
        <div className="flex flex-col gap-2 sm:gap-3.5 pb-[100px] md:pb-0">
          {sortedFilteredSections.map((sec, i) => {
            const allSubs = [...sec.subs, ...(state.csubs[sec.id] || [])];
            const secTotalEvs = allSubs.reduce((acc, sub) => acc + (state.ev[`${sec.id}|${sub}`] || []).length, 0);
            const isOpen = !!openSecs[sec.id];
            // completionPct: نشاط الشهر الحالي (يتحكم بالترتيب وتلوين الحدود — لا تغيير)
            const secStat = getSectionStat(sec.id);
            const completionPct = getMonthlyPct(sec.id);
            const filledSubs = secStat?.filledSubs ?? 0;
            const totalSubs = secStat?.totalSubs ?? allSubs.length;
            // cumulativePct: نسبة الاكتمال التراكمية الحقيقية عبر كل الأدلة منذ البداية (secStat) — تُعرض كمعلومة إضافية فقط
            const cumulativePct = secStat?.completionPct ?? 0;

            const borderColor =
              completionPct > 70  ? '#22c55e' :
              completionPct >= 35 ? '#f59e0b' :
                                    '#ef4444';

            return (
              <div key={sec.id} id={`sc-${sec.id}`} className="relative bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[16px] sm:rounded-[20px] border border-[var(--line)] overflow-hidden transition-all duration-300 hover:border-[var(--line2)]" style={{ scrollMarginTop: '90px', animation: `fadeUp .45s var(--sp) both ${i * 0.04}s`, borderRight: `4px solid ${borderColor}` }}>
                <div className="flex items-center gap-2 sm:gap-4 py-3 sm:py-5 px-3 sm:px-6 cursor-pointer relative select-none hover:bg-white/5 group" onClick={() => toggleSec(sec.id)}>
                   <div className="absolute bottom-0 right-6 left-6 h-px bg-gradient-to-r from-transparent via-[var(--em7)]/15 to-transparent opacity-0 transition-opacity duration-250 group-hover:opacity-100"></div>
                   
                   <div className={`w-[32px] h-[32px] sm:w-[42px] sm:h-[42px] rounded-lg sm:rounded-xl shrink-0 flex items-center justify-center text-[15px] sm:text-[20px] border shadow-[0_4px_14px_rgba(42,122,68,.3)] transition-all duration-350 ${isOpen ? 'bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white border-transparent scale-110 !rotate-[-5deg] shadow-[0_6px_20px_rgba(42,122,68,.5)]' : 'bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] border-[var(--em7)]/20 group-hover:bg-gradient-to-br group-hover:from-[var(--em4)] group-hover:to-[var(--em7)] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-5deg] group-hover:shadow-[0_6px_20px_rgba(42,122,68,.5)]'}`}>
                     <i className={`ti ${sec.icon}`}></i>
                   </div>
                   
                   <div className="flex-1 min-w-0">
                     <div className="text-[13.5px] sm:text-[16px] font-extrabold text-white font-[var(--font)] leading-tight">{sec.ttl}</div>
                     <div className="text-[11px] sm:text-[12px] text-[var(--text4)] mt-0.5">{totalSubs} قسم فرعي{secTotalEvs ? ` · ${secTotalEvs} دليل` : ''}</div>
                     {monthlyProgress && (
                       <div className="flex items-center gap-1.5 sm:gap-3 mt-1 sm:mt-1.5 flex-wrap">
                         <span className="text-[9.5px] sm:text-[10.5px] text-[var(--text4)] flex items-center gap-0.5 sm:gap-1">
                           <i className="ti ti-calendar text-[9px] sm:text-[10px]" />
                           {monthlyProgress.currentMonthName}:{' '}
                           <span className={monthlyProgress.getSectionMonthCount(sec.id) > 0 ? 'text-[var(--em8)] font-bold' : ''}>
                             {monthlyProgress.getSectionMonthCount(sec.id)}
                           </span>
                           {' '}/ 3
                         </span>
                         <span className="text-[var(--text4)] opacity-40 text-[9px]">·</span>
                         <span className="text-[9.5px] sm:text-[10.5px] text-[var(--text4)] flex items-center gap-0.5 sm:gap-1">
                           <i className="ti ti-trending-up text-[9px] sm:text-[10px]" />
                           {monthlyProgress.getSectionYearTotal(sec.id)} هذا العام
                         </span>
                       </div>
                     )}
                     {/* شريط التقدم — نشاط الشهر الحالي (الترتيب والتلوين يعتمدان عليه، بلا أي تغيير) */}
                     <div className="mt-2.5 flex items-center gap-2">
                       <div className="flex-1 h-[5px] rounded-full bg-white/8 overflow-hidden">
                         <div
                           className="h-full rounded-full transition-all duration-700 ease-out"
                           style={{
                             width: `${completionPct}%`,
                             background: completionPct >= 70
                               ? 'linear-gradient(90deg, var(--em6), var(--em7))'
                               : completionPct >= 35
                               ? 'linear-gradient(90deg, #b45309, #fcd34d)'
                               : 'linear-gradient(90deg, #9f1239, #f43f5e)',
                             boxShadow: completionPct >= 70 ? '0 0 8px rgba(82,196,120,.4)' : 'none'
                           }}
                         />
                       </div>
                       <span className={`text-[11px] font-black shrink-0 ${
                         completionPct >= 70 ? 'text-[var(--em8)]' :
                         completionPct >= 35 ? 'text-[#fcd34d]' : 'text-[#f87171]'
                       }`}>{completionPct}%</span>
                     </div>
                     {/* تسمية الشهر الحالي + الرقم التراكمي الحقيقي — معلومة إضافية فقط، لا تؤثر على الترتيب/التلوين أعلاه */}
                     <div className="flex items-center justify-between mt-1">
                       <span className="text-[9.5px] sm:text-[10px] text-[var(--text4)] font-semibold">نشاط هذا الشهر</span>
                       <span className="text-[9.5px] sm:text-[10px] text-[var(--text4)] font-semibold flex items-center gap-1">
                         <i className="ti ti-chart-pie-2 text-[9px] sm:text-[10px]" />
                         الإجمالي التراكمي: <span className="font-black text-[var(--em8)]">{cumulativePct}%</span>
                       </span>
                     </div>
                   </div>
                   
                   {secTotalEvs > 0 && (
                     <div className="hidden sm:flex flex-col items-center gap-0.5 shrink-0">
                       <div className="flex items-center gap-1 text-[12px] font-bold py-1.5 px-3.5 rounded-full bg-[var(--em7)]/10 text-[var(--em8)] border border-[var(--em7)]/15">
                         <i className="ti ti-files text-[13px]"></i> {secTotalEvs}
                       </div>
                       <div className="text-[10px] text-[var(--text4)] font-bold">{filledSubs}/{totalSubs} مكتمل</div>
                     </div>
                   )}
                   
                   <i className={`ti ti-chevron-down text-[22px] shrink-0 transition-all duration-400 ${isOpen ? 'rotate-180 text-[var(--em7)]' : 'text-[var(--text4)]'}`}></i>
                </div>
                
                <div className={`overflow-hidden transition-all duration-500 ease-[var(--ease)] ${isOpen ? 'max-h-[9999px] opacity-100 border-t border-[var(--line)]' : 'max-h-0 opacity-0 border-t-0'}`}>

                  {allSubs.map((sub, idx) => {
                     const isCustom = idx >= sec.subs.length;
                     const k = `${sec.id}|${sub}`;
                     const evs = state.ev[k] || [];
                     const note = state.notes[k] || '';

                     return (
                        <div key={sub} className="py-5 px-6 border-b border-white/5 hover:bg-white/[0.015] transition-colors duration-200 last:border-b-0">
                           <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-3">
                               <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-gradient-to-br from-[var(--em6)] to-[var(--gold)] shadow-[0_0_8px_rgba(82,196,120,.5)]" style={{ animation: 'pulse 3s ease-in-out infinite' }}></div>
                               <div className="text-[15px] font-bold text-[var(--text2)]">{sub}</div>
                               {evs.length > 0 && <span className="text-[12px] font-extrabold text-transparent bg-clip-text bg-[linear-gradient(135deg,var(--em7),var(--gold))]">{evs.length}</span>}
                               {isCustom && <span className="text-[11px] bg-[var(--gold)]/10 text-[var(--gold)] border border-[var(--gold)]/20 py-0.5 px-2 rounded-lg font-bold">جديد</span>}
                             </div>
                             <div className="flex gap-1.5">
                                {isCustom && (
                                  <button
                                    className="inline-flex items-center gap-1 py-2 px-3 rounded-xl text-[12px] font-bold cursor-pointer border border-red-500/20 text-red-400 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/40 transition-all duration-250"
                                    onClick={() => onDelSub(sec.id, sub)}
                                    title="حذف القسم الفرعي"
                                  >
                                    <i className="ti ti-trash text-[13px]"></i>
                                  </button>
                                )}
                               <button className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-[12.5px] font-bold cursor-pointer border-[1.5px] whitespace-nowrap border-[var(--em7)]/20 text-[var(--em7)] bg-[var(--em7)]/10 hover:bg-gradient-to-br hover:from-[var(--em4)] hover:to-[var(--em6)] hover:text-white hover:border-transparent hover:shadow-[0_6px_18px_rgba(42,122,68,.5)] hover:-translate-y-0.5 group transition-all duration-250 active:scale-95" onClick={() => onAddEvClick(sec.id, sub)}>
                                 <i className="ti ti-plus text-[15px] transition-transform duration-300 group-hover:scale-125 group-hover:rotate-[-5deg]"></i> إضافة دليل
                               </button>
                             </div>
                           </div>

                           {evs.length > 0 && (
                             <div className="flex flex-col gap-2 mb-3">
                               {evs.map((ev, ei) => {
                                 const t = EVT_CONFIG[ev.type] || EVT_CONFIG.doc;
                                 return (
                                   <div key={ei} className="flex items-center gap-3.5 py-3 px-4 bg-white/5 rounded-xl border border-[var(--line)] transition-all duration-250 hover:bg-white/10 hover:border-[var(--line2)] hover:-translate-x-1 hover:shadow-[0_4px_20px_rgba(0,0,0,.3)] group" style={{ animation: 'slideR .3s var(--sp) both' }}>
                                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[20px] shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-5deg] ${t.cls}`}>
                                       <i className={`ti ${t.icon}`}></i>
                                     </div>
                                     <div 
                                        className={`flex-1 min-w-0 ${ev.url ? 'cursor-pointer hover:opacity-80 transition-all' : ''}`}
                                        onClick={() => ev.url && window.open(ev.url, '_blank')}
                                        title={ev.url ? 'اضغط لعرض الملف' : ''}
                                      >
                                        <div className="text-[13.5px] font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis group-hover:text-[var(--em8)] transition-colors" dir="ltr" style={{unicodeBidi:'isolate'}}>{ev.name}</div>
                                        <div className="text-[11px] text-[var(--text4)] mt-1 flex items-center gap-1.5">
                                          <i className="ti ti-calendar"></i>{ev.date} · <i className="ti ti-tag"></i>{t.label}
                                          {ev.url && <span className="text-[var(--em8)] flex items-center gap-0.5 font-bold"><i className="ti ti-external-link"></i> استعراض</span>}
                                        </div>
                                      </div>
                                     <button className="bg-transparent border-none text-[var(--text4)] cursor-pointer p-2 rounded-lg text-[16px] shrink-0 transition-all duration-200 hover:text-red-400 hover:bg-red-400/10 hover:scale-115" onClick={() => onDeleteEv(sec.id, sub, ei)} title="حذف">
                                       <i className="ti ti-trash"></i>
                                     </button>
                                   </div>
                                 );
                               })}
                             </div>
                           )}

                           <button className="flex items-center gap-2.5 w-full py-3 px-4 border-[1.5px] border-dashed border-[var(--em7)]/20 rounded-xl cursor-pointer bg-transparent font-[var(--font)] text-[var(--text4)] text-[13.5px] transition-all duration-250 group overflow-hidden relative hover:border-[var(--em7)]/40 hover:text-[var(--em7)] hover:bg-[var(--em7)]/5" onClick={() => onAddEvClick(sec.id, sub)}>
                              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(82,196,120,.05),transparent)] translate-x-full transition-transform duration-500 group-hover:-translate-x-full"></div>
                              <i className="ti ti-paperclip text-[20px] transition-transform duration-350 group-hover:rotate-90 group-hover:scale-110"></i>
                              <span className="relative z-10">إرفاق ملف أو دليل...</span>
                           </button>

                           <textarea 
                             className="w-full p-4 mt-3 bg-white/5 border-[1.5px] border-[var(--line)] rounded-xl text-[13px] font-[var(--font)] text-white outline-none resize-none transition-all duration-250 leading-relaxed placeholder-[var(--text4)] focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/30 focus:shadow-[0_0_0_4px_rgba(42,122,68,.1)]" 
                             rows={2} 
                             placeholder="ملاحظة أو وصف..." 
                             value={note} 
                             onChange={(e) => onUpdateNote(k, e.target.value)}
                           ></textarea>

                        </div>
                     )
                  })}
                  
                  <div className="py-3.5 px-6 border-t border-[var(--line)]">
                    <button className="flex items-center gap-2 py-2.5 px-4 rounded-xl border-[1.5px] border-dashed border-[var(--line2)] bg-transparent text-[var(--text4)] text-[13px] cursor-pointer transition-all duration-250 group hover:border-[var(--em7)]/30 hover:text-[var(--em7)] hover:bg-[var(--em7)]/5" onClick={() => onAddSubClick(sec.id)}>
                      <i className="ti ti-folder-plus text-[18px] transition-transform duration-300 group-hover:rotate-90"></i> إضافة قسم فرعي جديد
                    </button>
                  </div>

                  {/* ── قائمة الشواهد من Supabase ── */}
                  {supabaseEv && (
                    <div className="px-6 pb-6 border-t border-[var(--line)] pt-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-[12px] font-extrabold text-[var(--text3)] tracking-wide uppercase">
                          <i className="ti ti-files text-[16px] text-[var(--em7)]" />
                          الشواهد الموثّقة
                          {supabaseEv.getBySection(sec.id).length > 0 && (
                            <span className="text-[10px] font-black text-[var(--em8)] bg-[var(--em7)]/10 px-2 py-0.5 rounded-full border border-[var(--em7)]/20">
                              {supabaseEv.getBySection(sec.id).length}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => onAddEvClick(sec.id, sec.subs[0] ?? 'عام')}
                          className="inline-flex items-center gap-1.5 py-1.5 px-3.5 rounded-lg text-[12px] font-bold bg-[var(--em7)]/10 border border-[var(--em7)]/20 text-[var(--em8)] hover:bg-[var(--em7)]/20 transition-all cursor-pointer font-[var(--font)]"
                        >
                          <i className="ti ti-plus text-[13px]" /> إضافة شاهد
                        </button>
                      </div>
                      <EvidenceList
                        sectionId={sec.id}
                        evidence={supabaseEv.getBySection(sec.id)}
                        loading={supabaseEv.loading}
                        onDelete={supabaseEv.deleteEvidence}
                        onAddClick={() => onAddEvClick(sec.id, sec.subs[0] ?? 'عام')}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* بطاقة الاستراتيجيات — مثبّتة دائماً في آخر القائمة، خارج نظام
              النسب/الترتيب/التلوين بالكامل (لا borderColor دلالي، لا شريط
              تقدم، لا "نشاط الشهر/تراكمي") — فقط عداد استخدام هذا الشهر. */}
          {stratSection && (
            <div key={stratSection.id} id={`sc-${stratSection.id}`} className="relative bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[16px] sm:rounded-[20px] border border-[var(--line)] overflow-hidden transition-all duration-300 hover:border-[var(--line2)]" style={{ scrollMarginTop: '90px', borderRight: '4px solid var(--gold)' }}>
              <div className="flex items-center gap-2 sm:gap-4 py-3 sm:py-5 px-3 sm:px-6 cursor-pointer relative select-none hover:bg-white/5 group" onClick={() => toggleSec(stratSection.id)}>
                 <div className="absolute bottom-0 right-6 left-6 h-px bg-gradient-to-r from-transparent via-[var(--gold)]/15 to-transparent opacity-0 transition-opacity duration-250 group-hover:opacity-100"></div>

                 <div className={`w-[32px] h-[32px] sm:w-[42px] sm:h-[42px] rounded-lg sm:rounded-xl shrink-0 flex items-center justify-center text-[15px] sm:text-[20px] border shadow-[0_4px_14px_rgba(201,162,39,.25)] transition-all duration-350 ${openSecs[stratSection.id] ? 'bg-gradient-to-br from-[var(--gold)] to-[var(--gold3)] text-white border-transparent scale-110 !rotate-[-5deg]' : 'bg-[var(--gold)]/10 text-[var(--gold)] border-[var(--gold)]/20 group-hover:bg-gradient-to-br group-hover:from-[var(--gold)] group-hover:to-[var(--gold3)] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-5deg]'}`}>
                   <i className={`ti ${stratSection.icon}`}></i>
                 </div>

                 <div className="flex-1 min-w-0">
                   <div className="text-[13.5px] sm:text-[16px] font-extrabold text-white font-[var(--font)] leading-tight">{stratSection.ttl}</div>
                   <div className="flex items-center gap-1.5 mt-1.5 text-[11.5px] sm:text-[12.5px] font-bold text-[var(--gold)]">
                     <i className="ti ti-bulb text-[12px]"></i>
                     {stratsUsedThisMonth} استراتيجية مستخدمة هذا الشهر
                   </div>
                 </div>

                 {stratEvCount > 0 && (
                   <div className="hidden sm:flex items-center gap-1 text-[12px] font-bold py-1.5 px-3.5 rounded-full bg-[var(--gold)]/10 text-[var(--gold)] border border-[var(--gold)]/15 shrink-0">
                     <i className="ti ti-files text-[13px]"></i>
                     {stratEvCount}
                   </div>
                 )}

                 <i className={`ti ti-chevron-down text-[22px] shrink-0 transition-all duration-400 ${openSecs[stratSection.id] ? 'rotate-180 text-[var(--gold)]' : 'text-[var(--text4)]'}`}></i>
              </div>

              <div className={`overflow-hidden transition-all duration-500 ease-[var(--ease)] ${openSecs[stratSection.id] ? 'max-h-[9999px] opacity-100 border-t border-[var(--line)]' : 'max-h-0 opacity-0 border-t-0'}`}>
                <div className="py-5 px-6 bg-[var(--gold)]/5">
                   <div className="flex items-center gap-2 text-[13px] font-extrabold text-[var(--text2)] mb-4 tracking-wide">
                     <i className="ti ti-bulb text-[20px] text-[var(--gold)]"></i> استراتيجيات التدريس المتاحة
                   </div>
                   <div className="flex flex-wrap gap-2 mb-5">
                     {stratSection.strats?.map(s => {
                        const isOn = state.strats.includes(s);
                        return (
                          <div
                            key={s}
                            className={`group relative flex items-center gap-1.5 py-2 px-4 rounded-full text-[13px] font-semibold cursor-pointer border-[1.5px] transition-all duration-250 overflow-hidden hover:-translate-y-0.5 ${isOn ? 'text-white border-transparent shadow-[0_6px_18px_rgba(42,122,68,.5)]' : 'border-white/10 text-[var(--text3)] bg-white/5 hover:border-[var(--em7)]/30'}`}
                            onClick={() => onToggleStrat(s)}
                          >
                            <div className={`absolute inset-0 bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] transition-opacity duration-250 ${isOn ? 'opacity-100' : 'opacity-0'}`}></div>
                            <i className={`ti ${isOn ? 'ti-check' : 'ti-plus'} text-[15px] relative z-10`}></i>
                            <span className="relative z-10">{s}</span>
                          </div>
                        );
                     })}
                   </div>

                   {/* Active Strategies Details with Evidence Attachment */}
                   {state.strats.length > 0 && (
                     <div className="flex flex-col gap-4 mt-2">
                       <div className="text-[12px] font-bold text-[var(--em8)] border-b border-[var(--em7)]/10 pb-2 mb-1">توثيق الاستراتيجيات المفعّلة:</div>
                       {state.strats.map(stratName => {
                         const k = `strat:${stratName}`;
                         const evs = state.ev[`${stratSection.id}|${k}`] || [];
                         return (
                           <div key={stratName} className="bg-white/5 rounded-2xl p-4 border border-[var(--em7)]/10">
                             <div className="flex items-center justify-between mb-3">
                               <div className="flex items-center gap-2">
                                 <div className="w-2 h-2 rounded-full bg-[var(--gold)] shadow-[0_0_8px_rgba(201,162,39,.5)]"></div>
                                 <span className="text-[14px] font-bold text-white">{stratName}</span>
                                 {evs.length > 0 && <span className="text-[11px] font-black text-[var(--em8)] bg-[var(--em7)]/10 px-2 py-0.5 rounded-md">{evs.length} شواهد</span>}
                               </div>
                               <div className="flex items-center gap-2">
                                 <button
                                   className="py-1.5 px-3 rounded-lg bg-[var(--em7)]/10 border border-[var(--em7)]/20 text-[12px] font-bold text-[var(--em8)] hover:bg-[var(--em7)]/20 transition-all flex items-center gap-1.5"
                                   onClick={() => onAddEvClick(stratSection.id, k)}
                                 >
                                   <i className="ti ti-paperclip"></i> إرفاق شواهد
                                 </button>
                                 <button
                                   className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text4)] hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                                   onClick={() => onToggleStrat(stratName)}
                                   title="حذف الاستراتيجية"
                                 >
                                   <i className="ti ti-x text-[11px]"></i>
                                 </button>
                               </div>
                             </div>

                             {evs.length > 0 && (
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                 {evs.map((ev, ei) => {
                                   const t = EVT_CONFIG[ev.type] || EVT_CONFIG.doc;
                                   return (
                                     <div key={ei} className="flex items-center gap-2.5 py-2 px-3 bg-black/20 rounded-xl border border-white/5 relative group">
                                       <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[16px] shrink-0 ${t.cls}`}>
                                         <i className={`ti ${t.icon}`}></i>
                                       </div>
                                       <div
                                          className={`flex-1 min-w-0 ${ev.url ? 'cursor-pointer hover:opacity-80 transition-all' : ''}`}
                                          onClick={() => ev.url && window.open(ev.url, '_blank')}
                                          title={ev.url ? 'اضغط لعرض الملف' : ''}
                                        >
                                          <div className="text-[12px] font-bold text-white truncate group-hover:text-[var(--em8)] transition-colors" dir="ltr" style={{unicodeBidi:'isolate'}}>{ev.name}</div>
                                          {ev.url && <div className="text-[10px] text-[var(--em8)] mt-0.5 flex items-center gap-0.5 font-bold"><i className="ti ti-external-link"></i> استعراض</div>}
                                        </div>
                                       <button className="text-[var(--text4)] hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onDeleteEv(stratSection.id, k, ei)}>
                                         <i className="ti ti-trash"></i>
                                       </button>
                                     </div>
                                   );
                                 })}
                               </div>
                             )}

                             {evs.length === 0 && (
                               <div className="text-[12px] text-[var(--text4)] italic">لا توجد شواهد مرفقة لهذه الاستراتيجية حالياً.</div>
                             )}
                           </div>
                         );
                       })}
                     </div>
                   )}

                   <button className="mt-4 inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-[12.5px] font-bold cursor-pointer border-[1.5px] border-[var(--em7)]/20 text-[var(--em7)] bg-[var(--em7)]/5 hover:bg-gradient-to-br hover:from-[var(--em4)] hover:to-[var(--em6)] hover:text-white hover:border-transparent hover:shadow-[0_6px_18px_rgba(42,122,68,.5)] hover:-translate-y-0.5 group transition-all duration-250" onClick={onAddStratClick}>
                      <i className="ti ti-plus text-[15px] transition-transform duration-300 group-hover:scale-125 group-hover:rotate-[-5deg]"></i> إضافة استراتيجية جديدة
                   </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* FAB Speed Dial — Mobile only */}
      {fabExpanded && (
        <div
          className="md:hidden fixed inset-0 z-[240] bg-black/40"
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

      <div className="md:hidden fixed z-[250] flex flex-col items-end gap-3" style={{ bottom: '80px', left: '16px' }}>
        {fabExpanded && (
          <>
            <button
              className="flex items-center gap-2.5 pr-1.5 pl-4 h-[46px] rounded-full active:scale-95 transition-transform duration-150 text-[13px] font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                boxShadow: '0 4px 16px rgba(29,78,216,.5)',
                animation: 'fadeUp .2s var(--sp) both',
              }}
              onClick={() => { setFabExpanded(false); setSectionPickerOpen(true); }}
              title="إضافة شاهد"
            >
              إضافة شاهد
              <span className="w-[32px] h-[32px] rounded-full bg-white/15 flex items-center justify-center text-[16px]">
                <i className="ti ti-list-check" />
              </span>
            </button>
            <button
              className="flex items-center gap-2.5 pr-1.5 pl-4 h-[46px] rounded-full active:scale-95 transition-transform duration-150 text-[13px] font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, var(--em4), var(--em7))',
                boxShadow: '0 4px 16px rgba(42,122,68,.5)',
                animation: 'fadeUp .2s var(--sp) both .04s',
              }}
              onClick={() => { setFabExpanded(false); quickCapture.openPicker(); }}
              title="التقاط سريع"
            >
              التقاط سريع
              <span className="w-[32px] h-[32px] rounded-full bg-white/15 flex items-center justify-center text-[16px]">
                <i className="ti ti-camera" />
              </span>
            </button>
          </>
        )}

        <button
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform duration-150"
          style={{
            width: '56px',
            height: '56px',
            background: 'linear-gradient(135deg, var(--em4), var(--em7))',
            boxShadow: '0 4px 20px rgba(42,122,68,.6), 0 0 0 3px rgba(82,196,120,.15)',
          }}
          onClick={() => setFabExpanded(prev => !prev)}
          title="إضافة شاهد"
        >
          <i
            className="ti ti-plus text-white transition-transform duration-200"
            style={{ fontSize: '28px', transform: fabExpanded ? 'rotate(45deg)' : 'none' }}
          />
        </button>
      </div>

      {/* Bottom Sheet — اختيار البند (الخطوة الأولى) — جوال فقط */}
      <BottomSheet isOpen={sectionPickerOpen} onClose={() => setSectionPickerOpen(false)}>
        <div className="flex items-center justify-between px-6 pt-1 pb-4 border-b border-[var(--line)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] flex items-center justify-center text-[18px] border border-[var(--em7)]/20 shadow-[0_4px_14px_rgba(42,122,68,.3)]">
              <i className="ti ti-list-check" />
            </div>
            <div className="text-[16px] font-black text-white">اختر البند</div>
          </div>
          <button
            onClick={() => setSectionPickerOpen(false)}
            className="w-9 h-9 rounded-xl bg-white/5 border border-[var(--line)] text-[var(--text4)] hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-[18px]"
          >
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          <div className="grid grid-cols-2 gap-3">
            {sections.map(sec => (
              <button
                key={sec.id}
                type="button"
                onClick={() => handlePickSection(sec)}
                className="flex flex-col items-center gap-2.5 py-5 px-3 rounded-2xl border-[1.5px] border-[var(--line)] bg-white/5 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/30 transition-all duration-200 text-center cursor-pointer active:scale-95"
              >
                <div className="w-[44px] h-[44px] rounded-xl shrink-0 flex items-center justify-center text-[20px] bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] border border-[var(--em7)]/20 shadow-[0_4px_14px_rgba(42,122,68,.3)]">
                  <i className={`ti ${sec.icon}`} />
                </div>
                <span className="text-[12.5px] font-bold text-[var(--text2)] leading-snug">{sec.ttl}</span>
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>

      {/* Bottom Sheet — التقاط سريع: اختيار البند بعد الصورة — جوال فقط */}
      <BottomSheet isOpen={quickCapture.pickerSheetOpen} onClose={quickCapture.cancelPending}>
        <div className="flex items-center justify-between px-6 pt-1 pb-4 border-b border-[var(--line)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] flex items-center justify-center text-[18px] border border-[var(--em7)]/20 shadow-[0_4px_14px_rgba(42,122,68,.3)]">
              <i className="ti ti-camera" />
            </div>
            <div className="text-[16px] font-black text-white">اختر البند</div>
          </div>
          <button
            onClick={quickCapture.cancelPending}
            className="w-9 h-9 rounded-xl bg-white/5 border border-[var(--line)] text-[var(--text4)] hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-[18px]"
          >
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {quickCapture.pendingPreviewUrl && (
            <img
              src={quickCapture.pendingPreviewUrl}
              alt="الصورة المختارة"
              className="w-full max-h-[160px] object-cover rounded-2xl border border-[var(--line)] mb-4"
            />
          )}
          <div className="flex flex-col gap-1.5">
            {sections.map(sec => (
              <button
                key={sec.id}
                type="button"
                disabled={quickCapture.saving}
                onClick={() => quickCapture.saveToSection(sec)}
                className="flex items-center gap-3 py-3 px-4 rounded-xl bg-white/5 hover:bg-[var(--em7)]/10 transition-all duration-200 text-right cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                <i className={`ti ${sec.icon} text-[16px] text-[var(--em7)] shrink-0`} />
                <span className="flex-1 text-[13.5px] font-bold text-[var(--text2)]">{sec.ttl}</span>
                {quickCapture.saving && <i className="ti ti-loader animate-spin text-[14px] text-[var(--em8)]" />}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>

      {/* Bottom Sheet — إضافة شاهد (الخطوة الثانية) — جوال فقط */}
      {supabaseEv && (
        <BottomSheet isOpen={mobileSheet.open} onClose={closeMobileSheet}>
          <EvidenceForm
            isOpen={mobileSheet.open}
            onClose={closeMobileSheet}
            sectionId={mobileSheet.sectionId}
            sub={mobileSheet.sub}
            userId={userId}
            supabaseEv={supabaseEv}
            onAddEv={onAddEv ?? (() => {})}
            onToast={onToast ?? (() => {})}
          />
        </BottomSheet>
      )}

      {/* Announcement Detail Modal */}
      {activeAnn && (
        <div className="modal-overlay" style={{ zIndex: 400 }} onClick={e => { if (e.target === e.currentTarget) handleCloseAnnModal(); }}>
          <div className="user-modal max-w-lg" style={{ animation: 'scaleIn .35s var(--sp) both' }}>
            <div className="umodal-header border-b border-white/5 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[20px] ${
                  activeAnn.category === 'admin' ? 'bg-[var(--gold)]/10 text-[var(--gold)]' :
                  activeAnn.category === 'urgent' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
                }`}>
                  <i className={`ti ${activeAnn.category === 'admin' ? 'ti-file-text' : activeAnn.category === 'urgent' ? 'ti-alert-triangle' : 'ti-settings'}`}></i>
                </div>
                <div>
                  <div className="text-[11.5px] text-[var(--text4)]">
                    {activeAnn.category === 'admin' ? 'تعميم إداري' : activeAnn.category === 'urgent' ? 'تنبيه عاجل' : 'تحديث برمجي'}
                  </div>
                  <div className="text-[12px] text-[var(--text3)] mt-0.5">
                    {new Date(activeAnn.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              </div>
              <button className="umodal-close" onClick={handleCloseAnnModal}><i className="ti ti-x" /></button>
            </div>

            <div className="px-6 py-2">
              <h3 className="text-[17px] font-black text-white mb-3.5 leading-snug">{activeAnn.title}</h3>
              <p className="text-[14px] text-[var(--text2)] leading-relaxed whitespace-pre-wrap mb-5">{activeAnn.content}</p>

              {activeAnn.attachment_url && (
                <div className="mb-4">
                  <a 
                    href={activeAnn.attachment_url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="inline-flex items-center gap-2 py-2 px-4 rounded-xl text-[12.5px] font-bold bg-[var(--em7)]/15 border border-[var(--em7)]/25 text-[var(--em8)] hover:bg-[var(--em7)]/25 transition-all no-underline"
                  >
                    <i className="ti ti-paperclip"></i> تحميل الملف المرفق
                  </a>
                </div>
              )}
            </div>

            <div className="umodal-actions border-t border-white/5 pt-4 mt-2 flex justify-end gap-2">
              <button className="umodal-btn primary-btn py-2.5 px-6 rounded-xl" onClick={handleCloseAnnModal}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
