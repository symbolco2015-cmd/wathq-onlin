import React, { useState, useMemo } from 'react';
import type { ContinuityData, FrozenPointsLevel, PublicPortfolioState, SectionData, SectionIndicator } from '../types';
import { getCompletionColor, formatDate } from '../utils';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import type { PublicCustomIndicator } from '../hooks/usePublicCustomIndicators';
import { findIndicatorByName, toEvRow } from '../indicators';
import EvidenceViewer, { extractYouTubeId, publicKind, type PublicKind, type ViewerItem } from './EvidenceViewer';
import TopAchievementCard, { TopAchievementPlaceholder } from './TopAchievementCard';
import PublicGallery, { pickGalleryItems } from './PublicGallery';
import PublicHero from './PublicHero';
import type { PublicResultsAnalysisRow } from './ResultsAnalysis/types';
import type { ComparisonPoint } from './ResultsAnalysis/logic';
import { groupPublicAnalysesBySubject, buildPublicComparisonSeries, comparisonDelta } from './ResultsAnalysis/logic';
import './Public.print.css';

interface PublicProps {
  state: PublicPortfolioState;
  sections: SectionData[];
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
  /** ملخصات الأقسام العادية غير المخفية، المفتاح رقم القسم. مصدرها
   * get_shared_section_summaries() (مسار ?share=) أو قراءة مباشرة بـRLS
   * (معاينة المالك). غائبة في وضع ?report=. */
  sectionSummaries?: Record<number, string>;
  /** عناصر مقارنة بند 10 مخبوزة سلفاً — تُمرَّر فقط في وضع ?report=، حيث حُسبت
   * وقت توليد التقرير من resultsAnalysis أعلاه (انظر HarvestReportSheet.tsx)
   * ولا يصح إعادة حسابها هنا وقت العرض (لقطة ثابتة، لا تتأثر بتعديل لاحق
   * للمصدر). غائبة في مسار ?share= الحي ومعاينة المالك — هناك تُحسب محلياً
   * كما كانت دائماً (انظر resultsComparisons أدناه). */
  frozenResultsComparisons?: { subject: string; series: ComparisonPoint[] }[];
  /** وضع "تقرير حصاد فصلي" الثابت (?report=) — يضيف سطر عنوان الفترة/تاريخ
   * التوليد في الهيرو وترويسة الطباعة، ومرجع شبكة الاستمرارية. pointsLevel
   * يبقى في اللقطة ويُمرَّر من App.tsx لكنه لا يُعرض (شارة اللقب محذوفة في 5.1).
   * غائب في مسار ?share= العادي. */
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
  /** مؤشرات صاحب الصفحة المخصصة التي عليها شواهد — get_shared_custom_indicators
   *  (مسار ?share=)، أو snapshot.customIndicators (مسار ?report=)، أو مخصص
   *  المالك نفسه (المعاينة). تُعرض كأي مؤشر، ولا تدخل في أي نسبة. */
  customIndicators?: PublicCustomIndicator[];
  /** معاينة المالك لصفحته (App.tsx، currentPage === 'public') — تُظهر الإطار
   *  المتقطع مكان «أبرز إنجاز» إن لم يُختر. لا تُمرَّر في ?share= ولا ?report=. */
  ownerPreview?: boolean;
}

/** اسم الدومين فقط (بدون www.) لعرضه بجانب أيقونة رابط عام غير معروف */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** صف عرض شاهد: صف المؤشرات المعتاد + نوع العرض العام والوصف (لمعاينة الملاحظة). */
function toPublicRow(e: SupabaseEvidence) {
  return { ...toEvRow(e), kind: publicKind(e), description: e.description };
}
type PublicRow = ReturnType<typeof toPublicRow>;

/** شواهد قسم مجمّعة حسب مؤشراته (بترتيب indicators، أي weight ثم المخصص)،
 *  المؤشر بلا شواهد لا يظهر. orphans: شاهد بلا indicator_id أو بمؤشر ليس من
 *  مؤشرات القسم — يُعرض في مجموعة أخيرة «بلا مؤشر» ولا يدخل أي نسبة. */
