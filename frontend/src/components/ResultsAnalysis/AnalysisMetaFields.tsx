import { useMemo, useState, type ReactNode } from 'react';
import { SelectDropdown } from '../UI';
import { SECTION_MAX } from './fileModel';
import {
  findSimilarSubject, gradeCountFor, gradeOrdinal, normalizeSubject, FULL_MARK_PRESETS, STAGE_OPTIONS, TEST_SEQ_LABELS,
  TEST_TYPE_OPTIONS, testNeedsSeq,
} from './logic';

/** حقول بيانات الاختبار المشتركة بين نافذة الرفع ونافذة التعديل */

// نفس ثوابت الحقول في EvidenceForm.tsx (نص مكرر، بلا استيراد منه)
export const INPUT_CLS = 'w-full h-11 px-3 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--bg)] text-[length:var(--fs-sm)] text-[var(--t1)] outline-none transition-colors duration-150 placeholder:text-[var(--t3)] focus:border-[var(--accent)]';
export const LABEL_CLS = 'text-[length:var(--fs-sm)] font-bold text-[var(--t1)] mb-2 flex items-center gap-1.5';
export const ICON_BTN_SM_CLS = 'w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0 cursor-pointer hover:text-[var(--t1)]';
export const SPIN_CLS = 'animate-spin motion-reduce:animate-none';
export const BLOCK_CLS = 'bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4 space-y-3';
export const BLOCK_TITLE_CLS = 'text-[length:var(--fs-xs)] font-bold text-[var(--t3)] flex items-center gap-1.5';
export const CHIP_CLS = 'h-9 px-3 inline-flex items-center rounded-[var(--r-sm)] border text-[length:var(--fs-sm)] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
export const CHIP_ON = 'border-[var(--t2)] text-[var(--t1)]';
export const CHIP_OFF = 'border-[var(--bd2)] text-[var(--t2)]';
export const CHIP_INPUT_CLS = 'w-24 h-9 px-3 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--bg)] text-[length:var(--fs-sm)] text-[var(--t1)] outline-none transition-colors duration-150 placeholder:text-[var(--t3)] focus:border-[var(--accent)]';
export const LINE_CLS = 'flex items-start gap-1.5 text-[length:var(--fs-xs)]';
export const CHECKBOX_CLS = 'w-5 h-5 shrink-0 accent-[var(--accent)] cursor-pointer';

const REQ = <span className="text-[var(--danger)]">*</span>;

const stageOptions = STAGE_OPTIONS.map(s => ({ value: s.value, label: s.label }));
const testTypeOptions = TEST_TYPE_OPTIONS.map(t => ({ value: t.value, label: t.label }));
const testSeqOptions = TEST_SEQ_LABELS.map((label, i) => ({ value: String(i + 1), label }));
export const sectionOptions = Array.from({ length: SECTION_MAX }, (_, i) => ({ value: String(i + 1), label: `شعبة ${i + 1}` }));

/** أكثر عدد من رقائق المواد السابقة */
const MAX_SUBJECT_CHIPS = 8;

/** حقل المادة: رقائق المواد السابقة عند التركيز (قبل الكتابة)، وسطر «هل
 *  تقصد…؟» لاسم جديد قريب من اسم محفوظ. الرقائق مضمّنة لا عائمة، فلا
 *  تقصّها حاوية النافذة. */
