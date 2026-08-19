import { useEffect, useMemo, useState } from 'react';
import BottomSheet from '../BottomSheet';
import type { EvidenceFormProps } from '../EvidenceForm';
import UploadAnalysisSheet from './UploadAnalysisSheet';
import ResultsBarChart from './ResultsBarChart';
import ComparisonChart from './ComparisonChart';
import ConvertToEvidenceFlow from './ConvertToEvidenceFlow';
import { buildComparisonSeries, computeScoreGap, groupAnalysesBySubject, groupRemedialStudents } from './logic';
import type { AnalysisSummary, GradeBand, ResultsAnalysisRow } from './types';
import type { SectionData } from '../../types';

type SupabaseEvidenceHook = ReturnType<typeof import('../../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface AnalysisSectionCardProps {
  section: SectionData;
  sections: SectionData[];
  userId: string | undefined;
  supabaseEv?: SupabaseEvidenceHook;
  gradeBands: GradeBand[];
  analyses: ResultsAnalysisRow[];
  loading: boolean;
  saveAnalysis: (subject: string, classSection: string | null, summary: AnalysisSummary) => Promise<ResultsAnalysisRow | null>;
  onAddEv?: EvidenceFormProps['onAddEv'];
  onToast?: (msg: string, icon?: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  /** معرّف تحليل يجب فتح تبويبه مباشرة — يصل من بطاقة "تحسين نتائج المتعلمين"
   *  عبر زر "اعرض السياق الكامل". يُستهلك مرة واحدة ثم يُعاد تصفيره بالمستدعي. */
  focusAnalysisId: string | null;
  onFocusHandled: () => void;
}

type Tab =
  | { kind: 'analysis'; id: string; label: string; analysis: ResultsAnalysisRow }
  | { kind: 'compare'; id: string; label: string; subject: string };

/**
 * بطاقة بند 10 "تحليل نتائج المتعلمين" — مثبّتة دائماً خارج شبكة الأقسام
 * الـ11 (نفس معاملة قسم الاستراتيجيات)، محتواها بالكامل أداة تحليل النتائج:
 * تبويب لكل تحليل محفوظ + تبويب "مقارنة" تلقائي لكل مادة لها تحليلان فأكثر.
 */
export default function AnalysisSectionCard({
  section, sections, userId, supabaseEv, gradeBands, analyses, loading,
  saveAnalysis, onAddEv, onToast, isOpen, onToggle, focusAnalysisId, onFocusHandled,
}: AnalysisSectionCardProps) {
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
    if (!isOpen) onToggle();
    onFocusHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAnalysisId]);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;

  if (loading) return null;

  return (
    <div id={`sc-${section.id}`} className="relative bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[16px] sm:rounded-[20px] border border-[var(--line)] overflow-hidden transition-all duration-300 hover:border-[var(--line2)]" style={{ scrollMarginTop: '90px' }}>
      <div className="flex items-center gap-2 sm:gap-4 py-3 sm:py-5 px-3 sm:px-6 cursor-pointer relative select-none hover:bg-white/5 group" onClick={onToggle}>
        <div className={`w-[32px] h-[32px] sm:w-[42px] sm:h-[42px] rounded-lg sm:rounded-xl shrink-0 flex items-center justify-center text-[15px] sm:text-[20px] border transition-all duration-350 ${analyses.length > 0 ? 'bg-[var(--em7)]/10 text-[var(--em8)] border-[var(--em7)]/20' : 'bg-white/5 text-[var(--text4)] border-[var(--line2)]'}`}>
          <i className={`ti ${section.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] sm:text-[16px] font-extrabold text-white font-[var(--font)] leading-tight">{section.ttl}</div>
          <div className={`flex items-center gap-1.5 mt-1 sm:mt-1.5 text-[10.5px] sm:text-[11.5px] font-bold ${analyses.length > 0 ? 'text-[var(--em8)]' : 'text-[var(--text4)]'}`}>
            <i className={`ti ${analyses.length > 0 ? 'ti-circle-check' : 'ti-circle-dashed'} text-[11px]`} />
            {analyses.length > 0 ? `${analyses.length} تحليل محفوظ` : 'لا تحليلات بعد'}
          </div>
        </div>
        <i className={`ti ti-chevron-down text-[22px] shrink-0 transition-all duration-400 ${isOpen ? 'rotate-180 text-[var(--em7)]' : 'text-[var(--text4)]'}`} />
      </div>

      <div className={`overflow-hidden transition-all duration-500 ease-[var(--ease)] ${isOpen ? 'max-h-[9999px] opacity-100 border-t border-[var(--line)]' : 'max-h-0 opacity-0 border-t-0'}`}>
        <div className="py-5 px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
              {tabs.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTabId(t.id)}
                  className={`shrink-0 py-2 px-3.5 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    activeTabId === t.id
                      ? t.kind === 'compare'
                        ? 'bg-[var(--gold)]/15 border-[var(--gold)]/40 text-[var(--gold3)]'
                        : 'bg-[var(--em7)]/15 border-[var(--em7)]/40 text-[var(--em8)]'
                      : 'bg-white/5 border-[var(--line2)] text-[var(--text3)] hover:bg-white/10'
                  }`}
                >
                  {t.kind === 'compare' && <i className="ti ti-chart-line ml-1" />}
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setUploadOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-[12.5px] font-bold bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white border border-[var(--em7)]/30 hover:-translate-y-0.5 transition-all duration-250 cursor-pointer font-[var(--font)] active:scale-95"
            >
              <i className="ti ti-upload text-[14px]" /> رفع {analyses.length > 0 ? 'جديد' : 'كشف درجات'}
            </button>
          </div>

          {tabs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-[22px] text-[var(--text4)] mb-3">
                <i className="ti ti-chart-dots-off" />
              </div>
              <p className="text-[var(--text3)] text-[13.5px]">ارفع أول كشف درجات لبدء التحليل</p>
            </div>
          )}

          {activeTab?.kind === 'compare' && (
            <div id="analysis-print-target" className="print-card bg-white/3 border border-[var(--line2)] rounded-2xl p-4">
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
        </div>
      </div>

      <BottomSheet isOpen={uploadOpen} onClose={() => setUploadOpen(false)}>
        <UploadAnalysisSheet
          onClose={() => setUploadOpen(false)}
          bands={gradeBands}
          saveAnalysis={saveAnalysis}
          onSaved={(row) => { setUploadOpen(false); setActiveTabId(row.id); if (!isOpen) onToggle(); }}
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
          onAddEv={onAddEv ?? (() => {})}
          onToast={onToast ?? noToast}
          onClose={() => setConvertOpen(false)}
        />
      )}
    </div>
  );
}

interface AnalysisTabBodyProps {
  analysis: ResultsAnalysisRow;
  bands: GradeBand[];
  onConvertClick: () => void;
}

function AnalysisTabBody({ analysis, bands, onConvertClick }: AnalysisTabBodyProps) {
  const weakBand = bands[bands.length - 1];
  const gap = computeScoreGap(analysis.summary.students);
  const remedial = groupRemedialStudents(analysis.summary.students, weakBand?.id);
  const dateLabel = new Date(analysis.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

  const handlePrint = () => window.print();

  return (
    <div id="analysis-print-target" className="print-card space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12px] text-[var(--text4)]">{dateLabel}</div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={onConvertClick}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg bg-[var(--gold)]/10 border border-[var(--gold)]/25 text-[var(--gold3)] text-[12px] font-bold cursor-pointer hover:bg-[var(--gold)]/15 transition-colors"
          >
            <i className="ti ti-photo-share" /> تحويل لشاهد
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg bg-white/5 border border-[var(--line2)] text-[var(--text2)] text-[12px] font-bold cursor-pointer hover:bg-white/10 transition-colors"
          >
            <i className="ti ti-printer" /> طباعة / تصدير
          </button>
        </div>
      </div>

      <div className="bg-white/3 border border-[var(--line2)] rounded-2xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
          <div>
            <div className="text-[20px] font-black text-white">{analysis.summary.totalStudents}</div>
            <div className="text-[10.5px] text-[var(--text4)] mt-0.5">طالب</div>
          </div>
          <div>
            <div className="text-[20px] font-black text-[var(--em8)]">{analysis.summary.average.toFixed(1)}</div>
            <div className="text-[10.5px] text-[var(--text4)] mt-0.5">المتوسط</div>
          </div>
          <div>
            <div className="text-[20px] font-black text-white">{gap.toFixed(1)}</div>
            <div className="text-[10.5px] text-[var(--text4)] mt-0.5">مؤشر الفجوة</div>
          </div>
          <div>
            <div className="text-[20px] font-black text-white">{analysis.summary.stdDev.toFixed(1)}</div>
            <div className="text-[10.5px] text-[var(--text4)] mt-0.5">الانحراف المعياري</div>
          </div>
        </div>
        <ResultsBarChart summary={analysis.summary} bands={bands} />
      </div>

      {(remedial.nearSuccess.length > 0 || remedial.largerGap.length > 0) && (
        <div className="bg-white/3 border border-[var(--line2)] rounded-2xl p-4">
          <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-widest uppercase mb-3">التجميع العلاجي</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--gold)]/8 border border-[var(--gold)]/20 rounded-xl p-3 text-center">
              <div className="text-[20px] font-black text-[var(--gold3)]">{remedial.nearSuccess.length}</div>
              <div className="text-[11px] text-[var(--text3)] mt-0.5">قريبون من النجاح</div>
            </div>
            <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3 text-center">
              <div className="text-[20px] font-black text-red-400">{remedial.largerGap.length}</div>
              <div className="text-[11px] text-[var(--text3)] mt-0.5">فجوة أكبر</div>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-widest uppercase mb-2.5">الطلاب ({analysis.summary.totalStudents})</div>
        <div className="rounded-2xl border border-[var(--line2)] overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-[var(--line)]">
            {analysis.summary.students.map((s, i) => {
              const band = bands.find(b => b.id === s.bandId);
              return (
                <div key={i} className="flex items-center justify-between gap-3 py-2.5 px-3.5 text-[12.5px]">
                  <span className="text-white font-semibold truncate">{s.name}{s.section ? ` · ${s.section}` : ''}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.inDangerZone && <i className="ti ti-alert-triangle text-[13px] text-[var(--gold3)]" title="ضمن منطقة الخطر" />}
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
