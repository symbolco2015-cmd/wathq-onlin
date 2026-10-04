import { useEffect, useMemo, useState } from 'react';
import BottomSheet from '../BottomSheet';
import type { EvidenceFormProps } from '../EvidenceForm';
import { BTN_SM, BTN_GH_SM, BTN_PRI_SM } from '../SectionView';
import UploadAnalysisSheet from './UploadAnalysisSheet';
import ResultsBarChart from './ResultsBarChart';
import ComparisonChart from './ComparisonChart';
import ConvertToEvidenceFlow from './ConvertToEvidenceFlow';
import { buildComparisonSeries, computeScoreGap, groupAnalysesBySubject, groupRemedialStudents } from './logic';
import type { AnalysisSummary, GradeBand, ResultsAnalysisRow } from './types';
import type { SectionData } from '../../types';
import { formatDate } from '../../utils';

type SupabaseEvidenceHook = ReturnType<typeof import('../../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface AnalysisSectionCardProps {
  section: SectionData;
  analysisCount: number;
  loading: boolean;
  onOpen: () => void;
}

/**
 * رأس بند 10 "تحليل نتائج المتعلمين" في الرئيسية — مثبّت خارج شبكة الأقسام
 * (نفس معاملة قسم الاستراتيجيات). الضغط يفتح شاشة القسم (3.5د)، والأداة نفسها
 * في AnalysisSectionBody أدناه.
 */
