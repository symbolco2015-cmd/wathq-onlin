import type { EvidenceFormProps } from '../EvidenceForm';
import ResultsBarChart from './ResultsBarChart';
import type { SmartCheckResult } from './useResultsAnalysis';
import type { GradeBand, ResultsAnalysisRow } from './types';
import type { SectionData } from '../../types';

type SupabaseEvidenceHook = ReturnType<typeof import('../../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface AnalysisDetailSheetProps {
  analysis: ResultsAnalysisRow;
  bands: GradeBand[];
  sections: SectionData[];
  userId: string | undefined;
  supabaseEv: SupabaseEvidenceHook;
  onAddEv: EvidenceFormProps['onAddEv'];
  onToast: (msg: string, icon?: string) => void;
  runSmartCheck: (analysis: ResultsAnalysisRow, kind: 'remedial' | 'honor') => Promise<SmartCheckResult>;
  onClose: () => void;
}

export default function AnalysisDetailSheet({
  analysis, bands, onClose,
}: AnalysisDetailSheetProps) {
  const dateLabel = new Date(analysis.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <div className="absolute top-0 right-[10%] left-[10%] h-[1.5px] bg-gradient-to-r from-transparent via-[var(--em7)] to-transparent" />
      <div className="flex items-center gap-4 px-7 pt-7 pb-5 border-b border-[var(--line)] shrink-0">
        <div className="w-[48px] h-[48px] rounded-2xl bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] flex items-center justify-center text-[22px] border border-[var(--em7)]/20">
          <i className="ti ti-chart-dots" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-black text-white truncate">{analysis.subject}</div>
          <div className="text-[12px] text-[var(--text4)] mt-0.5">
            {analysis.class_section ? `${analysis.class_section} · ` : ''}{dateLabel}
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/5 border border-[var(--line)] text-[var(--text4)] hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-[18px]">
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-7 py-6 space-y-6">
        {/* بند 1 — الرسم والإحصاءات */}
        <section>
          <div className="bg-white/3 border border-[var(--line2)] rounded-2xl p-4">
            <ResultsBarChart summary={analysis.summary} bands={bands} />
          </div>
        </section>

        {/* جدول الطلاب — الأسماء ظاهرة كاملة دائماً في هذا التدفق */}
        <section>
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
        </section>
      </div>
    </>
  );
}
