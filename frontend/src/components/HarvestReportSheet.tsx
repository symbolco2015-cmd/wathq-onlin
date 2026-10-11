import { useEffect, useMemo, useState } from 'react';
import BottomSheet from './BottomSheet';
import { BTN_PRI, BTN_GH_SM } from './SectionView';
import { FIELD, LABEL } from './formStyles';
import type { ToastKind } from './UI';
import { supabase } from '../supabaseClient';
import { calculatePointsLevelFromTotal, formatDate } from '../utils';
import type { AcademicDate, AppState, HarvestSnapshot, SectionData } from '../types';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import type { ResultsAnalysisRow } from './ResultsAnalysis/types';
import { toPublicResultsAnalysisRow, groupPublicAnalysesBySubject, buildPublicComparisonSeries } from './ResultsAnalysis/logic';

interface HarvestReportSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  state: Pick<AppState, 'profile' | 'yearStartMonth'>;
  sections: SectionData[];
  academicDates?: AcademicDate[];
  onToast?: (msg: string, kind: ToastKind) => void;
}

interface SemesterOption {
  key: string;
  semesterNumber: 1 | 2 | 3;
  label: string;
  from: string;
  to: string;
}

const flat = (dateStr: string): number => {
  const [y, m] = dateStr.split('-').map(Number);
  return y * 12 + m;
};

const formatArabicDate = (dateStr: string): string =>
  formatDate(new Date(`${dateStr}T12:00:00`), 'long');

/** يبني أزواج (بداية/نهاية) لكل رقم فصل من مواعيد academic_dates التي حدّدها
 * الأدمن — يزاوج كل موعد "بداية" بأقرب موعد "نهاية" تالٍ له بنفس رقم الفصل،
 * لدعم إضافة مواعيد لأكثر من سنة دراسية بنفس رقم الفصل بلا تعارض. */
function buildSemesterOptions(academicDates: AcademicDate[]): SemesterOption[] {
  const bySemester = new Map<number, AcademicDate[]>();
  academicDates.forEach(d => {
    if (!d.semester_number || !d.semester_boundary) return;
    const arr = bySemester.get(d.semester_number) || [];
    arr.push(d);
    bySemester.set(d.semester_number, arr);
  });

  const options: SemesterOption[] = [];
  bySemester.forEach((dates, semesterNumber) => {
    const starts = [...dates].filter(d => d.semester_boundary === 'start').sort((a, b) => a.date.localeCompare(b.date));
    const ends = [...dates].filter(d => d.semester_boundary === 'end').sort((a, b) => a.date.localeCompare(b.date));
    starts.forEach(start => {
      const matchingEnd = ends.find(e => e.date > start.date);
      if (!matchingEnd) return;
      options.push({
        key: `${start.id}-${matchingEnd.id}`,
        semesterNumber: semesterNumber as 1 | 2 | 3,
        label: `الفصل الدراسي ${semesterNumber}`,
        from: start.date,
        to: matchingEnd.date,
      });
    });
  });

  // الأقرب للسنة الدراسية الحالية أولاً: يُفضَّل الفصل النشط الآن، ثم الأحدث
  // تاريخ بداية تنازلياً — بلا أي استثناء إضافي.
  const todayIso = new Date().toISOString().slice(0, 10);
  options.sort((a, b) => {
    const aActive = a.from <= todayIso && todayIso <= a.to;
    const bActive = b.from <= todayIso && todayIso <= b.to;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return b.from.localeCompare(a.from);
  });

  return options;
}

/**
 * BottomSheet "تقرير حصاد فصلي": يبني لقطة ثابتة (harvest_reports.snapshot) من
 * شواهد فترة زمنية مختارة (فصل دراسي معتمد أو مدى مخصص) ثم يولّد رابط
 * `?report=<id>` قابل للمشاركة. لا يمسّ get_shared_evidence/get_shared_monthly_progress
 * إطلاقاً — يقرأ evidence/monthly_progress مباشرة بصلاحية المعلم العادية (RLS
 * الحالي كافٍ، هذه استعلامات مالك على جدوله الخاص).
 */
