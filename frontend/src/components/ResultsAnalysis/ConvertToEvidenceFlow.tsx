import { useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { SelectDropdown } from '../UI';
import EvidenceModal from '../EvidenceModal';
import type { EvidenceFormProps } from '../EvidenceForm';
import ResultsBarChart from './ResultsBarChart';
import { supabase } from '../../supabaseClient';
import type { SectionData } from '../../types';
import type { GradeBand, ResultsAnalysisRow } from './types';

type SupabaseEvidenceHook = ReturnType<typeof import('../../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface ConvertToEvidenceFlowProps {
  analysis: ResultsAnalysisRow;
  bands: GradeBand[];
  sections: SectionData[];
  userId: string | undefined;
  supabaseEv: SupabaseEvidenceHook;
  onAddEv: EvidenceFormProps['onAddEv'];
  onToast: (msg: string, icon?: string) => void;
  onClose: () => void;
}

/**
 * تدفق "تحويل لشاهد" — على رسم بند 1 فقط، منفصل تماماً عن بند 2 (لا تنبيهات
 * ولا فحص ذكي يظهر هنا إطلاقاً). Toggle الأسماء يتحكم فعلياً فيما يُركَّب في
 * الـDOM قبل الالتقاط عبر html-to-image — لا تعديل بكسلي لاحق، فالصورة
 * الناتجة إما تحوي قائمة الأسماء أو لا تحويها إطلاقاً حسب حالته وقت الالتقاط.
 */
export default function ConvertToEvidenceFlow({ analysis, bands, sections, userId, supabaseEv, onAddEv, onToast, onClose }: ConvertToEvidenceFlowProps) {
  const [includeNames, setIncludeNames] = useState(false);
  const [sectionId, setSectionId] = useState('');
  const [sub, setSub] = useState('');
  const [converting, setConverting] = useState(false);
  const [prefill, setPrefill] = useState<{ title: string; fileUrl: string; fileName: string } | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  // قسم الاستراتيجيات مُستبعد من وجهات التحويل — رسم تحليل نتائج لا علاقة له
  // منطقياً بـ"استراتيجية تدريس" ولا بـ"مراعاة الفروق الفردية" (subs[0] الخاص
  // بذلك القسم الهجين)، نفس نمط nonStratSections الشائع بالمشروع.
  const nonStratSections = sections.filter(s => !s.isStrat);
  const chosenSection = nonStratSections.find(s => s.id === Number(sectionId));
  const subOptions = chosenSection ? chosenSection.subs : [];
  const effectiveSub = sub || subOptions[0] || 'عام';

  const handleConvert = async () => {
    if (converting) return;
    if (!sectionId) { onToast('يرجى اختيار القسم أولاً', '⚠️'); return; }
    if (!captureRef.current || !supabase || !userId) return;
    setConverting(true);
    try {
      const blob = await toBlob(captureRef.current, { backgroundColor: '#0d1613', pixelRatio: 2 });
      if (!blob) throw new Error('فشل التقاط الصورة');
      const path = `${userId}/${Date.now()}_analysis.png`;
      const { error } = await supabase.storage
        .from('evidence')
        .upload(path, blob, { cacheControl: '3600', upsert: false, contentType: 'image/png' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(path);
      setPrefill({
        title: `تحليل نتائج - ${analysis.subject} - ${new Date(analysis.created_at).toLocaleDateString('ar-SA')}`,
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
        sub={effectiveSub}
        userId={userId}
        supabaseEv={supabaseEv}
        onAddEv={onAddEv}
        onToast={onToast}
        prefill={prefill}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-[500] flex items-center justify-center p-4"
      style={{ animation: 'fadeIn .2s both' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[28px] w-full max-w-xl border border-[var(--em7)]/15 shadow-[0_40px_100px_rgba(0,0,0,.8)] relative overflow-hidden flex flex-col max-h-[90vh]"
        style={{ animation: 'scaleIn .35s var(--sp) both' }}
      >
        <div className="absolute top-0 right-[10%] left-[10%] h-[1.5px] bg-gradient-to-r from-transparent via-[var(--em7)] to-transparent" />
        <div className="flex items-center gap-4 px-7 pt-7 pb-5 border-b border-[var(--line)] shrink-0">
          <div className="w-[48px] h-[48px] rounded-2xl bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] flex items-center justify-center text-[22px] border border-[var(--em7)]/20">
            <i className="ti ti-photo-share" />
          </div>
          <div className="flex-1">
            <div className="text-[18px] font-black text-white">تحويل لشاهد</div>
            <div className="text-[12px] text-[var(--text4)] mt-0.5">يُضاف الرسم كصورة إلى القسم الذي تختاره</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/5 border border-[var(--line)] text-[var(--text4)] hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-[18px]">
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-7 py-6 space-y-4">
          <label className="flex items-center justify-between gap-3 bg-white/3 border border-[var(--line2)] rounded-xl p-3.5 cursor-pointer">
            <span className="text-[13px] font-bold text-white">تضمين أسماء الطلاب في الشاهد المحفوظ</span>
            <input type="checkbox" checked={includeNames} onChange={e => setIncludeNames(e.target.checked)} className="w-5 h-5 accent-[var(--em6)] cursor-pointer" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11.5px] font-extrabold text-[var(--text4)] tracking-wide uppercase mb-1.5">القسم <span className="text-red-400">*</span></div>
              <SelectDropdown
                options={nonStratSections.map(s => ({ value: String(s.id), label: s.ttl }))}
                value={sectionId}
                onChange={v => { setSectionId(v); setSub(''); }}
                placeholder="اختر القسم"
                triggerClassName="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-xl text-[13px] text-white cursor-pointer"
              />
            </div>
            <div>
              <div className="text-[11.5px] font-extrabold text-[var(--text4)] tracking-wide uppercase mb-1.5">البند الفرعي</div>
              <SelectDropdown
                options={subOptions.map(s => ({ value: s, label: s }))}
                value={effectiveSub}
                onChange={setSub}
                placeholder="اختر البند"
                triggerClassName="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-xl text-[13px] text-white cursor-pointer disabled:opacity-40"
              />
            </div>
          </div>

          {/* عنصر الالتقاط — يعكس بالضبط ما سيُحفَظ كصورة */}
          <div ref={captureRef} className="bg-[#0d1613] rounded-2xl p-5 border border-[var(--line2)]">
            <div className="text-[13px] font-extrabold text-white mb-3">تحليل نتائج - {analysis.subject}</div>
            <ResultsBarChart summary={analysis.summary} bands={bands} />
            {includeNames && (
              <div className="mt-4 pt-3 border-t border-[var(--line)]">
                <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-wide uppercase mb-2">الطلاب</div>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.summary.students.map((s, i) => (
                    <span key={i} className="text-[11px] font-semibold text-[var(--text2)] bg-white/5 border border-[var(--line2)] rounded-full px-2.5 py-1">{s.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-7 py-5 border-t border-[var(--line)] shrink-0">
          <button onClick={onClose} className="py-2.5 px-6 rounded-xl border border-[var(--line2)] bg-transparent text-[13.5px] font-bold text-[var(--text3)] hover:text-white hover:bg-white/5 transition-all duration-200 font-[var(--font)] cursor-pointer">
            إلغاء
          </button>
          <button
            onClick={handleConvert}
            disabled={converting || !sectionId}
            className="flex items-center gap-2 py-2.5 px-7 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white text-[13.5px] font-extrabold shadow-[0_6px_20px_rgba(42,122,68,.45)] hover:-translate-y-0.5 transition-all duration-250 disabled:opacity-40 disabled:cursor-not-allowed font-[var(--font)] cursor-pointer"
          >
            {converting ? <><i className="ti ti-loader animate-spin" /> جاري التجهيز...</> : <><i className="ti ti-photo-share" /> تحويل لشاهد</>}
          </button>
        </div>
      </div>
    </div>
  );
}
