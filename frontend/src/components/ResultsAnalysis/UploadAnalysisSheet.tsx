import { useEffect, useState } from 'react';
import { SelectDropdown } from '../UI';
import type { ToastKind } from '../UI';
import { BTN_GH, BTN_PRI, BTN_SM } from '../SectionView';
import ResultsBarChart from './ResultsBarChart';
import { parseFile } from './parseFile';
import {
  computeSummary, deriveUniformSubject, detectColumns, distinctSectionValues, findSameTestFullMark, fmtNum, formatScore,
  gradeCountFor, gradeOrdinal, parseSectionNumber, DEFAULT_FULL_MARK, FULL_MARK_PRESETS, SECTION_LIST_MAX, SECTION_MAX,
  STAGE_OPTIONS, TEST_SEQ_LABELS, TEST_TYPE_OPTIONS, testNeedsSeq,
} from './logic';
import type { AnalysisMeta, AnalysisSummary, ColumnDetectionResult, GradeBand, ParsedFile, ResultsAnalysisRow, StageCode, TestTypeCode } from './types';

interface UploadAnalysisSheetProps {
  onClose: () => void;
  bands: GradeBand[];
  /** تحليلات المعلم المحفوظة — لملء الدرجة العظمى من شعبة أخرى في الاختبار نفسه */
  analyses: ResultsAnalysisRow[];
  saveAnalysis: (meta: AnalysisMeta, summary: AnalysisSummary) => Promise<ResultsAnalysisRow | null>;
  onSaved: (row: ResultsAnalysisRow) => void;
  onToast: (msg: string, kind: ToastKind) => void;
}

// نفس ثوابت الحقول في EvidenceForm.tsx (نص مكرر، بلا استيراد منه)
const INPUT_CLS = 'w-full h-11 px-3 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--bg)] text-[length:var(--fs-sm)] text-[var(--t1)] outline-none transition-colors duration-150 placeholder:text-[var(--t3)] focus:border-[var(--accent)]';
const LABEL_CLS = 'text-[length:var(--fs-sm)] font-bold text-[var(--t1)] mb-2 flex items-center gap-1.5';
const ICON_BTN_SM_CLS = 'w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0 cursor-pointer hover:text-[var(--t1)]';
const SPIN_CLS = 'animate-spin motion-reduce:animate-none';
const NOTE_CLS = 'flex items-start gap-2 text-[length:var(--fs-xs)] bg-[var(--s2)] border rounded-[var(--r-sm)] p-3';
const BLOCK_CLS = 'bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4 space-y-3';
const BLOCK_TITLE_CLS = 'text-[length:var(--fs-xs)] font-bold text-[var(--t3)] flex items-center gap-1.5';
const CHIP_CLS = 'h-9 px-3 inline-flex items-center rounded-[var(--r-sm)] border text-[length:var(--fs-sm)] font-bold cursor-pointer';
const CHIP_INPUT_CLS = 'w-24 h-9 px-3 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--bg)] text-[length:var(--fs-sm)] text-[var(--t1)] outline-none transition-colors duration-150 placeholder:text-[var(--t3)] focus:border-[var(--accent)]';
const STAT_NUM = 'text-[length:var(--fs-lg)] font-bold text-[var(--t1)]';
const STAT_TEXT = 'text-[length:var(--fs-sm)] font-bold text-[var(--t1)]';
const STAT_LABEL = 'text-[length:var(--fs-xs)] text-[var(--t3)] mt-0.5';

const SECTION_OTHER = 'other';
/** أكثر عدد من أرقام الصفوف يُذكر في رسالة المنع */
const MAX_LISTED_ROWS = 10;

const stageOptions = STAGE_OPTIONS.map(s => ({ value: s.value, label: s.label }));
const sectionOptions = [
  ...Array.from({ length: SECTION_LIST_MAX }, (_, i) => ({ value: String(i + 1), label: `شعبة ${i + 1}` })),
  { value: SECTION_OTHER, label: 'شعبة أخرى' },
];
const testTypeOptions = TEST_TYPE_OPTIONS.map(t => ({ value: t.value, label: t.label }));
const testSeqOptions = [
  ...TEST_SEQ_LABELS.map((label, i) => ({ value: String(i + 1), label })),
];

