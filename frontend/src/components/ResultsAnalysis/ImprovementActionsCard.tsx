import { useState } from 'react';
import EvidenceModal from '../EvidenceModal';
import type { EvidenceFormProps } from '../EvidenceForm';
import { BTN_SM, BTN_GH_SM, BTN_PRI_SM } from '../SectionView';
import { groupRemedialStudents } from './logic';
import type { SmartCheckResult } from './useResultsAnalysis';
import type { GradeBand, ResultsAnalysisRow } from './types';
import type { SectionData } from '../../types';

type SupabaseEvidenceHook = ReturnType<typeof import('../../hooks/useSupabaseEvidence').useSupabaseEvidence>;

const REMEDIAL_SUB = 'خطط علاجية وإثرائية';
const HONOR_SUB = 'تكريم المتميزين';

type CheckKind = 'remedial' | 'honor';
interface CheckState { loading: boolean; result: SmartCheckResult | null; }
type ChecksMap = Record<string, CheckState>;

function checkKey(analysisId: string, kind: CheckKind) {
  return `${analysisId}:${kind}`;
}

/** القيم التي تقرّر بنود الإجراء لتحليل واحد — مصدر واحد للجسم والعدّ */
function actionInputs(a: ResultsAnalysisRow, gradeBands: GradeBand[]) {
  const excellentBand = gradeBands[0];
  const weakBand = gradeBands[gradeBands.length - 1];
  const remedial = groupRemedialStudents(a.summary.students, weakBand?.id);
  const remedialTotal = remedial.nearSuccess.length + remedial.largerGap.length;
  const excellentCount = excellentBand ? a.summary.bandCounts[excellentBand.id] ?? 0 : 0;
  return { remedial, remedialTotal, excellentCount };
}

/** عدد بنود الإجراء — يطابق طول actionItems في ImprovementActionsBody:
 *  بند لكل (تحليل × شرط) من الشروط الثلاثة نفسها */
export function countImprovementActions(analyses: ResultsAnalysisRow[], gradeBands: GradeBand[]) {
  return analyses.reduce((n, a) => {
    const { remedialTotal, excellentCount } = actionInputs(a, gradeBands);
    return n + (remedialTotal > 0 ? 1 : 0) + (excellentCount > 0 ? 1 : 0) + (a.summary.inflationDetected ? 1 : 0);
  }, 0);
}

interface ImprovementActionsBodyProps {
  section: SectionData;
  userId: string | undefined;
  supabaseEv?: SupabaseEvidenceHook;
  gradeBands: GradeBand[];
  analyses: ResultsAnalysisRow[];
  runSmartCheck: (analysis: ResultsAnalysisRow, kind: 'remedial' | 'honor') => Promise<SmartCheckResult>;
  onEvidenceSaved?: EvidenceFormProps['onEvidenceSaved'];
  onToast?: (msg: string, icon?: string) => void;
  /** يفتح شاشة بند 10 على تبويب التحليل المصدر ("اعرض السياق الكامل") */
  onViewInAnalysis: (analysisId: string) => void;
}

/**
 * جسم شاشة بند 5 — تنبيهات إجراء (إخفاق/تفوق/تضخم) عبر كل تحليلات
 * results_analysis للمعلم دفعة واحدة. نتائج "فحص ذكي" حالة محلية تُفقد عند
 * مغادرة الشاشة.
 */
