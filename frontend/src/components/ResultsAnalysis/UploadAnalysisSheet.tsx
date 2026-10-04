import { useState } from 'react';
import { SelectDropdown } from '../UI';
import { BTN_GH, BTN_PRI, BTN_SM } from '../SectionView';
import ResultsBarChart from './ResultsBarChart';
import { parseFile } from './parseFile';
import { computeSummary, deriveUniformClassSection, deriveUniformSubject, detectColumns } from './logic';
import type { AnalysisSummary, ColumnDetectionResult, GradeBand, ParsedFile, ResultsAnalysisRow } from './types';

interface UploadAnalysisSheetProps {
  onClose: () => void;
  bands: GradeBand[];
  saveAnalysis: (subject: string, classSection: string | null, summary: AnalysisSummary) => Promise<ResultsAnalysisRow | null>;
  onSaved: (row: ResultsAnalysisRow) => void;
  onToast: (msg: string, icon?: string) => void;
}

// نفس ثوابت الحقول في EvidenceForm.tsx (نص مكرر، بلا استيراد منه)
const INPUT_CLS = 'w-full h-11 px-3 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--bg)] text-[length:var(--fs-sm)] text-[var(--t1)] outline-none transition-colors duration-150 placeholder:text-[var(--t3)] focus:border-[var(--accent)]';
const LABEL_CLS = 'text-[length:var(--fs-sm)] font-bold text-[var(--t1)] mb-2 flex items-center gap-1.5';
const ICON_BTN_SM_CLS = 'w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0 cursor-pointer hover:text-[var(--t1)]';
const SPIN_CLS = 'animate-spin motion-reduce:animate-none';
const NOTE_CLS = 'flex items-start gap-2 text-[length:var(--fs-xs)] bg-[var(--s2)] border rounded-[var(--r-sm)] p-3';

export default function UploadAnalysisSheet({ onClose, bands, saveAnalysis, onSaved, onToast }: UploadAnalysisSheetProps) {
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [detection, setDetection] = useState<ColumnDetectionResult | null>(null);

  const [scoreCol, setScoreCol] = useState('');
  const [nameCol, setNameCol] = useState('');
  const [sectionCol, setSectionCol] = useState('');
  const [subjectCol, setSubjectCol] = useState('');
  const [subject, setSubject] = useState('');

  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [saving, setSaving] = useState(false);

  const resetParsedState = () => {
    setParsed(null); setDetection(null); setSummary(null);
    setScoreCol(''); setNameCol(''); setSectionCol(''); setSubjectCol(''); setSubject('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      onToast('يُقبل فقط ملفات CSV أو Excel (xlsx)', '⚠️');
      return;
    }
    setFileName(file.name);
    setParsing(true);
    resetParsedState();
    try {
      const result = await parseFile(file);
      if (result.rows.length === 0) {
        onToast('الملف فارغ أو لا يحوي صفوف بيانات', '⚠️');
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
    } catch (err) {
      console.error('[UploadAnalysisSheet] تعذّر قراءة الملف:', err);
      onToast('تعذّر قراءة الملف، تأكد من صيغته وحاول مجدداً', '❌');
    } finally {
      setParsing(false);
    }
  };

  const canAnalyze = !!parsed && !!scoreCol;

  const handleAnalyze = () => {
    if (!parsed || !scoreCol) return;
    const result = computeSummary({
      parsed,
      bands,
      scoreCol,
      nameCol,
      sectionCol: sectionCol || null,
    });
    if (result.totalStudents === 0) {
      onToast('لم يُعثر على أي درجة صالحة (0-100) في العمود المحدَّد', '⚠️');
      return;
    }
    setSummary(result);
  };

  const handleSave = async () => {
    if (!summary || !subject.trim()) { onToast('يرجى إدخال المادة الدراسية', '⚠️'); return; }
    setSaving(true);
    try {
      const row = await saveAnalysis(subject.trim(), deriveUniformClassSection(summary), summary);
      if (row) {
        onToast('تم حفظ التحليل بنجاح ✅', '✅');
        onSaved(row);
      } else {
        onToast('تعذّر حفظ التحليل، حاول مجدداً', '❌');
      }
    } finally {
      setSaving(false);
    }
  };

  const columnOptions = (parsed?.headers ?? []).map(h => ({ value: h, label: h }));
  const scoreDetectionFailed = !!parsed && !detection?.scoreCol;
  const nameDetectionFailed = !!parsed && !detection?.nameCol;

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
          <div className="bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4 space-y-3">
            <div className="text-[length:var(--fs-xs)] font-bold text-[var(--t3)] flex items-center gap-1.5">
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

            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className={BTN_SM + ' w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed'}
            >
              <i className="ti ti-chart-bar text-[20px]" /> تحليل البيانات
            </button>
          </div>
        )}

        {/* المعاينة والحفظ */}
        {summary && (
          <div className="space-y-4">
            {summary.skippedRows > 0 && (
              <div className={`${NOTE_CLS} text-[var(--t2)] border-[var(--bd)]`}>
                <i className="ti ti-info-circle text-[16px] text-[var(--info)] shrink-0" />
                <span>{summary.skippedRows} صف تم تجاهلها لعدم احتوائها درجة صالحة (0-100)</span>
              </div>
            )}

            <div>
              <div className={LABEL_CLS}><i className="ti ti-book text-[16px] text-[var(--t2)]" /> المادة الدراسية <span className="text-[var(--danger)]">*</span></div>
              <input type="text" className={INPUT_CLS} placeholder="مثال: الرياضيات" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>

            <div className="bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
              <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                <div>
                  <div className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">{summary.totalStudents}</div>
                  <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-0.5">طالب</div>
                </div>
                <div>
                  <div className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">{summary.average.toFixed(1)}</div>
                  <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-0.5">المتوسط</div>
                </div>
                <div>
                  <div className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">{summary.stdDev.toFixed(1)}</div>
                  <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-0.5">الانحراف المعياري</div>
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
          disabled={!summary || saving}
          className={BTN_PRI + ' disabled:opacity-40 disabled:cursor-not-allowed'}
        >
          {saving ? <><i className={`ti ti-loader ${SPIN_CLS}`} /> جاري الحفظ...</> : <><i className="ti ti-check" /> حفظ التحليل</>}
        </button>
      </div>
    </>
  );
}
