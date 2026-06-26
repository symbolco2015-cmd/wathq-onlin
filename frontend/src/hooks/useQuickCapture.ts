import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../supabaseClient';
import type { SectionData } from '../types';

type SupabaseEvidenceHook = ReturnType<typeof import('./useSupabaseEvidence').useSupabaseEvidence>;

// نفس حد الصور في EvidenceForm (TYPE_CONFIG['image'].maxSizeMB)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

interface UseQuickCaptureOptions {
  userId: string | undefined;
  supabaseEv: SupabaseEvidenceHook | undefined;
  onAddEv: (sid: number, sub: string, type: 'pdf' | 'img' | 'doc' | 'vid', name: string, url?: string) => void;
  onToast: (msg: string, icon?: string) => void;
}

/**
 * يحصر منطق تدفّق "التقاط سريع": صورة فوراً ← اختيار بند ← حفظ بعنوان تلقائي،
 * بنفس آلية الضغط/الرفع المستخدمة في EvidenceForm (دون تعديل ذلك الملف).
 */
export function useQuickCapture({ userId, supabaseEv, onAddEv, onToast }: UseQuickCaptureOptions) {
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

  return {
    fileInputRef,
    openPicker,
    onFileSelected,
    pendingPreviewUrl,
    pickerSheetOpen,
    cancelPending,
    saving,
    saveToSection,
  };
}
