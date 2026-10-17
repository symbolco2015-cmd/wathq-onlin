import { useEffect, useMemo, useState } from 'react';
import BottomSheet from '../BottomSheet';
import type { EvidenceFormProps } from '../EvidenceForm';
import { BTN_SM, BTN_GH_SM, BTN_PRI_SM } from '../SectionView';
import UploadAnalysisSheet from './UploadAnalysisSheet';
import ResultsBarChart from './ResultsBarChart';
import ComparisonChart from './ComparisonChart';
import ConvertToEvidenceFlow from './ConvertToEvidenceFlow';
import EditAnalysisSheet from './EditAnalysisSheet';
import {
  analysisSourceLabel, buildComparisonSeries, classGroupLabel, computeScoreGap, fmtNum, formatScore, fullMarkOf,
  groupAnalysesByClass, groupRemedialStudents,
} from './logic';
import type { GradeBand, ResultsAnalysisRow } from './types';
import type { DeleteAnalysisFn, SaveAnalysisFn, UpdateAnalysisFn } from './useResultsAnalysis';
import type { SectionData } from '../../types';
import { AR_ABSENT, AR_STUDENT, countWord, formatDate } from '../../utils';
import { Modal, type ToastKind } from '../UI';

type SupabaseEvidenceHook = ReturnType<typeof import('../../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface AnalysisSectionBodyProps {
  sections: SectionData[];
  userId: string | undefined;
  supabaseEv?: SupabaseEvidenceHook;
  gradeBands: GradeBand[];
  analyses: ResultsAnalysisRow[];
  saveAnalysis: SaveAnalysisFn;
  deleteAnalysis: DeleteAnalysisFn;
  updateAnalysis: UpdateAnalysisFn;
  onEvidenceSaved?: EvidenceFormProps['onEvidenceSaved'];
  onToast?: (msg: string, kind: ToastKind) => void;
  /** معرّف تحليل يجب فتح تبويبه مباشرة — يصل من بطاقة "تحسين نتائج المتعلمين"
   *  عبر زر "اعرض السياق الكامل". يُستهلك مرة واحدة ثم يُعاد تصفيره بالمستدعي. */
  focusAnalysisId: string | null;
  onFocusHandled: () => void;
}

type Tab =
  | { kind: 'analysis'; id: string; label: string; analysis: ResultsAnalysisRow }
  | { kind: 'compare'; id: string; label: string; title: string; group: ResultsAnalysisRow[] };

/**
 * جسم شاشة بند 10 — أداة تحليل النتائج: تبويب لكل تحليل محفوظ + تبويب
 * "مقارنة" تلقائي لكل مادة وشعبة (مادة + مرحلة + صف + شعبة) لها تحليلان فأكثر. يُركَّب فقط بعد انتهاء التحميل
 * (الشاشة تعرض "جارٍ التحميل…" قبله)، فطلب التركيز يجد تبويباته من أول render.
 */
export function AnalysisSectionBody({
  sections, userId, supabaseEv, gradeBands, analyses,
  saveAnalysis, deleteAnalysis, updateAnalysis, onEvidenceSaved, onToast, focusAnalysisId, onFocusHandled,
}: AnalysisSectionBodyProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ResultsAnalysisRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResultsAnalysisRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const noToast = () => {};

  const classGroups = useMemo(() => groupAnalysesByClass(analyses), [analyses]);

  const tabs = useMemo<Tab[]>(() => {
    const analysisTabs: Tab[] = analyses.map(a => ({
      kind: 'analysis',
      id: a.id,
      label: analysisSourceLabel(a),
      analysis: a,
    }));
    const compareTabs: Tab[] = Array.from(classGroups.entries())
      .filter(([, list]) => list.length >= 2)
      .map(([key, list]) => {
        const title = classGroupLabel(list[0]);
        return { kind: 'compare' as const, id: `compare:${key}`, label: `مقارنة · ${title}`, title, group: list };
      });
    return [...analysisTabs, ...compareTabs];
  }, [analyses, classGroups]);

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

  /** بعد الحذف: التحليل في الموضع نفسه، وإلا السابق، وإلا أول تبويب باقٍ
   *  (مقارنة) أو الحالة الفارغة — يتولاهما المؤثّر أعلاه. */
  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const idx = analyses.findIndex(a => a.id === deleteTarget.id);
    const rest = analyses.filter(a => a.id !== deleteTarget.id);
    const ok = await deleteAnalysis(deleteTarget.id);
    setDeleting(false);
    if (!ok) { (onToast ?? noToast)('تعذّر حذف التحليل، حاول مجدداً', 'error'); return; }
    setDeleteTarget(null);
    setConvertOpen(false);
    setActiveTabId((rest[idx] ?? rest[idx - 1])?.id ?? null);
    (onToast ?? noToast)('حُذف التحليل', 'success');
  };

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
          <ComparisonChart title={activeTab.title} series={buildComparisonSeries(activeTab.group)} />
        </div>
      )}

      {activeTab?.kind === 'analysis' && (
        <AnalysisTabBody
          analysis={activeTab.analysis}
          bands={gradeBands}
          onConvertClick={() => setConvertOpen(true)}
          onEditClick={() => setEditTarget(activeTab.analysis)}
          onDeleteClick={() => setDeleteTarget(activeTab.analysis)}
        />
      )}

      <BottomSheet isOpen={uploadOpen} onClose={() => setUploadOpen(false)}>
        <UploadAnalysisSheet
          onClose={() => setUploadOpen(false)}
          bands={gradeBands}
          analyses={analyses}
          saveAnalysis={saveAnalysis}
          onSaved={(row) => { setUploadOpen(false); setActiveTabId(row.id); }}
          onToast={onToast ?? noToast}
        />
      </BottomSheet>

      <BottomSheet isOpen={!!editTarget} onClose={() => setEditTarget(null)}>
        {editTarget && (
          <EditAnalysisSheet
            key={editTarget.id}
            analysis={editTarget}
            analyses={analyses}
            bands={gradeBands}
            updateAnalysis={updateAnalysis}
            onClose={() => setEditTarget(null)}
            onToast={onToast ?? noToast}
          />
        )}
      </BottomSheet>

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        title="حذف التحليل"
        subtitle=""
        icon="ti-trash"
        tone="danger"
        onConfirm={handleDelete}
        confirmDisabled={deleting}
        confirmHelperText="جارٍ الحذف…"
      >
        {deleteTarget && (
          <p className="text-[length:var(--fs-sm)] text-[var(--t1)]">
            حذف تحليل <b className="font-bold">{analysisSourceLabel(deleteTarget)}</b>؟ لا يمكن التراجع.
          </p>
        )}
      </Modal>

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
  onEditClick: () => void;
  onDeleteClick: () => void;
}

