import { useState } from 'react';
import BottomSheet from '../BottomSheet';
import type { EvidenceFormProps } from '../EvidenceForm';
import { useResultsAnalysis } from './useResultsAnalysis';
import UploadAnalysisSheet from './UploadAnalysisSheet';
import AnalysisDetailSheet from './AnalysisDetailSheet';
import type { ResultsAnalysisRow } from './types';
import type { SectionData } from '../../types';

type SupabaseEvidenceHook = ReturnType<typeof import('../../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface ResultsAnalysisCardProps {
  userId: string | undefined;
  sections: SectionData[];
  supabaseEv?: SupabaseEvidenceHook;
  onAddEv?: EvidenceFormProps['onAddEv'];
  onToast?: (msg: string, icon?: string) => void;
}

/**
 * أداة تحليل وتحسين نتائج المتعلمين — بطاقة مستقلة تماماً عن شبكة الأقسام
 * الـ11 (لا تُحتسب ضمن أي نسبة تقدّم موجودة). تُعرض فوق شبكة الأقسام مباشرة.
 */
export default function ResultsAnalysisCard({ userId, sections, supabaseEv, onAddEv, onToast }: ResultsAnalysisCardProps) {
  const { gradeBands, analyses, loading, saveAnalysis, runSmartCheck } = useResultsAnalysis(userId);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailAnalysis, setDetailAnalysis] = useState<ResultsAnalysisRow | null>(null);

  const noToast = () => {};

  if (!userId || !supabaseEv || loading) return null;

  return (
    <>
      <div
        className="mb-5 rounded-[22px] p-5 sm:p-6 border border-[var(--em7)]/25 bg-gradient-to-br from-[var(--em7)]/10 via-[var(--surf3)] to-[var(--surf3)] relative overflow-hidden"
        style={{ animation: 'fadeUp .55s var(--sp) both 0.04s' }}
      >
        <div className="absolute top-0 right-0 left-0 h-[1.5px] bg-gradient-to-r from-transparent via-[var(--em7)]/40 to-transparent" />
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-1">
            <div className="flex items-center gap-3.5 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-xl shrink-0 bg-[var(--em7)]/10 border border-[var(--em7)]/20 flex items-center justify-center text-[22px] text-[var(--em8)]">
                <i className="ti ti-chart-dots" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-[var(--em8)]/80 tracking-wider uppercase mb-0.5 flex items-center gap-1.5">
                  <i className="ti ti-sparkles text-[12px]" /> أداة تحليل نتائج المتعلمين
                </div>
                <div className="text-[15px] font-extrabold text-white leading-snug">
                  {analyses.length === 0 ? 'ارفع أول كشف درجات لبدء التحليل' : `${analyses.length} تحليل محفوظ`}
                </div>
              </div>
            </div>
            <button
              onClick={() => setUploadOpen(true)}
              className="shrink-0 inline-flex items-center gap-2 py-3 px-6 rounded-xl text-[13px] font-bold bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white border border-[var(--em7)]/30 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(42,122,68,.35)] transition-all duration-250 cursor-pointer font-[var(--font)] active:scale-95"
            >
              <i className="ti ti-upload text-[15px]" /> رفع كشف {analyses.length > 0 ? 'جديد' : 'درجات'}
            </button>
          </div>

          {analyses.length > 0 && (
            <div className="mt-4 space-y-2">
              {analyses.map(a => (
                <button
                  key={a.id}
                  onClick={() => setDetailAnalysis(a)}
                  className="w-full flex items-center justify-between gap-3 py-2.5 px-3.5 rounded-xl bg-white/4 border border-[var(--line2)] hover:bg-white/8 hover:border-[var(--em7)]/30 transition-all duration-200 cursor-pointer text-right"
                >
                  <span className="text-[12.5px] font-bold text-white truncate">
                    {a.subject}{a.class_section ? ` · ${a.class_section}` : ''}
                  </span>
                  <span className="text-[11px] text-[var(--text4)] shrink-0">
                    {new Date(a.created_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomSheet isOpen={uploadOpen} onClose={() => setUploadOpen(false)}>
        <UploadAnalysisSheet
          onClose={() => setUploadOpen(false)}
          bands={gradeBands}
          saveAnalysis={saveAnalysis}
          onSaved={(row) => { setUploadOpen(false); setDetailAnalysis(row); }}
          onToast={onToast ?? noToast}
        />
      </BottomSheet>

      <BottomSheet isOpen={!!detailAnalysis} onClose={() => setDetailAnalysis(null)}>
        {detailAnalysis && (
          <AnalysisDetailSheet
            analysis={detailAnalysis}
            bands={gradeBands}
            sections={sections}
            userId={userId}
            supabaseEv={supabaseEv}
            onAddEv={onAddEv ?? (() => {})}
            onToast={onToast ?? noToast}
            runSmartCheck={runSmartCheck}
            onClose={() => setDetailAnalysis(null)}
          />
        )}
      </BottomSheet>
    </>
  );
}
