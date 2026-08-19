import { useState } from 'react';
import EvidenceModal from '../EvidenceModal';
import type { EvidenceFormProps } from '../EvidenceForm';
import { groupRemedialStudents } from './logic';
import type { SmartCheckResult } from './useResultsAnalysis';
import type { GradeBand, ResultsAnalysisRow } from './types';
import type { SectionData } from '../../types';

type SupabaseEvidenceHook = ReturnType<typeof import('../../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface ImprovementActionsCardProps {
  section: SectionData;
  userId: string | undefined;
  supabaseEv?: SupabaseEvidenceHook;
  gradeBands: GradeBand[];
  analyses: ResultsAnalysisRow[];
  loading: boolean;
  runSmartCheck: (analysis: ResultsAnalysisRow, kind: 'remedial' | 'honor') => Promise<SmartCheckResult>;
  onAddEv?: EvidenceFormProps['onAddEv'];
  onToast?: (msg: string, icon?: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  /** ينقل المستخدم لتبويب التحليل المصدر في بطاقة بند 10 ("اعرض السياق الكامل") */
  onViewInAnalysis: (analysisId: string) => void;
}

const REMEDIAL_SUB = 'خطط علاجية وإثرائية';
const HONOR_SUB = 'تكريم المتميزين';

type CheckKind = 'remedial' | 'honor';
interface CheckState { loading: boolean; result: SmartCheckResult | null; }
type ChecksMap = Record<string, CheckState>;

function checkKey(analysisId: string, kind: CheckKind) {
  return `${analysisId}:${kind}`;
}

/**
 * بطاقة بند 5 "تحسين نتائج المتعلمين" — مثبّتة دائماً خارج شبكة الأقسام
 * الـ11 (نفس معاملة قسم الاستراتيجيات وبطاقة بند 10). تجمّع تنبيهات إجراء
 * (إخفاق/تفوق/تضخم) عبر كل تحليلات results_analysis للمعلم دفعة واحدة، بدل
 * تنبيه تحليل واحد فقط كما كان سابقاً داخل الشيت القديم.
 */
export default function ImprovementActionsCard({
  section, userId, supabaseEv, gradeBands, analyses, loading, runSmartCheck,
  onAddEv, onToast, isOpen, onToggle, onViewInAnalysis,
}: ImprovementActionsCardProps) {
  const [checks, setChecks] = useState<ChecksMap>({});
  const [addEvidenceTarget, setAddEvidenceTarget] = useState<{ open: boolean; sub: string }>({ open: false, sub: '' });

  const noToast = () => {};
  const excellentBand = gradeBands[0];
  const weakBand = gradeBands[gradeBands.length - 1];

  const handleSmartCheck = async (analysis: ResultsAnalysisRow, kind: CheckKind) => {
    const key = checkKey(analysis.id, kind);
    setChecks(prev => ({ ...prev, [key]: { loading: true, result: null } }));
    const result = await runSmartCheck(analysis, kind);
    setChecks(prev => ({ ...prev, [key]: { loading: false, result } }));
  };

  // بند إجراء واحد لكل (تحليل × نوع)، عبر كل التحليلات المحفوظة — إن لم يوجد
  // بنود تحتاج انتباهاً في أي تحليل، تظهر حالة فارغة محايدة بدل بطاقة خالية.
  const actionItems = analyses.flatMap(a => {
    const remedial = groupRemedialStudents(a.summary.students, weakBand?.id);
    const remedialTotal = remedial.nearSuccess.length + remedial.largerGap.length;
    const excellentCount = excellentBand ? a.summary.bandCounts[excellentBand.id] ?? 0 : 0;
    const items: { analysis: ResultsAnalysisRow; kind: 'remedial' | 'honor' | 'inflation'; node: React.ReactNode }[] = [];

    if (remedialTotal > 0) {
      const parts: string[] = [];
      if (remedial.nearSuccess.length > 0) parts.push(`${remedial.nearSuccess.length} قريبون من النجاح`);
      if (remedial.largerGap.length > 0) parts.push(`${remedial.largerGap.length} بفجوة أكبر`);
      items.push({
        analysis: a,
        kind: 'remedial',
        node: (
          <ActionAlert
            key={checkKey(a.id, 'remedial')}
            icon="ti-alert-circle"
            sourceLabel={`${a.subject}${a.class_section ? ' · ' + a.class_section : ''}`}
            title={`${remedialTotal} طالب يحتاجون خطة علاجية (${parts.join(' · ')})`}
            subtitle="هل وثّقت خطة علاجية لهذه المجموعة؟"
            check={checks[checkKey(a.id, 'remedial')] ?? { loading: false, result: null }}
            onSmartCheck={() => handleSmartCheck(a, 'remedial')}
            onAddEvidence={() => setAddEvidenceTarget({ open: true, sub: REMEDIAL_SUB })}
            onViewContext={() => onViewInAnalysis(a.id)}
          />
        ),
      });
    }

    if (excellentCount > 0) {
      items.push({
        analysis: a,
        kind: 'honor',
        node: (
          <ActionAlert
            key={checkKey(a.id, 'honor')}
            icon="ti-award"
            sourceLabel={`${a.subject}${a.class_section ? ' · ' + a.class_section : ''}`}
            title={`${excellentCount} طالب متفوق في فئة "${excellentBand.label}"`}
            subtitle="هل قدّمت تكريماً؟"
            check={checks[checkKey(a.id, 'honor')] ?? { loading: false, result: null }}
            onSmartCheck={() => handleSmartCheck(a, 'honor')}
            onAddEvidence={() => setAddEvidenceTarget({ open: true, sub: HONOR_SUB })}
            onViewContext={() => onViewInAnalysis(a.id)}
          />
        ),
      });
    }

    if (a.summary.inflationDetected) {
      items.push({
        analysis: a,
        kind: 'inflation',
        node: (
          <div key={`${a.id}:inflation`} className="flex items-start gap-2.5 bg-[var(--gold)]/8 border border-[var(--gold)]/20 rounded-2xl p-4">
            <i className="ti ti-info-circle text-[18px] text-[var(--gold3)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-[var(--text4)] mb-1">{a.subject}{a.class_section ? ` · ${a.class_section}` : ''}</div>
              <div className="text-[13px] font-extrabold text-white">مؤشرات تضخم في الدرجات</div>
              <div className="text-[12px] text-[var(--text3)] mt-1 leading-relaxed">
                نسبة كبيرة من الدرجات مرتفعة جداً أو تكدّس ضعيف بين الطلاب — يُنصح بتنويع أدوات التقييم لقياس الفروق الفردية بدقة أكبر.
              </div>
              <button onClick={() => onViewInAnalysis(a.id)} className="mt-2 text-[11.5px] font-bold text-[var(--gold3)] underline cursor-pointer">اعرض السياق الكامل</button>
            </div>
          </div>
        ),
      });
    }

    return items;
  });

  if (loading) return null;

  return (
    <div id={`sc-${section.id}`} className="relative bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[16px] sm:rounded-[20px] border border-[var(--line)] overflow-hidden transition-all duration-300 hover:border-[var(--line2)]" style={{ scrollMarginTop: '90px' }}>
      <div className="flex items-center gap-2 sm:gap-4 py-3 sm:py-5 px-3 sm:px-6 cursor-pointer relative select-none hover:bg-white/5 group" onClick={onToggle}>
        <div className={`w-[32px] h-[32px] sm:w-[42px] sm:h-[42px] rounded-lg sm:rounded-xl shrink-0 flex items-center justify-center text-[15px] sm:text-[20px] border transition-all duration-350 ${actionItems.length > 0 ? 'bg-[var(--gold)]/10 text-[var(--gold3)] border-[var(--gold)]/20' : 'bg-white/5 text-[var(--text4)] border-[var(--line2)]'}`}>
          <i className={`ti ${section.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] sm:text-[16px] font-extrabold text-white font-[var(--font)] leading-tight">{section.ttl}</div>
          <div className={`flex items-center gap-1.5 mt-1 sm:mt-1.5 text-[10.5px] sm:text-[11.5px] font-bold ${actionItems.length > 0 ? 'text-[var(--gold3)]' : 'text-[var(--text4)]'}`}>
            <i className={`ti ${actionItems.length > 0 ? 'ti-bell' : 'ti-circle-dashed'} text-[11px]`} />
            {actionItems.length > 0 ? `${actionItems.length} إجراء يحتاج متابعة` : 'لا إجراءات حالياً'}
          </div>
        </div>
        <i className={`ti ti-chevron-down text-[22px] shrink-0 transition-all duration-400 ${isOpen ? 'rotate-180 text-[var(--em7)]' : 'text-[var(--text4)]'}`} />
      </div>

      <div className={`overflow-hidden transition-all duration-500 ease-[var(--ease)] ${isOpen ? 'max-h-[9999px] opacity-100 border-t border-[var(--line)]' : 'max-h-0 opacity-0 border-t-0'}`}>
        <div className="py-5 px-4 sm:px-6 space-y-3">
          {actionItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-[22px] text-[var(--text4)] mb-3">
                <i className="ti ti-checkup-list" />
              </div>
              <p className="text-[var(--text3)] text-[13.5px]">
                {analyses.length === 0 ? 'ارفع كشف درجات من بطاقة "تحليل نتائج المتعلمين" لبدء التوليد التلقائي للإجراءات' : 'لا إجراءات حالياً لتحليلاتك المحفوظة'}
              </p>
            </div>
          )}
          {actionItems.map(it => it.node)}
        </div>
      </div>

      {addEvidenceTarget.open && userId && supabaseEv && (
        <EvidenceModal
          isOpen
          onClose={() => setAddEvidenceTarget({ open: false, sub: '' })}
          sectionId={section.id}
          sub={addEvidenceTarget.sub}
          userId={userId}
          supabaseEv={supabaseEv}
          onAddEv={onAddEv ?? (() => {})}
          onToast={onToast ?? noToast}
        />
      )}
    </div>
  );
}

interface ActionAlertProps {
  icon: string;
  sourceLabel: string;
  title: string;
  subtitle: string;
  check: CheckState;
  onSmartCheck: () => void;
  onAddEvidence: () => void;
  onViewContext: () => void;
}

function ActionAlert({ icon, sourceLabel, title, subtitle, check, onSmartCheck, onAddEvidence, onViewContext }: ActionAlertProps) {
  return (
    <div className="bg-white/3 border border-[var(--line2)] rounded-2xl p-4">
      <div className="flex items-start gap-2.5">
        <i className={`ti ${icon} text-[18px] text-[var(--gold3)] shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-[var(--text4)] mb-0.5">{sourceLabel}</div>
          <div className="text-[13px] font-extrabold text-white">{title}</div>
          <div className="text-[12px] text-[var(--text3)] mt-0.5">{subtitle}</div>
        </div>
        <button onClick={onViewContext} className="shrink-0 text-[11px] font-bold text-[var(--text4)] hover:text-[var(--em8)] underline cursor-pointer">السياق الكامل</button>
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