export function ImprovementActionsBody({
  section, userId, supabaseEv, gradeBands, analyses, runSmartCheck,
  onEvidenceSaved, onToast, onViewInAnalysis,
}: ImprovementActionsBodyProps) {
  const [checks, setChecks] = useState<ChecksMap>({});
  const [addEvidenceTarget, setAddEvidenceTarget] = useState<{ open: boolean; sub: string; indicatorId?: string }>({ open: false, sub: '' });
  // مؤشر «تنفيذ خطط علاجية وإثرائية» بالاسم لا بالمعرّف. التكريم يُربط به أيضاً
  // (إثراء للمتفوقين)، والمعلم يستطيع تغييره في النموذج.
  const remedialIndicatorId = section.indicators.find(i => !i.isCustom && i.name_ar.includes('خطط علاجية'))?.id;

  const noToast = () => {};
  const excellentBand = gradeBands[0];

  const handleSmartCheck = async (analysis: ResultsAnalysisRow, kind: CheckKind) => {
    const key = checkKey(analysis.id, kind);
    setChecks(prev => ({ ...prev, [key]: { loading: true, result: null } }));
    const result = await runSmartCheck(analysis, kind);
    setChecks(prev => ({ ...prev, [key]: { loading: false, result } }));
  };

  // بند إجراء واحد لكل (تحليل × نوع)، عبر كل التحليلات المحفوظة — إن لم يوجد
  // بنود تحتاج انتباهاً في أي تحليل، تظهر حالة فارغة محايدة بدل بطاقة خالية.
  const actionItems = analyses.flatMap(a => {
    const { remedial, remedialTotal, excellentCount } = actionInputs(a, gradeBands);
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
            tone="warn"
            sourceLabel={`${a.subject}${a.class_section ? ' · ' + a.class_section : ''}`}
            title={`${remedialTotal} طالب يحتاجون خطة علاجية (${parts.join(' · ')})`}
            subtitle="هل وثّقت خطة علاجية لهذه المجموعة؟"
            check={checks[checkKey(a.id, 'remedial')] ?? { loading: false, result: null }}
            onSmartCheck={() => handleSmartCheck(a, 'remedial')}
            onAddEvidence={() => setAddEvidenceTarget({ open: true, sub: REMEDIAL_SUB, indicatorId: remedialIndicatorId })}
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
            tone="accent"
            sourceLabel={`${a.subject}${a.class_section ? ' · ' + a.class_section : ''}`}
            title={`${excellentCount} طالب متفوق في فئة "${excellentBand.label}"`}
            subtitle="هل قدّمت تكريماً؟"
            check={checks[checkKey(a.id, 'honor')] ?? { loading: false, result: null }}
            onSmartCheck={() => handleSmartCheck(a, 'honor')}
            onAddEvidence={() => setAddEvidenceTarget({ open: true, sub: HONOR_SUB, indicatorId: remedialIndicatorId })}
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
          <div key={`${a.id}:inflation`} className="flex items-start gap-2.5 bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
            <i className="ti ti-info-circle text-[20px] text-[var(--info)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mb-1">{a.subject}{a.class_section ? ` · ${a.class_section}` : ''}</div>
              <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">مؤشرات تضخم في الدرجات</div>
              <div className="text-[length:var(--fs-xs)] text-[var(--t2)] mt-1 leading-relaxed">
                نسبة كبيرة من الدرجات مرتفعة جداً أو تكدّس ضعيف بين الطلاب — يُنصح بتنويع أدوات التقييم لقياس الفروق الفردية بدقة أكبر.
              </div>
              <button onClick={() => onViewInAnalysis(a.id)} className={`${BTN_GH_SM} mt-3`}>اعرض السياق الكامل</button>
            </div>
          </div>
        ),
      });
    }

    return items;
  });

  return (
    <>
      <div className="flex flex-col gap-3">
        {actionItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-14 h-14 rounded-[var(--r-full)] bg-[var(--s2)] flex items-center justify-center text-[32px] text-[var(--t3)] mb-3">
              <i className="ti ti-checkup-list" />
            </div>
            <p className="text-[length:var(--fs-sm)] text-[var(--t2)]">
              {analyses.length === 0 ? 'ارفع كشف درجات من بطاقة "تحليل نتائج المتعلمين" لبدء التوليد التلقائي للإجراءات' : 'لا إجراءات حالياً لتحليلاتك المحفوظة'}
            </p>
          </div>
        )}
        {actionItems.map(it => it.node)}
      </div>

      {addEvidenceTarget.open && userId && supabaseEv && (
        <EvidenceModal
          isOpen
          onClose={() => setAddEvidenceTarget({ open: false, sub: '' })}
          sectionId={section.id}
          sub={addEvidenceTarget.sub}
          indicatorId={addEvidenceTarget.indicatorId}
          userId={userId}
          supabaseEv={supabaseEv}
          onEvidenceSaved={onEvidenceSaved ?? (() => {})}
          onToast={onToast ?? noToast}
        />
      )}
    </>
  );
}

interface ActionAlertProps {
  icon: string;
  /** لون أيقونة النوع: علاجي warn، تكريم accent */
  tone: 'warn' | 'accent';
  sourceLabel: string;
  title: string;
  subtitle: string;
  check: CheckState;
  onSmartCheck: () => void;
  onAddEvidence: () => void;
  onViewContext: () => void;
}

function ActionAlert({ icon, tone, sourceLabel, title, subtitle, check, onSmartCheck, onAddEvidence, onViewContext }: ActionAlertProps) {
  const found = check.result?.found;
  return (
    <div className="bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
      <div className="flex items-start gap-2.5">
        <i className={`ti ${icon} text-[20px] shrink-0 ${tone === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--accent)]'}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mb-0.5">{sourceLabel}</div>
          <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{title}</div>
          <div className="text-[length:var(--fs-xs)] text-[var(--t2)] mt-0.5">{subtitle}</div>
        </div>
      </div>

      {check.result && (
        found ? (
          <div className="flex items-center gap-2 mt-3 bg-[var(--s2)] rounded-[var(--r-sm)] px-3 py-2.5">
            <i className="ti ti-circle-check text-[16px] text-[var(--accent)] shrink-0" />
            <span className="text-[length:var(--fs-xs)] text-[var(--accent)] font-bold truncate">وُثِّق مسبقاً: {check.result.evidenceTitle}</span>
          </div>
        ) : (
          <div className="mt-3 bg-[var(--s2)] rounded-[var(--r-sm)] px-3 py-2.5">
            <span className="text-[length:var(--fs-xs)] text-[var(--t2)]">لم يُعثر على شاهد بهذا الخصوص</span>
          </div>
        )
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {!check.result && (
          <button type="button" onClick={onSmartCheck} disabled={check.loading} className={`${BTN_SM} disabled:opacity-40`}>
            {check.loading ? <><i className="ti ti-loader animate-spin text-[16px]" /> جاري الفحص...</> : <><i className="ti ti-search text-[16px]" /> فحص ذكي</>}
          </button>
        )}
        {check.result && !found && (
          <button type="button" onClick={onAddEvidence} className={BTN_PRI_SM}>
            <i className="ti ti-plus text-[16px]" /> إضافة شاهد
          </button>
        )}
        <button type="button" onClick={onViewContext} className={BTN_GH_SM}>السياق الكامل</button>
      </div>
    </div>
  );
}
