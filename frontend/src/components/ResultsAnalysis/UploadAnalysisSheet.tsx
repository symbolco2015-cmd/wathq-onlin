import { useState } from 'react';
import { SelectDropdown } from '../UI';
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

const INPUT_CLS = 'w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-xl text-[13.5px] font-[var(--font)] text-white outline-none transition-all duration-200 placeholder-[var(--text4)] focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/40 focus:shadow-[0_0_0_3px_rgba(42,122,68,.12)]';
const LABEL_CLS = 'text-[11.5px] font-extrabold text-[var(--text4)] tracking-wide uppercase mb-1.5 flex items-center gap-1.5';

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
      <div className="absolute top-0 right-[10%] left-[10%] h-[1.5px] bg-gradient-to-r from-transparent via-[var(--em7)] to-transparent" />
      <div className="flex items-center gap-4 px-7 pt-7 pb-5 border-b border-[var(--line)] shrink-0">
        <div className="w-[48px] h-[48px] rounded-2xl bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] flex items-center justify-center text-[22px] border border-[var(--em7)]/20 shadow-[0_4px_16px_rgba(42,122,68,.3)]">
          <i className="ti ti-file-spreadsheet" />
        </div>
        <div className="flex-1">
          <div className="text-[18px] font-black text-white">رفع كشف درجات</div>
          <div className="text-[12px] text-[var(--text4)] mt-0.5">CSV أو Excel — يُعالَج بالكامل داخل متصفحك</div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/5 border border-[var(--line)] text-[var(--text4)] hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-[18px]">
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-7 py-6 space-y-5">
        {/* اختيار الملف */}
        <div>
          <div className={LABEL_CLS}><i className="ti ti-upload text-[var(--em7)]" /> الملف <span className="text-red-400">*</span></div>
          <input type="file" id="results-analysis-file" className="hidden" accept=".csv,.xlsx" onChange={handleFileChange} />
          <label
            htmlFor="results-analysis-file"
            className={`block border-[1.5px] border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-250 ${
              parsed ? 'border-[var(--em8)]/40 bg-[var(--em7)]/5' : parsing ? 'border-[var(--em7)]/20 opacity-80 cursor-wait' : 'border-white/10 hover:border-[var(--em7)]/30 hover:bg-white/3'
            }`}
          >
            {parsing ? (
              <div className="flex flex-col items-center py-1">
                <i className="ti ti-loader animate-spin text-[32px] text-[var(--em8)] mb-2" />
                <p className="text-[13px] text-white font-bold">جاري القراءة...</p>
              </div>
            ) : parsed ? (
              <div className="flex flex-col items-center py-1">
                <i className="ti ti-file-check text-[32px] text-[var(--em8)] mb-2" />
                <p className="text-[13px] text-[var(--em8)] font-black">{parsed.rows.length} صف · {parsed.headers.length} عمود</p>
                <span className="text-[11.5px] text-white mt-1.5 font-semibold" dir="ltr" style={{ unicodeBidi: 'isolate' }}>{fileName}</span>
                <span className="text-[10.5px] text-[var(--text4)] mt-1">انقر لاستبدال الملف</span>
              </div>
            ) : (
              <div className="py-1">
                <i className="ti ti-cloud-upload text-[32px] text-[var(--em6)] mb-2 block" />
                <p className="text-[13px] text-[var(--text3)] font-semibold">انقر لاختيار الملف</p>
                <span className="text-[11px] text-[var(--text4)] mt-0.5 block">CSV · XLSX</span>
              </div>
            )}
          </label>
        </div>

        {/* تحديد الأعمدة — تظهر دائماً بعد القراءة، مُعبَّأة تلقائياً حين يمكن ذلك */}
        {parsed && (
          <div className="bg-white/3 border border-[var(--line2)] rounded-2xl p-4 space-y-3.5">
            <div className="text-[11.5px] font-extrabold text-[var(--text4)] tracking-wide flex items-center gap-1.5">
              <i className="ti ti-columns" /> تحديد الأعمدة
            </div>

            {scoreDetectionFailed && (
              <div className="flex items-start gap-2 text-[12px] text-[var(--gold3)] bg-[var(--gold)]/10 border border-[var(--gold)]/25 rounded-xl p-3">
                <i className="ti ti-alert-triangle text-[15px] shrink-0 mt-0.5" />
                <span>تعذّر تحديد عمود الدرجة تلقائياً — اخترْه يدوياً من القائمة أدناه</span>
              </div>
            )}

            {nameDetectionFailed && (
              <div className="flex items-start gap-2 text-[12px] text-[var(--text3)] bg-white/3 border border-[var(--line2)] rounded-xl p-3">
                <i className="ti ti-info-circle text-[15px] shrink-0 mt-0.5" />
                <span>تعذّر تحديد عمود الاسم تلقائياً — اخترْه يدوياً من القائمة، أو تابع بدون أسماء (سيظهر الطلاب كـ"طالب 1"، "طالب 2"... مع بقاء درجاتهم كاملة في التحليل)</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={LABEL_CLS + ' !mb-1'}>عمود الدرجة <span className="text-red-400">*</span></div>
                <SelectDropdown options={columnOptions} value={scoreCol} onChange={setScoreCol} placeholder="اختر العمود" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
              </div>
              <div>
                <div className={LABEL_CLS + ' !mb-1'}>عمود الاسم</div>
                <SelectDropdown options={columnOptions} value={nameCol} onChange={setNameCol} placeholder="— بدون أسماء —" triggerClassName={INPUT_CLS + ' cursor-pointer'} allowClear />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={LABEL_CLS + ' !mb-1'}>عمود الشعبة/الفصل</div>
                <SelectDropdown options={columnOptions} value={sectionCol} onChange={setSectionCol} placeholder="— بدون —" triggerClassName={INPUT_CLS + ' cursor-pointer'} allowClear />
              </div>
              <div>
                <div className={LABEL_CLS + ' !mb-1'}>عمود المادة</div>
                <SelectDropdown options={columnOptions} value={subjectCol} onChange={setSubjectCol} placeholder="— بدون —" triggerClassName={INPUT_CLS + ' cursor-pointer'} allowClear />
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--em6)]/15 border border-[var(--em6)]/30 text-[var(--em8)] text-[12.5px] font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <i className="ti ti-chart-bar" /> تحليل البيانات
            </button>
          </div>
        )}

        {/* المعاينة والحفظ */}
        {summary && (
          <div className="space-y-4">
            {summary.skippedRows > 0 && (
              <div className="flex items-start gap-2 text-[12px] text-[var(--text3)] bg-white/3 border border-[var(--line2)] rounded-xl p-3">
                <i className="ti ti-info-circle text-[15px] shrink-0 mt-0.5" />
                <span>{summary.skippedRows} صف تم تجاهلها لعدم احتوائها درجة صالحة (0-100)</span>
              </div>
            )}

            <div>
              <div className={LABEL_CLS}><i className="ti ti-book text-[var(--em7)]" /> المادة الدراسية <span className="text-red-400">*</span></div>
              <input type="text" className={INPUT_CLS} placeholder="مثال: الرياضيات" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>

            <div className="bg-white/3 border border-[var(--line2)] rounded-2xl p-4">
              <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                <div>
                  <div className="text-[22px] font-black text-white">{summary.totalStudents}</div>
                  <div className="text-[10.5px] text-[var(--text4)] mt-0.5">طالب</div>
                </div>
                <div>
                  <div className="text-[22px] font-black text-[var(--em8)]">{summary.average.toFixed(1)}</div>
                  <div className="text-[10.5px] text-[var(--text4)] mt-0.5">المتوسط</div>
                </div>
                <div>
                  <div className="text-[22px] font-black text-white">{summary.stdDev.toFixed(1)}</div>
                  <div className="text-[10.5px] text-[var(--text4)] mt-0.5">الانحراف المعياري</div>
                </div>
              </div>
              <ResultsBarChart summary={summary} bands={bands} />
            </div>

            {summary.inflationDetected && (
              <div className="flex items-start gap-2 text-[12px] text-[var(--gold3)] bg-[var(--gold)]/10 border border-[var(--gold)]/25 rounded-xl p-3">
                <i className="ti ti-alert-triangle text-[15px] shrink-0 mt-0.5" />
                <span>مؤشرات على تضخم في الدرجات — نسبة عالية من الدرجات المرتفعة جداً أو تكدّس ضعيف. يُنصح بتنويع أدوات التقييم لقياس الفروق الفردية بدقة أكبر.</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 px-7 py-5 border-t border-[var(--line)] shrink-0">
        <button onClick={onClose} className="py-2.5 px-6 rounded-xl border border-[var(--line2)] bg-transparent text-[13.5px] font-bold text-[var(--text3)] hover:text-white hover:bg-white/5 transition-all duration-200 font-[var(--font)] cursor-pointer">
          إلغاء
        </button>
        <button
          onClick={handleSave}
          disabled={!summary || saving}
          className="flex items-center gap-2 py-2.5 px-7 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white text-[13.5px] font-extrabold shadow-[0_6px_20px_rgba(42,122,68,.45)] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(42,122,68,.6)] transition-all duration-250 disabled:opacity-40 disabled:cursor-not-allowed font-[var(--font)] cursor-pointer"
        >
          {saving ? <><i className="ti ti-loader animate-spin" /> جاري الحفظ...</> : <><i className="ti ti-check" /> حفظ التحليل</>}
        </button>
      </div>
    </>
  );
}
