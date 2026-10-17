import { useMemo, useState } from 'react';
import { SelectDropdown } from '../UI';
import type { ToastKind } from '../UI';
import { BTN_GH, BTN_PRI } from '../SectionView';
import { parseFile } from './parseFile';
import {
  buildFileModel, countPresence, fileFullMark, quickEntryModel, quickEntryStatus, sectionSourceAvailability, sheetStatuses,
  splitSections, suggestNameColumn, suggestScoreColumn, suggestSectionSource, HEADER_SEARCH_ROWS, QUICK_NAME_COL, QUICK_SCORE_COL,
} from './fileModel';
import {
  checkSection, computeSummary, findDuplicateAnalysis, findSameTestFullMark, fmtNum, fmtPct, formatClass, formatTest,
  listRows, previousSectionCount, subjectSuggestions, FULL_MARK_PRESETS, INFLATION_WARNING,
  testNeedsSeq,
  type ComputeSummaryResult, type SectionCheck,
} from './logic';
import {
  AnalysisMetaFields, sectionOptions, BLOCK_CLS, BLOCK_TITLE_CLS, CHECKBOX_CLS, CHIP_CLS, CHIP_OFF, CHIP_ON, ICON_BTN_SM_CLS,
  INPUT_CLS, LABEL_CLS, LINE_CLS, SPIN_CLS,
} from './AnalysisMetaFields';
import type { SaveAnalysisFn } from './useResultsAnalysis';
import type { FileModel, GradeBand, ResultsAnalysisRow, SectionGroup, SectionSource, StageCode, TestTypeCode } from './types';
import { AR_ABSENT, AR_ANALYSIS, AR_ROW, AR_SCORE, AR_SHEET, AR_STUDENT, countAr } from '../../utils';

interface UploadAnalysisSheetProps {
  onClose: () => void;
  bands: GradeBand[];
  /** تحليلات المعلم المحفوظة — للدرجة العظمى من شعبة أخرى، ومنع التكرار، وتنبيه تغيّر العدد */
  analyses: ResultsAnalysisRow[];
  saveAnalysis: SaveAnalysisFn;
  onSaved: (row: ResultsAnalysisRow) => void;
  onToast: (msg: string, kind: ToastKind) => void;
}

const TEXTAREA_CLS = 'w-full px-3 py-2.5 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--bg)] text-[length:var(--fs-sm)] text-[var(--t1)] outline-none transition-colors duration-150 placeholder:text-[var(--t3)] focus:border-[var(--accent)] resize-y';

type EntryMode = 'file' | 'paste';

const headerRowOptions = Array.from({ length: HEADER_SEARCH_ROWS }, (_, i) => ({ value: String(i + 1), label: `الصف ${i + 1}` }));

const SOURCE_OPTIONS: { value: SectionSource; label: string }[] = [
  { value: 'column', label: 'عمود في الملف' },
  { value: 'name', label: 'داخل الاسم' },
  { value: 'sheets', label: 'أسماء الأوراق' },
  { value: 'single', label: 'الملف كله شعبة واحدة' },
];

/** حالة شعبة واحدة في القائمة وبطاقة الملخص */
interface SectionView {
  group: SectionGroup;
  present: number;
  absent: number;
  /** فيها درجة واحدة على الأقل — بدونها لا مربع اختيار ولا حفظ */
  hasScores: boolean;
  /** اختيار المعلم — يبقى محفوظاً ما دامت الشعبة ممنوعة، ويعود بزوال المانع */
  selected: boolean;
  /** فيها مانع حفظ: المربع غير محدد ومعطّل */
  blocked: boolean;
  /** يُحسب حين تكون الدرجة العظمى صالحة */
  result: ComputeSummaryResult | null;
  check: SectionCheck | null;
  /** تحليل محفوظ بالمفتاح نفسه */
  duplicate: ResultsAnalysisRow | null;
  replace: boolean;
  willSave: boolean;
}

function columnLabel(key: string, samples: string[]): string {
  return samples.length > 0 ? `${key} — ${samples.join('، ')}` : key;
}

