import { useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../supabaseClient';
import type { SectionData } from '../types';
import { useVoiceRecording } from './useVoiceRecording';

type SupabaseEvidenceHook = ReturnType<typeof import('./useSupabaseEvidence').useSupabaseEvidence>;

// نفس حد الصور في EvidenceForm (TYPE_CONFIG['image'].maxSizeMB)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [pickerSheetOpen, setPickerSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openPicker = () => fileInputRef.current?.click();

  const reset = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(null);
    setPendingPreviewUrl(null);
    setPickerSheetOpen(false);
    setSaving(false);
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

  const saveToSection = async (sec: SectionData) => {
    if (!pendingFile || saving) return;
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
      const result = await supabaseEv.addEvidence({
        section_id: sec.id,
        title,
        evidence_type: 'image',
        file_url: fileUrl,
      });

      if (!result) {
        onToast('تعذّر الحفظ، يرجى المحاولة مجدداً', '❌');
        setSaving(false);
        return;
      }

      onAddEv(sec.id, sec.subs[0] ?? 'عام', 'img', title, fileUrl);
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

        const sectionMeta = sections.find(s => s.id === data?.section_id) ?? sections[0];
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
        const result = await supabaseEv.addEvidence({
          section_id: sectionMeta.id,
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

        onAddEv(sectionMeta.id, sectionMeta.subs[0] ?? 'عام', 'doc', title, fileUrl);
        onToast('تم حفظ الشاهد الصوتي بنجاح ✅', '✅');
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
    saveToSection,

    voiceRecording,
    voiceConsentPromptOpen,
    voiceSheetOpen,
    voiceSaving,
    startVoiceCapture,
    acceptVoiceConsent,
    cancelVoiceCapture,
  };
}
