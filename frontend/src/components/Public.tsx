import React, { useState, useMemo } from 'react';
import type { ContinuityData, Evidence, FrozenPointsLevel, PublicPortfolioState, SectionData } from '../types';
import { calculatePointsLevel, getCompletionColor, getCompletionLabel, supabaseEvidenceTypeToLocal, extensionFromUrl } from '../utils';
import { LESSON_PLAN_SECTION_ID } from '../data';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import EvidenceList from './EvidenceList';
import PdfPreview, { PdfPreviewFallback } from './PdfPreview';
import type { PublicResultsAnalysisRow } from './ResultsAnalysis/types';
import type { ComparisonPoint } from './ResultsAnalysis/logic';
import { groupPublicAnalysesBySubject, buildPublicComparisonSeries, comparisonDelta } from './ResultsAnalysis/logic';
import './Public.print.css';

/** تدرج رمادي واحد فقط لوضع الطباعة، تتحكم النسبة بدرجته — لا يُستخدم على
 * الشاشة أبداً، فقط كقيمة لمتغيّر CSS (--print-gray) يُفعَّل عبر @media print.
 * نسبة منخفضة → رمادي فاتح جداً، نسبة عالية → قريب من الأسود. */
function printGray(pct: number): string {
  const clamped = Math.min(100, Math.max(0, pct));
  const v = Math.round(232 - (clamped / 100) * 204);
  const hex = v.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

interface PublicProps {
  state: PublicPortfolioState;
  sections: SectionData[];
  /** When true, this view is accessed via a public share link (no auth required) */
  isSharedView?: boolean;
  /** مؤشر الاستمرارية عبر الزمن — غائب فقط أثناء التحميل أو إن تعذّر الجلب،
   * وفي هذه الحالة القسم لا يُعرض إطلاقاً بدل عرض بيانات فارغة مضلّلة. */
  continuity?: ContinuityData | null;
  /** شواهد جدول evidence الجديد (الغني) — غائبة أثناء التحميل، وفي هذه الحالة
   * القسم الإضافي في نافذة تفاصيل البند لا يُعرض إطلاقاً (نفس منطق continuity). */
  evidence?: SupabaseEvidence[] | null;
  /** بند 10 (تحليل نتائج المتعلمين) — شكل مبسَّط آمن فقط (id, subject, stage,
   * class_section, created_at, total_students, average, min_score, max_score)،
   * بلا summary/students إطلاقاً. غائب فقط أثناء التحميل (مسار ?share= الحي)،
   * وفي هذه الحالة البطاقة لا تُعرض إطلاقاً. في وضع ?report= يأتي جاهزاً من
   * snapshot.resultsAnalysis (مخبوز وقت التوليد، انظر HarvestReportSheet.tsx). */
  resultsAnalysis?: PublicResultsAnalysisRow[] | null;
  /** ملخص ذكاء اصطناعي لبند "إعداد خطة التعلم" (section_id=6) كاملاً —
   * جملة واحدة أو جملتان، مصدرها جدول section_ai_summaries عبر
   * get_shared_lesson_plan_summary() (مسار ?share=) أو قراءة مباشرة بـRLS
   * (معاينة المالك). null/undefined يعني ببساطة "لا يوجد ملخص بعد" — لا
   * تمييز بينهما هنا خلافاً لـevidence/resultsAnalysis (لا قسم إضافي كامل
   * يُخفى، فقط سطر/صندوق صغير داخل بطاقة موجودة أصلاً). غائب دائماً في وضع
   * ?report= (خارج نطاق هذه الميزة حالياً). */
  lessonPlanSummary?: string | null;
  /** عناصر مقارنة بند 10 مخبوزة سلفاً — تُمرَّر فقط في وضع ?report=، حيث حُسبت
   * وقت توليد التقرير من resultsAnalysis أعلاه (انظر HarvestReportSheet.tsx)
   * ولا يصح إعادة حسابها هنا وقت العرض (لقطة ثابتة، لا تتأثر بتعديل لاحق
   * للمصدر). غائبة في مسار ?share= الحي ومعاينة المالك — هناك تُحسب محلياً
   * كما كانت دائماً (انظر resultsComparisons أدناه). */
  frozenResultsComparisons?: { subject: string; series: ComparisonPoint[] }[];
  /** وضع "تقرير حصاد فصلي" الثابت (?report=) — يستبدل حساب شارة النقاط الحي
   * (نافذة آخر 3 أشهر تقويمية، مرتبطة بـ"اليوم") بقيمة مجمَّدة وقت التوليد،
   * ويضيف سطر عنوان الفترة/تاريخ التوليد في الهيرو وترويسة الطباعة. غائب في
   * مسار ?share= العادي — لا فرق هناك إطلاقاً. */
  reportMeta?: {
    periodLabel: string;
    periodFrom: string;
    generatedAt: string;
    pointsLevel: FrozenPointsLevel;
  };
  /** اسم كل استراتيجية تدريس (id → name_ar) لحلّ evidence[].strategy_id إلى
   *  اسم معروض ببطاقة القسم 4 — من useTeachingStrategies (معاينة المالك)،
   *  usePublicTeachingStrategies (مسار ?share=)، أو snapshot.strategyNames
   *  المُخبوز وقت التوليد (مسار ?report=). افتراضي {} إن غاب. */
  strategyNames?: Record<string, string>;
}

/** يستخرج معرّف فيديو يوتيوب من أي صيغة رابط شائعة (watch؟v=, youtu.be/, embed/, shorts/)،
 * أو null إن لم يكن رابط يوتيوب صالحاً — يُستخدم لبناء مصغّرة img.youtube.com. */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(embed|shorts)\/([^/?]+)/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

/** اسم الدومين فقط (بدون www.) لعرضه بجانب أيقونة رابط عام غير معروف */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** امتدادات مستندات Office — تميّزها عن PDF ضمن شواهد النوع 'file' (كلاهما
 * يُحوَّل إلى نفس Evidence['type'] المجمَّد 'pdf' عبر supabaseEvidenceTypeToLocal،
 * فالتمييز الفعلي يحتاج فحص الامتداد الحقيقي في الرابط عبر extensionFromUrl). */
const OFFICE_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

const EVT_CONFIG: Record<string, {icon: string, cls: string, label: string}> = {
  pdf: {icon: 'ti-file-type-pdf', cls: 'bg-gradient-to-br from-[#b91c1c]/20 to-[#b91c1c]/10 text-[#f87171] border border-[#b91c1c]/20', label: 'PDF'},
  img: {icon: 'ti-photo', cls: 'bg-gradient-to-br from-[#1d4ed8]/20 to-[#1d4ed8]/10 text-[#93c5fd] border border-[#1d4ed8]/20', label: 'صورة'},
  doc: {icon: 'ti-file-text', cls: 'bg-gradient-to-br from-[#6d28d9]/20 to-[#6d28d9]/10 text-[#c4b5fd] border border-[#6d28d9]/20', label: 'مستند'},
  vid: {icon: 'ti-video', cls: 'bg-gradient-to-br from-[#b45309]/20 to-[#b45309]/10 text-[#fcd34d] border border-[#b45309]/20', label: 'فيديو'}
};

type SectionWithPct = SectionData & {
  fullName: string;
  evCount: number;
  evs: (Evidence & { sub: string })[];
  pct: number;
};

/** صف أيقونات التواصل (هاتف/بريد + روابط اجتماعية) — تُعرض الأيقونة فقط إن
 * كان الحقل المقابل لها غير فارغ. مُستخرج لتجنّب تكرار الشرط الخماسي مرتين
 * بين تخطيط الجوال وتخطيط الديسكتوب (البند 4). */
function SocialIconsRow({ profile, justify }: { profile: PublicPortfolioState['profile']; justify: string }) {
  const links: { key: string; href: string; icon: string; hover: string }[] = [];
  if (profile.phone) links.push({ key: 'phone', href: `tel:${profile.phone}`, icon: 'ti-phone', hover: 'hover:bg-[var(--em7)]/20 hover:text-[var(--em8)]' });
  if (profile.email) links.push({ key: 'email', href: `mailto:${profile.email}`, icon: 'ti-mail', hover: 'hover:bg-[var(--em7)]/20 hover:text-[var(--em8)]' });
  if (profile.twitter) links.push({ key: 'twitter', href: profile.twitter, icon: 'ti-brand-twitter', hover: 'hover:bg-[#1da1f2]/20 hover:text-[#1da1f2]' });
  if (profile.linkedin) links.push({ key: 'linkedin', href: profile.linkedin, icon: 'ti-brand-linkedin', hover: 'hover:bg-[#0077b5]/20 hover:text-[#0077b5]' });
  if (profile.youtube) links.push({ key: 'youtube', href: profile.youtube, icon: 'ti-brand-youtube', hover: 'hover:bg-[#ff0000]/20 hover:text-[#ff0000]' });

  return (
    <div className={`print-decor flex ${justify} gap-3 relative z-10`}>
      {links.map(l => (
        <a
          key={l.key}
          href={l.href}
          {...(l.key !== 'phone' && l.key !== 'email' ? { target: '_blank', rel: 'noreferrer' } : {})}
          className={`w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white transition-all ${l.hover}`}
        >
          <i className={`ti ${l.icon}`}></i>
        </a>
      ))}
    </div>
  );
}

function StatsRow({ totalEvs, sectionsCount, years, justify }: { totalEvs: number; sectionsCount: number; years: number; justify: string }) {
  return (
    <div className={`relative z-10 flex ${justify}`}>
      <div className="flex flex-col sm:flex-row gap-0 bg-white/5 border border-[var(--line)] rounded-2xl inline-flex overflow-hidden">
        <div className="py-4 px-8 text-center text-white border-b sm:border-b-0 sm:border-l border-[var(--line)]">
          <div className="text-[28px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-br from-[var(--em8)] to-[var(--gold3)]">{totalEvs}</div>
          <div className="text-[11px] text-[var(--text4)] mt-1">أدلة موثّقة</div>
        </div>
        <div className="py-4 px-8 text-center text-white border-b sm:border-b-0 sm:border-l border-[var(--line)]">
          <div className="text-[28px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-br from-[var(--em8)] to-[var(--gold3)]">{sectionsCount}</div>
          <div className="text-[11px] text-[var(--text4)] mt-1">قسم</div>
        </div>
        <div className="py-4 px-8 text-center text-white">
          <div className="text-[28px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-br from-[var(--em8)] to-[var(--gold3)]">{years}</div>
          <div className="text-[11px] text-[var(--text4)] mt-1">سنة خبرة</div>
        </div>
      </div>
    </div>
  );
}

const MONTH_ABBR: Record<number, string> = {
  1: 'ينا', 2: 'فبر', 3: 'مار', 4: 'أبر', 5: 'ماي', 6: 'يون',
  7: 'يول', 8: 'أغس', 9: 'سبت', 10: 'أكت', 11: 'نوف', 12: 'ديس',
};
const MONTH_FULL: Record<number, string> = {
  1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل', 5: 'مايو', 6: 'يونيو',
  7: 'يوليو', 8: 'أغسطس', 9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر',
};

/** يبني 12 شهراً بالترتيب بدءاً من yearStartMonth للسنة الدراسية المرجعية —
 * نفس منطق academicStartYear في useMonthlyProgress.ts، معاد محلياً هنا لأن
 * تلك النسخة مرتبطة بحالة قابلة للتعديل خاصة بلوحة التحكم (recordEvidence/
 * removeEvidence) لا حاجة لها في العرض العام للقراءة فقط.
 * referenceDate: افتراضياً "اليوم" (مسار ?share= الحي، بلا أي تغيير)؛ في وضع
 * تقرير الحصاد الفصلي (?report=) يُمرَّر بداية الفترة نفسها بدل "اليوم"، حتى
 * لا تُبنى شبكة سنة دراسية غير متعلقة بالتقرير عند فتح رابط قديم لاحقاً. */
function buildAcademicMonths(yearStartMonth: number, referenceDate: Date = new Date()): { year: number; month: number }[] {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  const startYear = currentMonth >= yearStartMonth ? currentYear : currentYear - 1;
  const startFlat = startYear * 12 + (yearStartMonth - 1);

  return Array.from({ length: 12 }, (_, i) => {
    const flat = startFlat + i;
    return { year: Math.floor(flat / 12), month: (flat % 12) + 1 };
  });
}

/** شبكة "الاستمرارية عبر العام الدراسي" — 12 مربعاً بترتيب السنة الدراسية،
 * بثلاث حالات بصرية: نشط (توثيق فعلي)، مضى بلا توثيق، ومستقبلي لم يحن بعد
 * (منقّط بلا خلفية) حتى لا يُقرأ كإخفاق.
 * referenceDate: انظر تعليق buildAcademicMonths — نفس المرجع يُستخدم هنا
 * لتحديد الخلايا "المستقبلية" بالنسبة لفترة التقرير، لا بالنسبة لتاريخ فتح الرابط. */
function ContinuityGrid({ continuity, referenceDate = new Date() }: { continuity: ContinuityData; referenceDate?: Date }) {
  const months = buildAcademicMonths(continuity.yearStartMonth, referenceDate);
  const activeSet = new Set(continuity.activeMonths.map(m => `${m.year}-${m.month}`));

  const currentFlat = referenceDate.getFullYear() * 12 + (referenceDate.getMonth() + 1);

  let activeCount = 0;
  const cells = months.map(m => {
    const flat = m.year * 12 + m.month;
    const isFuture = flat > currentFlat;
    const isActive = !isFuture && activeSet.has(`${m.year}-${m.month}`);
    if (isActive) activeCount++;
    return { ...m, isFuture, isActive };
  });

  return (
    <div className="print-card mb-8 bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--line)] shadow-lg p-6 sm:p-8">
      <h2 className="text-[15px] font-bold text-[var(--text3)] flex items-center gap-2 mb-4">
        <i className="ti ti-calendar-stats text-[var(--em8)]"></i> الاستمرارية عبر العام الدراسي
      </h2>
      <div className="grid grid-cols-12 gap-1.5 sm:gap-2">
        {cells.map((c, i) => (
          <div
            key={i}
            title={`${MONTH_FULL[c.month]} ${c.year} — ${c.isFuture ? 'لم يحن بعد' : c.isActive ? 'تم التوثيق' : 'بلا توثيق'}`}
            className={`aspect-square rounded-lg flex items-center justify-center text-[9px] sm:text-[11px] font-bold transition-colors ${
              c.isFuture
                ? 'border border-dashed border-[var(--line)] text-[var(--text4)]/50 bg-transparent'
                : c.isActive
                ? 'bg-[var(--em7)]/20 border border-[var(--em7)]/50 text-[var(--em8)]'
                : 'bg-white/5 border border-[var(--line)] text-[var(--text4)]'
            }`}
          >
            {MONTH_ABBR[c.month]}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] text-[var(--text3)]">
        نشط في <strong className="text-white">{activeCount}</strong> من 12 شهراً
      </p>
    </div>
  );
}

/** شارة لقب المستوى (خطوة ثابتة / مسيرة واثقة / قدوة متميزة) — بجانب اسم المعلم
 * أعلى صفحة المشاركة، بنفس تصميم الشارة الذهبية المستخدمة في بطاقات الأقسام.
 * pointsSubtitle: نص التلميح خلف عدد النقاط — "آخر 3 أشهر" في المسار الحي،
 * أو نص مخصص لفترة التقرير في وضع ?report= (النقاط ليست نافذة 3 أشهر هناك). */
function LevelBadge({ pointsLevel, pointsSubtitle = 'خلال آخر 3 أشهر' }: { pointsLevel: Pick<ReturnType<typeof calculatePointsLevel>, 'points' | 'levelIcon' | 'levelLabel'>; pointsSubtitle?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] sm:text-[13px] font-black text-[var(--gold3)] bg-[var(--gold)]/12 border border-[var(--gold)]/35 py-1.5 px-3 rounded-full leading-none relative z-10"
      style={{ animation: 'scaleIn .35s var(--sp) both' }}
      title={`${pointsLevel.points} نقطة ${pointsSubtitle}`}
    >
      <i className={`ti ${pointsLevel.levelIcon} text-[13px]`} /> {pointsLevel.levelLabel}
    </span>
  );
}

function BadgesRow({ justify }: { justify: string }) {
  return (
    <div className={`flex ${justify} gap-2 flex-wrap relative z-10`}>
      <div className="inline-flex items-center gap-1.5 py-1.5 px-4 bg-white/5 border border-white/10 rounded-full text-[12.5px] text-[var(--text2)] backdrop-blur-md cursor-default transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/25 hover:-translate-y-0.5">
        <i className="ti ti-school text-[var(--gold)]"></i> وزارة التعليم
      </div>
      <div className="inline-flex items-center gap-1.5 py-1.5 px-4 bg-white/5 border border-white/10 rounded-full text-[12.5px] text-[var(--text2)] backdrop-blur-md cursor-default transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/25 hover:-translate-y-0.5">
        <i className="ti ti-map-pin text-[var(--gold)]"></i> المملكة العربية السعودية
      </div>
    </div>
  );
}

/** سطر عنوان فترة التقرير + تاريخ التوليد — يظهر فقط في وضع ?report=، أعلى
 * اسم المعلم في الهيرو (كل من تخطيطي الجوال والديسكتوب). */
function ReportPeriodBanner({ periodLabel, generatedAt, justify }: { periodLabel: string; generatedAt: string; justify: string }) {
  const generatedLabel = new Date(generatedAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className={`flex ${justify} relative z-10 mb-3`}>
      <div className="inline-flex flex-col items-center sm:items-start gap-0.5 py-2 px-4 rounded-2xl bg-white/5 border border-[var(--gold)]/25 backdrop-blur-md">
        <span className="text-[13px] font-black text-[var(--gold3)] flex items-center gap-1.5">
          <i className="ti ti-file-report text-[13px]" /> {periodLabel}
        </span>
        <span className="text-[11px] text-[var(--text4)]">تقرير مُولَّد بتاريخ {generatedLabel}</span>
      </div>
    </div>
  );
}

function Avatar({ profile, size }: { profile: PublicPortfolioState['profile']; size: number }) {
  return (
    <div className="inline-block relative z-10" style={{ width: size, height: size }}>
      <div
        className="print-avatar rounded-full bg-gradient-to-br from-[var(--em3)] to-[var(--em6)] text-white inline-flex items-center justify-center font-black border-2 border-white/15 shadow-[0_0_0_8px_rgba(42,122,68,.1),0_0_0_16px_rgba(42,122,68,.05),0_20px_60px_rgba(0,0,0,.5)] relative z-10 bg-cover bg-center overflow-hidden"
        style={{ width: size, height: size, fontSize: size * 0.39, ...(profile.avatar ? { backgroundImage: `url(${profile.avatar})` } : {}) }}
      >
        {!profile.avatar && profile.name.substring(0, 2)}
      </div>
      <div className="print-decor absolute -inset-3 rounded-full border border-[var(--gold)]/20 z-0" style={{ animation: 'spin 12s linear infinite' }}></div>
      <div className="print-decor absolute -inset-5 rounded-full border border-[var(--em7)]/10 z-0" style={{ animation: 'spin 20s linear infinite reverse' }}></div>
      <div className="print-decor absolute bottom-2 left-2 w-5 h-5 bg-[#4ade80] border-[3px] border-[var(--em2)] rounded-full shadow-[0_0_10px_rgba(74,222,128,.5)] z-20" style={{ animation: 'pulse 2s infinite' }}></div>
    </div>
  );
}

/** بطاقة قسم واحدة — تُستخدم لكل من الأقسام النشطة (المستوى 2) والأقسام
 * الفارغة الموسّعة (المستوى 3)، حتى لا يتكرر تصميم البطاقة في أكثر من مكان.
 * اللون مأخوذ بالكامل من getCompletionColor(pct) في utils.ts. */
const LESSON_PLAN_SUMMARY_PREVIEW_MAX = 70;

function SectionCard({ sec, isTop, onClick, style, lessonPlanSummary }: { sec: SectionWithPct; isTop?: boolean; onClick: () => void; style?: React.CSSProperties; lessonPlanSummary?: string | null }) {
  const color = getCompletionColor(sec.pct);
  // العمق التراكمي = إجمالي الأدلة (evCount) ÷ عدد المؤشرات الفرعية المغطاة تراكمياً
  const filledSubsCount = new Set(sec.evs.map(e => e.sub)).size;
  const depth = filledSubsCount > 0 ? sec.evCount / filledSubsCount : 0;
  const hasBadges = isTop || sec.evCount > 3;
  return (
    <div
      className={`print-card group bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl shadow-lg cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,0,0,.3)] relative overflow-hidden ${isTop ? 'px-6 pt-6 border-2' : 'px-5 pt-5 border'} ${hasBadges ? (isTop ? 'pb-11' : 'pb-10') : (isTop ? 'pb-6' : 'pb-5')}`}
      style={{ borderColor: isTop ? color : 'var(--line)', ...style }}
      onClick={onClick}
      title={depth > 1 ? `متوسط ${depth.toFixed(1)} دليل لكل مؤشر مغطى` : undefined}
    >
      {hasBadges && (
        <div className="print-decor absolute bottom-3 left-3 z-20 flex flex-row items-center gap-1.5">
          {isTop && (
            <div className="flex items-center gap-1 py-0.5 px-2 rounded-full text-[9px] font-black text-white shrink-0" style={{ backgroundColor: color }}>
              <i className="ti ti-trophy text-[10px]"></i> أبرز إنجاز
            </div>
          )}
          {/* شارة "تجاوز الهدف" — الرقم المطلق للأدلة التراكمية (لا "+N") لأن
              الجمهور الخارجي لا يعرف سقف الهدف الشهري الداخلي؛ تظهر فقط إن > 3 */}
          {sec.evCount > 3 && (
            <div className="flex items-center justify-center gap-[1px] rounded-full text-[var(--gold)] bg-[var(--gold)]/15 border border-[var(--gold)]/30 shrink-0" style={{ width: 24, height: 24 }}>
              <i className="ti ti-bolt text-[9px]"></i>
              <span className="text-[9px] font-black leading-none">{sec.evCount}</span>
            </div>
          )}
        </div>
      )}
      <div className="print-decor absolute top-0 left-0 w-full h-[3px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: color }}></div>

      <div className="flex items-center gap-4 relative z-10">
        <div
          className={`print-decor rounded-2xl flex items-center justify-center border shrink-0 transition-all duration-300 ${isTop ? 'w-14 h-14 text-[28px]' : 'w-12 h-12 text-[24px]'}`}
          style={{ color, borderColor: `${color}40`, background: `${color}1a` }}
        >
          <i className={`ti ${sec.icon}`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-white leading-tight overflow-hidden text-ellipsis whitespace-nowrap ${isTop ? 'text-[16.5px]' : 'text-[15px]'}`}>{sec.fullName}</h3>
          <p className="text-[12.5px] text-[var(--text4)] mt-2 flex items-baseline gap-1.5">
            <span>{sec.isStrat ? 'الاستراتيجيات المضافة' : 'الأدلة الموثقة'}</span>
            <strong className="text-white font-black" style={{ fontSize: isTop ? 22 : 19 }}>{sec.evCount}</strong>
          </p>
          {/* معاينة ملخص بند "إعداد خطة التعلم" بالذكاء الاصطناعي — سطر واحد
              مقتطع، يظهر فقط لهذا البند تحديداً وعند وجود ملخص فعلي */}
          {sec.id === LESSON_PLAN_SECTION_ID && lessonPlanSummary && (
            <p className="text-[11.5px] text-[var(--em8)] mt-1.5 flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap">
              <i className="ti ti-sparkles text-[11px] shrink-0" />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {lessonPlanSummary.length > LESSON_PLAN_SUMMARY_PREVIEW_MAX
                  ? `${lessonPlanSummary.slice(0, LESSON_PLAN_SUMMARY_PREVIEW_MAX)}…`
                  : lessonPlanSummary}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** مصغّرة دليل واحد ضمن بطاقة الاستراتيجيات — صورة فعلية / مصغّرة يوتيوب /
 * أيقونة ملف+اسم / أيقونة رابط+دومين / أيقونة ملاحظة، حسب نوع الدليل ورابطه. */
/** onClick اختياري: يُستدعى بدلاً من فتح رابط خارجي مباشرة عند توفره (يُستخدم
 * لفتح نافذة معاينة/lightbox). الروابط الخارجية العامة (type: 'doc') تبقى
 * تفتح في تبويب جديد مباشرة دون معاينة. */
/** شكل بنيوي أدنى تحتاجه EvidenceThumb — Evidence القديم يحقّقه تلقائياً، وكذلك
 * أي SupabaseEvidence مُحوَّل يدوياً (انظر toThumbEvidence أدناه لبطاقة الاستراتيجيات). */
type ThumbEvidence = { type: Evidence['type']; name: string; url?: string };

function EvidenceThumb({ e, onClick }: { e: ThumbEvidence; onClick?: (e: ThumbEvidence) => void }) {
  const handleClick = (ev: React.MouseEvent) => {
    if (!onClick) return;
    ev.stopPropagation();
    onClick(e);
  };

  if (e.type === 'img' && e.url) {
    return (
      <img
        src={e.url}
        alt={e.name}
        onClick={onClick ? handleClick : undefined}
        className={`w-full h-[88px] object-cover rounded-xl border border-white/10 ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      />
    );
  }

  const ytId = e.url ? extractYouTubeId(e.url) : null;
  if (ytId) {
    return (
      <div onClick={onClick ? handleClick : undefined} className={`block relative group ${onClick ? 'cursor-pointer' : ''}`}>
        <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={e.name} className="w-full h-[88px] object-cover rounded-xl border border-white/10" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors rounded-xl">
          <i className="ti ti-player-play-filled text-white text-[26px] drop-shadow-lg"></i>
        </span>
      </div>
    );
  }

  if (e.type === 'pdf' || e.type === 'vid') {
    const t = EVT_CONFIG[e.type];
    return (
      <div
        onClick={e.url && onClick ? handleClick : undefined}
        className={`flex items-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 ${e.url && onClick ? 'hover:bg-white/10 cursor-pointer' : ''}`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[16px] shrink-0 ${t.cls}`}>
          <i className={`ti ${t.icon}`}></i>
        </div>
        <span className="text-[12px] font-bold text-white truncate">{e.name}</span>
      </div>
    );
  }

  if (e.type === 'doc' && e.url) {
    return (
      <a href={e.url} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()} className="flex items-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-[var(--em8)] hover:bg-white/10 transition-colors">
        <i className="ti ti-link text-[18px]"></i>
        <span className="text-[12px] font-bold truncate" dir="ltr">{getDomain(e.url)}</span>
      </a>
    );
  }

  // ملاحظة نصية بلا رابط أو ملف
  return (
    <div className="flex items-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-[var(--text3)]">
      <i className="ti ti-notes text-[18px]"></i>
      <span className="text-[12px] font-bold truncate">{e.name}</span>
    </div>
  );
}

/** الحقول السياقية الخمسة لدليل استراتيجية — تُعرض فقط إن وُجدت قيمة لها؛
 * الأدلة القديمة بلا هذي الحقول لا تُعرض لها أي شارة (لا "غير محدد" مكرّرة). */
/** نافذة معاينة مصغّرة (lightbox) خاصة بأدلة قسم الاستراتيجيات فقط — منفصلة
 * كلياً عن previewFile العام حتى لا تمتد التعديلات لأي قسم آخر في الصفحة.
 * ترتيب الفحص يطابق EvidenceThumb تماماً: صورة → يوتيوب → PDF → فيديو مباشر. */
function StrategyLightbox({ item, onClose }: { item: { name: string; url: string; type: Evidence['type'] } | null; onClose: () => void }) {
  if (!item) return null;
  const ytId = item.type !== 'img' ? extractYouTubeId(item.url) : null;
  const ext = extensionFromUrl(item.url);
  const isPdf = ext === 'pdf';
  const isOfficeDoc = OFFICE_EXTENSIONS.includes(ext);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative bg-[#0c1c12]/95 border border-[var(--gold)]/25 w-full max-w-3xl rounded-[24px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden" style={{ animation: 'jumpIn .4s var(--sp) both' }}>
        <div className="flex items-center justify-between py-4 px-6 border-b border-white/10 bg-black/20">
          <h3 className="text-[15px] font-black text-white truncate max-w-[280px] sm:max-w-[500px]" dir="rtl">{item.name}</h3>
          <button
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text3)] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all cursor-pointer"
            onClick={onClose}
          >
            <i className="ti ti-x text-[18px]"></i>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-black/10 flex items-center justify-center">
          {item.type === 'img' && (
            <img src={item.url} alt={item.name} className="max-w-full max-h-[65vh] object-contain rounded-2xl shadow-2xl" />
          )}

          {item.type !== 'img' && ytId && (
            <div className="w-full aspect-video rounded-2xl overflow-hidden shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                className="w-full h-full border-none"
                title={item.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {item.type === 'pdf' && !ytId && isPdf && (
            <PdfPreview url={item.url} name={item.name} className="w-full h-[65vh]" />
          )}

          {item.type === 'pdf' && !ytId && !isPdf && isOfficeDoc && (
            <div className="text-center p-8 max-w-md bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md shadow-2xl">
              <div className="w-16 h-16 rounded-2xl bg-[#c4b5fd]/15 text-[#c4b5fd] flex items-center justify-center text-[34px] mx-auto mb-5 border border-[#c4b5fd]/20 animate-pulse">
                <i className="ti ti-file-text"></i>
              </div>
              <h4 className="text-[17px] font-black text-white mb-2.5">معاينة هذا المستند غير متوفرة مباشرة</h4>
              <p className="text-[13px] text-[var(--text4)] leading-relaxed mb-6">
                بما أن هذا الملف مستند ميكروسوفت (Word/Excel)، فيرجى الضغط على زر تحميل أدناه لاستعراض كامل محتوياته على جهازك بكل يسر وسهولة.
              </p>
              <a
                href={item.url}
                download={item.name}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 py-3.5 px-7 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white text-[14px] font-black transition-all duration-300 hover:-translate-y-[3px] hover:shadow-[0_6px_20px_rgba(42,122,68,.5)] no-underline cursor-pointer border-none"
              >
                <i className="ti ti-download text-[18px]"></i>
                تحميل مستند الشاهد
              </a>
            </div>
          )}

          {item.type === 'pdf' && !ytId && !isPdf && !isOfficeDoc && (
            <PdfPreviewFallback url={item.url} name={item.name} />
          )}

          {item.type === 'vid' && !ytId && (
            <video src={item.url} controls className="max-w-full max-h-[65vh] rounded-2xl" />
          )}
        </div>
      </div>
    </div>
  );
}

/** سطر تحليل واحد ببطاقة بند 10 العامة — بلا أي رسم توزيع فئات أو قائمة طلاب
 *  (بيانات داخلية فقط)، فقط شريط مدى (0-100) يوضّح موقع الأدنى/الأعلى، وعلامة
 *  بيضاء لموقع المتوسط. dir="ltr" مقصود ومعزول عن اتجاه الصفحة: شريط رقمي
 *  كهذا يحتاج تموضعاً مطلقاً (left: min%→max%) لا يصح تركه لموضع RTL افتراضي
 *  غامض، وقيم الدرجات تُقرأ تقليدياً من اليسار لليمين بصرف النظر عن اتجاه
 *  النص المحيط بها. */
function ResultRangeRow({ row }: { row: PublicResultsAnalysisRow }) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const minPct = clamp(row.min_score);
  const maxPct = clamp(row.max_score);
  const avgPct = clamp(row.average);
  const metaParts = [row.stage, row.class_section].filter(Boolean) as string[];

  return (
    <div className="bg-white/5 rounded-2xl p-4 border border-[var(--violet)]/10">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-[14px] font-bold text-white">{row.subject}</span>
          {metaParts.length > 0 && (
            <span className="text-[12px] text-[var(--text4)] mr-2">{metaParts.join(' · ')}</span>
          )}
        </div>
        <span className="text-[11px] font-black text-[var(--violet2)] bg-[var(--violet)]/10 px-2 py-0.5 rounded-md whitespace-nowrap shrink-0">
          {row.total_students} طالب
        </span>
      </div>

      <div dir="ltr">
        <div className="relative h-2 rounded-full bg-white/10">
          <div
            className="absolute top-0 h-2 rounded-full bg-[var(--violet)]"
            style={{ left: `${minPct}%`, width: `${Math.max(1, maxPct - minPct)}%` }}
          ></div>
          <div
            className="absolute top-1/2 w-[3px] h-3.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,.7)] -translate-y-1/2"
            style={{ left: `${avgPct}%`, marginLeft: '-1.5px' }}
            title={`المتوسط ${row.average.toFixed(1)}`}
          ></div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-[var(--text4)] font-bold mt-2">
          <span>أدنى {row.min_score}</span>
          <span className="text-[var(--violet2)]">متوسط {row.average.toFixed(1)}</span>
          <span>أعلى {row.max_score}</span>
        </div>
      </div>
    </div>
  );
}

/** عنصر مقارنة تلقائي مصغّر لمادة بها تحليلان فأكثر — Sparkline بآخر نقطتين
 *  فقط (لا رسم زمني كامل، ذاك في لوحة التحكم) + نص الفرق (comparisonDelta،
 *  نفس المنطق ونفس صياغة النص المستخدَمة في ComparisonChart.tsx بلوحة
 *  التحكم). لا يُعرض إطلاقاً لو أقل من نقطتين (comparisonDelta يُرجع null). */
function ResultComparisonMini({ subject, series }: { subject: string; series: ComparisonPoint[] }) {
  const delta = comparisonDelta(series);
  if (!delta) return null;

  const last2 = series.slice(-2);
  const values = last2.map(p => p.average);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const norm = (v: number) => (hi === lo ? 0.5 : (v - lo) / (hi - lo));
  const w = 60, h = 24, pad = 4;
  const y1 = pad + (1 - norm(values[0])) * (h - pad * 2);
  const y2 = pad + (1 - norm(values[1])) * (h - pad * 2);

  return (
    <div className="bg-[var(--violet)]/8 border border-[var(--violet)]/20 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <i className="ti ti-chart-line text-[var(--violet2)] text-[16px] shrink-0"></i>
        <span className="text-[13px] font-bold text-white truncate">مقارنة — {subject}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0" dir="ltr">
        <svg width={w} height={h}>
          <line x1={pad} y1={y1} x2={w - pad} y2={y2} stroke="var(--violet2)" strokeWidth={2} strokeLinecap="round" />
          <circle cx={pad} cy={y1} r={2.5} fill="var(--violet2)" />
          <circle cx={w - pad} cy={y2} r={2.5} fill="#fff" />
        </svg>
        <span className={`text-[12px] font-black whitespace-nowrap ${delta.improved ? 'text-[var(--em8)]' : 'text-red-400'}`}>
          {delta.improved ? 'تحسّن' : 'تراجع'} {delta.improved ? '+' : ''}{delta.diff}
        </span>
      </div>
    </div>
  );
}

export default function Public({ state, sections, isSharedView, continuity, evidence, reportMeta, resultsAnalysis, frozenResultsComparisons, lessonPlanSummary, strategyNames = {} }: PublicProps) {
  const [selectedSecId, setSelectedSecId] = useState<number | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [printDate, setPrintDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [previewFile, setPreviewFile] = useState<{
    name: string;
    url: string;
    type: 'pdf' | 'img' | 'doc' | 'vid';
  } | null>(null);

  // حالة بطاقة "استراتيجيات التدريس المتنوعة" فقط — طي/فتح القسم كاملاً
  // (مطوي افتراضياً)، طي/فتح كل استراتيجية على حدة (مفتوحة افتراضياً، يُحفظ
  // اسمها في closedStrats فقط عند طيّها يدوياً)، ومعاينة مصغّرات الأدلة.
  const [stratCollapsed, setStratCollapsed] = useState(true);
  const [closedStrats, setClosedStrats] = useState<Set<string>>(new Set());
  const [stratPreview, setStratPreview] = useState<{ name: string; url: string; type: Evidence['type'] } | null>(null);

  // بطاقة "مراعاة الفروق الفردية بين المتعلمين" — طي/فتح مستقل عن بطاقة
  // الاستراتيجيات أعلاه (مطوية افتراضياً، نفس مبدأ stratCollapsed).
  const [indivDiffCollapsed, setIndivDiffCollapsed] = useState(true);
  const toggleStratRow = (strategyId: string) => {
    setClosedStrats(prev => {
      const next = new Set(prev);
      if (next.has(strategyId)) next.delete(strategyId); else next.add(strategyId);
      return next;
    });
  };

  // totalEvs: عدد الأدلة الفعلي من جدول evidence (لا state.ev القديم) —
  // calculateEvaluation() حُذفت 14 سبتمبر 2026، راجع utils.ts للتفاصيل.
  const totalEvs = evidence?.length ?? 0;

  // تجميع شواهد جدول evidence الجديد (الغني) حسب section_id — لعرضها كقائمة
  // إضافية في نافذة تفاصيل البند العادي (لا يمسّ قسم الاستراتيجيات إطلاقاً).
  const evidenceBySection = useMemo(() => {
    const map: Record<number, SupabaseEvidence[]> = {};
    (evidence ?? []).forEach(e => {
      (map[e.section_id] ??= []).push(e);
    });
    return map;
  }, [evidence]);

  // "أبرز إنجاز" مُختار بالذكاء الاصطناعي (ai_top_achievement_evidence_id) —
  // مستقل تماماً عن شارة "أبرز إنجاز" على مستوى القسم (SectionCard/isTop/
  // activeSecs أدناه)، لا بديل لها ولا تعديل عليها. يُعتمَد فقط إذا طابق شاهداً
  // موجوداً فعلياً ضمن evidence (لا نفترض أن المعرّف صالح دائماً) وله section_id
  // غير فارغ يقابل قسماً حقيقياً ضمن sections — حراسة مزدوجة تمنع الإشارة لشاهد
  // غير مصنَّف أو لقسم لم يعد موجوداً، حتى لو لم يُطبَّق فلتر section_id IS NOT
  // NULL على مستوى get_shared_evidence نفسها (غير مؤكَّد من ملفات هذا المستودع).
  const aiTopAchievement = useMemo(() => {
    const targetId = state.ai_top_achievement_evidence_id;
    if (!targetId || !evidence) return null;
    const matched = evidence.find(e => e.id === targetId);
    if (!matched || matched.section_id == null) return null;
    const section = sections.find(s => s.id === matched.section_id);
    if (!section) return null;
    return { evidence: matched, sectionName: section.ttl };
  }, [state.ai_top_achievement_evidence_id, evidence, sections]);

  // نقاط ومستوى الملف العام: في وضع التقرير (?report=) قيمة مجمَّدة وقت
  // التوليد (reportMeta.pointsLevel) — لأن حساب "آخر 3 أشهر تقويمية" الحي
  // يعتمد على "اليوم" فيصبح خاطئاً لأي تقرير قديم يُفتح لاحقاً. في المسار
  // الحي (?share=) يبقى الحساب كما هو تماماً من continuity.activeMonths.
  const pointsLevel = reportMeta
    ? reportMeta.pointsLevel
    : continuity
    ? calculatePointsLevel(
        continuity.activeMonths.map(m => ({ year: m.year, month: m.month, evidenceCount: m.evidenceCount ?? 0 }))
      )
    : null;

  // مرجع "اليوم" لشبكة الاستمرارية — بداية فترة التقرير في وضع ?report=، وإلا
  // اليوم الفعلي (بلا أي تغيير عن المسار الحي — undefined يجعل ContinuityGrid
  // يستخدم افتراضيها الخاص new Date())
  const continuityReferenceDate = reportMeta ? new Date(`${reportMeta.periodFrom}T12:00:00`) : undefined;

  // قسم "التنويع في استراتيجيات التدريس" مُستبعد كلياً من نظام النسب (المستويات
  // 1-2-3 أدناه) — له بطاقة طولية مستقلة بلا أي رقم نسبة (انظر أسفل الصفحة).
  // نفس الاستبعاد يشمل بندي 5/10 (isResultsSection) — لا مؤشرات فرعية عادية
  // تُحتسب ضمن هذا النظام. بند 5 له بطاقة عرض شواهد فعلية أدناه؛ بند 10
  // (تحليل نتائج المتعلمين) له الآن بطاقة عرض مبسَّطة أدناه أيضاً عبر
  // get_shared_results_analysis() (resultsAnalysis prop) — لا summary/students
  // إطلاقاً بهذا الشكل، فقط متوسط/مدى/عدد طلاب لكل تحليل.
  const stratSection = sections.find(s => s.isStrat) ?? null;
  const resultsSections = sections.filter(s => s.isResultsSection);
  const improvementSection = resultsSections.find(s => s.id === 5) ?? null;
  const analysisSection = resultsSections.find(s => s.id === 10) ?? null;
  const nonStratSections = sections.filter(s => !s.isStrat && !s.isResultsSection);

  // عناصر المقارنة التلقائية لبطاقة بند 10 — مادة واحدة لكل مجموعة subject
  // بها تحليلان فأكثر (نفس شرط تبويب "مقارنة" بلوحة التحكم)، بالشكل المبسَّط
  // العام (groupPublicAnalysesBySubject/buildPublicComparisonSeries، انظر
  // logic.ts) لا الداخلي الكامل — resultsAnalysis هنا مبسَّط أصلاً بلا أسماء.
  // في وضع ?report= تُستخدم frozenResultsComparisons كما هي (مخبوزة وقت
  // التوليد) بدل إعادة الحساب هنا — انظر تعليقها في PublicProps أعلاه.
  const resultsComparisons = useMemo(() => {
    if (frozenResultsComparisons) return frozenResultsComparisons;
    if (!resultsAnalysis || resultsAnalysis.length === 0) return [];
    const groups = groupPublicAnalysesBySubject(resultsAnalysis);
    return Array.from(groups.entries())
      .filter(([, rows]) => rows.length >= 2)
      .map(([subject]) => ({ subject, series: buildPublicComparisonSeries(resultsAnalysis, subject) }));
  }, [frozenResultsComparisons, resultsAnalysis]);

  // "مراعاة الفروق الفردية بين المتعلمين" — مؤشر فرعي عادي بالقسم الهجين،
  // منفصل كلياً عن الاستراتيجيات. بطاقة الاستراتيجيات أدناه تعرض فقط أدلة
  // strategy_id غير الفارغ (stratGroups)، فهذا المؤشر لا يظهر هناك رغم كونه
  // جزءاً طبيعياً من subs — عرض مبسّط مستقل له (بلا أزرار تعديل، مطابق لباقي
  // شواهد صفحة المشاركة).
  // يُحدَّد بالاسم لا بالترتيب (subs[0]) — نفس سبب Dashboard.tsx: ترتيب weight
  // بجدول section_indicators غير مضمون التطابق مع الترتيب القديم في data.ts.
  // غير موجود ⇐ إخفاء البطاقة (الشرط أدناه) لا كسر الصفحة.
  // ⚠️ تنبيه: لا حذف هنا (عرض فقط)، لكن الحذف المقابل بلوحة التحكم (Dashboard.tsx
  // onDeleteEv) يطابق السجل في جدول evidence الحقيقي بالعنوان النصي فقط
  // (section_id + title)، لا بمعرّف مرتبط — عناوين متطابقة قد تحذف السجل
  // الخطأ من الجدول الحقيقي، فقد يسبب تبايناً صامتاً بين ما يظهر هنا وهناك.
  const indivDiffSub = stratSection?.indicators.find(i => i.name_ar.includes('الفروق الفردية'))?.name_ar;
  const indivDiffEvs = (stratSection && indivDiffSub) ? (state.ev[`${stratSection.id}|${indivDiffSub}`] || []) : [];

  // بطاقة الاستراتيجيات — مُشتقّة من evidenceBySection[stratSection.id] (أدلة
  // جدول evidence الحقيقية ذات strategy_id غير فارغ)، مجمَّعة حسب strategy_id
  // واسمها محلول عبر strategyNames (بند 9 بـApp.tsx) — لا state.strats بعد الآن.
  const toThumbEvidence = (e: SupabaseEvidence): ThumbEvidence => ({
    type: supabaseEvidenceTypeToLocal(e.evidence_type),
    name: e.title,
    url: e.file_url ?? e.link_url ?? undefined,
  });
  const stratGroups = useMemo(() => {
    if (!stratSection) return [];
    const map = new Map<string, SupabaseEvidence[]>();
    for (const e of evidenceBySection[stratSection.id] ?? []) {
      if (!e.strategy_id) continue;
      const arr = map.get(e.strategy_id) ?? [];
      arr.push(e);
      map.set(e.strategy_id, arr);
    }
    return Array.from(map.entries()).map(([id, evs]) => ({
      id,
      name: strategyNames[id] ?? '—',
      evidence: evs,
    }));
  }, [stratSection, evidenceBySection, strategyNames]);

  const chartData = nonStratSections.map(sec => {
    const allSubs = [...sec.subs, ...(state.csubs[sec.id] || [])];
    const evs = allSubs.flatMap(s => (state.ev[`${sec.id}|${s}`] || []).map(e => ({ ...e, sub: s })));

    return {
      ...sec,
      name: sec.ttl.split(' ')[0] + (sec.ttl.split(' ')[1] ? ' ' + sec.ttl.split(' ')[1] : ''),
      fullName: sec.ttl,
      evCount: evs.length,
      evs,
    };
  });

  // المستويات الثلاثة (البند 3) تُبنى جميعها من نفس حساب pct لكل قسم — منطق
  // التغطية نفسه المستخدم سابقاً (target/filled/maxTarget) بلا أي تغيير، فقط
  // محسوب مرة واحدة هنا بدل تكراره في كل من شبكة البطاقات والدوائر القديمة.
  // (قسم الاستراتيجيات isStrat مُستبعد أصلاً من nonStratSections أعلاه)
  // ⚠️ pct الرقمي نفسه يبقى محسوباً من state.ev حصراً كما كان دائماً — لا
  // علاقة له بـevidenceBySection إطلاقاً، هذا خارج نطاق التوحيد أدناه عمداً.
  const sectionsWithPct: SectionWithPct[] = chartData.map(data => {
    const target = data.subs.length + (state.csubs[data.id] || []).length;
    const allSubs = [...data.subs, ...(state.csubs[data.id] || [])];
    const filled = allSubs.filter(s => (state.ev[`${data.id}|${s}`] || []).length > 0).length;
    const maxTarget = Math.max(target, filled, 1);
    const pct = Math.min(100, Math.round((filled / maxTarget) * 100));
    return { ...data, pct };
  });

  // دالة موحّدة: هل يملك القسم أي دليل موثّق عبر أي من المصدرين معاً (النظام
  // القديم state.ev/evs، أو الجدول الحقيقي evidenceBySection)؟ نفس المنطق
  // المزدوج المطبَّق سابقاً حصراً على بند "إعداد خطة التعلم" (id:6)، معمَّم
  // الآن لكل أقسام sectionsWithPct (لا يشمل قسم الاستراتيجيات isStrat، المستبعد
  // أصلاً من nonStratSections أعلاه — له تحقّق منفصل خاص به، انظر تعليقه أدناه
  // عند selectedSecData.isStrat). تُستخدم فقط لتصنيف "فارغ/غير فارغ" لأغراض
  // العرض (activeSecs/emptySecs + رسالة المودال) — لا تمسّ حساب pct الرقمي
  // إطلاقاً.
  const sectionHasEvidence = (sec: Pick<SectionWithPct, 'id' | 'evs'>): boolean =>
    sec.evs.length > 0 || (evidenceBySection[sec.id]?.length ?? 0) > 0;

  // مؤشر الجاهزية الإجمالي (المستوى 1) — من get_portfolio_completion (عبر
  // get_shared_portfolio)، موحَّد مع نفس الرقم المعروض في Dashboard.tsx، بدل
  // متوسط sectionsWithPct.pct المحلي القديم. state.completion غائب (كاش لحساب
  // لم يُحدَّث بعد) ⇐ 0% بدل انهيار الصفحة أو undefined.
  const overallPct = state.completion?.overall_pct ?? 0;

  // تنازلياً بـpct، وعند التساوي (شائع بسبب سقف maxTarget أعلاه) يُرجَّح القسم
  // الأعلى إجمالي أدلة تراكمية (evCount) — يعكس عمق التوثيق الفعلي رغم تساوي النسبة.
  // التصنيف نشط/فارغ نفسه أصبح عبر sectionHasEvidence (مزدوج المصدر) بدل pct
  // وحده — قسم بلا أدلة بالنظام القديم لكن بأدلة حقيقية بـevidenceBySection
  // يُصنَّف الآن "نشط" ويظهر في الشبكة الرئيسية رغم أن شارة pct المعروضة عليه
  // قد تبقى 0% (الرقم نفسه غير متأثر بهذا التغيير، انظر تعليق sectionsWithPct أعلاه).
  const activeSecs = sectionsWithPct.filter(s => sectionHasEvidence(s)).sort((a, b) => {
    const pctDiff = b.pct - a.pct;
    if (pctDiff !== 0) return pctDiff;
    return b.evCount - a.evCount;
  });
  const emptySecs = sectionsWithPct.filter(s => !sectionHasEvidence(s));

  const exportToPDF = () => {
    // تاريخ التصدير الفعلي لحظة الطباعة (وليس تاريخاً ثابتاً من لحظة تحميل
    // الصفحة) — يُحدَّث في الترويسة المخصّصة لوضع الطباعة قبل فتح حوار الطباعة.
    setPrintDate(new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }));
    // ننتظر دورة رسم واحدة (requestAnimationFrame) لضمان وصول التاريخ الجديد
    // إلى الـDOM قبل أن يأخذ المتصفح "لقطته" الخاصة بحوار الطباعة.
    requestAnimationFrame(() => window.print());
  };

  const buildShareUrl = async (): Promise<string> => {
    // If we already have a share URL cached, return it
    if (shareUrl) return shareUrl;

    // وضع التقرير الثابت (?report=): الرابط الصحيح الوحيد هو رابط الصفحة
    // الحالية نفسها — لا نبني أبداً رابط ?share=${user.id} حتى لو كان صاحب
    // الملف مسجَّلاً دخوله (مثلاً يعاين تقريره الخاص)، لأن ذاك رابط مختلف
    // تماماً (حي وليس لقطة ثابتة).
    if (reportMeta) {
      const url = window.location.href;
      setShareUrl(url);
      return url;
    }

    // Try to get current user ID from Supabase
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        // Hardcoded "/" — not window.location.pathname, which inherits
        // whatever path the user happened to be on and produces a broken
        // share link (e.g. https://wathq.online/robots.txt?share=...).
        const url = `${window.location.origin}/?share=${user.id}`;
        setShareUrl(url);
        return url;
      }
    }

    // Fallback: current URL (e.g. if already in shared view — the page was
    // already loaded at .../?share=xxx, so location.href is correct here).
    // Cached in state too, so the QR modal (which reads shareUrl directly,
    // no inline fallback) always has a value once this resolves.
    const fallbackUrl = window.location.href;
    setShareUrl(fallbackUrl);
    return fallbackUrl;
  };

  const handleOpenShare = async () => {
    await buildShareUrl();
    setShowShare(true);
  };

  const copyLink = async () => {
    const url = await buildShareUrl();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedSecData = selectedSecId ? sectionsWithPct.find(c => c.id === selectedSecId) : null;

  // اختبار وجود أدلة فعلية عبر النظامين معاً (القديم selectedSecData.evs +
  // الغني evidenceBySection) — نفس sectionHasEvidence المستخدمة أعلاه لتصنيف
  // activeSecs/emptySecs، معمَّمة الآن لكل الأقسام بدل اقتصارها سابقاً على
  // LESSON_PLAN_SECTION_ID (id:6) وحده. رسالة "لا توجد أدلة موثقة" أدناه
  // تظهر فقط إذا كان كلا المصدرين فارغين معاً لأي قسم.
  const showEmptyMessage = !selectedSecData || !sectionHasEvidence(selectedSecData);

  // previewFile.type مجمَّد وقت الحفظ (state.ev القديم) وقد يكون خاطئاً لملف
  // Office قديم مصنَّف 'pdf' — الفرع الفعلي يُختار من الامتداد الحقيقي في
  // previewFile.url بدل previewFile.type، الذي يبقى فقط لاختيار أيقونة EVT_CONFIG.
  const previewExt = previewFile ? extensionFromUrl(previewFile.url) : '';
  const previewIsPdf = previewExt === 'pdf';
  const previewIsOfficeDoc = OFFICE_EXTENSIONS.includes(previewExt);
  // حارس أخير: إن لم يتطابق أي فرع معروف (نادر — مثلاً شاهد نوعه 'pdf' لكن
  // بامتداد غير pdf وغير Office)، تُعرض بطاقة فشل عامة بدل نافذة فارغة.
  const previewMatchedKnownBranch = previewFile
    ? previewFile.type === 'img' || previewIsPdf || previewFile.type === 'vid' || previewIsOfficeDoc
    : true;

  return (
    <div>
      <div id="public-portfolio-content" className="bg-[#060f0a] min-h-screen">
        {/* ترويسة خاصة بوضع الطباعة فقط — مخفية دائماً على الشاشة (انظر Public.print.css) */}
        <div className="print-header-block">
          <div className="print-header-row">
            <div>
              <div className="print-header-name">{state.profile.name}</div>
              <div className="print-header-meta">{state.profile.role} — {state.profile.school}</div>
            </div>
            <div className="print-header-brand">
              <div className="print-header-title">
                {reportMeta ? `وثّق — ${reportMeta.periodLabel}` : 'وثّق — ملف الإنجاز الرقمي'}
              </div>
              <div className="print-header-date">
                {reportMeta
                  ? `مُولَّد بتاريخ ${new Date(reportMeta.generatedAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}`
                  : printDate}
              </div>
              <div className="print-header-url">wathq.online</div>
            </div>
          </div>
          <div className="print-header-rule"></div>
        </div>

        <div className="print-hero relative overflow-hidden bg-gradient-to-br from-[var(--em1)] via-[var(--em2)] to-[rgba(20,60,35,.9)] pt-20 px-8 pb-16 text-center">

          <div id="pdf-action-buttons" className="absolute top-6 left-6 z-20 flex gap-2 print:hidden">
            <button
              onClick={exportToPDF}
              className="flex items-center gap-2 py-2 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[13px] font-bold transition-all backdrop-blur-md cursor-pointer"
            >
              <i className="ti ti-download text-[16px]"></i>
              <span className="hidden sm:inline">تصدير PDF</span>
            </button>
            <button
              onClick={handleOpenShare}
              className="flex items-center gap-2 py-2 px-4 rounded-xl bg-[var(--em7)]/20 hover:bg-[var(--em7)]/40 border border-[var(--em7)]/30 text-white text-[13px] font-bold transition-all cursor-pointer backdrop-blur-md"
            >
              <i className="ti ti-share text-[16px]"></i>
              <span className="hidden sm:inline">مشاركة</span>
            </button>
          </div>

          <div className="print-decor absolute inset-0 z-0 bg-[linear-gradient(rgba(82,196,120,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(82,196,120,.04)_1px,transparent_1px)] bg-[length:40px_40px]"></div>
          <div className="print-decor absolute w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(82,196,120,.15),transparent_70%)] -top-50 left-1/2 -translate-x-1/2 pointer-events-none z-0"></div>

          {/* تخطيط الجوال (الحالي والمستقر) — يبقى دون أي تغيير، مخفي من lg فصاعداً */}
          <div className="lg:hidden">
            {reportMeta && <ReportPeriodBanner periodLabel={reportMeta.periodLabel} generatedAt={reportMeta.generatedAt} justify="justify-center" />}

            <div className="mb-7">
              <Avatar profile={state.profile} size={112} />
            </div>

            <div className="flex items-center justify-center gap-3 flex-wrap mb-2">
              <h1 className="text-[34px] font-black text-white tracking-tight relative z-10">{state.profile.name}</h1>
              {pointsLevel && <LevelBadge pointsLevel={pointsLevel} pointsSubtitle={reportMeta ? 'خلال هذه الفترة' : undefined} />}
            </div>
            <p className="text-[15px] text-[var(--text3)] mb-5 relative z-10">{state.profile.role} — {state.profile.school}</p>

            <div className="mb-7">
              <SocialIconsRow profile={state.profile} justify="justify-center" />
            </div>

            <div className="mb-6">
              <StatsRow totalEvs={totalEvs} sectionsCount={sections.length} years={state.profile.yearsOfExperience} justify="justify-center" />
            </div>

            <div className="mt-5">
              <BadgesRow justify="justify-center" />
            </div>
          </div>

          {/* تخطيط الديسكتوب الجديد (البند 4): الصورة يسار البطاقة مرفوعة عن
              المنتصف، البيانات النصية يمين البطاقة — flex-row-reverse يضع أول
              عنصر (الصورة) على يسار البطاقة فعلياً داخل سياق RTL. */}
          <div className="hidden lg:flex lg:flex-row-reverse lg:items-start lg:justify-center lg:gap-12 lg:max-w-4xl lg:mx-auto lg:text-right">
            <div className="lg:mt-3 lg:shrink-0">
              <Avatar profile={state.profile} size={132} />
            </div>

            <div className="flex-1 flex flex-col gap-5 items-end">
              <div>
                {reportMeta && <ReportPeriodBanner periodLabel={reportMeta.periodLabel} generatedAt={reportMeta.generatedAt} justify="justify-end" />}
                <div className="flex items-center justify-end gap-3 flex-wrap mb-2">
                  <h1 className="text-[34px] font-black text-white tracking-tight relative z-10">{state.profile.name}</h1>
                  {pointsLevel && <LevelBadge pointsLevel={pointsLevel} pointsSubtitle={reportMeta ? 'خلال هذه الفترة' : undefined} />}
                </div>
                <p className="text-[15px] text-[var(--text3)] relative z-10">{state.profile.role} — {state.profile.school}</p>
              </div>

              <SocialIconsRow profile={state.profile} justify="justify-end" />
              <StatsRow totalEvs={totalEvs} sectionsCount={sections.length} years={state.profile.yearsOfExperience} justify="justify-end" />
              <BadgesRow justify="justify-end" />
            </div>
          </div>
        </div>

        <div className="max-w-[1000px] mx-auto py-10 px-4 sm:px-7">

          {/* المستوى 1: مؤشر الجاهزية الإجمالي — بارز فوق كل شيء */}
          <div className="print-card mb-8 bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--line)] shadow-lg p-6 sm:p-8 relative overflow-hidden">
            <div className="print-decor absolute top-0 left-0 w-full h-[4px]" style={{ backgroundColor: getCompletionColor(overallPct) }}></div>
            <div className="flex items-center justify-between flex-wrap gap-4 mb-4 relative z-10">
              <div>
                <h2 className="text-[15px] font-bold text-[var(--text3)] flex items-center gap-2">
                  <i className="ti ti-gauge text-[var(--em8)]"></i> مؤشر الجاهزية العام
                </h2>
                <p className="text-[12px] text-[var(--text4)] mt-1">متوسط نسبة الاكتمال عبر {state.completion?.total_sections ?? sectionsWithPct.length} مجالات أساسية</p>
              </div>
              <div className="text-[40px] sm:text-[48px] font-black leading-none" style={{ color: getCompletionColor(overallPct) }}>{overallPct}%</div>
            </div>
            <div className="print-progress-track h-3.5 w-full bg-[#060f0a] rounded-full overflow-hidden border border-white/5 relative z-10">
              <div
                className="print-progress-fill h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${overallPct}%`, backgroundColor: getCompletionColor(overallPct), '--print-gray': printGray(overallPct) } as React.CSSProperties}
              ></div>
            </div>
            <div className="mt-3 text-[12.5px] font-bold relative z-10" style={{ color: getCompletionColor(overallPct) }}>{getCompletionLabel(overallPct)}</div>
          </div>

          {/* ملخص الملف بالذكاء الاصطناعي (ai_summary) — لا يُعرض شيء إطلاقاً إن
              كانت القيمة غائبة أو فارغة، بلا أي نص بديل أو رسالة خطأ */}
          {state.ai_summary && (
            <div className="print-card mb-8 bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--line)] shadow-lg p-6 sm:p-8 relative overflow-hidden">
              <div className="print-decor absolute top-0 left-0 w-full h-[3px] bg-[var(--em7)]" />
              <h2 className="text-[15px] font-bold text-[var(--text3)] flex items-center gap-2 mb-3 relative z-10">
                <i className="ti ti-sparkles text-[var(--em8)]"></i> نبذة عن الملف
              </h2>
              <p className="text-[14px] text-[var(--text2)] leading-relaxed relative z-10">{state.ai_summary}</p>
            </div>
          )}

          {/* بطاقة "أبرز إنجاز" المُختارة بالذكاء الاصطناعي — منفصلة تماماً عن
              شارة "أبرز إنجاز" على مستوى القسم في شبكة الأقسام أدناه (لا تستبدلها
              ولا تعدّلها). لا تُعرض إطلاقاً إن لم يجتز aiTopAchievement الحراسة
              المزدوجة أعلاه */}
          {aiTopAchievement && (
            <div className="print-card mb-8 bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--gold)]/25 shadow-lg p-6 sm:p-8 relative overflow-hidden">
              <div className="print-decor absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent" />
              <div className="flex items-start gap-4 relative z-10">
                <div className="w-12 h-12 rounded-2xl shrink-0 bg-[var(--gold)]/10 border border-[var(--gold)]/25 flex items-center justify-center text-[22px] text-[var(--gold)]">
                  <i className="ti ti-trophy"></i>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-[var(--gold3)] tracking-wider uppercase mb-1.5 flex items-center gap-1.5">
                    <i className="ti ti-sparkles text-[12px]"></i> أبرز إنجاز
                  </div>
                  <h3 className="text-[17px] font-black text-white leading-snug">{aiTopAchievement.evidence.title}</h3>
                  {aiTopAchievement.evidence.description && (
                    <p className="text-[13px] text-[var(--text3)] mt-2 leading-relaxed">{aiTopAchievement.evidence.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="text-[11px] font-bold text-[var(--text4)] bg-white/5 border border-white/10 rounded-md py-1 px-2.5">
                      {aiTopAchievement.sectionName}
                    </span>
                    {(aiTopAchievement.evidence.file_url || aiTopAchievement.evidence.link_url) && (
                      <a
                        href={aiTopAchievement.evidence.file_url ?? aiTopAchievement.evidence.link_url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-bold text-[var(--gold)] hover:underline flex items-center gap-1"
                      >
                        <i className="ti ti-external-link text-[11px]"></i> عرض الدليل
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {continuity && <ContinuityGrid continuity={continuity} referenceDate={continuityReferenceDate} />}

          <div className="mb-6 flex justify-between items-end flex-wrap gap-4">
            <div>
              <h2 className="text-[20px] font-black text-white flex items-center gap-2">
                <i className="ti ti-apps text-[var(--em8)]"></i>
                أقسام الملف
              </h2>
              <p className="text-[13px] text-[var(--text3)] mt-1">اضغط على أي قسم لاستعراض التفاصيل والأدلة الخاصة به</p>
            </div>
          </div>

          {/* المستوى 2: الأقسام النشطة، مرتبة تنازلياً، أبرزها يحصل على تمييز بصري */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSecs.map((sec, i) => (
              <SectionCard
                key={sec.id}
                sec={sec}
                isTop={i === 0}
                onClick={() => setSelectedSecId(sec.id)}
                style={{ animation: `fadeUp .4s var(--sp) both ${i * 0.05}s` }}
                lessonPlanSummary={lessonPlanSummary}
              />
            ))}
          </div>

          {/* المستوى 3: الأقسام الفارغة — سطر مختصر قابل للتوسيع على الشاشة */}
          {emptySecs.length > 0 && (
            <div className="print:hidden mt-5">
              <button
                onClick={() => setShowEmpty(v => !v)}
                className="w-full flex items-center justify-between gap-3 py-3.5 px-5 bg-white/3 hover:bg-white/5 border border-[var(--line)] rounded-2xl text-[13px] font-bold text-[var(--text3)] transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <i className="ti ti-folder-plus text-[var(--em8)]"></i>
                  +{emptySecs.length} مجالات أخرى قيد التطوير
                </span>
                <i className={`ti ti-chevron-down transition-transform duration-300 ${showEmpty ? 'rotate-180' : ''}`}></i>
              </button>
              <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-hidden transition-all duration-300 ${showEmpty ? 'mt-4 max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {emptySecs.map(sec => (
                  <SectionCard key={sec.id} sec={sec} onClick={() => setSelectedSecId(sec.id)} lessonPlanSummary={lessonPlanSummary} />
                ))}
              </div>
            </div>
          )}

          {/* نسخة الطباعة فقط: تعرض كل الأقسام الفارغة كبطاقات مباشرة بدون أكورديون */}
          {emptySecs.length > 0 && (
            <div className="hidden print:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {emptySecs.map(sec => (
                <SectionCard key={`print-${sec.id}`} sec={sec} onClick={() => setSelectedSecId(sec.id)} lessonPlanSummary={lessonPlanSummary} />
              ))}
            </div>
          )}

          {/* بطاقتا الاستراتيجيات ومراعاة الفروق الفردية — متجاورتان جنباً إلى
              جنب على الشاشات الواسعة (sm+)، تكديس عمودي طبيعي على الجوال. لا
              تغيير على منطق أي منهما؛ mt-8 انتقل من بطاقة الاستراتيجيات نفسها
              إلى الحاوية حتى يتساوى الهامش العلوي للبطاقتين ضمن صف الـgrid.
              items-start إلزامي: افتراضي CSS Grid هو align-items:stretch،
              فتمدّد حاوية البطاقة المغلقة لارتفاع الصف عند فتح المجاورة —
              مساحة فارغة تحتها تبدو "مفتوحة" رغم أن stratCollapsed/
              indivDiffCollapsed الداخليين لم يتغيّرا. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 items-start">
          {/* بطاقة استراتيجيات التدريس — مستقلة كلياً عن نظام النسب أعلاه، بدون أي رقم نسبة.
              مطوية بالكامل افتراضياً؛ نسخة الطباعة (print:) تُجبَر دائماً على الفتح الكامل
              بصرف النظر عن حالة الطي على الشاشة، حفاظاً على سلوك تصدير PDF السابق. */}
          {stratSection && (
            <div className="print-card bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--gold)]/20 shadow-lg p-6 sm:p-8">
              <div
                className="flex items-center justify-between gap-3 cursor-pointer select-none print:pointer-events-none"
                onClick={() => setStratCollapsed(v => !v)}
              >
                <div className="flex items-center gap-2">
                  <i className="ti ti-bulb text-[var(--gold)] text-[20px]"></i>
                  <h2 className="text-[18px] font-black text-white">استراتيجيات التدريس المتنوعة</h2>
                </div>
                <div className="flex items-center gap-2.5 print:hidden">
                  {stratGroups.length > 0 && (
                    <span className="text-[11px] font-black text-[#241a05] bg-[var(--gold)] px-2.5 py-1 rounded-full whitespace-nowrap">
                      {stratGroups.length} استراتيجيات
                    </span>
                  )}
                  <i className={`ti ti-chevron-down text-[var(--text3)] text-[18px] transition-transform duration-300 ${stratCollapsed ? '' : 'rotate-180'}`}></i>
                </div>
              </div>

              <div className={`overflow-hidden transition-all duration-300 ease-out print:!max-h-none print:!opacity-100 print:!mt-6 ${stratCollapsed ? 'max-h-0 opacity-0' : 'max-h-[10000px] opacity-100 mt-6'}`}>
                {stratGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-[22px] text-[var(--text4)] mb-3">
                      <i className="ti ti-bulb-off"></i>
                    </div>
                    <p className="text-[var(--text3)] text-[13.5px]">لا توجد استراتيجيات موثّقة بدليل بعد</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    {stratGroups.map(group => {
                      const rowOpen = !closedStrats.has(group.id);
                      return (
                        <div key={group.id} className="bg-white/5 rounded-2xl p-4 border border-[var(--gold)]/10">
                          <div
                            className="flex items-center gap-2 mb-3 cursor-pointer select-none print:pointer-events-none"
                            onClick={ev => { ev.stopPropagation(); toggleStratRow(group.id); }}
                          >
                            <div className="w-2 h-2 rounded-full bg-[var(--gold)] shrink-0"></div>
                            <span className="text-[14px] font-bold text-white flex-1">{group.name}</span>
                            <span className="text-[11px] font-black text-[var(--gold)] bg-[var(--gold)]/10 px-2 py-0.5 rounded-md">{group.evidence.length} شواهد</span>
                            <i className={`ti ti-chevron-down text-[var(--text4)] text-[13px] transition-transform duration-300 print:hidden ${rowOpen ? 'rotate-180' : ''}`}></i>
                          </div>
                          <div className={`overflow-hidden transition-all duration-300 ease-out print:!max-h-none print:!opacity-100 ${rowOpen ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                              {group.evidence.map(e => (
                                <div key={e.id}>
                                  <EvidenceThumb e={toThumbEvidence(e)} onClick={ev => ev.url && setStratPreview({ name: ev.name, url: ev.url, type: ev.type })} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* بطاقة مستقلة لـ"مراعاة الفروق الفردية بين المتعلمين" — عرض مبسّط
              (بلا أزرار تعديل)، بنفس مبدأ بطاقة الاستراتيجيات أعلاه لكن بدون
              رقم نسبة/عدّاد، فقط حالة موثّق/غير موثّق قابلة للفتح. */}
          {stratSection && indivDiffSub && (
            <div className="print-card bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--em7)]/20 shadow-lg p-6 sm:p-8">
              <div
                className="flex items-center justify-between gap-3 cursor-pointer select-none print:pointer-events-none"
                onClick={() => setIndivDiffCollapsed(v => !v)}
              >
                <div className="flex items-center gap-2">
                  <i className="ti ti-users text-[var(--em8)] text-[20px]"></i>
                  <h2 className="text-[18px] font-black text-white">{indivDiffSub}</h2>
                </div>
                <div className="flex items-center gap-2.5 print:hidden">
                  <span className={`text-[11px] font-black px-2.5 py-1 rounded-full whitespace-nowrap ${indivDiffEvs.length > 0 ? 'text-[#0a1f13] bg-[var(--em7)]' : 'text-[var(--text4)] bg-white/5 border border-[var(--line2)]'}`}>
                    {indivDiffEvs.length > 0 ? `موثّق ✓ (${indivDiffEvs.length})` : 'غير موثّق بعد'}
                  </span>
                  <i className={`ti ti-chevron-down text-[var(--text3)] text-[18px] transition-transform duration-300 ${indivDiffCollapsed ? '' : 'rotate-180'}`}></i>
                </div>
              </div>

              <div className={`overflow-hidden transition-all duration-300 ease-out print:!max-h-none print:!opacity-100 print:!mt-6 ${indivDiffCollapsed ? 'max-h-0 opacity-0' : 'max-h-[10000px] opacity-100 mt-6'}`}>
                {indivDiffEvs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-[22px] text-[var(--text4)] mb-3">
                      <i className="ti ti-ghost"></i>
                    </div>
                    <p className="text-[var(--text3)] text-[13.5px]">لا توجد شواهد موثّقة بعد لهذا المؤشر</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {indivDiffEvs.map((e, idx) => (
                      <div key={idx}>
                        <EvidenceThumb e={e} onClick={ev => ev.url && setStratPreview({ name: ev.name, url: ev.url, type: ev.type })} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>

          {/* بطاقتا بند 10 (تحليل) وبند 5 (تحسين) — متجاورتان جنباً إلى جنب على
              الشاشات الواسعة (نفس نمط grid sm:grid-cols-2 items-start المستخدَم
              بلوحة التحكم لهذا الزوج ولزوج الاستراتيجيات/الفروق الفردية أعلاه).
              items-start إلزامي هنا للسبب نفسه دائماً: بند 10 غالباً أطول محتوى
              من بند 5 (عناصر المقارنة قد تضيف صفوفاً)، فبلا items-start يمدّد
              افتراضي CSS Grid (align-items:stretch) بطاقة بند 5 لنفس ارتفاع
              بند 10 فارغاً من تحت. mt-8 انتقل من كل بطاقة على حدة إلى الحاوية،
              نفس تقنية زوج الاستراتيجيات/الفروق الفردية. ترتيب العرض: التحليل
              أولاً ثم التحسين — نفس ترتيب لوحة التحكم. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 items-start">
          {analysisSection && resultsAnalysis && (
            <div className="print-card bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--line2)] shadow-lg p-6 sm:p-8" style={{ borderRight: '4px solid var(--violet)' }}>
              <div className="flex items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-2">
                  <i className={`ti ${analysisSection.icon} text-[var(--violet2)] text-[20px]`}></i>
                  <h2 className="text-[18px] font-black text-white">{analysisSection.ttl}</h2>
                </div>
                {resultsAnalysis.length > 0 && (
                  <span className="text-[11px] font-black text-[var(--violet2)] bg-[var(--violet)]/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                    {resultsAnalysis.length} تحليل
                  </span>
                )}
              </div>

              {resultsAnalysis.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-[22px] text-[var(--text4)] mb-3">
                    <i className="ti ti-ghost"></i>
                  </div>
                  <p className="text-[var(--text3)] text-[13.5px]">لا توجد تحليلات نتائج موثّقة بعد لهذا البند</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {resultsAnalysis.map(row => (
                    <ResultRangeRow key={row.id} row={row} />
                  ))}
                  {resultsComparisons.map(c => (
                    <ResultComparisonMini key={c.subject} subject={c.subject} series={c.series} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* بطاقة بند 5 "تحسين نتائج المتعلمين" — عرض قراءة فقط لشواهد فعلية
              موثّقة (state.ev بمفتاحي REMEDIAL_SUB/HONOR_SUB)، بلا أي تنبيهات
              خام إطلاقاً (تلك أداة تخطيط داخلية للمعلم وحده، ليست محتوى عرض
              لمشرف خارجي). فارغ بشكل محايد تماماً كأي قسم فارغ آخر لو صفر شواهد.
              شريط اللون البنفسجي (--violet) يطابق بطاقتَي التحليل/التحسين في
              Dashboard.tsx — الآن ضمن نفس حاوية grid المجاورة لبطاقة بند 10
              أعلاه (انظر تعليقها). */}
          {improvementSection && (
            <div className="print-card bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--line2)] shadow-lg p-6 sm:p-8" style={{ borderRight: '4px solid var(--violet)' }}>
              <div className="flex items-center gap-2 mb-6">
                <i className={`ti ${improvementSection.icon} text-[var(--em8)] text-[20px]`}></i>
                <h2 className="text-[18px] font-black text-white">{improvementSection.ttl}</h2>
              </div>
              {(() => {
                const remedialEvs = state.ev[`${improvementSection.id}|خطط علاجية وإثرائية`] || [];
                const honorEvs = state.ev[`${improvementSection.id}|تكريم المتميزين`] || [];
                const groups = [
                  { label: 'خطط علاجية وإثرائية', evs: remedialEvs },
                  { label: 'تكريم المتميزين', evs: honorEvs },
                ].filter(g => g.evs.length > 0);

                if (groups.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-[22px] text-[var(--text4)] mb-3">
                        <i className="ti ti-ghost"></i>
                      </div>
                      <p className="text-[var(--text3)] text-[13.5px]">لا توجد شواهد موثّقة بعد لهذا البند</p>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col gap-5">
                    {groups.map(g => (
                      <div key={g.label} className="bg-white/5 rounded-2xl p-4 border border-[var(--em7)]/10">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full bg-[var(--em7)] shrink-0"></div>
                          <span className="text-[14px] font-bold text-white flex-1">{g.label}</span>
                          <span className="text-[11px] font-black text-[var(--em8)] bg-[var(--em7)]/10 px-2 py-0.5 rounded-md">{g.evs.length} شواهد</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {g.evs.map((e, idx) => (
                            <div key={idx}>
                              <EvidenceThumb e={e} onClick={ev => ev.url && setStratPreview({ name: ev.name, url: ev.url, type: ev.type })} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          </div>

          <footer className="mt-12 pt-6 border-t border-[var(--line)] text-center">
            <p className="text-[12px] font-normal text-[var(--text4)]">
              جميع الحقوق محفوظة لدى <span className="text-[var(--gold3)]">وثق</span> © {new Date().getFullYear()}
            </p>
          </footer>
        </div>
      </div>

      {showShare && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowShare(false)}></div>
          <div className="relative bg-[var(--surf1)] w-full max-w-sm rounded-[24px] border border-[var(--line)] shadow-2xl flex flex-col overflow-hidden" style={{ animation: 'jumpIn .4s var(--sp) both' }}>
            <div className="flex items-center justify-between py-4 px-6 border-b border-[var(--line)] bg-[var(--surf0)]">
              <h3 className="text-[16px] font-black text-white flex items-center gap-2">
                <i className="ti ti-share text-[var(--em8)]"></i> مشاركة الملف
              </h3>
              <button
                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text3)] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                onClick={() => setShowShare(false)}
              >
                <i className="ti ti-x text-[16px]"></i>
              </button>
            </div>

            <div className="p-6 flex flex-col items-center">
              <div className="bg-white p-4 rounded-2xl mb-5 shadow-[0_8px_30px_rgba(0,0,0,.3)]">
                <QRCodeSVG
                  value={shareUrl}
                  size={180}
                  level="H"
                  fgColor="#000000"
                  imageSettings={state.profile.avatar ? {
                    src: state.profile.avatar,
                    x: undefined,
                    y: undefined,
                    height: 40,
                    width: 40,
                    excavate: true,
                  } : undefined}
                />
              </div>
              <p className="text-[13px] text-[var(--text3)] text-center mb-5">امسح الرمز أو انسخ الرابط المباشر لمشاركة ملف الإنجاز — <strong className="text-[var(--em8)]">لا يحتاج تسجيل دخول</strong></p>

              <div className="flex w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surf0)]">
                <button
                  onClick={copyLink}
                  className="bg-[var(--em7)]/20 hover:bg-[var(--em7)]/30 text-[var(--em8)] px-4 py-3 font-bold text-[13px] transition-colors whitespace-nowrap border-l border-[var(--line)] cursor-pointer"
                >
                  {copied ? <i className="ti ti-check text-[16px]"></i> : <i className="ti ti-copy text-[16px]"></i>}
                </button>
                <div className="flex-1 px-4 py-3 text-[12px] text-[var(--text4)] overflow-hidden text-ellipsis whitespace-nowrap bg-[var(--surf0)] text-left" dir="ltr">
                  {shareUrl}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSecId && selectedSecData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSecId(null)}></div>
          <div className="relative bg-[var(--surf1)] w-full max-w-3xl rounded-[24px] border border-[var(--line)] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden" style={{ animation: 'jumpIn .4s var(--sp) both' }}>
            <div className="flex items-center justify-between py-4 px-6 border-b border-[var(--line)] bg-[var(--surf0)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--em7)]/10 text-[var(--em8)] flex items-center justify-center text-[20px]">
                  <i className={`ti ${selectedSecData.icon}`}></i>
                </div>
                <div>
                  <h3 className="text-[16px] font-black text-white">{selectedSecData.fullName}</h3>
                  <p className="text-[12px] text-[var(--text3)] mt-0.5">الأدلة والشواهد الموثقة</p>
                </div>
              </div>
              <button
                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text3)] hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setSelectedSecId(null)}
              >
                <i className="ti ti-x text-[16px]"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6" dir="rtl">
              {/* قسم الاستراتيجيات (isStrat) مُستبعد أصلاً من sectionsWithPct
                  (مبنية من nonStratSections فقط) — selectedSecData لا يمكن أن
                  يطابق قسم 4 إطلاقاً، فلا فرع خاص به هنا (له بطاقته المستقلة
                  أعلى الصفحة، انظر stratGroups). */}
              <>
                {/* ملخص بند "إعداد خطة التعلم" بالذكاء الاصطناعي — الجملة كاملة،
                    يظهر فقط لهذا البند تحديداً وقبل عرض أي أدلة */}
                {selectedSecData.id === LESSON_PLAN_SECTION_ID && lessonPlanSummary && (
                  <div className="mb-5 flex items-start gap-2.5 bg-[var(--em7)]/5 border border-[var(--em7)]/15 rounded-2xl py-3.5 px-4">
                    <i className="ti ti-sparkles text-[var(--em7)] text-[16px] mt-0.5 shrink-0" />
                    <p className="text-[13px] text-[var(--text2)] leading-relaxed">{lessonPlanSummary}</p>
                  </div>
                )}
                {!showEmptyMessage ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedSecData.evs.map((e, idx) => {
                      const t = EVT_CONFIG[e.type] || EVT_CONFIG.doc;
                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 py-3 px-4 bg-[var(--surf2)] rounded-xl border border-[var(--line)] transition-all duration-200 ${e.url ? 'cursor-pointer hover:border-[var(--em7)]/40 hover:bg-[var(--surf3)] hover:-translate-y-0.5' : ''}`}
                          onClick={() => e.url && setPreviewFile({ name: e.name, url: e.url, type: e.type })}
                          title={e.url ? 'انقر لمعاينة الدليل فوراً' : ''}
                        >
                          <div className={`w-[40px] h-[40px] rounded-lg text-[20px] flex items-center justify-center shrink-0 ${t.cls}`}>
                            <i className={`ti ${t.icon}`}></i>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-bold text-white truncate group-hover:text-[var(--em8)] transition-colors">{e.name}</div>
                            <div className="text-[11px] text-[var(--text4)] mt-1 truncate">
                              {e.sub} · {e.date}
                              {e.url && <span className="text-[var(--em8)] mr-1.5 font-bold"><i className="ti ti-eye"></i> معاينة</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-[24px] text-[var(--text4)] mb-3">
                      <i className="ti ti-folder-open"></i>
                    </div>
                    <p className="text-[var(--text3)] text-[14px]">لا توجد أدلة موثقة في هذا القسم</p>
                  </div>
                )}
                {(evidenceBySection[selectedSecData.id]?.length ?? 0) > 0 && (
                  <div className="mt-6 pt-6 border-t border-[var(--line)]">
                    <div className="text-[14px] font-bold text-white mb-3 flex items-center gap-2">
                      <i className="ti ti-files text-[var(--em8)]"></i> الشواهد الموثّقة
                    </div>
                    <EvidenceList
                      sectionId={selectedSecData.id}
                      evidence={evidenceBySection[selectedSecData.id] ?? []}
                      loading={false}
                      onDelete={async () => {}}
                      onAddClick={() => {}}
                      readOnly
                    />
                  </div>
                )}
              </>
            </div>
            <div className="p-4 border-t border-[var(--line)] bg-[var(--surf0)] flex justify-end">
              <button
                className="py-2 px-6 rounded-xl bg-white/5 border border-[var(--line2)] text-[13px] font-bold text-white hover:bg-white/10 transition-colors"
                onClick={() => setSelectedSecId(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setPreviewFile(null)}></div>
          <div className="relative bg-[#0c1c12]/95 border border-[var(--em7)]/25 w-full max-w-4xl rounded-[28px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" style={{ animation: 'jumpIn .4s var(--sp) both' }}>

            <div className="absolute -top-px right-[15%] left-[15%] h-px bg-gradient-to-r from-transparent via-[var(--em7)] via-[var(--gold)] via-[var(--em7)] to-transparent opacity-60"></div>

            <div className="flex items-center justify-between py-4.5 px-7 border-b border-white/10 bg-black/20 relative z-10">
              <div className="flex items-center gap-3">
                <div className={`w-[42px] h-[42px] rounded-xl flex items-center justify-center text-[22px] ${EVT_CONFIG[previewFile.type]?.cls || EVT_CONFIG.doc.cls}`}>
                  <i className={`ti ${EVT_CONFIG[previewFile.type]?.icon || EVT_CONFIG.doc.icon}`}></i>
                </div>
                <div className="min-w-0">
                  <h3 className="text-[16px] font-black text-white truncate max-w-[280px] sm:max-w-[450px]" dir="rtl">{previewFile.name}</h3>
                  <p className="text-[12px] text-[var(--text4)] mt-0.5">معاينة الدليل الرقمي الآمن</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <a
                  href={previewFile.url}
                  download={previewFile.name}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 px-4.5 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white text-[13px] font-bold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(42,122,68,.4)] flex items-center gap-2 no-underline cursor-pointer border-none"
                  title="تحميل الملف للجهاز"
                >
                  <i className="ti ti-download text-[16px]"></i>
                  <span>تحميل</span>
                </a>

                <button
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text3)] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all cursor-pointer"
                  onClick={() => setPreviewFile(null)}
                >
                  <i className="ti ti-x text-[18px]"></i>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-black/10 flex items-center justify-center">
              {previewFile.type === 'img' && (
                <div className="relative group max-w-full max-h-[68vh] overflow-hidden rounded-2xl shadow-2xl">
                  <img
                    src={previewFile.url}
                    alt={previewFile.name}
                    className="max-w-full max-h-[68vh] object-contain rounded-2xl"
                  />
                </div>
              )}

              {previewIsPdf && (
                <PdfPreview url={previewFile.url} name={previewFile.name} className="w-full h-[68vh]" />
              )}

              {previewFile.type === 'vid' && (
                <div className="w-full max-h-[68vh] rounded-2xl overflow-hidden shadow-2xl bg-black flex items-center justify-center">
                  <video
                    src={previewFile.url}
                    controls
                    className="max-w-full max-h-[68vh] rounded-2xl"
                  />
                </div>
              )}

              {(previewFile.type === 'doc' || previewIsOfficeDoc) && (
                <div className="text-center p-8 max-w-md bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md shadow-2xl">
                  <div className="w-16 h-16 rounded-2xl bg-[#c4b5fd]/15 text-[#c4b5fd] flex items-center justify-center text-[34px] mx-auto mb-5 border border-[#c4b5fd]/20 animate-pulse">
                    <i className="ti ti-file-text"></i>
                  </div>
                  <h4 className="text-[17px] font-black text-white mb-2.5">معاينة هذا المستند غير متوفرة مباشرة</h4>
                  <p className="text-[13px] text-[var(--text4)] leading-relaxed mb-6">
                    بما أن هذا الملف مستند ميكروسوفت (Word/Excel)، فيرجى الضغط على زر تحميل أدناه لاستعراض كامل محتوياته على جهازك بكل يسر وسهولة.
                  </p>
                  <a
                    href={previewFile.url}
                    download={previewFile.name}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 py-3.5 px-7 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white text-[14px] font-black transition-all duration-300 hover:-translate-y-[3px] hover:shadow-[0_6px_20px_rgba(42,122,68,.5)] no-underline cursor-pointer border-none"
                  >
                    <i className="ti ti-download text-[18px]"></i>
                    تحميل مستند الشاهد
                  </a>
                </div>
              )}

              {!previewMatchedKnownBranch && (
                <PdfPreviewFallback url={previewFile.url} name={previewFile.name} />
              )}
            </div>

          </div>
        </div>
      )}

      <StrategyLightbox item={stratPreview} onClose={() => setStratPreview(null)} />
    </div>
  );
}