export default function UploadAnalysisSheet({ onClose, bands, analyses, saveAnalysis, onSaved, onToast }: UploadAnalysisSheetProps) {
  /** «رفع ملف» أو «إدخال الدرجات» — الثاني يبني نموذج الملف نفسه من النص */
  const [mode, setMode] = useState<EntryMode>('file');
  const [pasteText, setPasteText] = useState('');
  const [pasteSection, setPasteSection] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  /** نموذج الملف وحده يبقى في الحالة؛ الشبكة الخام تُرمى بعد القراءة */
  const [model, setModel] = useState<FileModel | null>(null);

  const [scoreCol, setScoreCol] = useState('');
  const [nameCol, setNameCol] = useState('');
  const [source, setSource] = useState<SectionSource | ''>('');
  const [sectionCol, setSectionCol] = useState('');
  const [singleSection, setSingleSection] = useState('');
  /** رقم الشعبة الذي حدده المعلم لكل قيمة غير مفهومة */
  const [manual, setManual] = useState<Record<string, string>>({});

  // بيانات الاختبار المشتركة لكل الشعب
  const [subject, setSubject] = useState('');
  const [stage, setStage] = useState('');
  const [grade, setGrade] = useState('');
  const [testType, setTestType] = useState('');
  const [testSeq, setTestSeq] = useState('');
  const [fullMarkText, setFullMarkText] = useState('');
  /** المعلم اختار الدرجة العظمى بيده — يوقف الاقتراح */
  const [fullMarkTouched, setFullMarkTouched] = useState(false);
  /** آخر قيمة جاءت من حقل «رقم آخر» لا من الأزرار */
  const [fullMarkFromInput, setFullMarkFromInput] = useState(false);

  /** شعب ألغى المعلم اختيارها */
  const [unchecked, setUnchecked] = useState<Record<number, boolean>>({});
  /** شعب محفوظة من قبل اختار لها المعلم «استبدال» (الافتراضي تخطي) */
  const [replaceChoice, setReplaceChoice] = useState<Record<number, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const gradeNumber = grade ? Number(grade) : null;
  // رقم الاختبار إلزامي للأنواع المرقّمة، ويُحفظ null للنهائي وأعمال السنة
  const needsSeq = testNeedsSeq(testType);
  const seqNumber = needsSeq && testSeq ? Number(testSeq) : null;
  const subjects = useMemo(() => subjectSuggestions(analyses), [analyses]);
  const testKnown = !!subject.trim() && !!stage && gradeNumber !== null && !!testType && (!needsSeq || seqNumber !== null);

  // ---- اقتراحات الملف ----

  const applyModel = (m: FileModel) => {
    const score = suggestScoreColumn(m);
    const name = suggestNameColumn(m, score);
    const sec = suggestSectionSource(m, score, name.nameCol);
    setModel(m);
    setScoreCol(score ?? '');
    setNameCol(name.nameCol ?? '');
    setSource(sec.source);
    setSectionCol(sec.column ?? '');
    setSingleSection('');
    setManual({});
    setUnchecked({});
    setReplaceChoice({});
    setSaveErrors({});
  };

  const readFile = async (f: File, headerRow: number | null) => {
    setParsing(true);
    try {
      const raw = await parseFile(f);
      const m = buildFileModel(raw, headerRow);
      if (m.totalRows === 0) {
        onToast('الملف فارغ أو لا يحوي صفوف بيانات', 'error');
        return;
      }
      setFile(f);
      applyModel(m);
    } catch (err) {
      console.error('[UploadAnalysisSheet] تعذّر قراءة الملف:', err);
      onToast('تعذّر قراءة الملف، تأكد من صيغته وحاول مجدداً', 'error');
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) {
      onToast('يُقبل فقط ملفات CSV أو Excel (xlsx)', 'error');
      return;
    }
    setModel(null);
    setFullMarkTouched(false);
    setFullMarkText('');
    await readFile(f, null);
  };

  // تغيير صف العناوين يعيد قراءة الملف نفسه، فلا تُحفظ الشبكة الخام
  const handleHeaderRowChange = (v: string) => {
    if (file && v) void readFile(file, Number(v));
  };

  const handleNameColChange = (v: string) => {
    setNameCol(v);
    const col = model?.columns.find(c => c.key === v);
    if (col && col.sectionInNameRatio > 0.5) setSource('name');
  };

  const handleFullMarkChange = (v: string, fromInput: boolean) => {
    setFullMarkText(v);
    setFullMarkFromInput(fromInput);
    setFullMarkTouched(true);
  };

  const handleModeChange = (m: EntryMode) => {
    if (m === mode) return;
    setMode(m);
    setUnchecked({});
    setReplaceChoice({});
    setSaveErrors({});
  };

  // الإدخال السريع: نموذج ملف من النص، بعمودَي اسم ودرجة وشعبة واحدة، ثم
  // المسار نفسه (splitSections ← computeSummary ← الفحص ← الحفظ)
  const pasteModel = useMemo(() => pasteText.trim() ? quickEntryModel(pasteText) : null, [pasteText]);
  const pasteStatus = useMemo(() => pasteModel ? quickEntryStatus(pasteModel) : null, [pasteModel]);
  const isPaste = mode === 'paste';
  const activeModel = isPaste ? pasteModel : model;
  const activeScoreCol = isPaste ? QUICK_SCORE_COL : scoreCol;
  const activeNameCol = isPaste ? QUICK_NAME_COL : nameCol;
  const activeSingle = isPaste ? pasteSection : singleSection;

  const statuses = useMemo(() => model ? sheetStatuses(model, scoreCol || null) : [], [model, scoreCol]);
  const availability = useMemo(() => model ? sectionSourceAvailability(model, scoreCol || null, nameCol || null) : null, [model, scoreCol, nameCol]);
  const effectiveSource: SectionSource | '' = isPaste ? 'single' : source && availability?.[source] ? source : '';

  const split = useMemo(() => {
    if (!activeModel || !activeScoreCol || !effectiveSource) return null;
    if (effectiveSource === 'column' && !sectionCol) return null;
    const manualNums: Record<string, number> = {};
    for (const [k, v] of Object.entries(manual)) if (v) manualNums[k] = Number(v);
    return splitSections(activeModel, {
      scoreCol: activeScoreCol,
      nameCol: activeNameCol || null,
      source: effectiveSource,
      sectionCol: sectionCol || null,
      singleSection: activeSingle ? Number(activeSingle) : null,
      manual: manualNums,
    });
  }, [activeModel, activeScoreCol, activeNameCol, effectiveSource, sectionCol, activeSingle, manual]);

  // ---- الدرجة العظمى: من الملف، أو من تحليل سابق للاختبار نفسه، أو يختارها المعلم ----

  const fullMarkSuggestion = useMemo(() => {
    const fromFile = activeModel ? fileFullMark(activeModel, activeScoreCol || null) : null;
    if (fromFile) {
      const label = isPaste ? 'من صيغة الدرجات المدخلة' : fromFile.source === 'header' ? 'من اسم العمود' : 'من صيغة الدرجات في الملف';
      return { value: fromFile.value, label };
    }
    if (!testKnown) return null;
    const prev = findSameTestFullMark(analyses, { subject, stage, grade: gradeNumber, testType, testSeq: seqNumber, section: null });
    if (!prev) return null;
    return { value: prev.fullMark, label: prev.section !== null ? `من تحليل شعبة ${prev.section}` : 'من تحليل سابق للاختبار نفسه' };
  }, [activeModel, activeScoreCol, isPaste, testKnown, analyses, subject, stage, gradeNumber, testType, seqNumber]);

  const fullMarkStr = fullMarkTouched ? fullMarkText : (fullMarkSuggestion ? String(fullMarkSuggestion.value) : '');
  const fullMarkIsInput = fullMarkTouched ? fullMarkFromInput : (!!fullMarkSuggestion && !FULL_MARK_PRESETS.includes(fullMarkSuggestion.value));
  const fullMarkNum = Number(fullMarkStr);
  const fullMarkValid = fullMarkStr.trim() !== '' && Number.isFinite(fullMarkNum) && fullMarkNum > 0;
  const metaComplete = testKnown && fullMarkValid;

  // ---- الشعب ----

  const views = useMemo<SectionView[]>(() => (split?.groups ?? []).map(group => {
    const { present, absent } = countPresence(group.rows);
    const hasScores = present > 0;
    const selected = hasScores && !unchecked[group.section];
    const result = fullMarkValid
      ? computeSummary({ rows: group.rows, bands, fullMark: fullMarkNum, multiSheet: group.sheets.length > 1 })
      : null;
    const prevCount = testKnown
      ? previousSectionCount(analyses, { subject, stage, grade: gradeNumber, section: group.section })
      : null;
    const check = result ? checkSection(result, fullMarkNum, prevCount) : null;
    const duplicate = testKnown
      ? findDuplicateAnalysis(analyses, { subject, stage, grade: gradeNumber, section: group.section, testType, testSeq: seqNumber })
      : null;
    const replace = !!duplicate && !!replaceChoice[group.section];
    const blocked = !!check && check.blockers.length > 0;
    const willSave = selected && metaComplete && !!check && !blocked && (!duplicate || replace);
    return { group, present, absent, hasScores, selected, blocked, result, check, duplicate, replace, willSave };
  }), [split, unchecked, fullMarkValid, fullMarkNum, bands, testKnown, analyses, subject, stage, gradeNumber, testType, seqNumber, replaceChoice, metaComplete]);

  const saveCount = views.filter(v => v.willSave).length;
  const selectedViews = views.filter(v => v.selected);

  const handleSave = async () => {
    const toSave = views.filter(v => v.willSave && v.result);
    if (toSave.length === 0 || gradeNumber === null) return;
    setSaving(true);
    const errors: Record<number, string> = {};
    const saved: ResultsAnalysisRow[] = [];
    try {
      for (const v of toSave) {
        const res = await saveAnalysis({
          subject: subject.trim(),
          stage: stage as StageCode,
          grade_level: gradeNumber,
          class_section: v.group.section,
          test_type: testType as TestTypeCode,
          test_seq: seqNumber,
          full_mark: fullMarkNum,
        }, v.result!.summary, v.replace && v.duplicate ? v.duplicate.id : undefined);
        if (res.row) saved.push(res.row);
        else errors[v.group.section] = res.duplicate ? 'محفوظ من قبل — حدّث الصفحة' : 'تعذّر الحفظ، حاول مجدداً';
      }
    } finally {
      setSaving(false);
    }
    // المحفوظة تظهر الآن «محفوظ من قبل»، وافتراضها تخطي
    setReplaceChoice(prev => {
      const next = { ...prev };
      for (const r of saved) if (r.class_section !== null) delete next[r.class_section];
      return next;
    });
    setSaveErrors(errors);
    const failed = toSave.length - saved.length;
    if (failed === 0) {
      onToast(saved.length === 1 ? 'تم حفظ التحليل' : `حُفظت ${countAr(saved.length, AR_ANALYSIS)}`, 'success');
      onSaved(saved[0]);
    } else {
      onToast(`تعذّر حفظ ${countAr(failed, AR_ANALYSIS)} من ${toSave.length}`, 'error');
    }
  };

  // ---- العرض ----

  const includedSheets = statuses.filter(s => s.included);
  const skippedSheets = statuses.filter(s => !s.included);
  const multiSheet = (model?.sheets.length ?? 0) > 1;
  const numericCols = model?.columns.filter(c => c.numeric) ?? [];
  const scoreOptions = (numericCols.length > 0 ? numericCols : model?.columns ?? []).map(c => ({ value: c.key, label: columnLabel(c.key, c.samples) }));
  const otherOptions = (model?.columns ?? []).filter(c => c.key !== scoreCol).map(c => ({ value: c.key, label: columnLabel(c.key, c.samples) }));
  const testTitle = [subject.trim(), formatClass(stage, gradeNumber, null), formatTest(testType, seqNumber), fullMarkValid ? `من ${fmtNum(fullMarkNum)}` : '']
    .filter(Boolean).join(' · ');
  const saveLabel = saveCount > 0 ? `حفظ ${countAr(saveCount, AR_ANALYSIS, { genitive: true })}` : 'حفظ';

  return (
    <>
      <div className="flex items-center gap-2.5 px-[18px] pt-3.5 pb-2.5 shrink-0">
        <span className="w-9 h-9 rounded-[var(--r-sm)] bg-[var(--s2)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0">
          <i className="ti ti-file-spreadsheet" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">رفع كشف درجات</div>
          <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-0.5">
            {isPaste ? 'الصق الدرجات أو اكتبها — تُعالَج بالكامل داخل متصفحك' : 'CSV أو Excel — يُعالَج بالكامل داخل متصفحك'}
          </div>
        </div>
        <button onClick={onClose} className={ICON_BTN_SM_CLS}>
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-[18px] pt-1 pb-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => handleModeChange('file')} className={`${CHIP_CLS} gap-1.5 ${!isPaste ? CHIP_ON : CHIP_OFF}`}>
            <i className="ti ti-upload text-[16px]" /> رفع ملف
          </button>
          <button type="button" onClick={() => handleModeChange('paste')} className={`${CHIP_CLS} gap-1.5 ${isPaste ? CHIP_ON : CHIP_OFF}`}>
            <i className="ti ti-keyboard text-[16px]" /> إدخال الدرجات
          </button>
        </div>

        {isPaste && (
          <div className="space-y-3">
            <div>
              <div className={LABEL_CLS}>الدرجات <span className="text-[var(--danger)]">*</span></div>
              <textarea
                rows={7}
                className={TEXTAREA_CLS}
                placeholder={'درجة في كل سطر، أو الاسم ثم الدرجة\nمثال: أحمد، 18'}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
              {pasteStatus && <QuickStatusLine status={pasteStatus} />}
              {!pasteStatus && (
                <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">يُقبل اللصق من Excel، و«غ» للغائب</div>
              )}
            </div>
            <div>
              <div className={LABEL_CLS}>الشعبة <span className="text-[var(--danger)]">*</span></div>
              <SelectDropdown options={sectionOptions} value={pasteSection} onChange={setPasteSection} placeholder="رقم الشعبة" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
            </div>
          </div>
        )}

        {/* اختيار الملف — شكل .drop ثم .picked في نموذج الشاهد */}
        {!isPaste && <div>
          <div className={LABEL_CLS}><i className="ti ti-upload text-[16px] text-[var(--t2)]" /> الملف <span className="text-[var(--danger)]">*</span></div>
          <input type="file" id="results-analysis-file" className="hidden" accept=".csv,.xlsx" onChange={handleFileChange} />
          <label
            htmlFor="results-analysis-file"
            className={`block rounded-[var(--r-md)] p-[18px] text-center text-[length:var(--fs-sm)] text-[var(--t3)] cursor-pointer transition-colors duration-150 ${
              model ? 'border border-[var(--bd)] bg-[var(--s2)]' : parsing ? 'border-[1.5px] border-dashed border-[var(--bd2)] opacity-80 cursor-wait' : 'border-[1.5px] border-dashed border-[var(--bd2)] hover:border-[var(--t3)]'
            }`}
          >
            {parsing ? (
              <div className="flex flex-col items-center">
                <i className={`ti ti-loader text-[24px] text-[var(--t2)] mb-1 ${SPIN_CLS}`} />
                <p className="text-[var(--t2)]">جاري القراءة...</p>
              </div>
            ) : model && file ? (
              <div className="flex flex-col items-center">
                <i className="ti ti-file-check text-[24px] text-[var(--t2)] mb-1" />
                <p className="font-bold text-[var(--t1)]">
                  {multiSheet ? `${countAr(model.sheets.length, AR_SHEET)} · ` : ''}{countAr(model.totalRows, AR_ROW)}
                </p>
                <span className="text-[length:var(--fs-xs)] text-[var(--t2)] mt-1" dir="ltr" style={{ unicodeBidi: 'isolate' }}>{file.name}</span>
                <span className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">انقر لاستبدال الملف</span>
              </div>
            ) : (
              <div>
                <i className="ti ti-cloud-upload text-[24px] mb-1 block" />
                <p>انقر لاختيار الملف</p>
                <span className="text-[length:var(--fs-xs)] mt-0.5 block">CSV · XLSX</span>
              </div>
            )}
          </label>
        </div>}

        {/* ما فهمته الأداة من الملف — يؤكده المعلم أو يصححه */}
        {!isPaste && model && (
          <div className={BLOCK_CLS}>
            <div className={BLOCK_TITLE_CLS}>
              <i className="ti ti-file-search text-[16px]" /> ما وجدناه في ملفك
            </div>

            {multiSheet && (
              <div className="space-y-1">
                {includedSheets.length > 0 && (
                  <div className={`${LINE_CLS} text-[var(--t2)]`}>
                    <i className="ti ti-table text-[16px] shrink-0" />
                    <span>أوراق الدرجات: {includedSheets.map(s => s.name).join('، ')}</span>
                  </div>
                )}
                {skippedSheets.map(s => (
                  <div key={s.name} className={`${LINE_CLS} text-[var(--t3)]`}>
                    <i className="ti ti-table-off text-[16px] shrink-0" />
                    <span>«{s.name}» — تُخطّيت: {s.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {model.hiddenColumns > 0 && (
              <div className={`${LINE_CLS} text-[var(--t3)]`}>
                <i className="ti ti-eye-off text-[16px] shrink-0" />
                <span>أعمدة البريد والمعرّفات ({model.hiddenColumns}) لا تُقرأ ولا تُحفظ</span>
              </div>
            )}

            <div>
              <div className={LABEL_CLS}>صف العناوين</div>
              <SelectDropdown options={headerRowOptions} value={String(model.headerRow)} onChange={handleHeaderRowChange} placeholder="اختر" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
            </div>

            <div>
              <div className={LABEL_CLS}>عمود الدرجة <span className="text-[var(--danger)]">*</span></div>
              <SelectDropdown options={scoreOptions} value={scoreCol} onChange={setScoreCol} placeholder="اختر العمود" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
              {!scoreCol && (
                <div className="text-[length:var(--fs-xs)] text-[var(--warn)] mt-1">لم نحدد عمود الدرجة. اختره من القائمة</div>
              )}
            </div>

            <div>
              <div className={LABEL_CLS}>عمود الاسم</div>
              <SelectDropdown options={otherOptions} value={nameCol} onChange={handleNameColChange} placeholder="— بلا أسماء —" triggerClassName={INPUT_CLS + ' cursor-pointer'} allowClear />
              {!nameCol && (
                <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">بلا أسماء يظهر الطلاب «طالب 1»، «طالب 2»… ودرجاتهم كاملة في التحليل</div>
              )}
            </div>

            <div>
              <div className={LABEL_CLS}>مصدر الشعبة <span className="text-[var(--danger)]">*</span></div>
              <div className="flex flex-wrap gap-2">
                {SOURCE_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={!availability?.[o.value]}
                    onClick={() => setSource(o.value)}
                    className={`${CHIP_CLS} ${effectiveSource === o.value ? CHIP_ON : CHIP_OFF}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {effectiveSource === 'column' && (
                <div className="mt-2">
                  <SelectDropdown options={otherOptions.filter(o => o.value !== nameCol)} value={sectionCol} onChange={setSectionCol} placeholder="اختر عمود الشعبة" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
                </div>
              )}
              {effectiveSource === 'single' && (
                <div className="mt-2">
                  <SelectDropdown options={sectionOptions} value={singleSection} onChange={setSingleSection} placeholder="رقم الشعبة" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
                </div>
              )}
            </div>

            {split && split.unresolved.length > 0 && (
              <div className="space-y-2">
                <div className={`${LINE_CLS} text-[var(--t1)]`}>
                  <i className="ti ti-help-circle text-[16px] text-[var(--warn)] shrink-0" />
                  <span>لم نفهم رقم هذه الشعب. حدده لكل قيمة، وصفوفها لا تُحسب قبل ذلك</span>
                </div>
                {split.unresolved.map(u => (
                  <div key={u.key} className="grid grid-cols-2 gap-3 items-center">
                    <div className="text-[length:var(--fs-sm)] text-[var(--t1)] min-w-0 truncate">
                      «{u.label}» <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">{countAr(u.count, AR_ROW)}</span>
                    </div>
                    <SelectDropdown
                      options={sectionOptions}
                      value={manual[u.key] ?? ''}
                      onChange={v => setManual(prev => ({ ...prev, [u.key]: v }))}
                      placeholder="رقم الشعبة"
                      triggerClassName={INPUT_CLS + ' cursor-pointer'}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* بيانات الاختبار — مشتركة لكل الشعب، يختارها المعلم مرة واحدة */}
        {(isPaste || model) && (
          <div className={BLOCK_CLS}>
            <div className={BLOCK_TITLE_CLS}>
              <i className="ti ti-clipboard-text text-[16px]" /> بيانات الاختبار
            </div>
            <AnalysisMetaFields
              subject={subject}
              onSubject={setSubject}
              subjects={subjects}
              stage={stage}
              onStage={setStage}
              grade={grade}
              onGrade={setGrade}
              testType={testType}
              onTestType={setTestType}
              testSeq={testSeq}
              onTestSeq={setTestSeq}
              fullMarkStr={fullMarkStr}
              fullMarkIsInput={fullMarkIsInput}
              onFullMark={handleFullMarkChange}
              fullMarkHint={!fullMarkTouched && (
                <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">
                  {fullMarkSuggestion ? fullMarkSuggestion.label : isPaste ? 'اخترها' : 'لم نجدها في الملف. اخترها'}
                </div>
              )}
            />
          </div>
        )}

        {/* الشعب المكتشفة — كل شعبة مختارة تُحفظ تحليلاً مستقلاً */}
        {views.length > 0 && (
          <div className={BLOCK_CLS}>
            <div className={BLOCK_TITLE_CLS}>
              <i className="ti ti-users-group text-[16px]" /> {isPaste ? 'الشعبة' : 'الشعب في الملف'}
            </div>
            {views.map(v => (
              <SectionRowView
                key={v.group.section}
                view={v}
                testName={formatTest(testType, seqNumber)}
                saveError={saveErrors[v.group.section]}
                onToggle={checked => setUnchecked(prev => ({ ...prev, [v.group.section]: !checked }))}
                onReplace={replace => setReplaceChoice(prev => ({ ...prev, [v.group.section]: replace }))}
              />
            ))}
          </div>
        )}

        {/* بطاقة الملخص قبل الحفظ — التسمية الكاملة بخط أكبر ليظهر خطأ الصف أو الاختبار */}
        {metaComplete && selectedViews.length > 0 && (
          <div className="bg-[var(--s2)] border border-[var(--bd2)] rounded-[var(--r-md)] p-4 space-y-2">
            <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">{testTitle}</div>
            {selectedViews.map(v => <SummaryLine key={v.group.section} view={v} />)}
          </div>
        )}
      </div>

      <div className="flex gap-2 px-[18px] pt-3 pb-[18px] border-t border-[var(--bd)] shrink-0">
        <button onClick={onClose} className={BTN_GH}>
          إلغاء
        </button>
        <button
          onClick={handleSave}
          disabled={saveCount === 0 || saving}
          className={BTN_PRI + ' disabled:opacity-40 disabled:cursor-not-allowed'}
        >
          {saving ? <><i className={`ti ti-loader ${SPIN_CLS}`} /> جاري الحفظ...</> : <><i className="ti ti-check" /> {saveLabel}</>}
        </button>
      </div>
    </>
  );
}

function presenceText(v: SectionView): string {
  return `${countAr(v.present, AR_STUDENT)}${v.absent > 0 ? ` · ${countAr(v.absent, AR_ABSENT)}` : ''}`;
}

function SectionRowView({ view: v, testName, saveError, onToggle, onReplace }: {
  view: SectionView;
  testName: string;
  saveError?: string;
  onToggle: (checked: boolean) => void;
  onReplace: (replace: boolean) => void;
}) {
  const section = v.group.section;
  if (!v.hasScores) {
    // شعبة بلا أي درجة: لا مربع اختيار ولا حفظ
    return (
      <div className="rounded-[var(--r-sm)] border border-[var(--bd)] p-3 text-[length:var(--fs-sm)] text-[var(--t3)]">
        <span className="font-bold">شعبة {section}</span> — لا درجات ({countAr(v.absent, AR_ABSENT)})
      </div>
    );
  }
  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--bd)] p-3 space-y-2">
      <label className={`flex items-center gap-2.5 ${v.blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={v.selected && !v.blocked}
          disabled={v.blocked}
          onChange={e => onToggle(e.target.checked)}
          className={`${CHECKBOX_CLS} disabled:opacity-40 disabled:cursor-not-allowed`}
        />
        <span className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">شعبة {section}</span>
        <span className="text-[length:var(--fs-xs)] text-[var(--t2)]">— {presenceText(v)}</span>
      </label>

      {/* المانع يظهر ما دام قائماً، اختيرت الشعبة أم لا */}
      {v.check?.blockers.map(b => (
        <div key={b} className={`${LINE_CLS} text-[var(--danger)]`}>
          <i className="ti ti-alert-circle text-[16px] shrink-0" /><span>{b}</span>
        </div>
      ))}

      {v.selected && !v.blocked && v.duplicate && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[length:var(--fs-xs)] text-[var(--t1)]">{testName} لشعبة {section} محفوظ من قبل.</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => onReplace(true)} className={`${CHIP_CLS} ${v.replace ? CHIP_ON : CHIP_OFF}`}>استبدال</button>
            <button type="button" onClick={() => onReplace(false)} className={`${CHIP_CLS} ${!v.replace ? CHIP_ON : CHIP_OFF}`}>تخطي</button>
          </div>
        </div>
      )}

      {v.selected && !v.blocked && v.check?.warnings.map(w => (
        <div key={w} className={`${LINE_CLS} text-[var(--warn)]`}>
          <i className="ti ti-alert-triangle text-[16px] shrink-0" /><span>{w}</span>
        </div>
      ))}
      {v.selected && !v.blocked && v.result && v.result.ignoredRows.length > 0 && (
        <div className={`${LINE_CLS} text-[var(--t3)]`}>
          <i className="ti ti-info-circle text-[16px] shrink-0" />
          <span>تُجوهل {v.result.ignoredRows.length === 1 ? 'الصف' : 'الصفوف'} {listRows(v.result.ignoredRows)}: الدرجة ليست رقماً</span>
        </div>
      )}
      {saveError && (
        <div className={`${LINE_CLS} text-[var(--danger)]`}>
          <i className="ti ti-alert-circle text-[16px] shrink-0" /><span>{saveError}</span>
        </div>
      )}
    </div>
  );
}

function SummaryLine({ view: v }: { view: SectionView }) {
  const section = v.group.section;
  const blocker = v.check?.blockers[0];
  if (blocker) {
    return (
      <div className={`${LINE_CLS} text-[var(--danger)]`}>
        <i className="ti ti-alert-triangle text-[16px] shrink-0" />
        <span>شعبة {section} — {blocker} (لن تُحفظ)</span>
      </div>
    );
  }
  if (v.duplicate && !v.replace) {
    return <div className="text-[length:var(--fs-sm)] text-[var(--t3)]">شعبة {section} — تُتخطى (محفوظة من قبل)</div>;
  }
  const avg = v.result ? ` · المتوسط ${fmtPct(v.result.summary.averagePct ?? 0)}` : '';
  return (
    <div className="space-y-1">
      <div className="text-[length:var(--fs-sm)] text-[var(--t1)]">
        شعبة {section} — {presenceText(v)}{avg}{v.replace ? ' · تستبدل المحفوظ' : ''}
      </div>
      {v.result?.summary.inflationDetected && (
        <div className={`${LINE_CLS} text-[var(--warn)]`}>
          <i className="ti ti-alert-triangle text-[16px] shrink-0" /><span>{INFLATION_WARNING}</span>
        </div>
      )}
    </div>
  );
}

/** «27 درجة · 2 غائبان · تُجوهل السطر 5: ليس رقماً» — تحت مربع الإدخال السريع */
function QuickStatusLine({ status }: { status: { present: number; absent: number; ignoredLines: string[] } }) {
  const parts = [countAr(status.present, AR_SCORE)];
  if (status.absent > 0) parts.push(countAr(status.absent, AR_ABSENT));
  const ignored = status.ignoredLines;
  return (
    <div className="text-[length:var(--fs-xs)] mt-1">
      <span className="text-[var(--t2)]">{parts.join(' · ')}</span>
      {ignored.length > 0 && (
        <span className="text-[var(--warn)]">
          {' · '}{ignored.length === 1 ? 'تُجوهل السطر' : 'تُجوهلت الأسطر'} {listRows(ignored)}: ليس رقماً
        </span>
      )}
    </div>
  );
}
