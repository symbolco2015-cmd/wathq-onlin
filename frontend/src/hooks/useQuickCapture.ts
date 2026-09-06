import { useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../supabaseClient';
import type { SectionData } from '../types';
import { useVoiceRecording } from './useVoiceRecording';
import { useSaveEvidence } from './useSaveEvidence';

type SupabaseEvidenceHook = ReturnType<typeof import('./useSupabaseEvidence').useSupabaseEvidence>;

interface Indicator {
  id: string;
  name_ar: string;
}

// نفس حد الصور في EvidenceForm (TYPE_CONFIG['image'].maxSizeMB)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// إيقاف مؤقت لميزة "تسجيل صوتي سريع" (2026-08-14) — شاهد صوتي بلا دليل
// بصري لا يخدم غرض التوثيق جيداً، إضافة لمشكلة تصنيف تلقائي معروفة بالذكاء
// الاصطناعي (section_id قد يُحفَظ null فلا يظهر الشاهد في القسم المتوقَّع).
// ستُعاد الميزة لاحقاً بتصميم أفضل. لا يمسّ هذا التبديل EvidenceForm (له
// ميزة توثيق صوتي منفصلة عبر useVoiceRecording مباشرة، لا تمر من هنا).
// لإعادة التفعيل: أعد القيمة إلى true فقط. مُصدَّرة لأن Dashboard.tsx يعرض
// محتوى بديلاً ثابتاً داخل الـBottom Sheet نفسه بدل التدفّق المعتاد.
export const VOICE_CAPTURE_ENABLED = false;
export const VOICE_CAPTURE_DISABLED_MESSAGE = 'هذه الميزة قيد التطوير حالياً وستعود قريباً بشكل أفضل';

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
};

interface UseQuickCaptureOptions {
  userId: string | undefined;
  supabaseEv: SupabaseEvidenceHook | undefined;
  onAddEv: (sid: number, sub: string, type: 'pdf' | 'img' | 'doc' | 'vid', name: string, url?: string) => void;
  onToast: (msg: string, icon?: string) => void;
  /** لازمة فقط لتدفّق "تسجيل صوتي سريع" — قائمة الأقسام لاقتراح القسم الأنسب ولتحديد اسم البند الفرعي عند الحفظ */
  sections?: SectionData[];
  aiConsentGiven?: boolean;
  onGiveAiConsent?: () => void;
}

/**
 * يحصر منطق تدفّق "التقاط سريع": صورة فوراً ← اختيار بند ← حفظ بعنوان تلقائي،
 * بنفس آلية الضغط/الرفع المستخدمة في EvidenceForm (دون تعديل ذلك الملف).
 */
