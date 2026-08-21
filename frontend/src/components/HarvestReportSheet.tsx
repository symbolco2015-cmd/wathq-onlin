import { useEffect, useMemo, useState } from 'react';
import BottomSheet from './BottomSheet';
import { supabase } from '../supabaseClient';
import { SECS } from '../data';
import { calculatePointsLevelFromTotal, supabaseEvidenceTypeToLocal } from '../utils';
import type { AcademicDate, AppState, Evidence, HarvestSnapshot } from '../types';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import type { ResultsAnalysisRow } from './ResultsAnalysis/types';
import { toPublicResultsAnalysisRow, groupPublicAnalysesBySubject, buildPublicComparisonSeries } from './ResultsAnalysis/logic';

interface HarvestReportSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  state: Pick<AppState, 'profile' | 'strats' | 'yearStartMonth'>;
  academicDates?: AcademicDate[];
  onToast?: (msg: string, icon?: string) => void;
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
  new Date(`${dateStr}T12:00:00`).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

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
export default function HarvestReportSheet({ isOpen, onClose, userId, state, academicDates, onToast }: HarvestReportSheetProps) {
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

      // 2) أسماء المؤشرات (section_indicators — قراءة عامة مفعّلة) لبناء مفاتيح
      // ev/csubs ذات معنى بدل تجميع كل شواهد القسم تحت مفتاح واحد عام.
      const indicatorIds = Array.from(
        new Set(rawEvidence.map(e => e.indicator_id).filter((id): id is string => !!id))
      );
      const indicatorNames = new Map<string, string>();
      if (indicatorIds.length > 0) {
        const { data: indicators } = await supabase
          .from('section_indicators')
          .select('id, name_ar')
          .in('id', indicatorIds);
        (indicators || []).forEach((i: any) => indicatorNames.set(i.id, i.name_ar));
      }

      // 3) ev/csubs اصطناعيان مبنيان فقط من شواهد الفترة (وليس state.ev الحية،
      // التي تمثل كامل عمر الملف بلا حدود زمنية) — بهذا تعكس بطاقات "أقسام
      // الملف" ونسب الاكتمال في Public.tsx تغطية الفترة المختارة فعلياً.
      const ev: Record<string, Evidence[]> = {};
      const csubs: Record<number, string[]> = {};
      rawEvidence.forEach(row => {
        if (row.section_id == null) return; // مستبعد أصلاً بالاستعلام، حراسة إضافية فقط
        const subName = (row.indicator_id && indicatorNames.get(row.indicator_id)) || 'أدلة أخرى';
        const secStatic = SECS.find(s => s.id === row.section_id);
        const isKnownSub = secStatic?.subs.includes(subName);
        if (!isKnownSub) {
          if (!csubs[row.section_id]) csubs[row.section_id] = [];
          if (!csubs[row.section_id].includes(subName)) csubs[row.section_id].push(subName);
        }
        const key = `${row.section_id}|${subName}`;
        if (!ev[key]) ev[key] = [];
        ev[key].push({
          type: supabaseEvidenceTypeToLocal(row.evidence_type),
          name: row.title,
          url: row.file_url ?? row.link_url ?? undefined,
          date: new Date(row.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }),
        });
      });

      // 4) monthly_progress ضمن المدى — نفس تجميع get_shared_monthly_progress
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

      // 5) بند 10 (تحليل نتائج المتعلمين) ضمن الفترة — استعلام مالك مباشر على
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

      // 6) شارة اللقب/النقاط — من مجموع شواهد الفترة فقط، وليس نافذة "آخر 3
      // أشهر تقويمية" المعتادة في calculatePointsLevel (تلك مرتبطة بـ"اليوم"،
      // غير مناسبة لتقرير عن فترة قد تكون منتهية منذ زمن).
      const totalPoints = activeMonths.reduce((sum, m) => sum + m.evidenceCount, 0);
      const pointsLevel = calculatePointsLevelFromTotal(totalPoints);

      const generatedAt = new Date().toISOString();
      const snapshot: HarvestSnapshot = {
        state: {
          ev,
          strats: state.strats,
          csubs,
          profile: state.profile,
        },
        continuity: {
          yearStartMonth: state.yearStartMonth ?? 9,
          activeMonths,
        },
        evidence: scrubbedEvidence,
        resultsAnalysis,
        resultsComparisons,
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
      onToast?.('تم توليد التقرير بنجاح ✓', '✓');
    } catch (e) {
      console.error('[HarvestReportSheet] generate error:', e);
      onToast?.('فشل توليد التقرير، حاول مرة أخرى ❌', '❌');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-1 pb-4 border-b border-[var(--line)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--gold)]/25 to-[var(--gold2)]/15 text-[var(--gold3)] flex items-center justify-center text-[18px] border border-[var(--gold)]/25 shadow-[0_4px_14px_rgba(201,162,39,.25)]">
            <i className="ti ti-chart-bar-popular" />
          </div>
          <div className="text-[16px] font-black text-white">تقرير حصاد فصلي</div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-white/5 border border-[var(--line)] text-[var(--text4)] hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-[18px]"
        >
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-5 space-y-5">
        {resultUrl ? (
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-14 h-14 rounded-full bg-[var(--em7)]/15 border border-[var(--em7)]/30 flex items-center justify-center text-[26px] text-[var(--em8)]">
              <i className="ti ti-circle-check" />
            </div>
            <div>
              <div className="text-[15px] font-black text-white mb-1">تم توليد التقرير بنجاح</div>
              <p className="text-[12.5px] text-[var(--text3)] leading-relaxed">
                هذا الرابط ثابت — لن يتغيّر بأي تعديل لاحق على شواهدك، وهو ما تراه أي جهة تفتحه لاحقاً.
              </p>
            </div>
            <div className="flex w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surf0)]">
              <button
                onClick={handleCopy}
                className="bg-[var(--em7)]/20 hover:bg-[var(--em7)]/30 text-[var(--em8)] px-4 py-3 font-bold text-[13px] transition-colors whitespace-nowrap border-l border-[var(--line)] cursor-pointer"
              >
                {copied ? <i className="ti ti-check text-[16px]" /> : <i className="ti ti-copy text-[16px]" />}
              </button>
              <div className="flex-1 px-4 py-3 text-[12px] text-[var(--text4)] overflow-hidden text-ellipsis whitespace-nowrap bg-[var(--surf0)] text-left" dir="ltr">
                {resultUrl}
              </div>
            </div>
            <button
              onClick={() => setResultUrl(null)}
              className="text-[12.5px] font-bold text-[var(--text3)] hover:text-white transition-colors cursor-pointer"
            >
              توليد تقرير آخر لمدى مختلف
            </button>
          </div>
        ) : (
          <>
            <p className="text-[12.5px] text-[var(--text3)] leading-relaxed">
              اختر فصلاً دراسياً معتمداً أو مدى تواريخ مخصصاً — سيُبنى تقرير ثابت من شواهدك الموثّقة ضمن هذه الفترة فقط، برابط عام قابل للمشاركة لا يتأثر بأي تعديل لاحق على ملفك.
            </p>

            {semesterOptions.length > 0 && (
              <div className="space-y-2">
                <div className="text-[12px] font-bold text-[var(--text3)] tracking-wide uppercase">الفصول المتاحة</div>
                <div className="flex flex-col gap-2">
                  {semesterOptions.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSelectedKey(opt.key)}
                      className={`text-right py-3 px-4 rounded-xl border transition-all cursor-pointer ${
                        selectedKey === opt.key
                          ? 'border-[var(--gold)]/50 bg-[var(--gold)]/10'
                          : 'border-[var(--line2)] bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className={`text-[13.5px] font-bold ${selectedKey === opt.key ? 'text-[var(--gold3)]' : 'text-white'}`}>{opt.label}</div>
                      <div className="text-[11.5px] text-[var(--text4)] mt-0.5">{formatArabicDate(opt.from)} – {formatArabicDate(opt.to)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedKey('custom')}
                className={`w-full text-right py-3 px-4 rounded-xl border transition-all cursor-pointer ${
                  isCustom ? 'border-[var(--gold)]/50 bg-[var(--gold)]/10' : 'border-[var(--line2)] bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className={`text-[13.5px] font-bold ${isCustom ? 'text-[var(--gold3)]' : 'text-white'}`}>مدى مخصص</div>
                <div className="text-[11.5px] text-[var(--text4)] mt-0.5">حدّد تاريخي البداية والنهاية يدوياً</div>
              </button>

              {isCustom && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="text-[11.5px] font-bold text-[var(--text3)] mb-1.5">من تاريخ</div>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={e => setCustomFrom(e.target.value)}
                      className="w-full py-2.5 px-3 bg-white/5 border border-[var(--line2)] rounded-lg text-white text-[13px] outline-none focus:border-[var(--em7)]/40"
                    />
                  </div>
                  <div>
                    <div className="text-[11.5px] font-bold text-[var(--text3)] mb-1.5">إلى تاريخ</div>
                    <input
                      type="date"
                      value={customTo}
                      onChange={e => setCustomTo(e.target.value)}
                      className="w-full py-2.5 px-3 bg-white/5 border border-[var(--line2)] rounded-lg text-white text-[13px] outline-none focus:border-[var(--em7)]/40"
                    />
                  </div>
                </div>
              )}
              {isCustom && customFrom && customTo && !customRangeValid && (
                <div className="text-[11.5px] font-bold text-red-400">تاريخ البداية يجب أن يسبق تاريخ النهاية</div>
              )}
            </div>
          </>
        )}
      </div>

      {!resultUrl && (
        <div className="p-4 border-t border-[var(--line)] bg-[var(--surf0)] shrink-0">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || generating}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] font-black bg-gradient-to-br from-[var(--gold)] to-[var(--gold2)] text-[var(--em0)] border border-[var(--gold)]/30 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(201,162,39,.35)] transition-all duration-250 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {generating ? (
              <><i className="ti ti-loader animate-spin text-[16px]" /> جاري توليد التقرير...</>
            ) : (
              <><i className="ti ti-file-report text-[16px]" /> توليد التقرير</>
            )}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