const MENU_ITEM = 'w-full h-9 px-3 flex items-center gap-2 text-right text-[length:var(--fs-sm)] font-bold whitespace-nowrap cursor-pointer';

const STAT_NUM = 'text-[length:var(--fs-lg)] font-bold text-[var(--t1)]';
const STAT_TEXT = 'text-[length:var(--fs-sm)] font-bold text-[var(--t1)]';
const STAT_LABEL = 'text-[length:var(--fs-xs)] text-[var(--t3)] mt-1';
const BLOCK_TITLE = 'text-[length:var(--fs-xs)] font-bold text-[var(--t3)]';

function AnalysisTabBody({ analysis, bands, onConvertClick, onEditClick, onDeleteClick }: AnalysisTabBodyProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const weakBand = bands[bands.length - 1];
  const fullMark = fullMarkOf(analysis.full_mark);
  const gap = computeScoreGap(analysis.summary.students);
  const remedial = groupRemedialStudents(analysis.summary.students, weakBand?.id, fullMark);
  const absentCount = analysis.summary.absentCount ?? 0;
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
          {/* نمط قائمة الشاهد في SectionView: 36px بصرياً، ومساحة الضغط 44px */}
          <div className="relative">
            <button
              type="button"
              aria-label="خيارات التحليل"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}
              className="relative w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] flex items-center justify-center text-[16px] text-[var(--t2)] shrink-0 cursor-pointer before:absolute before:-inset-1 before:content-['']"
            >
              <i className="ti ti-dots" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                <div role="menu" className="absolute left-0 top-full mt-1 z-30 min-w-[140px] py-1 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)]">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEditClick(); }} className={`${MENU_ITEM} text-[var(--t1)]`}>
                    <i className="ti ti-pencil text-[16px]" /> تعديل البيانات
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDeleteClick(); }} className={`${MENU_ITEM} text-[var(--danger)]`}>
                    <i className="ti ti-trash text-[16px]" /> حذف التحليل
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
        <div className={`grid grid-cols-2 ${absentCount > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3 mb-4 text-center`}>
          <div>
            <div className={STAT_NUM}>{analysis.summary.totalStudents}</div>
            <div className={STAT_LABEL}>{countWord(analysis.summary.totalStudents, AR_STUDENT)}</div>
          </div>
          {absentCount > 0 && (
            <div>
              <div className={STAT_NUM}>{absentCount}</div>
              <div className={STAT_LABEL}>{countWord(absentCount, AR_ABSENT)}</div>
            </div>
          )}
          <div>
            <div className={STAT_TEXT}>{formatScore(analysis.summary.average, fullMark)}</div>
            <div className={STAT_LABEL}>المتوسط</div>
          </div>
          <div>
            <div className={STAT_TEXT}>{formatScore(gap, fullMark)}</div>
            <div className={STAT_LABEL}>مؤشر الفجوة</div>
          </div>
          <div>
            <div className={STAT_TEXT}>{fmtNum(analysis.summary.stdDev)} نقطة</div>
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
                  <span className="text-[var(--t1)] truncate">{s.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.inDangerZone && <i className="ti ti-alert-triangle text-[16px] text-[var(--warn)]" title="ضمن منطقة الخطر" />}
                    <span className="font-bold" style={{ color: band?.color }}>{formatScore(s.score, fullMark)}</span>
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
