import { useEffect, useMemo, useRef, useState } from 'react';
import BottomSheet from '../BottomSheet';
import type { EvidenceFormProps } from '../EvidenceForm';
import { BTN_SM, BTN_GH_SM, BTN_PRI_SM } from '../SectionView';
import UploadAnalysisSheet from './UploadAnalysisSheet';
import ResultsBarChart from './ResultsBarChart';
import ComparisonChart from './ComparisonChart';
import ConvertToEvidenceFlow from './ConvertToEvidenceFlow';
import EditAnalysisSheet from './EditAnalysisSheet';
import {
  ALL, FilterBar, OptionsMenu, SectionsList, TestsList, loadNavPrefs, saveNavPrefs, visibilityItems,
  type BrowseView, type MenuEntry, type NavPrefs,
} from './AnalysisBrowser';
import { HiddenNote } from './PublicResultsSection';
import {
  analysisSourceLabel, bandTextCss, bandTone, buildSectionTimeline, classGroupKey, classGroupLabel, computeScoreGap, fmtNum,
  formatScore, fullMarkOf, gradeFilterOptions, gradeKey, groupPublicTests, groupRemedialStudents, groupSectionTimelines,
  normalizeSubject, subjectFilterOptions, testKey, toPublicResultsAnalysisRow,
} from './logic';
import type { GradeBand, ResultsAnalysisRow } from './types';
import type { DeleteAnalysisFn, SaveAnalysisFn, SetAnalysesHiddenFn, UpdateAnalysisFn } from './useResultsAnalysis';
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
  /** إخفاء من الصفحة العامة — بدونها لا تظهر عناصر الإخفاء */
  setAnalysesHidden?: SetAnalysesHiddenFn;
  onEvidenceSaved?: EvidenceFormProps['onEvidenceSaved'];
  onToast?: (msg: string, kind: ToastKind) => void;
  /** معرّف تحليل يجب فتحه مباشرة — يصل من بطاقة "تحسين نتائج المتعلمين"
   *  عبر زر "اعرض السياق الكامل". يُستهلك مرة واحدة ثم يُعاد تصفيره بالمستدعي. */
  focusAnalysisId: string | null;
  onFocusHandled: () => void;
}

/** ما يُعرض فوق القائمة: تحليل واحد (ومن أي عرض جاء)، أو شعبة عبر الزمن */
type OpenItem =
  | { kind: 'analysis'; id: string; from: BrowseView }
  | { kind: 'timeline'; key: string };

const sectionNo = (a: ResultsAnalysisRow) => a.class_section ?? Number.MAX_SAFE_INTEGER;

/**
 * جسم شاشة بند 10 — أداة تحليل النتائج. شريط تصفية (المادة، والصف إن تعدد)
 * وعرضان: «حسب الاختبار» (بطاقة الصفحة العامة نفسها، وكل سطر شعبة يفتح
 * تحليلها)، و«حسب الشعبة» (يفتح المقارنة عبر الزمن). التحليل الواحد يُفتح في
 * المكان نفسه بمحتواه كاملاً. يُركَّب فقط بعد انتهاء التحميل، فطلب التركيز يجد
 * تحليله من أول render.
 *
 * فتح تحليل حالة داخل البند لا مدخل في سجل المتصفح: نظام الشاشات في
 * Dashboard (pushScreen) يعرف البند كله فقط، فزر الرجوع في الجوال أو المتصفح
 * يغلق البند. زر «كل الاختبارات» هو طريق الرجوع إلى القائمة.
 */
