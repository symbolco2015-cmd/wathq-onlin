import { useMemo, useState } from 'react';
import type { ToastKind } from '../UI';
import { BTN_GH, BTN_PRI } from '../SectionView';
import {
  analysesWithSubject, analysisSourceLabel, findDuplicateAnalysis, findRenameConflicts, fmtNum, fullMarkOf,
  recomputeForFullMark, subjectSuggestions, testNeedsSeq, FULL_MARK_PRESETS,
} from './logic';
import {
  AnalysisMetaFields, BLOCK_CLS, CHECKBOX_CLS, ICON_BTN_SM_CLS, LINE_CLS, SPIN_CLS,
} from './AnalysisMetaFields';
import type { UpdateAnalysisFn } from './useResultsAnalysis';
import type { GradeBand, ResultsAnalysisRow, StageCode, TestTypeCode } from './types';
import { AR_ANALYSIS, countAr } from '../../utils';

interface EditAnalysisSheetProps {
  analysis: ResultsAnalysisRow;
  /** كل تحليلات المعلم — لمنع التكرار وتوحيد اسم المادة */
  analyses: ResultsAnalysisRow[];
  bands: GradeBand[];
  updateAnalysis: UpdateAnalysisFn;
  onClose: () => void;
  onToast: (msg: string, kind: ToastKind) => void;
}

const normSubject = (s: string) => s.trim().toLowerCase();

/** تعديل بيانات تحليل محفوظ: الحقول نفسها التي في الرفع، بلا الدرجات.
 *  تغيير الدرجة العظمى يعيد الحساب من الدرجات الخام المحفوظة. */