export default function AnalysisSectionCard({ section, analysisCount, loading, onOpen }: AnalysisSectionCardProps) {
  if (loading) return null;

  return (
    <div id={`sc-${section.id}`} className="relative bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[16px] sm:rounded-[20px] border border-[var(--line)] overflow-hidden transition-all duration-300 hover:border-[var(--line2)]" style={{ scrollMarginTop: '90px', borderRight: '4px solid var(--violet)' }}>
      <div className="flex items-center gap-2 sm:gap-4 py-3 sm:py-5 px-3 sm:px-6 cursor-pointer relative select-none hover:bg-white/5 group" onClick={onOpen}>
        <div className={`w-[32px] h-[32px] sm:w-[42px] sm:h-[42px] rounded-lg sm:rounded-xl shrink-0 flex items-center justify-center text-[15px] sm:text-[20px] border transition-all duration-350 ${analysisCount > 0 ? 'bg-[var(--em7)]/10 text-[var(--em8)] border-[var(--em7)]/20' : 'bg-white/5 text-[var(--text4)] border-[var(--line2)]'}`}>
          <i className={`ti ${section.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] sm:text-[16px] font-extrabold text-white font-[var(--font)] leading-tight">{section.ttl}</div>
          <div className={`flex items-center gap-1.5 mt-1 sm:mt-1.5 text-[10.5px] sm:text-[11.5px] font-bold ${analysisCount > 0 ? 'text-[var(--em8)]' : 'text-[var(--text4)]'}`}>
            <i className={`ti ${analysisCount > 0 ? 'ti-circle-check' : 'ti-circle-dashed'} text-[11px]`} />
            {analysisCount > 0 ? `${analysisCount} تحليل محفوظ` : 'لا تحليلات بعد'}
          </div>
        </div>
        <i className="ti ti-chevron-left text-[22px] shrink-0 text-[var(--text4)]" />
      </div>
    </div>
  );
}

interface AnalysisSectionBodyProps {
  sections: SectionData[];
  userId: string | undefined;
  supabaseEv?: SupabaseEvidenceHook;
  gradeBands: GradeBand[];
  analyses: ResultsAnalysisRow[];
  saveAnalysis: (subject: string, classSection: string | null, summary: AnalysisSummary) => Promise<ResultsAnalysisRow | null>;
  onEvidenceSaved?: EvidenceFormProps['onEvidenceSaved'];
  onToast?: (msg: string, icon?: string) => void;
  /** معرّف تحليل يجب فتح تبويبه مباشرة — يصل من بطاقة "تحسين نتائج المتعلمين"
   *  عبر زر "اعرض السياق الكامل". يُستهلك مرة واحدة ثم يُعاد تصفيره بالمستدعي. */
  focusAnalysisId: string | null;
  onFocusHandled: () => void;
}

type Tab =
  | { kind: 'analysis'; id: string; label: string; analysis: ResultsAnalysisRow }
  | { kind: 'compare'; id: string; label: string; subject: string };

/**
 * جسم شاشة بند 10 — أداة تحليل النتائج: تبويب لكل تحليل محفوظ + تبويب
 * "مقارنة" تلقائي لكل مادة لها تحليلان فأكثر. يُركَّب فقط بعد انتهاء التحميل
 * (الشاشة تعرض "جارٍ التحميل…" قبله)، فطلب التركيز يجد تبويباته من أول render.
 */
export function AnalysisSectionBody({
  sections, userId, supabaseEv, gradeBands, analyses,
  saveAnalysis, onEvidenceSaved, onToast, focusAnalysisId, onFocusHandled,
}: AnalysisSectionBodyProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const noToast = () => {};

  const subjectGroups = useMemo(() => groupAnalysesBySubject(analyses), [analyses]);

  const tabs = useMemo<Tab[]>(() => {
    const analysisTabs: Tab[] = analyses.map(a => ({
      kind: 'analysis',
      id: a.id,
      label: `${a.subject}${a.class_section ? ' · ' + a.class_section : ''}`,
      analysis: a,
    }));
    const compareTabs: Tab[] = Array.from(subjectGroups.entries())
      .filter(([, list]) => list.length >= 2)
      .map(([subject]) => ({ kind: 'compare' as const, id: `compare:${subject}`, label: `مقارنة · ${subject}`, subject }));
    return [...analysisTabs, ...compareTabs];
  }, [analyses, subjectGroups]);

  // تبويب افتراضي: أول تحليل عند التحميل، ما لم يوجد طلب تركيز صريح من بطاقة
  // "تحسين نتائج المتعلمين" (بند 5) — ذلك الطلب له الأولوية دائماً.
  useEffect(() => {
    if (activeTabId && tabs.some(t => t.id === activeTabId)) return;
    if (tabs.length > 0) setActiveTabId(tabs[0].id);
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (!focusAnalysisId) return;
    if (!tabs.some(t => t.id === focusAnalysisId)) return;
    setActiveTabId(focusAnalysisId);
    onFocusHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAnalysisId]);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTabId(t.id)}
              className={`shrink-0 h-9 px-3 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border text-[length:var(--fs-sm)] font-bold whitespace-nowrap cursor-pointer ${
                activeTabId === t.id
                  ? 'bg-[var(--s2)] border-[var(--bd2)] text-[var(--t1)]'
                  : 'border-[var(--bd)] text-[var(--t2)]'
              }`}
            >
              {t.kind === 'compare' && <i className="ti ti-chart-line text-[16px]" />}
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setUploadOpen(true)} className={`${BTN_PRI_SM} shrink-0`}>
          <i className="ti ti-upload text-[16px]" /> رفع {analyses.length > 0 ? 'جديد' : 'كشف درجات'}
        </button>
      </div>

      {tabs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-14 h-14 rounded-[var(--r-full)] bg-[var(--s2)] flex items-center justify-center text-[32px] text-[var(--t3)] mb-3">
            <i className="ti ti-chart-dots-off" />
          </div>
          <p className="text-[length:var(--fs-sm)] text-[var(--t2)]">ارفع أول كشف درجات لبدء التحليل</p>
        </div>
      )}

      {activeTab?.kind === 'compare' && (
        <div id="analysis-print-target" className="print-card bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
          <ComparisonChart subject={activeTab.subject} series={buildComparisonSeries(analyses, activeTab.subject)} />
        </div>
      )}

      {activeTab?.kind === 'analysis' && (
        <AnalysisTabBody
          analysis={activeTab.analysis}
          bands={gradeBands}
          onConvertClick={() => setConvertOpen(true)}
        />
      )}

      <BottomSheet isOpen={uploadOpen} onClose={() => setUploadOpen(false)}>
        <UploadAnalysisSheet
          onClose={() => setUploadOpen(false)}
          bands={gradeBands}
          saveAnalysis={saveAnalysis}
          onSaved={(row) => { setUploadOpen(false); setActiveTabId(row.id); }}
          onToast={onToast ?? noToast}
        />
      </BottomSheet>

      {convertOpen && activeTab?.kind === 'analysis' && userId && supabaseEv && (
        <ConvertToEvidenceFlow
          analysis={activeTab.analysis}
          bands={gradeBands}
          sections={sections}
          userId={userId}
          supabaseEv={supabaseEv}
          onEvidenceSaved={onEvidenceSaved ?? (() => {})}
          onToast={onToast ?? noToast}
          onClose={() => setConvertOpen(false)}
        />
      )}
    </>
  );
}

interface AnalysisTabBodyProps {
  analysis: ResultsAnalysisRow;
  bands: GradeBand[];
  onConvertClick: () => void;
}

const STAT_NUM = 'text-[length:var(--fs-lg)] font-bold text-[var(--t1)]';
const STAT_LABEL = 'text-[length:var(--fs-xs)] text-[var(--t3)] mt-1';
const BLOCK_TITLE = 'text-[length:var(--fs-xs)] font-bold text-[var(--t3)]';

function AnalysisTabBody({ analysis, bands, onConvertClick }: AnalysisTabBodyProps) {
  const weakBand = bands[bands.length - 1];
  const gap = computeScoreGap(analysis.summary.students);
  const remedial = groupRemedialStudents(analysis.summary.students, weakBand?.id);
  const dateLabel = formatDate(analysis.created_at, 'long');

  const handlePrint = () => window.print();

  return (
    <div id="analysis-print-target" className="print-card space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[length:var(--fs-xs)] text-[var(--t3)]">{dateLabel}</div>
        <div className="flex items-center gap-2 print:hidden">
          <button type="button" onClick={onConvertClick} className={BTN_SM.replace('self-start ', '')}>
            <i className="ti ti-photo-share text-[16px]" /> تحويل لشاهد
          </button>
          <button type="button" onClick={handlePrint} className={BTN_GH_SM}>
            <i className="ti ti-printer text-[16px]" /> طباعة / تصدير
          </button>
        </div>
      </div>

      <div className="bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
          <div>
            <div className={STAT_NUM}>{analysis.summary.totalStudents}</div>
            <div className={STAT_LABEL}>طالب</div>
          </div>
          <div>
            <div className={STAT_NUM}>{analysis.summary.average.toFixed(1)}</div>
            <div className={STAT_LABEL}>المتوسط</div>
          </div>
          <div>
            <div className={STAT_NUM}>{gap.toFixed(1)}</div>
            <div className={STAT_LABEL}>مؤشر الفجوة</div>
          </div>
          <div>
            <div className={STAT_NUM}>{analysis.summary.stdDev.toFixed(1)}</div>
            <div className={STAT_LABEL}>الانحراف المعياري</div>
          </div>
        </div>
        <ResultsBarChart summary={analysis.summary} bands={bands} />
      </div>

      {(remedial.nearSuccess.length > 0 || remedial.largerGap.length > 0) && (
        <div className="bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
          <div className={`${BLOCK_TITLE} mb-3`}>التجميع العلاجي</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--s2)] border border-[var(--warn)]/35 rounded-[var(--r-sm)] p-3 text-center">
              <div className="text-[length:var(--fs-lg)] font-bold text-[var(--warn)]">{remedial.nearSuccess.length}</div>
              <div className="text-[length:var(--fs-xs)] text-[var(--t2)] mt-1">قريبون من النجاح</div>
            </div>
            <div className="bg-[var(--s2)] border border-[var(--danger)]/35 rounded-[var(--r-sm)] p-3 text-center">
              <div className="text-[length:var(--fs-lg)] font-bold text-[var(--danger)]">{remedial.largerGap.length}</div>
              <div className="text-[length:var(--fs-xs)] text-[var(--t2)] mt-1">فجوة أكبر</div>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className={`${BLOCK_TITLE} mb-2`}>الطلاب ({analysis.summary.totalStudents})</div>
        <div className="rounded-[var(--r-md)] border border-[var(--bd)] overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-[var(--bd)]">
            {analysis.summary.students.map((s, i) => {
              const band = bands.find(b => b.id === s.bandId);
              return (
                <div key={i} className="flex items-center justify-between gap-3 py-2.5 px-3.5 text-[length:var(--fs-sm)]">
                  <span className="text-[var(--t1)] truncate">{s.name}{s.section ? ` · ${s.section}` : ''}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.inDangerZone && <i className="ti ti-alert-triangle text-[16px] text-[var(--warn)]" title="ضمن منطقة الخطر" />}
                    <span className="font-bold" style={{ color: band?.color }}>{s.score}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