export function useQuickCapture({ userId, supabaseEv, onAddEv, onToast, sections, aiConsentGiven, onGiveAiConsent }: UseQuickCaptureOptions) {
  // مسار الكتابة الموحّد — INSERT في evidence، وعند نجاحه فقط تحديث state.ev
  // + monthly_progress عبر onAddEv (انظر useSaveEvidence.ts)
  const { saveEvidence } = useSaveEvidence(supabaseEv?.addEvidence, onAddEv);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [pickerSheetOpen, setPickerSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── اختيار البند ثم المؤشر الفرعي (خطوتان داخل نفس الـBottom Sheet) ─────
  const [pendingSection, setPendingSection] = useState<SectionData | null>(null);
  const [sectionIndicators, setSectionIndicators] = useState<Indicator[]>([]);
  const [indicatorsLoading, setIndicatorsLoading] = useState(false);

  const openPicker = () => fileInputRef.current?.click();

  const reset = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(null);
    setPendingPreviewUrl(null);
    setPickerSheetOpen(false);
    setSaving(false);
    setPendingSection(null);
    setSectionIndicators([]);
    setIndicatorsLoading(false);
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      onToast(`حجم الصورة يتجاوز الحد المسموح (${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB).`, '❌');
      return;
    }
    setPendingFile(file);
    setPendingPreviewUrl(URL.createObjectURL(file));
    setPickerSheetOpen(true);
  };

  const cancelPending = () => reset();

  /** الخطوة الأولى: اختيار البند — يجلب مؤشراته الفرعية فوراً (نفس استعلام
   *  EvidenceForm: section_indicators مرتّبة بـweight) وينقل الشيت للخطوة
   *  الثانية. لا رفع ولا حفظ عند هذه الخطوة. */
  const selectSection = async (sec: SectionData) => {
    setPendingSection(sec);
    setSectionIndicators([]);
    if (!supabase) return;
    setIndicatorsLoading(true);
    try {
      const { data, error } = await supabase
        .from('section_indicators')
        .select('id, name_ar')
        .eq('section_id', sec.id)
        .order('weight', { ascending: true })
        .order('name_ar', { ascending: true });
      if (error) {
        console.warn('[QuickCapture] تعذّر تحميل مؤشرات القسم:', error.message);
        setSectionIndicators([]);
        return;
      }
      setSectionIndicators(data ?? []);
    } finally {
      setIndicatorsLoading(false);
    }
  };

  /** رجوع من خطوة اختيار المؤشر إلى خطوة اختيار البند، دون إغلاق الشيت */
  const backToSectionPicker = () => {
    setPendingSection(null);
    setSectionIndicators([]);
    setIndicatorsLoading(false);
  };

  /** الخطوة الثانية: اختيار المؤشر — هنا فقط يبدأ الرفع والحفظ الفعليان */
  const saveToIndicator = async (indicator: Indicator) => {
    const sec = pendingSection;
    if (!pendingFile || saving || !sec) return;
    if (!supabaseEv) {
      onToast('غير متاح حالياً، يرجى المحاولة مجدداً', '❌');
      return;
    }
    setSaving(true);
    try {
      let fileToUpload: File = pendingFile;
      try {
        fileToUpload = await imageCompression(pendingFile, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: false });
      } catch (compressErr) {
        console.warn('[QuickCapture] فشل ضغط الصورة، تم استخدام الملف الأصلي:', compressErr);
      }

      let fileUrl = '';
      if (userId && supabase) {
        const ext = pendingFile.name.split('.').pop();
        const rand = Math.random().toString(36).substring(2, 9);
        const filePath = `${userId}/${Date.now()}_${rand}.${ext}`;
        const { error } = await supabase.storage
          .from('evidence')
          .upload(filePath, fileToUpload, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath);
        fileUrl = urlData.publicUrl;
      } else {
        fileUrl = URL.createObjectURL(fileToUpload);
      }

      const title = `شاهد سريع - ${new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}`;
      // sub = اسم المؤشر المختار فعلياً (indicator.name_ar)، لا subs[0] الثابت —
      // حتى يُصنَّف الشاهد محلياً (state.ev) تحت نفس المؤشر المسجَّل في evidence
      // عبر indicator_id، بدل الانحياز دائماً لأول مؤشر بالقسم بصرف النظر عن اختيار المستخدم
      const result = await saveEvidence({
        section_id: sec.id,
        indicator_id: indicator.id,
        sub: indicator.name_ar,
        title,
        evidence_type: 'image',
        file_url: fileUrl,
      });

      if (!result) {
        onToast('تعذّر الحفظ، يرجى المحاولة مجدداً', '❌');
        setSaving(false);
        return;
      }

      if (!result.localSyncOk) {
        onToast('تم حفظ الشاهد، لكن تعذّر تحديث العرض المحلي — يرجى تحديث الصفحة', '⚠️');
        reset();
        return;
      }

      onToast('تم حفظ الشاهد بنجاح ✅', '✅');
      reset();
    } catch (err) {
      console.error('[QuickCapture] خطأ في الحفظ:', err);
      onToast('تعذّر رفع الصورة، يرجى المحاولة مجدداً', '❌');
      setSaving(false);
    }
  };

  // ── تسجيل صوتي سريع (Beta) ────────────────────────────────────────────
  // تدفّق مستقل تماماً عن التقاط الصورة أعلاه: تسجيل ← تفريغ + اقتراح قسم
  // من الذكاء الاصطناعي ← حفظ فوري دون اختيار يدوي للبند (بعكس الصورة).
  const voiceRecording = useVoiceRecording();
  const [voiceConsentPromptOpen, setVoiceConsentPromptOpen] = useState(false);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);

  const startVoiceCapture = () => {
    // معطَّلة مؤقتاً — يُفتح الشيت ليعرض رسالة "قيد التطوير" فقط، دون طلب
    // إذن الميكروفون أو استدعاء getUserMedia بأي شكل (انظر VOICE_CAPTURE_ENABLED أعلاه)
    if (!VOICE_CAPTURE_ENABLED) { setVoiceSheetOpen(true); return; }
    if (!aiConsentGiven) { setVoiceConsentPromptOpen(true); return; }
    setVoiceSheetOpen(true);
    voiceRecording.startRecording();
  };

  const acceptVoiceConsent = () => {
    onGiveAiConsent?.();
    setVoiceConsentPromptOpen(false);
    setVoiceSheetOpen(true);
    voiceRecording.startRecording();
  };

  const cancelVoiceCapture = () => {
    if (voiceRecording.isRecording) voiceRecording.stopRecording();
    setVoiceConsentPromptOpen(false);
    setVoiceSheetOpen(false);
  };

  useEffect(() => {
    const audioBase64 = voiceRecording.audioBase64;
    if (!audioBase64) return;
    if (!supabaseEv || !supabase || !sections?.length) {
      onToast('غير متاح حالياً، يرجى المحاولة مجدداً', '❌');
      setVoiceSheetOpen(false);
      return;
    }

    (async () => {
      setVoiceSaving(true);
      try {
        const { data, error } = await supabase!.functions.invoke('transcribe-voice', {
          body: {
            audioBase64,
            mimeType: voiceRecording.mimeType,
            sections: sections.map(s => ({ id: s.id, name: s.ttl })),
          },
        });
        if (error) throw error;
        if (data?.error === 'daily_limit_reached') {
          onToast('الخدمة مشغولة حالياً، حاول لاحقاً', '⏳');
          setVoiceSheetOpen(false);
          return;
        }
        if (data?.error) throw new Error(data.error);

        const sectionMeta = sections.find(s => s.id === data?.section_id) ?? null;
        const ext = voiceRecording.mimeType.includes('mp4') ? 'm4a' : 'webm';

        let fileUrl = '';
        if (userId) {
          const rand = Math.random().toString(36).substring(2, 9);
          const filePath = `${userId}/${Date.now()}_${rand}.${ext}`;
          const blob = base64ToBlob(audioBase64, voiceRecording.mimeType);
          const { error: upErr } = await supabase!.storage
            .from('evidence-audio')
            .upload(filePath, blob, { cacheControl: '3600', upsert: false });
          if (upErr) throw upErr;
          const { data: urlData } = supabase!.storage.from('evidence-audio').getPublicUrl(filePath);
          fileUrl = urlData.publicUrl;
        } else {
          fileUrl = URL.createObjectURL(base64ToBlob(audioBase64, voiceRecording.mimeType));
        }

        const title = `شاهد صوتي سريع - ${new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}`;
        // ⚠️ يتجاوز saveEvidence الموحّد عمداً (استثناء VOICE_CAPTURE_ENABLED أعلاه)
        // ولا يمرّر indicator_id — إعادة تفعيل هذا التدفّق مستقبلاً تستلزم أولاً
        // إضافة خطوة اختيار مؤشر (مثل selectSection/saveToIndicator أعلاه)، وإلا
        // فشل هذا الحفظ حال إضافة قيد NOT NULL على evidence.indicator_id مستقبلاً
        const result = await supabaseEv.addEvidence({
          section_id: sectionMeta?.id ?? null,
          title,
          description: (data?.description as string) || (data?.transcript as string) || undefined,
          evidence_type: 'audio',
          file_url: fileUrl,
        });

        if (!result) {
          onToast('تعذّر الحفظ، يرجى المحاولة مجدداً', '❌');
          setVoiceSheetOpen(false);
          return;
        }

        if (sectionMeta) {
          onAddEv(sectionMeta.id, sectionMeta.subs[0] ?? 'عام', 'doc', title, fileUrl);
          onToast(`تم حفظ الشاهد الصوتي في "${sectionMeta.ttl}" ✅`, '✅');
        } else {
          // لم يتمكّن الذكاء الاصطناعي من التصنيف بثقة — يُحفظ بلا قسم (section_id
          // null) دون تحديث عدّاد شهري، ويظهر لاحقاً في قائمة "غير مصنّف"
          onToast('تم حفظ الشاهد، يحتاج تصنيف 📋', '📋');
        }
        setVoiceSheetOpen(false);
      } catch (err) {
        console.error('[QuickCapture] خطأ في حفظ الشاهد الصوتي:', err);
        onToast('تعذّر معالجة التسجيل الصوتي، يرجى المحاولة مجدداً', '❌');
        setVoiceSheetOpen(false);
      } finally {
        setVoiceSaving(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRecording.audioBase64]);

  return {
    fileInputRef,
    openPicker,
    onFileSelected,
    pendingPreviewUrl,
    pickerSheetOpen,
    cancelPending,
    saving,
    selectSection,
    backToSectionPicker,
    saveToIndicator,
    pendingSection,
    sectionIndicators,
    indicatorsLoading,

    voiceRecording,
    voiceConsentPromptOpen,
    voiceSheetOpen,
    voiceSaving,
    startVoiceCapture,
    acceptVoiceConsent,
    cancelVoiceCapture,
  };
}