export function AnalysisSectionBody({
  sections, userId, supabaseEv, gradeBands, analyses,
  saveAnalysis, deleteAnalysis, updateAnalysis, setAnalysesHidden, onEvidenceSaved, onToast, focusAnalysisId, onFocusHandled,
}: AnalysisSectionBodyProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ResultsAnalysisRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResultsAnalysisRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [prefs, setPrefs] = useState<NavPrefs>(() => loadNavPrefs() ?? { subject: null, grade: ALL, view: 'tests' });
  const [openItem, setOpenItem] = useState<OpenItem | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listScrollY = useRef<number | null>(null);

  const toast = onToast ?? (() => {});

  const updatePrefs = (patch: Partial<NavPrefs>) => {
    setPrefs(p => {
      const next = { ...p, ...patch };
      saveNavPrefs(next);
      return next;
    });
  };

  // التصفية: القيمة المحفوظة إن بقيت صالحة، وإلا أحدث مادة و«الكل» للصف
  const subjects = useMemo(() => subjectFilterOptions(analyses), [analyses]);
  const subject = prefs.subject === ALL && subjects.length > 1 ? ALL
    : subjects.some(s => s.key === prefs.subject) ? prefs.subject as string
    : subjects[0]?.key ?? ALL;
  const subjectRows = useMemo(
    () => subject === ALL ? analyses : analyses.filter(a => normalizeSubject(a.subject) === subject),
    [analyses, subject],
  );
  const grades = useMemo(() => gradeFilterOptions(subjectRows), [subjectRows]);
  const grade = grades.length > 1 && grades.some(g => g.key === prefs.grade) ? prefs.grade : ALL;
  const filtered = useMemo(
    () => grade === ALL ? subjectRows : subjectRows.filter(a => gradeKey(a) === grade),
    [subjectRows, grade],
  );

  const byId = useMemo(() => new Map(analyses.map(a => [a.id, a])), [analyses]);
  // بطاقات الاختبار من صفوف المعلم بعد تحويلها للشكل العام (مع الفئات)، كمعاينة المالك
  const tests = useMemo(
    () => groupPublicTests(filtered.map(a => toPublicResultsAnalysisRow(a, gradeBands))),
    [filtered, gradeBands],
  );
  const timelines = useMemo(() => groupSectionTimelines(filtered), [filtered]);

  const openAnalysis = openItem?.kind === 'analysis' ? byId.get(openItem.id) ?? null : null;
  const siblings = useMemo(
    () => openAnalysis
      ? analyses.filter(a => testKey(a) === testKey(openAnalysis)).sort((a, b) => sectionNo(a) - sectionNo(b))
      : [],
    [analyses, openAnalysis],
  );
  const openTimelineRows = useMemo(
    () => openItem?.kind === 'timeline' ? analyses.filter(a => classGroupKey(a) === openItem.key) : [],
    [analyses, openItem],
  );

  // تحليل حُذف أو شعبة لم يبق لها تحليل: العودة إلى القائمة
  useEffect(() => {
    if (openItem?.kind === 'analysis' && !byId.has(openItem.id)) setOpenItem(null);
    if (openItem?.kind === 'timeline' && openTimelineRows.length === 0) setOpenItem(null);
  }, [openItem, byId, openTimelineRows.length]);

  const scrollToTop = () => requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: 'start' }));

  const openFromList = (item: OpenItem) => {
    if (!openItem) listScrollY.current = window.scrollY;
    setOpenItem(item);
    scrollToTop();
  };

  /** من خارج القائمة (التركيز، الرفع): المادة مادته، والصف «الكل» */
  const revealAnalysis = (a: ResultsAnalysisRow) => {
    updatePrefs({ subject: normalizeSubject(a.subject), grade: ALL });
    listScrollY.current = null;
    setOpenItem({ kind: 'analysis', id: a.id, from: 'tests' });
    scrollToTop();
  };

  const backToList = () => {
    const y = listScrollY.current;
    setOpenItem(null);
    setConvertOpen(false);
    if (y !== null) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }));
  };

  useEffect(() => {
    if (!focusAnalysisId) return;
    const a = analyses.find(x => x.id === focusAnalysisId);
    if (!a) return;
    revealAnalysis(a);
    onFocusHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAnalysisId]);

  const handleSetHidden = async (ids: string[], hidden: boolean) => {
    if (!setAnalysesHidden) return;
    const ok = await setAnalysesHidden(ids, hidden);
    if (!ok) { toast('تعذّر تغيير الظهور في الصفحة العامة، حاول مجدداً', 'error'); return; }
    toast(hidden ? 'أُخفي من الصفحة العامة' : 'يظهر الآن في الصفحة العامة', 'success');
  };
  const onSetHidden = setAnalysesHidden ? handleSetHidden : undefined;

  /** بعد الحذف: الشعبة التالية في الاختبار نفسه، وإلا السابقة، وإلا القائمة */
  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const sibs = analyses.filter(a => testKey(a) === testKey(deleteTarget)).sort((a, b) => sectionNo(a) - sectionNo(b));
    const idx = sibs.findIndex(a => a.id === deleteTarget.id);
    const rest = sibs.filter(a => a.id !== deleteTarget.id);
    const ok = await deleteAnalysis(deleteTarget.id);
    setDeleting(false);
    if (!ok) { toast('تعذّر حذف التحليل، حاول مجدداً', 'error'); return; }
    setDeleteTarget(null);
    setConvertOpen(false);
    if (openItem?.kind === 'analysis' && openItem.id === deleteTarget.id) {
      const next = rest[idx] ?? rest[idx - 1];
      if (next) setOpenItem({ ...openItem, id: next.id });
      else backToList();
    }
    toast('حُذف التحليل', 'success');
  };

  const sibIdx = openAnalysis ? siblings.findIndex(a => a.id === openAnalysis.id) : -1;
  const prevSib = sibIdx > 0 ? siblings[sibIdx - 1] : null;
  const nextSib = sibIdx >= 0 && sibIdx < siblings.length - 1 ? siblings[sibIdx + 1] : null;
  const goSibling = (a: ResultsAnalysisRow) => {
    if (openItem?.kind !== 'analysis') return;
    setConvertOpen(false);
    setOpenItem({ ...openItem, id: a.id });
  };

  const backLabel = openItem?.kind === 'analysis' && openItem.from === 'tests' ? 'كل الاختبارات' : 'كل الشعب';

  return (
    <div ref={rootRef} className="scroll-mt-4">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        {openItem ? (
          <button type="button" onClick={backToList} className={`${BTN_GH_SM} -ms-3 print:hidden`}>
            <i className="ti ti-arrow-right text-[16px]" /> {backLabel}
          </button>
        ) : <span />}
        <button type="button" onClick={() => setUploadOpen(true)} className={`${BTN_PRI_SM} shrink-0 print:hidden`}>
          <i className="ti ti-upload text-[16px]" /> رفع {analyses.length > 0 ? 'جديد' : 'كشف درجات'}
        </button>
      </div>

      {analyses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-14 h-14 rounded-[var(--r-full)] bg-[var(--s2)] flex items-center justify-center text-[32px] text-[var(--t3)] mb-3">
            <i className="ti ti-chart-dots-off" />
          </div>
          <p className="text-[length:var(--fs-sm)] text-[var(--t2)]">ارفع أول كشف درجات لبدء التحليل</p>
        </div>
      )}

      {!openItem && analyses.length > 0 && (
        <>
          <FilterBar
            subjects={subjects}
            subject={subject}
            onSubject={key => updatePrefs({ subject: key, grade: ALL })}
            grades={grades}
            grade={grade}
            onGrade={key => updatePrefs({ grade: key })}
            view={prefs.view}
            onView={view => updatePrefs({ view })}
          />
          {prefs.view === 'tests' ? (
            <TestsList
              tests={tests}
              byId={byId}
              bands={gradeBands}
              onOpen={id => openFromList({ kind: 'analysis', id, from: 'tests' })}
              onSetHidden={onSetHidden}
            />
          ) : (
            <SectionsList
              timelines={timelines}
              showSubject={subject === ALL}
              onOpen={key => openFromList({ kind: 'timeline', key })}
            />
          )}
        </>
      )}

      {openItem?.kind === 'timeline' && openTimelineRows.length > 0 && (
        <div id="analysis-print-target" className="print-card bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
          <ComparisonChart
            title={classGroupLabel([...openTimelineRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0])}
            points={buildSectionTimeline(openTimelineRows)}
            onOpen={id => setOpenItem({ kind: 'analysis', id, from: 'sections' })}
          />
        </div>
      )}

      {openAnalysis && (
        <>
          <div className="mb-4 print:hidden">
            <h3 className="text-[length:var(--fs-md)] font-bold text-[var(--t1)] break-words">{analysisSourceLabel(openAnalysis)}</h3>
            {openAnalysis.hidden_public === true && <div className="mt-1"><HiddenNote /></div>}
            {siblings.length > 1 && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <button type="button" disabled={!prevSib} onClick={() => prevSib && goSibling(prevSib)} className={`${BTN_GH_SM} -ms-3`}>
                  <i className="ti ti-chevron-right text-[16px]" /> الشعبة السابقة
                </button>
                <span className="text-[length:var(--fs-xs)] text-[var(--t3)] whitespace-nowrap">{sibIdx + 1} من {siblings.length}</span>
                <button type="button" disabled={!nextSib} onClick={() => nextSib && goSibling(nextSib)} className={`${BTN_GH_SM} -me-3`}>
                  الشعبة التالية <i className="ti ti-chevron-left text-[16px]" />
                </button>
              </div>
            )}
          </div>
          <AnalysisTabBody
            key={openAnalysis.id}
            analysis={openAnalysis}
            bands={gradeBands}
            onConvertClick={() => setConvertOpen(true)}
            onEditClick={() => setEditTarget(openAnalysis)}
            onDeleteClick={() => setDeleteTarget(openAnalysis)}
            visibility={onSetHidden ? visibilityItems([openAnalysis], 'analysis', onSetHidden) : []}
          />
        </>
      )}

      <BottomSheet isOpen={uploadOpen} onClose={() => setUploadOpen(false)}>
        <UploadAnalysisSheet
          onClose={() => setUploadOpen(false)}
          bands={gradeBands}
          analyses={analyses}
          saveAnalysis={saveAnalysis}
          onSaved={(row) => { setUploadOpen(false); revealAnalysis(row); }}
          onToast={toast}
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
            onToast={toast}
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

      {convertOpen && openAnalysis && userId && supabaseEv && (
        <ConvertToEvidenceFlow
          analysis={openAnalysis}
          bands={gradeBands}
          sections={sections}
          userId={userId}
          supabaseEv={supabaseEv}
          onEvidenceSaved={onEvidenceSaved ?? (() => {})}
          onToast={toast}
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
  onEditClick: () => void;
  onDeleteClick: () => void;
  /** إخفاء/إظهار في الصفحة العامة — فارغة إن لم تُمرَّر setAnalysesHidden */
  visibility: MenuEntry[];
}

const STAT_NUM = 'text-[length:var(--fs-lg)] font-bold text-[var(--t1)]';
const STAT_TEXT = 'text-[length:var(--fs-sm)] font-bold text-[var(--t1)]';
const STAT_LABEL = 'text-[length:var(--fs-xs)] text-[var(--t3)] mt-1';
const BLOCK_TITLE = 'text-[length:var(--fs-xs)] font-bold text-[var(--t3)]';

function AnalysisTabBody({ analysis, bands, onConvertClick, onEditClick, onDeleteClick, visibility }: AnalysisTabBodyProps) {
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
          <OptionsMenu
            label="خيارات التحليل"
            items={[
              { key: 'edit', icon: 'ti-pencil', label: 'تعديل البيانات', onSelect: onEditClick },
              ...visibility,
              { key: 'delete', icon: 'ti-trash', label: 'حذف التحليل', danger: true, onSelect: onDeleteClick },
            ]}
          />
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
              const bandIndex = bands.findIndex(b => b.id === s.bandId);
              const scoreColor = bandIndex >= 0 ? bandTextCss(bandTone(bandIndex, bands.length)) : 'var(--t1)';
              return (
                <div key={i} className="flex items-center justify-between gap-3 py-2.5 px-3.5 text-[length:var(--fs-sm)]">
                  <span className="text-[var(--t1)] truncate">{s.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.inDangerZone && <i className="ti ti-alert-triangle text-[16px] text-[var(--warn)]" title="ضمن منطقة الخطر" />}
                    <span className="font-bold" style={{ color: scoreColor }}>{formatScore(s.score, fullMark)}</span>
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