function listRows(rows: number[]): string {
  const shown = rows.slice(0, MAX_LISTED_ROWS).join('، ');
  return rows.length > MAX_LISTED_ROWS ? `${shown}، و${rows.length - MAX_LISTED_ROWS} غيرها` : shown;
}

export default function UploadAnalysisSheet({ onClose, bands, analyses, saveAnalysis, onSaved, onToast }: UploadAnalysisSheetProps) {
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [detection, setDetection] = useState<ColumnDetectionResult | null>(null);

  const [scoreCol, setScoreCol] = useState('');
  const [nameCol, setNameCol] = useState('');
  const [sectionCol, setSectionCol] = useState('');
  const [subjectCol, setSubjectCol] = useState('');

  // بيانات الاختبار
  const [subject, setSubject] = useState('');
  const [stage, setStage] = useState('');
  const [grade, setGrade] = useState('');
  const [sectionChoice, setSectionChoice] = useState('');
  const [sectionOther, setSectionOther] = useState('');
  const [testType, setTestType] = useState('');
  const [testSeq, setTestSeq] = useState('');
  const [fullMarkText, setFullMarkText] = useState(String(DEFAULT_FULL_MARK));
  /** المعلم غيّر الدرجة العظمى بيده — يوقف الملء التلقائي */
  const [fullMarkTouched, setFullMarkTouched] = useState(false);
  /** آخر قيمة جاءت من حقل «رقم آخر» لا من الأزرار — يُبقي ما يكتبه ظاهراً فيه */
  const [fullMarkFromInput, setFullMarkFromInput] = useState(false);
  /** الشعبة التي أُخذت منها الدرجة العظمى تلقائياً، أو undefined */
  const [autoFilledFrom, setAutoFilledFrom] = useState<number | null | undefined>(undefined);

  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  /** سبب منع الحفظ (درجات فوق العظمى، أو أكثر من شعبة) — يبقى ظاهراً حتى إعادة التحليل */
  const [blockError, setBlockError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sectionNumber = sectionChoice === SECTION_OTHER ? parseSectionNumber(sectionOther) : (sectionChoice ? Number(sectionChoice) : null);
  const gradeNumber = grade ? Number(grade) : null;
  // رقم الاختبار إلزامي للأنواع المرقّمة، ويُحفظ null للنهائي وأعمال السنة
  const needsSeq = testNeedsSeq(testType);
  const seqNumber = needsSeq && testSeq ? Number(testSeq) : null;
  const fullMarkNum = Number(fullMarkText);
  const fullMarkValid = fullMarkText.trim() !== '' && Number.isFinite(fullMarkNum) && fullMarkNum > 0;
  const gradeOptions = Array.from({ length: gradeCountFor(stage) }, (_, i) => ({ value: String(i + 1), label: gradeOrdinal(i + 1) }));
  const metaComplete = !!subject.trim() && !!stage && gradeNumber !== null && sectionNumber !== null && !!testType && (!needsSeq || seqNumber !== null) && fullMarkValid;

  // ملء الدرجة العظمى من تحليل الاختبار نفسه في شعبة أخرى — ما لم يغيّرها المعلم بيده
  useEffect(() => {
    if (fullMarkTouched) return;
    // نوع مرقّم بلا رقم بعد: لا يُعرف الاختبار، فلا بحث
    const match = needsSeq && seqNumber === null ? null : findSameTestFullMark(analyses, {
      subject, stage, grade: gradeNumber, testType, testSeq: seqNumber, section: sectionNumber,
    });
    if (match) {
      setFullMarkText(String(match.fullMark));
      setFullMarkFromInput(!FULL_MARK_PRESETS.includes(match.fullMark));
      setAutoFilledFrom(match.section);
    } else if (autoFilledFrom !== undefined) {
      setFullMarkText(String(DEFAULT_FULL_MARK));
      setFullMarkFromInput(false);
      setAutoFilledFrom(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyses, subject, stage, gradeNumber, testType, needsSeq, seqNumber, sectionNumber, fullMarkTouched]);

  // أي تغيير يمسّ الحساب بعد التحليل يمسح المعاينة، فيلزم التحليل من جديد
  useEffect(() => {
    setSummary(null);
    setBlockError(null);
  }, [scoreCol, nameCol, sectionCol, fullMarkText]);

  const resetParsedState = () => {
    setParsed(null); setDetection(null); setSummary(null); setBlockError(null);
    setScoreCol(''); setNameCol(''); setSectionCol(''); setSubjectCol(''); setSubject('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      onToast('يُقبل فقط ملفات CSV أو Excel (xlsx)', 'error');
      return;
    }
    setFileName(file.name);
    setParsing(true);
    resetParsedState();
    try {
      const result = await parseFile(file);
      if (result.rows.length === 0) {
        onToast('الملف فارغ أو لا يحوي صفوف بيانات', 'error');
        return;
      }
      const det = detectColumns(result.headers);
      setParsed(result);
      setDetection(det);
      setScoreCol(det.scoreCol ?? '');
      setNameCol(det.nameCol ?? '');
      setSectionCol(det.sectionCol ?? '');
      setSubjectCol(det.subjectCol ?? '');
      setSubject(deriveUniformSubject(result, det.subjectCol));
      // عمود شعبة بقيمة واحدة صالحة يُقترح رقماً للشعبة
      const sections = distinctSectionValues(result, det.sectionCol);
      const suggested = sections.length === 1 ? parseSectionNumber(sections[0]) : null;
      if (suggested !== null) {
        if (suggested <= SECTION_LIST_MAX) { setSectionChoice(String(suggested)); }
        else { setSectionChoice(SECTION_OTHER); setSectionOther(String(suggested)); }
      }
    } catch (err) {
      console.error('[UploadAnalysisSheet] تعذّر قراءة الملف:', err);
      onToast('تعذّر قراءة الملف، تأكد من صيغته وحاول مجدداً', 'error');
    } finally {
      setParsing(false);
    }
  };

  const handleStageChange = (v: string) => {
    setStage(v);
    if (gradeNumber !== null && gradeNumber > gradeCountFor(v)) setGrade('');
  };

  const handleFullMarkChange = (v: string, fromInput: boolean) => {
    setFullMarkText(v);
    setFullMarkFromInput(fromInput);
    setFullMarkTouched(true);
    setAutoFilledFrom(undefined);
  };

  const canAnalyze = !!parsed && !!scoreCol && metaComplete;

  const handleAnalyze = () => {
    if (!parsed || !scoreCol || !metaComplete) return;
    setSummary(null);
    setBlockError(null);

    const sections = distinctSectionValues(parsed, sectionCol || null);
    if (sections.length > 1) {
      setBlockError(`الملف فيه أكثر من شعبة (${sections.join('، ')}). ارفع كل شعبة في ملف مستقل`);
      return;
    }

    const { summary: result, overMaxRows } = computeSummary({
      parsed,
      bands,
      scoreCol,
      nameCol,
      fullMark: fullMarkNum,
    });
    if (overMaxRows.length > 0) {
      setBlockError(`درجات أعلى من الدرجة العظمى (${fmtNum(fullMarkNum)}) في الصفوف: ${listRows(overMaxRows)}. صحّحها ثم أعد التحليل`);
      return;
    }
    if (result.totalStudents === 0) {
      onToast('لم يُعثر على أي درجة صالحة في العمود المحدَّد', 'error');
      return;
    }
    setSummary(result);
  };

  const handleSave = async () => {
    if (!summary || blockError) return;
    if (!metaComplete || sectionNumber === null || gradeNumber === null) { onToast('أكمل بيانات الاختبار', 'error'); return; }
    setSaving(true);
    try {
      const row = await saveAnalysis({
        subject: subject.trim(),
        stage: stage as StageCode,
        grade_level: gradeNumber,
        class_section: sectionNumber,
        test_type: testType as TestTypeCode,
        test_seq: seqNumber,
        full_mark: fullMarkNum,
      }, summary);
      if (row) {
        onToast('تم حفظ التحليل بنجاح', 'success');
        onSaved(row);
      } else {
        onToast('تعذّر حفظ التحليل، حاول مجدداً', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const columnOptions = (parsed?.headers ?? []).map(h => ({ value: h, label: h }));
  const scoreDetectionFailed = !!parsed && !detection?.scoreCol;
  const nameDetectionFailed = !!parsed && !detection?.nameCol;
  const sectionOtherInvalid = sectionChoice === SECTION_OTHER && sectionOther.trim() !== '' && sectionNumber === null;
  const absentCount = summary?.absentCount ?? 0;

  return (
    <>
      <div className="flex items-center gap-2.5 px-[18px] pt-3.5 pb-2.5 shrink-0">
        <span className="w-9 h-9 rounded-[var(--r-sm)] bg-[var(--s2)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0">
          <i className="ti ti-file-spreadsheet" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">رفع كشف درجات</div>
          <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-0.5">CSV أو Excel — يُعالَج بالكامل داخل متصفحك</div>
        </div>
        <button onClick={onClose} className={ICON_BTN_SM_CLS}>
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-[18px] pt-1 pb-4 space-y-4">
        {/* اختيار الملف — شكل .drop ثم .picked في نموذج الشاهد */}
        <div>
          <div className={LABEL_CLS}><i className="ti ti-upload text-[16px] text-[var(--t2)]" /> الملف <span className="text-[var(--danger)]">*</span></div>
          <input type="file" id="results-analysis-file" className="hidden" accept=".csv,.xlsx" onChange={handleFileChange} />
          <label
            htmlFor="results-analysis-file"
            className={`block rounded-[var(--r-md)] p-[18px] text-center text-[length:var(--fs-sm)] text-[var(--t3)] cursor-pointer transition-colors duration-150 ${
              parsed ? 'border border-[var(--bd)] bg-[var(--s2)]' : parsing ? 'border-[1.5px] border-dashed border-[var(--bd2)] opacity-80 cursor-wait' : 'border-[1.5px] border-dashed border-[var(--bd2)] hover:border-[var(--t3)]'
            }`}
          >
            {parsing ? (
              <div className="flex flex-col items-center">
                <i className={`ti ti-loader text-[24px] text-[var(--t2)] mb-1 ${SPIN_CLS}`} />
                <p className="text-[var(--t2)]">جاري القراءة...</p>
              </div>
            ) : parsed ? (
              <div className="flex flex-col items-center">
                <i className="ti ti-file-check text-[24px] text-[var(--t2)] mb-1" />
                <p className="font-bold text-[var(--t1)]">{parsed.rows.length} صف · {parsed.headers.length} عمود</p>
                <span className="text-[length:var(--fs-xs)] text-[var(--t2)] mt-1" dir="ltr" style={{ unicodeBidi: 'isolate' }}>{fileName}</span>
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
        </div>

        {/* تحديد الأعمدة — تظهر دائماً بعد القراءة، مُعبَّأة تلقائياً حين يمكن ذلك */}
        {parsed && (
          <div className={BLOCK_CLS}>
            <div className={BLOCK_TITLE_CLS}>
              <i className="ti ti-columns text-[16px]" /> تحديد الأعمدة
            </div>

            {scoreDetectionFailed && (
              <div className={`${NOTE_CLS} text-[var(--t1)] border-[var(--warn)]/35`}>
                <i className="ti ti-alert-triangle text-[16px] text-[var(--warn)] shrink-0" />
                <span>تعذّر تحديد عمود الدرجة تلقائياً — اخترْه يدوياً من القائمة أدناه</span>
              </div>
            )}

            {nameDetectionFailed && (
              <div className={`${NOTE_CLS} text-[var(--t2)] border-[var(--bd)]`}>
                <i className="ti ti-info-circle text-[16px] text-[var(--info)] shrink-0" />
                <span>تعذّر تحديد عمود الاسم تلقائياً — اخترْه يدوياً من القائمة، أو تابع بدون أسماء (سيظهر الطلاب كـ"طالب 1"، "طالب 2"... مع بقاء درجاتهم كاملة في التحليل)</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={LABEL_CLS}>عمود الدرجة <span className="text-[var(--danger)]">*</span></div>
                <SelectDropdown options={columnOptions} value={scoreCol} onChange={setScoreCol} placeholder="اختر العمود" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
              </div>
              <div>
                <div className={LABEL_CLS}>عمود الاسم</div>
                <SelectDropdown options={columnOptions} value={nameCol} onChange={setNameCol} placeholder="— بدون أسماء —" triggerClassName={INPUT_CLS + ' cursor-pointer'} allowClear />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={LABEL_CLS}>عمود الشعبة/الفصل</div>
                <SelectDropdown options={columnOptions} value={sectionCol} onChange={setSectionCol} placeholder="— بدون —" triggerClassName={INPUT_CLS + ' cursor-pointer'} allowClear />
              </div>
              <div>
                <div className={LABEL_CLS}>عمود المادة</div>
                <SelectDropdown options={columnOptions} value={subjectCol} onChange={setSubjectCol} placeholder="— بدون —" triggerClassName={INPUT_CLS + ' cursor-pointer'} allowClear />
              </div>
            </div>
          </div>
        )}

        {/* بيانات الاختبار — كل تحليل شعبة واحدة في اختبار واحد */}
        {parsed && (
          <div className={BLOCK_CLS}>
            <div className={BLOCK_TITLE_CLS}>
              <i className="ti ti-clipboard-text text-[16px]" /> بيانات الاختبار
            </div>

            <div>
              <div className={LABEL_CLS}>المادة الدراسية <span className="text-[var(--danger)]">*</span></div>
              <input type="text" className={INPUT_CLS} placeholder="مثال: الرياضيات" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className={LABEL_CLS}>المرحلة <span className="text-[var(--danger)]">*</span></div>
                <SelectDropdown options={stageOptions} value={stage} onChange={handleStageChange} placeholder="اختر" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
              </div>
              <div>
                <div className={LABEL_CLS}>الصف <span className="text-[var(--danger)]">*</span></div>
                <SelectDropdown options={gradeOptions} value={grade} onChange={setGrade} placeholder={stage ? 'اختر' : 'المرحلة أولاً'} triggerClassName={INPUT_CLS + ' cursor-pointer'} />
              </div>
              <div>
                <div className={LABEL_CLS}>الشعبة <span className="text-[var(--danger)]">*</span></div>
                <SelectDropdown options={sectionOptions} value={sectionChoice} onChange={setSectionChoice} placeholder="اختر" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
              </div>
            </div>

            {sectionChoice === SECTION_OTHER && (
              <div>
                <div className={LABEL_CLS}>رقم الشعبة <span className="text-[var(--danger)]">*</span></div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={SECTION_MAX}
                  className={INPUT_CLS}
                  placeholder={`من 1 إلى ${SECTION_MAX}`}
                  value={sectionOther}
                  onChange={e => setSectionOther(e.target.value)}
                />
                {sectionOtherInvalid && (
                  <div className="text-[length:var(--fs-xs)] text-[var(--danger)] mt-1">رقم الشعبة عدد صحيح من 1 إلى {SECTION_MAX}</div>
                )}
              </div>
            )}

            <div className={`grid ${needsSeq ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              <div>
                <div className={LABEL_CLS}>نوع الاختبار <span className="text-[var(--danger)]">*</span></div>
                <SelectDropdown options={testTypeOptions} value={testType} onChange={setTestType} placeholder="اختر النوع" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
              </div>
              {needsSeq && (
                <div>
                  <div className={LABEL_CLS}>رقم الاختبار <span className="text-[var(--danger)]">*</span></div>
                  <SelectDropdown options={testSeqOptions} value={testSeq} onChange={setTestSeq} placeholder="اختر" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
                  <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">مثلاً: الفتري الأول أو الثاني</div>
                </div>
              )}
            </div>

            <div>
              <div className={LABEL_CLS}>الدرجة العظمى <span className="text-[var(--danger)]">*</span></div>
              <div className="flex flex-wrap items-center gap-2">
                {FULL_MARK_PRESETS.map(v => {
                  const active = !fullMarkFromInput && fullMarkValid && fullMarkNum === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleFullMarkChange(String(v), false)}
                      className={`${CHIP_CLS} ${active ? 'border-[var(--t2)] text-[var(--t1)]' : 'border-[var(--bd2)] text-[var(--t2)]'}`}
                    >
                      {v}
                    </button>
                  );
                })}
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className={CHIP_INPUT_CLS}
                  placeholder="رقم آخر"
                  value={fullMarkFromInput ? fullMarkText : ''}
                  onChange={e => handleFullMarkChange(e.target.value, true)}
                />
              </div>
              {!fullMarkValid && fullMarkText.trim() !== '' && (
                <div className="text-[length:var(--fs-xs)] text-[var(--danger)] mt-1">الدرجة العظمى رقم أكبر من صفر</div>
              )}
              {autoFilledFrom !== undefined && (
                <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">
                  أُخذت من تحليل {autoFilledFrom !== null ? `شعبة ${autoFilledFrom}` : 'سابق'} في الاختبار نفسه
                </div>
              )}
            </div>
          </div>
        )}

        {parsed && (
          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className={BTN_SM + ' w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed'}
          >
            <i className="ti ti-chart-bar text-[20px]" /> تحليل البيانات
          </button>
        )}

        {blockError && (
          <div className={`${NOTE_CLS} text-[var(--t1)] border-[var(--danger)]/35`}>
            <i className="ti ti-alert-circle text-[16px] text-[var(--danger)] shrink-0" />
            <span>{blockError}</span>
          </div>
        )}

        {/* المعاينة والحفظ */}
        {summary && (
          <div className="space-y-4">
            {summary.skippedRows > 0 && (
              <div className={`${NOTE_CLS} text-[var(--t2)] border-[var(--bd)]`}>
                <i className="ti ti-info-circle text-[16px] text-[var(--info)] shrink-0" />
                <span>{summary.skippedRows} صف تم تجاهلها لأن درجتها ليست رقماً صالحاً</span>
              </div>
            )}

            <div className="bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
                <div>
                  <div className={STAT_NUM}>{summary.totalStudents}</div>
                  <div className={STAT_LABEL}>طالب</div>
                </div>
                <div>
                  <div className={STAT_NUM}>{absentCount}</div>
                  <div className={STAT_LABEL}>غائب</div>
                </div>
                <div>
                  <div className={STAT_TEXT}>{formatScore(summary.average, fullMarkNum)}</div>
                  <div className={STAT_LABEL}>المتوسط</div>
                </div>
                <div>
                  <div className={STAT_TEXT}>{fmtNum(summary.stdDev)} نقطة</div>
                  <div className={STAT_LABEL}>الانحراف المعياري</div>
                </div>
              </div>
              <ResultsBarChart summary={summary} bands={bands} />
            </div>

            {summary.inflationDetected && (
              <div className={`${NOTE_CLS} text-[var(--t1)] border-[var(--warn)]/35`}>
                <i className="ti ti-alert-triangle text-[16px] text-[var(--warn)] shrink-0" />
                <span>مؤشرات على تضخم في الدرجات — نسبة عالية من الدرجات المرتفعة جداً أو تكدّس ضعيف. يُنصح بتنويع أدوات التقييم لقياس الفروق الفردية بدقة أكبر.</span>
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
          disabled={!summary || !!blockError || !metaComplete || saving}
          className={BTN_PRI + ' disabled:opacity-40 disabled:cursor-not-allowed'}
        >
          {saving ? <><i className={`ti ti-loader ${SPIN_CLS}`} /> جاري الحفظ...</> : <><i className="ti ti-check" /> حفظ التحليل</>}
        </button>
      </div>
    </>
  );
}