export function SubjectField({ value, onChange, subjects }: {
  value: string;
  onChange: (v: string) => void;
  /** مواد المعلم، الأحدث أولاً */
  subjects: string[];
}) {
  const [focused, setFocused] = useState(false);
  const chips = useMemo(() => {
    const q = normalizeSubject(value);
    const list = q ? subjects.filter(s => normalizeSubject(s).includes(q) && s !== value.trim()) : subjects;
    return list.slice(0, MAX_SUBJECT_CHIPS);
  }, [subjects, value]);
  const similar = findSimilarSubject(value, subjects);

  return (
    <div>
      <div className={LABEL_CLS}>المادة الدراسية {REQ}</div>
      <input
        type="text"
        className={INPUT_CLS}
        placeholder="مثال: الرياضيات"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {focused && chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {chips.map(s => (
            <button
              key={s}
              type="button"
              // mousedown قبل blur، فلا تختفي الرقاقة قبل أن تُختار
              onMouseDown={e => { e.preventDefault(); onChange(s); }}
              onClick={() => onChange(s)}
              className={`${CHIP_CLS} ${CHIP_OFF}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {similar && (
        <div className="flex items-center gap-2 flex-wrap mt-2 text-[length:var(--fs-xs)] text-[var(--t1)]">
          <span>هل تقصد <b className="font-bold">{similar}</b>؟</span>
          <button type="button" onClick={() => onChange(similar)} className={`${CHIP_CLS} ${CHIP_OFF}`}>نعم</button>
        </div>
      )}
    </div>
  );
}

export interface MetaFieldsProps {
  subject: string;
  onSubject: (v: string) => void;
  subjects: string[];
  stage: string;
  onStage: (v: string) => void;
  grade: string;
  onGrade: (v: string) => void;
  /** الشعبة — تُعرض فقط مع onSection (نافذة التعديل) */
  section?: string;
  onSection?: (v: string) => void;
  testType: string;
  onTestType: (v: string) => void;
  testSeq: string;
  onTestSeq: (v: string) => void;
  fullMarkStr: string;
  /** القيمة جاءت من حقل «رقم آخر» لا من الأزرار */
  fullMarkIsInput: boolean;
  onFullMark: (v: string, fromInput: boolean) => void;
  /** سطر تحت الدرجة العظمى (مصدر الاقتراح، أو مانع) */
  fullMarkHint?: ReactNode;
}

/** المادة، والمرحلة والصف، والشعبة (اختياري)، ونوع الاختبار ورقمه، والدرجة العظمى */
export function AnalysisMetaFields(p: MetaFieldsProps) {
  const gradeOptions = Array.from({ length: gradeCountFor(p.stage) }, (_, i) => ({ value: String(i + 1), label: gradeOrdinal(i + 1) }));
  const needsSeq = testNeedsSeq(p.testType);
  const fullMarkNum = Number(p.fullMarkStr);
  const fullMarkValid = p.fullMarkStr.trim() !== '' && Number.isFinite(fullMarkNum) && fullMarkNum > 0;

  const handleStage = (v: string) => {
    p.onStage(v);
    if (p.grade && Number(p.grade) > gradeCountFor(v)) p.onGrade('');
  };

  return (
    <>
      <SubjectField value={p.subject} onChange={p.onSubject} subjects={p.subjects} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={LABEL_CLS}>المرحلة {REQ}</div>
          <SelectDropdown options={stageOptions} value={p.stage} onChange={handleStage} placeholder="اختر" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
        </div>
        <div>
          <div className={LABEL_CLS}>الصف {REQ}</div>
          <SelectDropdown options={gradeOptions} value={p.grade} onChange={p.onGrade} placeholder={p.stage ? 'اختر' : 'المرحلة أولاً'} triggerClassName={INPUT_CLS + ' cursor-pointer'} />
        </div>
      </div>

      {p.onSection && (
        <div>
          <div className={LABEL_CLS}>الشعبة {REQ}</div>
          <SelectDropdown options={sectionOptions} value={p.section ?? ''} onChange={p.onSection} placeholder="اختر" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
        </div>
      )}

      <div className={`grid ${needsSeq ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
        <div>
          <div className={LABEL_CLS}>نوع الاختبار {REQ}</div>
          <SelectDropdown options={testTypeOptions} value={p.testType} onChange={p.onTestType} placeholder="اختر النوع" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
        </div>
        {needsSeq && (
          <div>
            <div className={LABEL_CLS}>رقم الاختبار {REQ}</div>
            <SelectDropdown options={testSeqOptions} value={p.testSeq} onChange={p.onTestSeq} placeholder="اختر" triggerClassName={INPUT_CLS + ' cursor-pointer'} />
            <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">مثلاً: الفتري الأول أو الثاني</div>
          </div>
        )}
      </div>

      <div>
        <div className={LABEL_CLS}>الدرجة العظمى {REQ}</div>
        <div className="flex flex-wrap items-center gap-2">
          {FULL_MARK_PRESETS.map(v => {
            const active = !p.fullMarkIsInput && fullMarkValid && fullMarkNum === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => p.onFullMark(String(v), false)}
                className={`${CHIP_CLS} ${active ? CHIP_ON : CHIP_OFF}`}
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
            value={p.fullMarkIsInput ? p.fullMarkStr : ''}
            onChange={e => p.onFullMark(e.target.value, true)}
          />
        </div>
        {!fullMarkValid && p.fullMarkStr.trim() !== '' && (
          <div className="text-[length:var(--fs-xs)] text-[var(--danger)] mt-1">الدرجة العظمى رقم أكبر من صفر</div>
        )}
        {p.fullMarkHint}
      </div>
    </>
  );
}
