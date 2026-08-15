import { useState } from 'react';
import EvidenceModal from '../EvidenceModal';
import type { EvidenceFormProps } from '../EvidenceForm';
import ResultsBarChart from './ResultsBarChart';
import ConvertToEvidenceFlow from './ConvertToEvidenceFlow';
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

// القسم الأنسب دلالياً من الـ11 القسم لشواهد بند 2 (لا علاقة له بتدفق
// "تحويل لشاهد" العام الذي يختار المعلم قسمه بحرّية) — "تحسين نتائج المتعلمين".
const IMPROVEMENT_SECTION_ID = 5;
const REMEDIAL_SUB = 'خطط علاجية وإثرائية';
const HONOR_SUB = 'تكريم المتميزين';

type SmartCheckKind = 'remedial' | 'honor';
interface SmartCheckState { loading: boolean; result: SmartCheckResult | null; }

export default function AnalysisDetailSheet({
  analysis, bands, sections, userId, supabaseEv, onAddEv, onToast, runSmartCheck, onClose,
}: AnalysisDetailSheetProps) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [addEvidenceTarget, setAddEvidenceTarget] = useState<{ open: boolean; sub: string }>({ open: false, sub: '' });
  const [checks, setChecks] = useState<Record<SmartCheckKind, SmartCheckState>>({
    remedial: { loading: false, result: null },
    honor: { loading: false, result: null },
  });

  const excellentBand = bands[0];
  const weakBand = bands[bands.length - 1];
  const weakCount = weakBand ? analysis.summary.bandCounts[weakBand.id] ?? 0 : 0;
  const excellentCount = excellentBand ? analysis.summary.bandCounts[excellentBand.id] ?? 0 : 0;

  const handleSmartCheck = async (kind: SmartCheckKind) => {
    setChecks(prev => ({ ...prev, [kind]: { loading: true, result: null } }));
    const result = await runSmartCheck(analysis, kind);
    setChecks(prev => ({ ...prev, [kind]: { loading: false, result } }));
  };

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
          <button
            onClick={() => setConvertOpen(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--gold)]/10 border border-[var(--gold)]/25 text-[var(--gold3)] text-[12.5px] font-bold cursor-pointer hover:bg-[var(--gold)]/15 transition-colors"
          >
            <i className="ti ti-photo-share" /> تحويل لشاهد
          </button>
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

        {/* بند 2 — تحسين نتائج المتعلمين */}
        <section className="space-y-3">
          <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-widest uppercase">تحسين نتائج المتعلمين</div>

          {weakCount > 0 && (
            <AlertCard
              icon="ti-alert-circle"
              title={`${weakCount} طالب في فئة "${weakBand.label}"`}
              subtitle="هل وثّقت خطة علاجية؟"
              check={checks.remedial}
              onSmartCheck={() => handleSmartCheck('remedial')}
              onAddEvidence={() => setAddEvidenceTarget({ open: true, sub: REMEDIAL_SUB })}
            />
          )}

          {excellentCount > 0 && (
            <AlertCard
              icon="ti-award"
              title={`${excellentCount} طالب متفوق في فئة "${excellentBand.label}"`}
              subtitle="هل قدّمت تكريماً؟"
              check={checks.honor}
              onSmartCheck={() => handleSmartCheck('honor')}
              onAddEvidence={() => setAddEvidenceTarget({ open: true, sub: HONOR_SUB })}
            />
          )}

          {analysis.summary.inflationDetected && (
            <div className="flex items-start gap-2.5 bg-[var(--gold)]/8 border border-[var(--gold)]/20 rounded-2xl p-4">
              <i className="ti ti-info-circle text-[18px] text-[var(--gold3)] shrink-0 mt-0.5" />
              <div>
                <div className="text-[13px] font-extrabold text-white">مؤشرات تضخم في الدرجات</div>
                <div className="text-[12px] text-[var(--text3)] mt-1 leading-relaxed">
                  نسبة كبيرة من الدرجات مرتفعة جداً أو تكدّس ضعيف بين الطلاب — يُنصح بتنويع أدوات التقييم (مهام أدائية، مشاريع، اختبارات قصيرة) لقياس الفروق الفردية بدقة أكبر.
                </div>
              </div>
            </div>
          )}

          {weakCount === 0 && excellentCount === 0 && !analysis.summary.inflationDetected && (
            <div className="text-[12.5px] text-[var(--text4)] py-2">لا تنبيهات حالياً لهذا التحليل.</div>
          )}
        </section>
      </div>

      {convertOpen && (
        <ConvertToEvidenceFlow
          analysis={analysis}
          bands={bands}
          sections={sections}
          userId={userId}
          supabaseEv={supabaseEv}
          onAddEv={onAddEv}
          onToast={onToast}
          onClose={() => setConvertOpen(false)}
        />
      )}

      {addEvidenceTarget.open && (
        <EvidenceModal
          isOpen
          onClose={() => setAddEvidenceTarget({ open: false, sub: '' })}
          sectionId={IMPROVEMENT_SECTION_ID}
          sub={addEvidenceTarget.sub}
          userId={userId}
          supabaseEv={supabaseEv}
          onAddEv={onAddEv}
          onToast={onToast}
        />
      )}
    </>
  );
}

interface AlertCardProps {
  icon: string;
  title: string;
  subtitle: string;
  check: SmartCheckState;
  onSmartCheck: () => void;
  onAddEvidence: () => void;
}

function AlertCard({ icon, title, subtitle, check, onSmartCheck, onAddEvidence }: AlertCardProps) {
  return (
    <div className="bg-white/3 border border-[var(--line2)] rounded-2xl p-4">
      <div className="flex items-start gap-2.5">
        <i className={`ti ${icon} text-[18px] text-[var(--gold3)] shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-extrabold text-white">{title}</div>
          <div className="text-[12px] text-[var(--text3)] mt-0.5">{subtitle}</div>
        </div>
      </div>

      {check.result ? (
        check.result.found ? (
          <div className="flex items-center gap-2 mt-3 bg-[var(--em7)]/10 border border-[var(--em7)]/25 rounded-xl px-3 py-2.5">
            <i className="ti ti-circle-check text-[16px] text-[var(--em8)]" />
            <span className="text-[12px] text-[var(--em8)] font-semibold truncate">وُثِّق مسبقاً: {check.result.evidenceTitle}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 mt-3 bg-[var(--gold)]/10 border border-[var(--gold)]/25 rounded-xl px-3 py-2.5">
            <span className="text-[12px] text-[var(--gold3)] font-semibold">لم يُعثر على شاهد بهذا الخصوص</span>
            <button onClick={onAddEvidence} className="shrink-0 text-[11.5px] font-bold text-[var(--em8)] underline cursor-pointer">إضافة شاهد</button>
          </div>
        )
      ) : (
        <button
          onClick={onSmartCheck}
          disabled={check.loading}
          className="mt-3 flex items-center gap-2 py-2 px-4 rounded-lg bg-[var(--em6)]/15 border border-[var(--em6)]/30 text-[var(--em8)] text-[12px] font-bold disabled:opacity-50 cursor-pointer"
        >
          {check.loading ? <><i className="ti ti-loader animate-spin" /> جاري الفحص...</> : <><i className="ti ti-search" /> فحص ذكي</>}
        </button>
      )}
    </div>
  );
}