function groupByIndicator(evs: SupabaseEvidence[], indicators: SectionIndicator[]) {
  const known = new Set(indicators.map(i => i.id));
  const groups = indicators
    .map(ind => ({ indicator: ind, evs: evs.filter(e => e.indicator_id === ind.id) }))
    .filter(g => g.evs.length > 0);
  const orphans = evs.filter(e => !e.indicator_id || !known.has(e.indicator_id));
  return { groups, orphans };
}

const NO_INDICATOR_LABEL = 'بلا مؤشر';

type EvidenceGroup = { key: string; label: string; evs: PublicRow[] };

/** groupByIndicator بشكل قائمة عرض: مجموعة لكل مؤشر ثم «بلا مؤشر» إن وُجد. */
function toGroupList({ groups, orphans }: ReturnType<typeof groupByIndicator>): EvidenceGroup[] {
  const list = groups.map(g => ({ key: g.indicator.id, label: g.indicator.name_ar, evs: g.evs.map(toPublicRow) }));
  if (orphans.length > 0) list.push({ key: 'no-indicator', label: NO_INDICATOR_LABEL, evs: orphans.map(toPublicRow) });
  return list;
}

const EVT_CONFIG: Record<string, {icon: string, cls: string, label: string}> = {
  pdf: {icon: 'ti-file-type-pdf', cls: 'bg-gradient-to-br from-[#b91c1c]/20 to-[#b91c1c]/10 text-[#f87171] border border-[#b91c1c]/20', label: 'PDF'},
  img: {icon: 'ti-photo', cls: 'bg-gradient-to-br from-[#1d4ed8]/20 to-[#1d4ed8]/10 text-[#93c5fd] border border-[#1d4ed8]/20', label: 'صورة'},
  doc: {icon: 'ti-file-text', cls: 'bg-gradient-to-br from-[#6d28d9]/20 to-[#6d28d9]/10 text-[#c4b5fd] border border-[#6d28d9]/20', label: 'مستند'},
  vid: {icon: 'ti-video', cls: 'bg-gradient-to-br from-[#b45309]/20 to-[#b45309]/10 text-[#fcd34d] border border-[#b45309]/20', label: 'فيديو'},
  audio: {icon: 'ti-microphone', cls: 'bg-gradient-to-br from-[#b45309]/20 to-[#b45309]/10 text-[#fcd34d] border border-[#b45309]/20', label: 'تسجيل صوتي'},
  link: {icon: 'ti-link', cls: 'bg-gradient-to-br from-[#6d28d9]/20 to-[#6d28d9]/10 text-[#c4b5fd] border border-[#6d28d9]/20', label: 'رابط'},
  note: {icon: 'ti-notes', cls: 'bg-gradient-to-br from-[#6d28d9]/20 to-[#6d28d9]/10 text-[#c4b5fd] border border-[#6d28d9]/20', label: 'ملاحظة'}
};

type SectionWithPct = SectionData & {
  fullName: string;
  evCount: number;
  /** orphan: شاهد بلا مؤشر معروف في القسم (sub = «بلا مؤشر») — يُعرض ولا يُحسب في النسبة */
  evs: (PublicRow & { sub: string; orphan: boolean })[];
  pct: number;
};


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

/** بطاقة قسم واحدة — تُستخدم لكل من الأقسام النشطة (المستوى 2) والأقسام
 * الفارغة الموسّعة (المستوى 3)، حتى لا يتكرر تصميم البطاقة في أكثر من مكان.
 * اللون مأخوذ بالكامل من getCompletionColor(pct) في utils.ts. */
const SECTION_SUMMARY_PREVIEW_MAX = 70;