export default function EditAnalysisSheet({ analysis, analyses, bands, updateAnalysis, onClose, onToast }: EditAnalysisSheetProps) {
  const initialFullMark = fullMarkOf(analysis.full_mark);
  const [subject, setSubject] = useState(analysis.subject);
  const [stage, setStage] = useState(analysis.stage ?? '');
  const [grade, setGrade] = useState(analysis.grade_level ? String(analysis.grade_level) : '');
  const [section, setSection] = useState(analysis.class_section ? String(analysis.class_section) : '');
  const [testType, setTestType] = useState(analysis.test_type ?? '');
  const [testSeq, setTestSeq] = useState(analysis.test_seq ? String(analysis.test_seq) : '');
  const [fullMarkStr, setFullMarkStr] = useState(String(initialFullMark));
  const [fullMarkIsInput, setFullMarkIsInput] = useState(!FULL_MARK_PRESETS.includes(initialFullMark));
  const [renameAll, setRenameAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverDuplicate, setServerDuplicate] = useState(false);

  const subjects = useMemo(() => subjectSuggestions(analyses), [analyses]);
  const others = useMemo(() => analyses.filter(a => a.id !== analysis.id), [analyses, analysis.id]);

  const gradeNumber = grade ? Number(grade) : null;
  const sectionNumber = section ? Number(section) : null;
  const needsSeq = testNeedsSeq(testType);
  const seqNumber = needsSeq && testSeq ? Number(testSeq) : null;
  const fullMarkNum = Number(fullMarkStr);
  const fullMarkValid = fullMarkStr.trim() !== '' && Number.isFinite(fullMarkNum) && fullMarkNum > 0;
  const complete = !!subject.trim() && !!stage && gradeNumber !== null && sectionNumber !== null && !!testType &&
    (!needsSeq || seqNumber !== null) && fullMarkValid;

  const fullMarkChanged = fullMarkValid && fullMarkNum !== initialFullMark;
  const recomputed = useMemo(
    () => fullMarkChanged ? recomputeForFullMark(analysis.summary, bands, fullMarkNum) : null,
    [fullMarkChanged, analysis.summary, bands, fullMarkNum],
  );
  const fullMarkError = recomputed && 'error' in recomputed ? recomputed.error : null;

  const changed = subject.trim() !== analysis.subject || stage !== (analysis.stage ?? '') ||
    gradeNumber !== analysis.grade_level || sectionNumber !== analysis.class_section ||
    testType !== (analysis.test_type ?? '') || seqNumber !== (analysis.test_seq ?? null) || fullMarkChanged;

  const duplicate = complete
    ? findDuplicateAnalysis(others, { subject, stage, grade: gradeNumber, section: sectionNumber!, testType, testSeq: seqNumber })
    : null;

  // توحيد اسم المادة: بقية تحليلات الاسم القديم
  const subjectChanged = !!subject.trim() && normSubject(subject) !== normSubject(analysis.subject);
  const oldGroup = useMemo(() => analysesWithSubject(analyses, analysis.subject), [analyses, analysis.subject]);
  const renameOthers = oldGroup.filter(a => a.id !== analysis.id);
  const canRenameAll = subjectChanged && renameOthers.length > 0;
  const applyRename = canRenameAll && renameAll;
  const renameConflicts = applyRename && complete
    ? findRenameConflicts(analyses, oldGroup, subject.trim(), {
      id: analysis.id, stage, grade: gradeNumber!, section: sectionNumber!, testType, testSeq: seqNumber,
    }).filter(c => c.id !== duplicate?.id)
    : [];

  const title = complete ? `${analysisSourceLabel({
    subject: subject.trim(), stage, grade_level: gradeNumber, class_section: sectionNumber, test_type: testType, test_seq: seqNumber,
  })} · من ${fmtNum(fullMarkNum)}` : '';
  const canSave = complete && changed && !fullMarkError && !duplicate && renameConflicts.length === 0 && !saving;

  const handleSave = async () => {
    if (!canSave || gradeNumber === null || sectionNumber === null) return;
    setSaving(true);
    setServerDuplicate(false);
    try {
      const summary = recomputed && 'summary' in recomputed ? recomputed.summary : null;
      const res = await updateAnalysis(analysis.id, {
        subject: subject.trim(),
        stage: stage as StageCode,
        grade_level: gradeNumber,
        class_section: sectionNumber,
        test_type: testType as TestTypeCode,
        test_seq: seqNumber,
        full_mark: fullMarkNum,
      }, summary, applyRename ? renameOthers.map(a => a.id) : []);
      if (!res.ok) {
        if (res.duplicate) setServerDuplicate(true);
        else onToast('تعذّر حفظ التعديل، حاول مجدداً', 'error');
        return;
      }
      if (res.renameFailed) onToast('حُفظ هذا التحليل، وتعذّر تغيير الاسم في البقية', 'error');
      else onToast('حُفظ التعديل', 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const duplicateLabel = duplicate ? analysisSourceLabel(duplicate) : title.replace(/ · من .*$/, '');

  return (
    <>
      <div className="flex items-center gap-2.5 px-[18px] pt-3.5 pb-2.5 shrink-0">
        <span className="w-9 h-9 rounded-[var(--r-sm)] bg-[var(--s2)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0">
          <i className="ti ti-pencil" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">تعديل بيانات التحليل</div>
          <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-0.5">الدرجات لا تُعدَّل هنا. لتصحيحها أعد الرفع واختر «استبدال»</div>
        </div>
        <button onClick={onClose} className={ICON_BTN_SM_CLS}>
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-[18px] pt-1 pb-4 space-y-4">
        <div className={BLOCK_CLS}>
          <AnalysisMetaFields
            subject={subject}
            onSubject={v => { setSubject(v); setServerDuplicate(false); }}
            subjects={subjects}
            stage={stage}
            onStage={setStage}
            grade={grade}
            onGrade={setGrade}
            section={section}
            onSection={setSection}
            testType={testType}
            onTestType={setTestType}
            testSeq={testSeq}
            onTestSeq={setTestSeq}
            fullMarkStr={fullMarkStr}
            fullMarkIsInput={fullMarkIsInput}
            onFullMark={(v, fromInput) => { setFullMarkStr(v); setFullMarkIsInput(fromInput); }}
            fullMarkHint={fullMarkError && (
              <div className={`${LINE_CLS} text-[var(--danger)] mt-1`}>
                <i className="ti ti-alert-circle text-[16px] shrink-0" /><span>{fullMarkError}</span>
              </div>
            )}
          />

          {canRenameAll && (
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={renameAll} onChange={e => setRenameAll(e.target.checked)} className={CHECKBOX_CLS} />
              <span className="text-[length:var(--fs-sm)] text-[var(--t1)]">
                طبّق الاسم الجديد على كل تحليلات <b className="font-bold">{analysis.subject}</b> ({countAr(oldGroup.length, AR_ANALYSIS)})
              </span>
            </label>
          )}
        </div>

        {complete && (
          <div className="bg-[var(--s2)] border border-[var(--bd2)] rounded-[var(--r-md)] p-4 space-y-2">
            <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">{title}</div>
            {fullMarkChanged && !fullMarkError && (
              <div className="text-[length:var(--fs-xs)] text-[var(--t2)]">تُعاد النسب والفئات والمتوسط من الدرجات المحفوظة</div>
            )}
            {(duplicate || serverDuplicate) && (
              <div className={`${LINE_CLS} text-[var(--danger)]`}>
                <i className="ti ti-alert-circle text-[16px] shrink-0" />
                <span>يوجد تحليل محفوظ لـ {duplicateLabel} بالبيانات نفسها.</span>
              </div>
            )}
            {renameConflicts.length > 0 && (
              <div className={`${LINE_CLS} text-[var(--danger)]`}>
                <i className="ti ti-alert-circle text-[16px] shrink-0" />
                <span>لا يمكن تطبيق الاسم على الكل، لأنه يكرر تحليلات محفوظة: {renameConflicts.map(analysisSourceLabel).join('، ')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 px-[18px] pt-3 pb-[18px] border-t border-[var(--bd)] shrink-0">
        <button onClick={onClose} className={BTN_GH}>
          إلغاء
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={BTN_PRI + ' disabled:opacity-40 disabled:cursor-not-allowed'}
        >
          {saving ? <><i className={`ti ti-loader ${SPIN_CLS}`} /> جاري الحفظ...</> : <><i className="ti ti-check" /> حفظ</>}
        </button>
      </div>
    </>
  );
}
