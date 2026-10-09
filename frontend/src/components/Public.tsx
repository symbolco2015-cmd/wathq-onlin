import React, { useState, useMemo, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { ContinuityData, FrozenPointsLevel, PublicPortfolioState, SectionData, SectionIndicator } from '../types';
import { formatDate } from '../utils';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import type { PublicCustomIndicator } from '../hooks/usePublicCustomIndicators';
import { findIndicatorByName } from '../indicators';
import EvidenceViewer, { extractYouTubeId, publicKind, type ViewerItem } from './EvidenceViewer';
import TopAchievementCard, { TopAchievementPlaceholder } from './TopAchievementCard';
import PublicGallery, { pickGalleryItems } from './PublicGallery';
import PublicHero from './PublicHero';
import PublicContinuity from './PublicContinuity';
import {
  toPublicRow, SectionsList, SectionSheet, CoreSectionBody,
  StrategiesContent, IndivDiffContent, AnalysisContent, ImprovementContent,
  type AreaItem, type EvidenceGroup, type OpenSec, type PublicRow, type SpecialKey,
} from './PublicSections';
import { sectionLevel, nEv, type Level } from './SectionView';
import type { PublicResultsAnalysisRow } from './ResultsAnalysis/types';
import type { ComparisonPoint } from './ResultsAnalysis/logic';
import { groupPublicAnalysesBySubject, buildPublicComparisonSeries } from './ResultsAnalysis/logic';
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

/** groupByIndicator بشكل قائمة عرض: مجموعة لكل مؤشر ثم «بلا مؤشر» إن وُجد. */
function toGroupList({ groups, orphans }: ReturnType<typeof groupByIndicator>): EvidenceGroup[] {
  const list = groups.map(g => ({ key: g.indicator.id, label: g.indicator.name_ar, evs: g.evs.map(toPublicRow) }));
  if (orphans.length > 0) list.push({ key: 'no-indicator', label: NO_INDICATOR_LABEL, evs: orphans.map(toPublicRow) });
  return list;
}

type SectionWithLevel = SectionData & {
  fullName: string;
  evCount: number;
  /** orphan: شاهد بلا مؤشر معروف في القسم (sub = «بلا مؤشر») — يُعرض ولا يُحسب في النسبة */
  evs: (PublicRow & { sub: string; orphan: boolean })[];
  /** مستوى التغطية — sectionLevel (lvl() في النموذج) من المؤشرات الرسمية فقط */
  level: Level;
};

/** ينتظر تحميل صور القسم الخاص بالطباعة (بحد أقصى timeoutMs) قبل حوار الطباعة */
function waitForImages(root: HTMLElement | null, timeoutMs: number): Promise<void> {
  if (!root) return Promise.resolve();
  const pending = Array.from(root.querySelectorAll('img')).filter(img => !img.complete);
  if (pending.length === 0) return Promise.resolve();
  const all = Promise.all(pending.map(img => new Promise<void>(res => {
    img.addEventListener('load', () => res(), { once: true });
    img.addEventListener('error', () => res(), { once: true });
  })));
  return Promise.race([all.then(() => undefined), new Promise<void>(res => setTimeout(res, timeoutMs))]);
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
  // نافذة البند المفتوحة، والصف الذي فتحها (يعود إليه التركيز عند الإغلاق)
  const [openSec, setOpenSec] = useState<OpenSec | null>(null);
  const [openerEl, setOpenerEl] = useState<HTMLElement | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [printDate, setPrintDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  // نافذة العرض الموحّدة — نافذة البند، والبطاقات، و«أبرز إنجاز»، والمعرض
  const [viewerItem, setViewerItem] = useState<ViewerItem | null>(null);
  // نافذة البند تتجاهل Esc ما دامت نافذة العرض مفتوحة فوقها
  const viewerOpenRef = useRef(false);
  viewerOpenRef.current = viewerItem !== null;

  // محتوى البنود الخاصة يُركَّب عند فتح نافذته فقط؛ للطباعة يُركَّب كله في قسم
  // مخفي على الشاشة (hidden print:block) بين beforeprint وafterprint. flushSync
  // لأن المتصفح يأخذ لقطة الطباعة مباشرة بعد beforeprint.
  const [printAll, setPrintAll] = useState(false);
  const printAllRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = () => flushSync(() => setPrintAll(true));
    const after = () => setPrintAll(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

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
  // ترتيب واحد في المعاينة والمشاركة والتقرير: الأحدث أولاً، كلوحة التحكم.
  // المصادر تختلف: useResultsAnalysis تنازلي، وget_shared_results_analysis
  // تصاعدي، ولقطة التقرير بلا ترتيب.
  const sortedAnalysis = useMemo(
    () => resultsAnalysis
      ? [...resultsAnalysis].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      : resultsAnalysis,
    [resultsAnalysis]
  );

  const resultsComparisons = useMemo(() => {
    if (frozenResultsComparisons) return frozenResultsComparisons;
    if (!sortedAnalysis || sortedAnalysis.length === 0) return [];
    const groups = groupPublicAnalysesBySubject(sortedAnalysis);
    return Array.from(groups.entries())
      .filter(([, rows]) => rows.length >= 2)
      .map(([subject]) => ({ subject, series: buildPublicComparisonSeries(sortedAnalysis, subject) }));
  }, [frozenResultsComparisons, sortedAnalysis]);

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
  // بـ indicator_id حصراً. level = sectionLevel(المؤشرات الرسمية التي لها شاهد،
  // عدد الرسمية، عدد الشواهد) — نفس مستوى لوحة التحكم و lvl() في النموذج.
  // شاهد لا يطابق أي مؤشر من مؤشرات قسمه يُعرض آخراً بـ«بلا مؤشر» ولا يدخل المستوى.
  const sectionsWithLevel: SectionWithLevel[] = useMemo(() => {
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
        level: sectionLevel(filled, total, evs.length),
      };
    });
  }, [sections, evidenceBySection]);

  // البنود التي عليها شواهد فقط، بترتيب البنود نفسه — acts في pub() بالنموذج.
  // البند بلا شواهد لا يظهر في الصفحة العامة.
  const activeSecs = sectionsWithLevel.filter(s => s.evs.length > 0);
  // «X من 8 مجالات» في الرأس: البنود العادية التي فيها شاهد واحد على الأقل (يشمل «بلا مؤشر»)
  const coveredCount = activeSecs.length;

  const coreItems: AreaItem[] = activeSecs.map(sec => ({
    key: `core-${sec.id}`,
    open: { kind: 'core', id: sec.id },
    icon: sec.icon,
    title: sec.fullName,
    count: nEv(sec.evCount),
    level: sec.level,
    summary: sectionSummaries?.[sec.id],
  }));

  // البنود الخاصة الأربعة — تظهر فقط إن كان فيها محتوى، بالعدد وحده (لا مستوى)
  const stratEvCount = stratGroups.reduce((n, g) => n + g.evidence.length, 0) + otherStratEvs.length;
  const analysisEvCount = analysisGroups.reduce((n, g) => n + g.evs.length, 0);
  const analysisRowCount = sortedAnalysis?.length ?? 0;
  const specialItems: AreaItem[] = [];
  if (stratSection && stratEvCount > 0) {
    specialItems.push({ key: 'strat', open: { kind: 'strat' }, icon: 'ti-bulb', title: 'استراتيجيات التدريس المتنوعة', count: nEv(stratEvCount) });
  }
  if (stratSection && indivDiffSub && indivDiffEvs.length > 0) {
    specialItems.push({ key: 'indiv', open: { kind: 'indiv' }, icon: 'ti-users', title: indivDiffSub, count: nEv(indivDiffEvs.length) });
  }
  if (analysisSection && (analysisRowCount > 0 || analysisEvCount > 0)) {
    const parts = [analysisRowCount > 0 ? `${analysisRowCount} تحليل` : '', analysisEvCount > 0 ? nEv(analysisEvCount) : ''].filter(Boolean);
    specialItems.push({ key: 'analysis', open: { kind: 'analysis' }, icon: analysisSection.icon, title: analysisSection.ttl, count: parts.join(' · ') });
  }
  if (improvementSection && improvementGroups.length > 0) {
    const n = improvementGroups.reduce((c, g) => c + g.evs.length, 0);
    specialItems.push({ key: 'improvement', open: { kind: 'improvement' }, icon: improvementSection.icon, title: improvementSection.ttl, count: nEv(n) });
  }

  /** محتوى بند خاص — في نافذة البند، أو في قسم الطباعة (forPrint: كل شيء مفتوح والصور فورية) */
  const renderSpecial = (kind: SpecialKey, forPrint = false) => {
    switch (kind) {
      case 'strat':
        return <StrategiesContent groups={stratGroups} otherEvs={otherStratEvs} onPreview={setViewerItem} forceOpen={forPrint} eager={forPrint} />;
      case 'indiv':
        return <IndivDiffContent evs={indivDiffEvs} onPreview={setViewerItem} eager={forPrint} />;
      case 'analysis':
        return <AnalysisContent rows={sortedAnalysis} comparisons={resultsComparisons} groups={analysisGroups} onPreview={setViewerItem} eager={forPrint} />;
      case 'improvement':
        return <ImprovementContent groups={improvementGroups} onPreview={setViewerItem} eager={forPrint} />;
    }
  };

  const openSection = (open: OpenSec, el: HTMLElement) => {
    setOpenerEl(el);
    setOpenSec(open);
  };

  /** صف شاهد في بند عادي: الرابط العادي يُفتح في تبويب جديد، والباقي في نافذة العرض */
  const activateRow = (row: PublicRow, groupLabel: string) => {
    if (row.kind === 'link' && row.url && !extractYouTubeId(row.url)) {
      window.open(row.url, '_blank', 'noopener,noreferrer');
      return;
    }
    setViewerItem({ ...row, meta: `${groupLabel} · ${row.date}` });
  };

  const exportToPDF = async () => {
    // تاريخ التصدير الفعلي لحظة الطباعة (وليس تاريخاً ثابتاً من لحظة تحميل
    // الصفحة) — يُحدَّث في الترويسة المخصّصة لوضع الطباعة قبل فتح حوار الطباعة.
    setPrintDate(formatDate(new Date(), 'long'));
    // نفس مسار beforeprint: محتوى البنود الخاصة يُركَّب للطباعة، ثم ننتظر صوره
    // (3 ثوانٍ كحد أقصى) حتى لا تخرج فارغة في PDF.
    flushSync(() => setPrintAll(true));
    await waitForImages(printAllRef.current, 3000);
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

  // نافذة البند المفتوحة: رأسها ومحتواها. المحتوى لا يُركَّب قبل الفتح.
  const closeSection = () => setOpenSec(null);
  let sheet: { icon: string; title: string; body: React.ReactNode } | null = null;
  if (openSec?.kind === 'core') {
    const sec = sectionsWithLevel.find(s => s.id === openSec.id);
    if (sec) {
      const groups: EvidenceGroup[] = toGroupList(groupByIndicator(evidenceBySection[sec.id] ?? [], sec.indicators));
      sheet = {
        icon: sec.icon,
        title: sec.fullName,
        body: <CoreSectionBody groups={groups} summary={sectionSummaries?.[sec.id]} onActivate={activateRow} />,
      };
    }
  } else if (openSec) {
    const kind = openSec.kind;
    const item = specialItems.find(i => i.open.kind === kind);
    if (item) sheet = { icon: item.icon, title: item.title, body: renderSpecial(kind) };
  }

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
          totalSections={sectionsWithLevel.length}
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

        <div className="max-w-[1100px] mx-auto px-4 lg:px-8 py-8">
          <SectionsList
            core={coreItems}
            special={specialItems}
            coveredCount={coveredCount}
            totalSections={sectionsWithLevel.length}
            onOpen={openSection}
          />

          {continuity && (
            <div className="mt-8">
              <PublicContinuity continuity={continuity} referenceDate={continuityReferenceDate} />
            </div>
          )}

          {/* محتوى البنود الخاصة للطباعة فقط — يُركَّب بين beforeprint وafterprint
              (أو من زر «تصدير PDF»)، ومخفي على الشاشة دائماً */}
          {printAll && specialItems.length > 0 && (
            <div ref={printAllRef} className="hidden print:block mt-8">
              {specialItems.map(item => (
                <section key={item.key} className="print-card mt-6">
                  <h2 className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">{item.title}</h2>
                  {renderSpecial(item.open.kind as SpecialKey, true)}
                </section>
              ))}
            </div>
          )}

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

      {sheet && (
        <SectionSheet icon={sheet.icon} title={sheet.title} onClose={closeSection} returnFocusTo={openerEl} viewerOpenRef={viewerOpenRef}>
          {sheet.body}
        </SectionSheet>
      )}

      <EvidenceViewer item={viewerItem} onClose={() => setViewerItem(null)} />
    </div>
  );
}