export default function HarvestReportSheet({ isOpen, onClose, userId, state, sections, academicDates, onToast }: HarvestReportSheetProps) {
  const semesterOptions = useMemo(() => buildSemesterOptions(academicDates || []), [academicDates]);
  const [selectedKey, setSelectedKey] = useState<string>('custom');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // تصفير كامل عند إغلاق الشيت — كل فتح لاحق يبدأ من جديد بلا أي نتيجة سابقة عالقة
  useEffect(() => {
    if (!isOpen) {
      setSelectedKey(semesterOptions[0]?.key ?? 'custom');
      setCustomFrom('');
      setCustomTo('');
      setGenerating(false);
      setResultUrl(null);
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selectedSemester = semesterOptions.find(o => o.key === selectedKey) ?? null;
  const isCustom = selectedKey === 'custom';
  const customRangeValid = !!customFrom && !!customTo && customFrom <= customTo;
  const canGenerate = isCustom ? customRangeValid : !!selectedSemester;

  const handleCopy = async () => {
    if (!resultUrl) return;
    await navigator.clipboard.writeText(resultUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerate = async () => {
    if (!userId || !supabase || generating || !canGenerate) return;

    const from = isCustom ? customFrom : selectedSemester!.from;
    const to = isCustom ? customTo : selectedSemester!.to;
    const periodLabel = isCustom
      ? `مدى مخصص (${formatArabicDate(from)} – ${formatArabicDate(to)})`
      : `${selectedSemester!.label} (${formatArabicDate(from)} – ${formatArabicDate(to)})`;

    setGenerating(true);
    try {
      const fromIso = new Date(`${from}T00:00:00`).toISOString();
      const toIso = new Date(`${to}T23:59:59.999`).toISOString();

      // 1) شواهد الفترة — استعلام عادي بصلاحية المعلم (RLS المالك)، وليس أي
      // RPC مشاركة. نفس استبعاد section_id IS NULL المعتمد في get_shared_evidence.
      const { data: evidenceRows, error: evErr } = await supabase
        .from('evidence')
        .select('*')
        .eq('portfolio_id', userId)
        .not('section_id', 'is', null)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false });
      if (evErr) throw evErr;
      const rawEvidence = (evidenceRows || []) as SupabaseEvidence[];

      // خصوصية: هذا التقرير قابل للقراءة العامة عبر id (نفس نمط ?share=)،
      // فتُفرَّغ حقول التأمل الخاصة تماماً كما تفعل get_shared_evidence.
      const scrubbedEvidence: SupabaseEvidence[] = rawEvidence.map(e => ({
        ...e,
        impact: null,
        self_reflection: null,
      }));

      // 2) monthly_progress ضمن المدى — نفس تجميع get_shared_monthly_progress
      // (مجموع evidence_count لكل year/month عبر كل الأقسام)، مبني هنا من
      // صفوف المالك المباشرة (RLS تسمح، لسنا في مسار مشاركة عام).
      const { data: monthlyRows, error: mpErr } = await supabase
        .from('monthly_progress')
        .select('year, month, evidence_count')
        .eq('portfolio_id', userId);
      if (mpErr) throw mpErr;

      const fromFlat = flat(from);
      const toFlat = flat(to);
      const monthTotals = new Map<string, { year: number; month: number; evidenceCount: number }>();
      (monthlyRows || []).forEach((r: any) => {
        const f = r.year * 12 + r.month;
        if (f < fromFlat || f > toFlat) return;
        const key = `${r.year}-${r.month}`;
        const existing = monthTotals.get(key);
        if (existing) existing.evidenceCount += r.evidence_count || 0;
        else monthTotals.set(key, { year: r.year, month: r.month, evidenceCount: r.evidence_count || 0 });
      });
      const activeMonths = Array.from(monthTotals.values()).filter(m => m.evidenceCount > 0);

      // 3) بند 10 (تحليل نتائج المتعلمين) ضمن الفترة — استعلام مالك مباشر على
      // results_analysis (RLS تسمح، بلا أي RPC)، بنفس شرط المدى الزمني أعلاه.
      // الصف الخام summary يحوي أسماء الطلاب؛ يُحوَّل فوراً لنفس الشكل المبسَّط
      // الآمن الذي تُرجعه get_shared_results_analysis عبر toPublicResultsAnalysisRow
      // (لا اسم طالب واحد يدخل الـsnapshot)، وعناصر المقارنة تُحسب وتُخبَز هنا
      // أيضاً (نفس منطق groupAnalysesBySubject/comparisonDelta الحي) بدل تأجيل
      // حسابها لوقت العرض — التقرير لقطة ثابتة لا تتأثر بتعديل/حذف لاحق للمصدر.
      const { data: analysisRows, error: raErr } = await supabase
        .from('results_analysis')
        .select('*')
        .eq('portfolio_id', userId)
        .gte('created_at', fromIso)
        .lte('created_at', toIso);
      if (raErr) throw raErr;
      const resultsAnalysis = ((analysisRows || []) as ResultsAnalysisRow[]).map(toPublicResultsAnalysisRow);
      const resultsComparisonGroups = groupPublicAnalysesBySubject(resultsAnalysis);
      const resultsComparisons = Array.from(resultsComparisonGroups.entries())
        .filter(([, rows]) => rows.length >= 2)
        .map(([subject]) => ({ subject, series: buildPublicComparisonSeries(resultsAnalysis, subject) }));

      // 4) شارة اللقب/النقاط — من مجموع شواهد الفترة فقط، وليس نافذة "آخر 3
      // أشهر تقويمية" المعتادة في calculatePointsLevel (تلك مرتبطة بـ"اليوم"،
      // غير مناسبة لتقرير عن فترة قد تكون منتهية منذ زمن).
      const totalPoints = activeMonths.reduce((sum, m) => sum + m.evidenceCount, 0);
      const pointsLevel = calculatePointsLevelFromTotal(totalPoints);

      // 5) أسماء استراتيجيات التدريس (بند 4) المُشار إليها ضمن شواهد الفترة —
      // تُخبَز هنا وقت التوليد (المولِّد هو المالك المسجَّل دخوله، RLS تسمح له
      // بقراءة كتالوجه العام+الخاص مباشرة) لأن التقرير لقطة ثابتة بلا أي RPC
      // حية وقت العرض لاحقاً (نفس مبدأ resultsAnalysis/pointsLevel أعلاه) —
      // لا يمكن حلّ strategy_id إلى اسم حينها إلا بتجميده هنا مسبقاً.
      const strategyIds = Array.from(
        new Set(rawEvidence.map(e => e.strategy_id).filter((id): id is string => !!id))
      );
      const strategyNames: Record<string, string> = {};
      if (strategyIds.length > 0) {
        const { data: strategies } = await supabase
          .from('teaching_strategies')
          .select('id, name_ar')
          .in('id', strategyIds);
        (strategies || []).forEach((s: any) => { strategyNames[s.id] = s.name_ar; });
      }

      // 6) جاهزية الفترة — نفس معادلة get_portfolio_completion (أقسام core فقط)
      // لكن "له شاهد" = له شاهد من rawEvidence (شواهد الفترة). تُخبَز هنا ولا
      // تُحسب وقت العرض. فشل جلب المؤشرات لا يُفشل التقرير: يُحفظ بلا completion
      // و Public.tsx يُخفي البطاقة حينها.
      let completion: HarvestSnapshot['state']['completion'];
      const { data: coreIndicators, error: indErr } = await supabase
        .from('section_indicators')
        .select('id, section_id, sections!inner(section_type)')
        .eq('sections.section_type', 'core')
        .is('portfolio_id', null); // الرسمية فقط — المخصص لا يدخل في الجاهزية
      if (indErr || !coreIndicators || coreIndicators.length === 0) {
        console.warn('[HarvestReportSheet] تعذّر جلب مؤشرات أقسام core — التقرير بلا جاهزية الفترة:', indErr?.message ?? 'empty');
      } else {
        const covered = new Set(rawEvidence.map(e => e.indicator_id).filter((id): id is string => !!id));
        const bySection = new Map<number, { total: number; covered: number }>();
        let coveredCount = 0;
        (coreIndicators as { id: string; section_id: number }[]).forEach(ind => {
          const isCovered = covered.has(ind.id);
          if (isCovered) coveredCount++;
          const s = bySection.get(ind.section_id) ?? { total: 0, covered: 0 };
          s.total++;
          if (isCovered) s.covered++;
          bySection.set(ind.section_id, s);
        });
        completion = {
          overall_pct: Math.round((coveredCount / coreIndicators.length) * 100),
          completed_sections: Array.from(bySection.values()).filter(s => s.covered === s.total).length,
          total_sections: bySection.size,
        };
      }

      // 7) المؤشرات المخصصة التي عليها شاهد من شواهد الفترة — تُخبَز هنا حتى
      // يعرض التقرير شواهدها (Public.tsx لا يعرض شاهداً بلا مؤشر في قسمه)
      const periodIndicatorIds = new Set(rawEvidence.map(e => e.indicator_id).filter((id): id is string => !!id));
      const customIndicators = sections.flatMap(sec =>
        sec.indicators
          .filter(ind => ind.isCustom && periodIndicatorIds.has(ind.id))
          .map(ind => ({ id: ind.id, section_id: sec.id, name_ar: ind.name_ar }))
      );

      const generatedAt = new Date().toISOString();
      const snapshot: HarvestSnapshot = {
        state: {
          profile: state.profile,
          ...(completion ? { completion } : {}),
        },
        strategyNames,
        continuity: {
          yearStartMonth: state.yearStartMonth ?? 9,
          activeMonths,
        },
        evidence: scrubbedEvidence,
        resultsAnalysis,
        resultsComparisons,
        customIndicators,
        pointsLevel: {
          points: pointsLevel.points,
          levelId: pointsLevel.levelId,
          levelLabel: pointsLevel.levelLabel,
          levelIcon: pointsLevel.levelIcon,
        },
        periodLabel,
        periodFrom: from,
        periodTo: to,
        generatedAt,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('harvest_reports')
        .insert({
          portfolio_id: userId,
          period_label: periodLabel,
          period_from: from,
          period_to: to,
          snapshot,
        })
        .select('id')
        .single();
      if (insertErr) throw insertErr;

      // "/" ثابت — وليس window.location.pathname، بنفس إصلاح رابط ?share= السابق
      // (يمنع روابط مكسورة إن كان المعلم على مسار فرعي عند توليد التقرير).
      setResultUrl(`${window.location.origin}/?report=${inserted.id}`);
      onToast?.('تم توليد التقرير بنجاح', 'success');
    } catch (e) {
      console.error('[HarvestReportSheet] generate error:', e);
      onToast?.('فشل توليد التقرير، حاول مرة أخرى', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const periodBtn = (active: boolean) =>
    `w-full min-h-11 py-2 px-3 flex items-center justify-between gap-3 text-right rounded-[var(--r-sm)] border cursor-pointer transition-colors duration-150 ${active
      ? 'bg-[var(--s2)] border-[var(--bd2)]'
      : 'bg-transparent border-[var(--bd)] hover:bg-[var(--s2)]'}`;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex items-center justify-between gap-2 px-4 pb-3 border-b border-[var(--bd)] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-[var(--r-sm)] shrink-0 flex items-center justify-center bg-[var(--s2)] border border-[var(--bd)] text-[var(--t2)] text-[length:var(--fs-lg)]">
            <i className="ti ti-chart-bar-popular" />
          </div>
          <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">تقرير حصاد فصلي</div>
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={`${BTN_GH_SM} w-11 h-11 px-0`}>
          <i className="ti ti-x text-[length:var(--fs-lg)]" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4">
        {resultUrl ? (
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-14 h-14 rounded-[var(--r-full)] bg-[var(--s2)] border border-[var(--bd)] flex items-center justify-center text-[length:var(--fs-xl)] text-[var(--accent)]">
              <i className="ti ti-circle-check" />
            </div>
            <div>
              <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)] mb-1">تم توليد التقرير بنجاح</div>
              <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">
                هذا الرابط ثابت — لن يتغيّر بأي تعديل لاحق على شواهدك، وهو ما تراه أي جهة تفتحه لاحقاً.
              </p>
            </div>
            <div className="flex items-center w-full overflow-hidden rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)]">
              <button
                type="button"
                onClick={handleCopy}
                aria-label="نسخ الرابط"
                className="w-11 h-11 shrink-0 flex items-center justify-center text-[var(--t2)] hover:text-[var(--t1)] border-l border-[var(--bd)] transition-colors duration-150 cursor-pointer"
              >
                {copied ? <i className="ti ti-check text-[length:var(--fs-md)]" /> : <i className="ti ti-copy text-[length:var(--fs-md)]" />}
              </button>
              <div className="flex-1 min-w-0 px-3 text-[length:var(--fs-xs)] text-[var(--t2)] overflow-hidden text-ellipsis whitespace-nowrap text-left" dir="ltr">
                {resultUrl}
              </div>
            </div>
            <button type="button" onClick={() => setResultUrl(null)} className={BTN_GH_SM}>
              توليد تقرير آخر لمدى مختلف
            </button>
          </div>
        ) : (
          <>
            <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">
              اختر فصلاً دراسياً معتمداً أو مدى تواريخ مخصصاً — سيُبنى تقرير ثابت من شواهدك الموثّقة ضمن هذه الفترة فقط، برابط عام قابل للمشاركة لا يتأثر بأي تعديل لاحق على ملفك.
            </p>

            {semesterOptions.length > 0 && (
              <div>
                <div className={LABEL}>الفصول المتاحة</div>
                <div className="flex flex-col gap-2">
                  {semesterOptions.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSelectedKey(opt.key)}
                      className={periodBtn(selectedKey === opt.key)}
                    >
                      <div className="min-w-0">
                        <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{opt.label}</div>
                        <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">{formatArabicDate(opt.from)} – {formatArabicDate(opt.to)}</div>
                      </div>
                      {selectedKey === opt.key && <i className="ti ti-check text-[length:var(--fs-lg)] text-[var(--t1)] shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button type="button" onClick={() => setSelectedKey('custom')} className={periodBtn(isCustom)}>
                <div className="min-w-0">
                  <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">مدى مخصص</div>
                  <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">حدّد تاريخي البداية والنهاية يدوياً</div>
                </div>
                {isCustom && <i className="ti ti-check text-[length:var(--fs-lg)] text-[var(--t1)] shrink-0" />}
              </button>

              {isCustom && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <div className={LABEL}>من تاريخ</div>
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={FIELD} />
                  </div>
                  <div className="min-w-0">
                    <div className={LABEL}>إلى تاريخ</div>
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={FIELD} />
                  </div>
                </div>
              )}
              {isCustom && customFrom && customTo && !customRangeValid && (
                <div className="text-[length:var(--fs-xs)] font-bold text-[var(--danger)]">تاريخ البداية يجب أن يسبق تاريخ النهاية</div>
              )}
            </div>
          </>
        )}
      </div>

      {!resultUrl && (
        <div className="p-4 border-t border-[var(--bd)] bg-[var(--s1)] shrink-0">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || generating}
            className={`${BTN_PRI} w-full disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {generating ? (
              <><i className="ti ti-loader animate-spin text-[length:var(--fs-md)]" /> جاري توليد التقرير...</>
            ) : (
              <><i className="ti ti-file-report text-[length:var(--fs-md)]" /> توليد التقرير</>
            )}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
