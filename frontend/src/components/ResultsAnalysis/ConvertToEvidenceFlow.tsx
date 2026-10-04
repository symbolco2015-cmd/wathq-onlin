import { useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { SelectDropdown } from '../UI';
import { BTN_GH, BTN_PRI } from '../SectionView';
import EvidenceModal from '../EvidenceModal';
import type { EvidenceFormProps } from '../EvidenceForm';
import ResultsBarChart from './ResultsBarChart';
import { supabase } from '../../supabaseClient';
import type { SectionData } from '../../types';
import type { GradeBand, ResultsAnalysisRow } from './types';
import { formatDate } from '../../utils';

type SupabaseEvidenceHook = ReturnType<typeof import('../../hooks/useSupabaseEvidence').useSupabaseEvidence>;

// نفس ثوابت الحقول في EvidenceForm.tsx (نص مكرر، بلا استيراد منه)
const INPUT_CLS = 'w-full h-11 px-3 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--bg)] text-[length:var(--fs-sm)] text-[var(--t1)] outline-none transition-colors duration-150 placeholder:text-[var(--t3)] focus:border-[var(--accent)]';
const LABEL_CLS = 'text-[length:var(--fs-sm)] font-bold text-[var(--t1)] mb-2';
const ICON_BTN_SM_CLS = 'w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0 cursor-pointer hover:text-[var(--t1)]';

interface ConvertToEvidenceFlowProps {
  analysis: ResultsAnalysisRow;
  bands: GradeBand[];
  sections: SectionData[];
  userId: string | undefined;
  supabaseEv: SupabaseEvidenceHook;
  onEvidenceSaved: EvidenceFormProps['onEvidenceSaved'];
  onToast: (msg: string, icon?: string) => void;
  onClose: () => void;
}

/**
 * تدفق "تحويل لشاهد" — على رسم بند 1 فقط، منفصل تماماً عن بند 2 (لا تنبيهات
 * ولا فحص ذكي يظهر هنا إطلاقاً). Toggle الأسماء يتحكم فعلياً فيما يُركَّب في
 * الـDOM قبل الالتقاط عبر html-to-image — لا تعديل بكسلي لاحق، فالصورة
 * الناتجة إما تحوي قائمة الأسماء أو لا تحويها إطلاقاً حسب حالته وقت الالتقاط.
 */
export default function ConvertToEvidenceFlow({ analysis, bands, sections, userId, supabaseEv, onEvidenceSaved, onToast, onClose }: ConvertToEvidenceFlowProps) {
  const [includeNames, setIncludeNames] = useState(false);
  const [sectionId, setSectionId] = useState('');
  const [indicatorId, setIndicatorId] = useState('');
  const [converting, setConverting] = useState(false);
  const [prefill, setPrefill] = useState<{ title: string; fileUrl: string; fileName: string } | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  // قسم الاستراتيجيات مُستبعد من وجهات التحويل — رسم تحليل نتائج لا علاقة له
  // منطقياً بـ"استراتيجية تدريس" ولا بـ"مراعاة الفروق الفردية" (subs[0] الخاص
  // بذلك القسم الهجين)، نفس نمط nonStratSections الشائع بالمشروع. بندا 5/10
  // (isResultsSection) مُستبعدان أيضاً: محتواهما بالكامل واجهة هذه الأداة نفسها
  // الآن، فلا مؤشرات فرعية عادية متبقية فيهما لتحويل الرسم إليها.
  const nonStratSections = sections.filter(s => !s.isStrat && !s.isResultsSection);
  const chosenSection = nonStratSections.find(s => s.id === Number(sectionId));
  // البند مؤشر بمعرّفه، يُمرَّر للنموذج مختاراً. بلا اختيار صريح لا يُختار
  // شيء نيابةً عن المعلم، فيفتح النموذج على «اختر المؤشر».
  const indicatorOptions = chosenSection ? chosenSection.indicators : [];
  const chosenIndicator = indicatorOptions.find(ind => ind.id === indicatorId);

  const handleConvert = async () => {
    if (converting) return;
    if (!sectionId) { onToast('يرجى اختيار القسم أولاً', '⚠️'); return; }
    if (!captureRef.current || !supabase || !userId) return;
    setConverting(true);
    try {
      // قيمة --s1 ثابتة: خيار backgroundColor يُكتب على جذر النسخة كما هو،
      // ولا تُعرَّف متغيرات CSS هناك
      const blob = await toBlob(captureRef.current, { backgroundColor: '#121715', pixelRatio: 2 });
      if (!blob) throw new Error('فشل التقاط الصورة');
      const path = `${userId}/${Date.now()}_analysis.png`;
      const { error } = await supabase.storage
        .from('evidence')
        .upload(path, blob, { cacheControl: '3600', upsert: false, contentType: 'image/png' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(path);
      setPrefill({
        title: `تحليل نتائج - ${analysis.subject} - ${formatDate(analysis.created_at, 'short')}`,
        fileUrl: urlData.publicUrl,
        fileName: 'analysis.png',
      });
    } catch (err) {
      console.error('[ConvertToEvidenceFlow] تعذّر تحويل الرسم لشاهد:', err);
      onToast('تعذّر تحويل الرسم إلى شاهد، حاول مجدداً', '❌');
    } finally {
      setConverting(false);
    }
  };

  // بعد الرفع الناجح — افتح تدفق إضافة الشاهد المعتاد نفسه، مُعبَّأً مسبقاً
  if (prefill) {
    return (
      <EvidenceModal
        isOpen
        onClose={onClose}
        sectionId={Number(sectionId)}
        sub={chosenIndicator?.name_ar ?? ''}
        indicatorId={chosenIndicator?.id}
        userId={userId}
        supabaseEv={supabaseEv}
        onEvidenceSaved={onEvidenceSaved}
        onToast={onToast}
        prefill={prefill}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[500] flex items-center justify-center p-4"
      style={{ animation: 'fadeIn .2s both' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[var(--s1)] rounded-[var(--r-lg)] w-full max-w-xl border border-[var(--bd2)] relative overflow-hidden flex flex-col max-h-[90vh]"
        style={{ animation: 'scaleIn .35s var(--sp) both' }}
      >
        <div className="flex items-center gap-2.5 px-[18px] pt-3.5 pb-2.5 shrink-0">
          <span className="w-9 h-9 rounded-[var(--r-sm)] bg-[var(--s2)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0">
            <i className="ti ti-photo-share" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">تحويل لشاهد</div>
            <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-0.5">يُضاف الرسم كصورة إلى القسم الذي تختاره</div>
          </div>
          <button onClick={onClose} className={ICON_BTN_SM_CLS}>
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-[18px] pt-1 pb-4 space-y-4">
          <label className="flex items-center justify-between gap-3 bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-sm)] p-3 cursor-pointer">
            <span className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">تضمين أسماء الطلاب في الشاهد المحفوظ</span>
            <input type="checkbox" checked={includeNames} onChange={e => setIncludeNames(e.target.checked)} className="w-5 h-5 accent-[var(--accent)] cursor-pointer" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={LABEL_CLS}>القسم <span className="text-[var(--danger)]">*</span></div>
              <SelectDropdown
                options={nonStratSections.map(s => ({ value: String(s.id), label: s.ttl }))}
                value={sectionId}
                onChange={v => { setSectionId(v); setIndicatorId(''); }}
                placeholder="اختر القسم"
                triggerClassName={INPUT_CLS + ' cursor-pointer'}
              />
            </div>
            <div>
              <div className={LABEL_CLS}>البند الفرعي</div>
              <SelectDropdown
                options={indicatorOptions.map(ind => ({ value: ind.id, label: ind.name_ar }))}
                value={indicatorId}
                onChange={setIndicatorId}
                placeholder="اختر البند"
                triggerClassName={INPUT_CLS + ' cursor-pointer disabled:opacity-40'}
              />
            </div>
          </div>

          {/* عنصر الالتقاط — يعكس بالضبط ما سيُحفَظ كصورة */}
          <div ref={captureRef} className="bg-[var(--s1)] rounded-[var(--r-md)] p-4 border border-[var(--bd)]">
            <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)] mb-3">تحليل نتائج - {analysis.subject}</div>
            <ResultsBarChart summary={analysis.summary} bands={bands} />
            {includeNames && (
              <div className="mt-4 pt-3 border-t border-[var(--bd)]">
                <div className="text-[length:var(--fs-xs)] font-bold text-[var(--t3)] mb-2">الطلاب</div>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.summary.students.map((s, i) => (
                    <span key={i} className="text-[length:var(--fs-xs)] text-[var(--t2)] bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-full)] px-2.5 py-1">{s.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-[18px] pt-3 pb-[18px] border-t border-[var(--bd)] shrink-0">
          <button onClick={onClose} className={BTN_GH}>
            إلغاء
          </button>
          <button
            onClick={handleConvert}
            disabled={converting || !sectionId}
            className={BTN_PRI + ' disabled:opacity-40 disabled:cursor-not-allowed'}
          >
            {converting ? <><i className="ti ti-loader animate-spin motion-reduce:animate-none" /> جاري التجهيز...</> : <><i className="ti ti-photo-share" /> تحويل لشاهد</>}
          </button>
        </div>
      </div>
    </div>
  );
}