function SectionCard({ sec, onClick, style, summary }: { sec: SectionWithPct; onClick: () => void; style?: React.CSSProperties; summary?: string | null }) {
  const color = getCompletionColor(sec.pct);
  // العمق التراكمي = أدلة المؤشرات المعروفة ÷ عدد المؤشرات المغطاة («بلا مؤشر» لا يُعدّ مؤشراً)
  const indicatorEvs = sec.evs.filter(e => !e.orphan);
  const filledSubsCount = new Set(indicatorEvs.map(e => e.sub)).size;
  const depth = filledSubsCount > 0 ? indicatorEvs.length / filledSubsCount : 0;
  const hasBadges = sec.evCount > 3;
  return (
    <div
      className={`print-card group bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl shadow-lg cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,0,0,.3)] relative overflow-hidden px-5 pt-5 border ${hasBadges ? 'pb-10' : 'pb-5'}`}
      style={{ borderColor: 'var(--line)', ...style }}
      onClick={onClick}
      title={depth > 1 ? `متوسط ${depth.toFixed(1)} دليل لكل مؤشر مغطى` : undefined}
    >
      {hasBadges && (
        <div className="print-decor absolute bottom-3 left-3 z-20 flex flex-row items-center gap-1.5">
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
          className={`print-decor rounded-2xl flex items-center justify-center border shrink-0 transition-all duration-300 w-12 h-12 text-[24px]`}
          style={{ color, borderColor: `${color}40`, background: `${color}1a` }}
        >
          <i className={`ti ${sec.icon}`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-white leading-tight overflow-hidden text-ellipsis whitespace-nowrap text-[15px]`}>{sec.fullName}</h3>
          <p className="text-[12.5px] text-[var(--text4)] mt-2 flex items-baseline gap-1.5">
            <span>{sec.isStrat ? 'الاستراتيجيات المضافة' : 'الأدلة الموثقة'}</span>
            <strong className="text-white font-black" style={{ fontSize: 19 }}>{sec.evCount}</strong>
          </p>
          {/* معاينة ملخص القسم — سطر واحد مقتطع، عند وجود ملخص فعلي */}
          {summary && (
            <p className="text-[11.5px] text-[var(--em8)] mt-1.5 flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap">
              <i className="ti ti-sparkles text-[11px] shrink-0" />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {summary.length > SECTION_SUMMARY_PREVIEW_MAX
                  ? `${summary.slice(0, SECTION_SUMMARY_PREVIEW_MAX)}…`
                  : summary}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** مصغّرة دليل واحد ضمن بطاقات الاستراتيجيات والفروق الفردية وبندي 5/10 —
 * صورة فعلية / مصغّرة يوتيوب / أيقونة ملف+اسم / أيقونة رابط+دومين / ملاحظة،
 * حسب kind (publicKind). onClick يفتح نافذة العرض الموحّدة (EvidenceViewer)؛ الرابط
 * العادي (غير يوتيوب) يفتح في تبويب جديد مباشرة دون معاينة. */
function EvidenceThumb({ e, onClick }: { e: ViewerItem; onClick?: (e: ViewerItem) => void }) {
  const handleClick = (ev: React.MouseEvent) => {
    if (!onClick) return;
    ev.stopPropagation();
    onClick(e);
  };

  if (e.kind === 'img' && e.url) {
    return (
      <img
        src={e.url}
        alt={e.name}
        loading="lazy"
        onClick={onClick ? handleClick : undefined}
        className={`w-full h-[88px] object-cover rounded-xl border border-white/10 ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      />
    );
  }

  const ytId = e.url ? extractYouTubeId(e.url) : null;
  if (ytId) {
    return (
      <div onClick={onClick ? handleClick : undefined} className={`block relative group ${onClick ? 'cursor-pointer' : ''}`}>
        <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={e.name} loading="lazy" className="w-full h-[88px] object-cover rounded-xl border border-white/10" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors rounded-xl">
          <i className="ti ti-player-play-filled text-white text-[26px] drop-shadow-lg"></i>
        </span>
      </div>
    );
  }

  if (e.kind === 'pdf' || e.kind === 'vid' || e.kind === 'audio') {
    const t = EVT_CONFIG[e.kind];
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

  if (e.kind === 'link' && e.url) {
    return (
      <a href={e.url} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()} className="flex items-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-[var(--em8)] hover:bg-white/10 transition-colors">
        <i className="ti ti-link text-[18px]"></i>
        <span className="text-[12px] font-bold truncate" dir="ltr">{getDomain(e.url)}</span>
      </a>
    );
  }

  // ملاحظة نصية بلا رابط أو ملف — النقر يعرض العنوان والوصف
  return (
    <div
      onClick={onClick ? handleClick : undefined}
      className={`flex items-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-[var(--text3)] ${onClick ? 'hover:bg-white/10 cursor-pointer' : ''}`}
    >
      <i className="ti ti-notes text-[18px]"></i>
      <span className="text-[12px] font-bold truncate">{e.name}</span>
    </div>
  );
}

/** مجموعات شواهد بعنوان صغير لكل مجموعة (مؤشر، أو «بلا مؤشر»، أو «شواهد
 * أخرى») — نفس كتلة المجموعة التي كانت في بطاقة بند 5، تُستعمل الآن في بندي
 * 5/10 و«شواهد أخرى» في بطاقة الاستراتيجيات. */
function IndicatorGroups({ groups, onPreview }: { groups: EvidenceGroup[]; onPreview: (e: ViewerItem) => void }) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map(g => (
        <div key={g.key} className="bg-white/5 rounded-2xl p-4 border border-[var(--em7)]/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[var(--em7)] shrink-0"></div>
            <span className="text-[14px] font-bold text-white flex-1">{g.label}</span>
            <span className="text-[11px] font-black text-[var(--em8)] bg-[var(--em7)]/10 px-2 py-0.5 rounded-md">{g.evs.length} شواهد</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {g.evs.map(e => (
              <div key={e.id}>
                <EvidenceThumb e={e} onClick={onPreview} />
              </div>
            ))}
          </div>
        </div>
      ))}
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

const NO_CUSTOM_INDICATORS: PublicCustomIndicator[] = [];

export default function Public({ state, sections: allSections, continuity, evidence, reportMeta, resultsAnalysis, frozenResultsComparisons, sectionSummaries, strategyNames = {}, customIndicators = NO_CUSTOM_INDICATORS, ownerPreview = false }: PublicProps) {
  // مخصص useSections مستبعد دائماً: يحمّل مخصص المعلم المسجّل، وهو قد يكون
  // زائراً يفتح صفحة غيره. مخصص صاحب الصفحة يأتي من customIndicators فقط،
  // ويُلحَق بعد الرسمية في قسمه بلا أي تمييز بصري.
  const sections = useMemo(() => allSections.map(s => {
    const custom = customIndicators
      .filter(ci => ci.section_id === s.id)
      .map(ci => ({ id: ci.id, name_ar: ci.name_ar, isCustom: true }));
    const indicators = [...s.indicators.filter(ind => !ind.isCustom), ...custom];
    return { ...s, indicators, subs: indicators.map(ind => ind.name_ar) };
  }), [allSections, customIndicators]);
  const [selectedSecId, setSelectedSecId] = useState<number | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [printDate, setPrintDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  // نافذة العرض الموحّدة — نافذة البند، والبطاقات، و«أبرز إنجاز»، والمعرض
  const [viewerItem, setViewerItem] = useState<ViewerItem | null>(null);

  // حالة بطاقة "استراتيجيات التدريس المتنوعة" فقط — طي/فتح القسم كاملاً
  // (مطوي افتراضياً)، وطي/فتح كل استراتيجية على حدة (مفتوحة افتراضياً، يُحفظ
  // اسمها في closedStrats فقط عند طيّها يدوياً).
  const [stratCollapsed, setStratCollapsed] = useState(true);
  const [closedStrats, setClosedStrats] = useState<Set<string>>(new Set());

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

  // totalEvs: عدد شواهد جدول evidence التي لها قسم — كل شاهد منها يُعرض في
  // مكان ما بالصفحة (نافذة البند، أو بطاقة الاستراتيجيات/الفروق الفردية، أو
  // بطاقتا بندي 5/10). الشاهد بلا section_id لا مكان له فلا يُعدّ (يصل فقط في
  // معاينة المالك؛ get_shared_evidence ولقطة التقرير تستبعدانه أصلاً).
  const totalEvs = (evidence ?? []).filter(e => e.section_id != null).length;

  // تجميع شواهد جدول evidence حسب section_id — المصدر الوحيد لشواهد الصفحة
  // (نسب البنود، نافذة البند، والبطاقات الخاصة).
  const evidenceBySection = useMemo(() => {
    const map: Record<number, SupabaseEvidence[]> = {};
    (evidence ?? []).forEach(e => {
      if (e.section_id == null) return;
      (map[e.section_id] ??= []).push(e);
    });
    return map;
  }, [evidence]);

  const sectionName = (id: number | null) => (id == null ? undefined : sections.find(s => s.id === id)?.ttl);

  // «أبرز إنجاز»: المعرّف محسوب في get_shared_portfolio (أو محلياً في معاينة
  // المالك)، ويُطابَق مع الشواهد المعروضة. غير موجود ⇐ لا بطاقة. لقطة ?report=
  // لا تحمل المعرّف أصلاً، فلا بطاقة فيها.
  const topId = state.top_achievement_evidence_id ?? null;
  const topEvidence = useMemo(
    () => (topId ? (evidence ?? []).find(e => e.id === topId && e.section_id != null) ?? null : null),
    [evidence, topId]
  );
  const topIndicatorName = topEvidence
    ? sections.find(s => s.id === topEvidence.section_id)?.indicators.find(ind => ind.id === topEvidence.indicator_id)?.name_ar
    : undefined;

  const galleryItems = useMemo(() => pickGalleryItems(evidence ?? [], topId), [evidence, topId]);

  /** شاهد من evidence ⇐ عنصر نافذة العرض، بسطر «البند · التاريخ». الرابط
   *  العادي (غير يوتيوب) يُفتح في تبويب جديد كما في نافذة البند. */
  const openEvidence = (e: SupabaseEvidence) => {
    if (publicKind(e) === 'link' && e.link_url && !extractYouTubeId(e.link_url)) {
      window.open(e.link_url, '_blank', 'noopener,noreferrer');
      return;
    }
    setViewerItem({
    ...toPublicRow(e),
      meta: [sectionName(e.section_id), formatDate(e.created_at, 'long')].filter(Boolean).join(' · '),
    });
  };

  // مرجع "اليوم" لشبكة الاستمرارية — بداية فترة التقرير في وضع ?report=، وإلا
  // اليوم الفعلي (بلا أي تغيير عن المسار الحي — undefined يجعل ContinuityGrid
  // يستخدم افتراضيها الخاص new Date())
  const continuityReferenceDate = reportMeta ? new Date(`${reportMeta.periodFrom}T12:00:00`) : undefined;

  // قسم "التنويع في استراتيجيات التدريس" مُستبعد كلياً من نظام النسب (المستويات
  // 1-2-3 أدناه) — له بطاقة طولية مستقلة بلا أي رقم نسبة (انظر أسفل الصفحة).
  // نفس الاستبعاد يشمل بندي 5/10 (isResultsSection) — لا مؤشرات فرعية عادية
  // تُحتسب ضمن هذا النظام. بند 5 له بطاقة شواهده مجمّعة حسب المؤشر؛ بند 10
  // (تحليل نتائج المتعلمين) له بطاقة التحليلات المبسَّطة عبر
  // get_shared_results_analysis() (resultsAnalysis prop) — لا summary/students
  // إطلاقاً بهذا الشكل، فقط متوسط/مدى/عدد طلاب لكل تحليل — وتحتها شواهده إن وُجدت.
  const stratSection = sections.find(s => s.isStrat) ?? null;
  const resultsSections = sections.filter(s => s.isResultsSection);
  const improvementSection = resultsSections.find(s => s.id === 5) ?? null;
  const analysisSection = resultsSections.find(s => s.id === 10) ?? null;

  // شواهد بندي 5/10 مجمّعة حسب المؤشر (groupByIndicator) — المؤشر بلا شواهد
  // لا يظهر، والشاهد بلا مؤشر معروف في مجموعة أخيرة «بلا مؤشر».
  const improvementGroups = useMemo(
    () => improvementSection ? toGroupList(groupByIndicator(evidenceBySection[improvementSection.id] ?? [], improvementSection.indicators)) : [],
    [improvementSection, evidenceBySection]
  );
  const analysisGroups = useMemo(
    () => analysisSection ? toGroupList(groupByIndicator(evidenceBySection[analysisSection.id] ?? [], analysisSection.indicators)) : [],
    [analysisSection, evidenceBySection]
  );

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
  // غير موجود ⇐ console.error وإخفاء البطاقة (الشرط أدناه) لا كسر الصفحة.
  // أدلته = evidence ذات indicator_id لهذا المؤشر حصراً.
  const indivDiffIndicator = useMemo(() => findIndicatorByName(stratSection, 'الفروق الفردية'), [stratSection]);
  const indivDiffSub = indivDiffIndicator?.name_ar;
  // شواهد الاستراتيجيات (strategy_id) تُعرض في بطاقة الاستراتيجيات وحدها
  const indivDiffEvs = indivDiffIndicator
    ? (evidence ?? []).filter(e => e.indicator_id === indivDiffIndicator.id && !e.strategy_id).map(toPublicRow)
    : [];

  // بطاقة الاستراتيجيات — مُشتقّة من evidenceBySection[stratSection.id] (أدلة
  // جدول evidence الحقيقية ذات strategy_id غير فارغ)، مجمَّعة حسب strategy_id
  // واسمها محلول عبر strategyNames (بند 9 بـApp.tsx) — لا state.strats بعد الآن.
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

  // «شواهد أخرى» في بطاقة الاستراتيجيات: شاهد في البند 4 بلا strategy_id
  // ومؤشره ليس «مراعاة الفروق الفردية» — لا مكان آخر له في الصفحة.
  const otherStratEvs = useMemo(() => {
    if (!stratSection) return [];
    return (evidenceBySection[stratSection.id] ?? [])
      .filter(e => !e.strategy_id && (!indivDiffIndicator || e.indicator_id !== indivDiffIndicator.id))
      .map(toPublicRow);
  }, [stratSection, evidenceBySection, indivDiffIndicator]);

  // البنود الثمانية (بلا الاستراتيجيات وبندي 5/10): شواهد كل بند من
  // evidenceBySection مجمّعة حسب المؤشر بترتيب sec.indicators، والربط
  // بـ indicator_id حصراً. pct = المؤشرات التي لها شاهد واحد على الأقل ÷ عدد
  // مؤشرات القسم — نفس completionPct في Dashboard.tsx (evStats) تماماً.
  // شاهد لا يطابق أي مؤشر من مؤشرات قسمه يُعرض آخراً بـ«بلا مؤشر» ولا يدخل النسبة.
  const sectionsWithPct: SectionWithPct[] = useMemo(() => {
    return sections.filter(s => !s.isStrat && !s.isResultsSection).map(sec => {
      const secEvidence = evidenceBySection[sec.id] ?? [];
      const { groups, orphans } = groupByIndicator(secEvidence, sec.indicators);
      const evs = [
        ...groups.flatMap(g => g.evs.map(e => ({ ...toPublicRow(e), sub: g.indicator.name_ar, orphan: false }))),
        ...orphans.map(e => ({ ...toPublicRow(e), sub: NO_INDICATOR_LABEL, orphan: true })),
      ];
      // النسبة من المؤشرات الرسمية فقط — المخصص يُعرض ولا يُحسب
      const official = sec.indicators.filter(ind => !ind.isCustom);
      const filled = official.filter(ind => secEvidence.some(e => e.indicator_id === ind.id)).length;
      const total = official.length;
      return {
        ...sec,
        fullName: sec.ttl,
        evCount: evs.length,
        evs,
        pct: total > 0 ? Math.round((filled / total) * 100) : 0,
      };
    });
  }, [sections, evidenceBySection]);

  // هل يملك القسم أي دليل موثّق؟ يُستخدم لتصنيف "فارغ/غير فارغ" لأغراض
  // العرض (activeSecs/emptySecs + رسالة المودال).
  const sectionHasEvidence = (sec: Pick<SectionWithPct, 'evs'>): boolean => sec.evs.length > 0;

  // تنازلياً بـpct، وعند التساوي يُرجَّح القسم الأعلى إجمالي أدلة تراكمية
  // (evCount) — يعكس عمق التوثيق الفعلي رغم تساوي النسبة.
  const activeSecs = sectionsWithPct.filter(s => sectionHasEvidence(s)).sort((a, b) => {
    const pctDiff = b.pct - a.pct;
    if (pctDiff !== 0) return pctDiff;
    return b.evCount - a.evCount;
  });
  const emptySecs = sectionsWithPct.filter(s => !sectionHasEvidence(s));
  // «X من 8 مجالات» في الرأس: البنود العادية التي فيها شاهد واحد على الأقل (يشمل «بلا مؤشر»)
  const coveredCount = activeSecs.length;

  const exportToPDF = () => {
    // تاريخ التصدير الفعلي لحظة الطباعة (وليس تاريخاً ثابتاً من لحظة تحميل
    // الصفحة) — يُحدَّث في الترويسة المخصّصة لوضع الطباعة قبل فتح حوار الطباعة.
    setPrintDate(formatDate(new Date(), 'long'));
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

  // نفس sectionHasEvidence المستخدمة أعلاه لتصنيف activeSecs/emptySecs.
  const showEmptyMessage = !selectedSecData || !sectionHasEvidence(selectedSecData);

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
                  ? `مُولَّد بتاريخ ${formatDate(reportMeta.generatedAt, 'long')}`
                  : printDate}
              </div>
              <div className="print-header-url">wathq.online</div>
            </div>
          </div>
          <div className="print-header-rule"></div>
        </div>

        <PublicHero
          profile={state.profile}
          completion={state.completion}
          aiSummary={state.ai_summary}
          totalEvs={totalEvs}
          coveredCount={coveredCount}
          totalSections={sectionsWithPct.length}
          reportMeta={reportMeta}
          onExportPdf={exportToPDF}
          onShare={handleOpenShare}
        />

        {/* «أبرز إنجاز» ثم «لمحات» — بعد الرأس مباشرة كما في النموذج، وبعرضه (1100px) */}
        {(topEvidence || (ownerPreview && !reportMeta)) && (
          <div className="max-w-[1100px] mx-auto px-4 lg:px-8 pt-6">
            {topEvidence ? (
              <TopAchievementCard
                evidence={topEvidence}
                source={state.top_achievement_source}
                sectionName={sectionName(topEvidence.section_id)}
                indicatorName={topIndicatorName}
                onOpen={() => openEvidence(topEvidence)}
              />
            ) : (
              <TopAchievementPlaceholder />
            )}
          </div>
        )}
        {galleryItems.length > 0 && (
          <div className="print:hidden max-w-[1100px] mx-auto px-4 lg:px-8 pt-6">
            <PublicGallery items={galleryItems} sectionName={sectionName} onOpen={openEvidence} />
          </div>
        )}

        <div className="max-w-[1000px] mx-auto py-10 px-4 sm:px-7">

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
                onClick={() => setSelectedSecId(sec.id)}
                style={{ animation: `fadeUp .4s var(--sp) both ${i * 0.05}s` }}
                summary={sectionSummaries?.[sec.id]}
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
                  <SectionCard key={sec.id} sec={sec} onClick={() => setSelectedSecId(sec.id)} summary={sectionSummaries?.[sec.id]} />
                ))}
              </div>
            </div>
          )}

          {/* نسخة الطباعة فقط: تعرض كل الأقسام الفارغة كبطاقات مباشرة بدون أكورديون */}
          {emptySecs.length > 0 && (
            <div className="hidden print:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {emptySecs.map(sec => (
                <SectionCard key={`print-${sec.id}`} sec={sec} onClick={() => setSelectedSecId(sec.id)} summary={sectionSummaries?.[sec.id]} />
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
                {stratGroups.length === 0 && otherStratEvs.length === 0 ? (
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
                                  <EvidenceThumb e={toPublicRow(e)} onClick={setViewerItem} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {otherStratEvs.length > 0 && (
                      <IndicatorGroups groups={[{ key: 'other', label: 'شواهد أخرى', evs: otherStratEvs }]} onPreview={setViewerItem} />
                    )}
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
                    {indivDiffEvs.map(e => (
                      <div key={e.id}>
                        <EvidenceThumb e={e} onClick={setViewerItem} />
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
          {/* البطاقة تظهر إن جُلبت التحليلات، أو إن فشل جلبها وفي البند شواهد
              (فتُعرض الشواهد وحدها). الشواهد تحت التحليلات، ولا رسالة فارغة لها. */}
          {analysisSection && (resultsAnalysis || analysisGroups.length > 0) && (
            <div className="print-card bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--line2)] shadow-lg p-6 sm:p-8" style={{ borderRight: '4px solid var(--violet)' }}>
              <div className="flex items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-2">
                  <i className={`ti ${analysisSection.icon} text-[var(--violet2)] text-[20px]`}></i>
                  <h2 className="text-[18px] font-black text-white">{analysisSection.ttl}</h2>
                </div>
                {resultsAnalysis && resultsAnalysis.length > 0 && (
                  <span className="text-[11px] font-black text-[var(--violet2)] bg-[var(--violet)]/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                    {resultsAnalysis.length} تحليل
                  </span>
                )}
              </div>

              {resultsAnalysis && (resultsAnalysis.length === 0 ? (
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
              ))}

              {analysisGroups.length > 0 && (
                <div className={resultsAnalysis ? 'mt-5' : ''}>
                  <IndicatorGroups groups={analysisGroups} onPreview={setViewerItem} />
                </div>
              )}
            </div>
          )}

          {/* بطاقة بند 5 "تحسين نتائج المتعلمين" — عرض قراءة فقط لكل شواهد البند
              مجمّعة حسب المؤشر (improvementGroups)، بلا أي تنبيهات خام إطلاقاً
              (تلك أداة تخطيط داخلية للمعلم وحده). رسالة الفراغ فقط إن لم يكن في
              البند أي شاهد. شريط اللون البنفسجي (--violet) يطابق بطاقتَي
              التحليل/التحسين في Dashboard.tsx. */}
          {improvementSection && (
            <div className="print-card bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--line2)] shadow-lg p-6 sm:p-8" style={{ borderRight: '4px solid var(--violet)' }}>
              <div className="flex items-center gap-2 mb-6">
                <i className={`ti ${improvementSection.icon} text-[var(--em8)] text-[20px]`}></i>
                <h2 className="text-[18px] font-black text-white">{improvementSection.ttl}</h2>
              </div>
              {improvementGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-[22px] text-[var(--text4)] mb-3">
                    <i className="ti ti-ghost"></i>
                  </div>
                  <p className="text-[var(--text3)] text-[13.5px]">لا توجد شواهد موثّقة بعد لهذا البند</p>
                </div>
              ) : (
                <IndicatorGroups groups={improvementGroups} onPreview={setViewerItem} />
              )}
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
                  (تستبعد isStrat وisResultsSection) — selectedSecData لا يمكن أن
                  يطابق قسم 4 إطلاقاً، فلا فرع خاص به هنا (له بطاقته المستقلة
                  أعلى الصفحة، انظر stratGroups). */}
              <>
                {/* ملخص القسم — الجملة كاملة، قبل عرض أي أدلة */}
                {sectionSummaries?.[selectedSecData.id] && (
                  <div className="mb-5 flex items-start gap-2.5 bg-[var(--em7)]/5 border border-[var(--em7)]/15 rounded-2xl py-3.5 px-4">
                    <i className="ti ti-sparkles text-[var(--em7)] text-[16px] mt-0.5 shrink-0" />
                    <p className="text-[13px] text-[var(--text2)] leading-relaxed">{sectionSummaries[selectedSecData.id]}</p>
                  </div>
                )}
                {!showEmptyMessage ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedSecData.evs.map(e => {
                      const t = EVT_CONFIG[e.kind];
                      // الرابط يُفتح في تبويب جديد مباشرة، إلا يوتيوب فيُعاين بالمشغّل
                      // المضمّن؛ الملاحظة تُعاين نصاً بلا رابط
                      const isLink = e.kind === 'link' && !!e.url && !extractYouTubeId(e.url);
                      const clickable = isLink || e.kind === 'note' || !!e.url;
                      return (
                        <div
                          key={e.id}
                          className={`flex items-center gap-3 py-3 px-4 bg-[var(--surf2)] rounded-xl border border-[var(--line)] transition-all duration-200 ${clickable ? 'cursor-pointer hover:border-[var(--em7)]/40 hover:bg-[var(--surf3)] hover:-translate-y-0.5' : ''}`}
                          onClick={() => {
                            if (isLink) window.open(e.url, '_blank', 'noopener,noreferrer');
                            else if (clickable) setViewerItem({ ...e, meta: `${e.sub} · ${e.date}` });
                          }}
                          title={isLink ? 'انقر لفتح الرابط' : clickable ? 'انقر لمعاينة الدليل فوراً' : ''}
                        >
                          <div className={`w-[40px] h-[40px] rounded-lg text-[20px] flex items-center justify-center shrink-0 ${t.cls}`}>
                            <i className={`ti ${t.icon}`}></i>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-bold text-white truncate group-hover:text-[var(--em8)] transition-colors">{e.name}</div>
                            <div className="text-[11px] text-[var(--text4)] mt-1 truncate">
                              {e.sub} · {e.date}
                              {isLink
                                ? <span className="text-[var(--em8)] mr-1.5 font-bold"><i className="ti ti-external-link"></i> فتح الرابط</span>
                                : clickable && <span className="text-[var(--em8)] mr-1.5 font-bold"><i className="ti ti-eye"></i> معاينة</span>}
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

      <EvidenceViewer item={viewerItem} onClose={() => setViewerItem(null)} />
    </div>
  );
}
