import { useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../supabaseClient';

const MAX_FILES = 30;
// نفس إعدادات ضغط الصور المستخدمة في useQuickCapture.ts/EvidenceForm.tsx
const COMPRESSION_OPTIONS = { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: false };

export interface BulkImportProgress {
  done: number;
  total: number;
}

interface UseBulkImportOptions {
  userId: string | undefined;
  onToast: (msg: string, icon?: string) => void;
  /** يُستدعى بعد اكتمال استدعاء process-bulk-queue بالخلفية (نجاحاً أو فشلاً) — اختياري */
  onClassificationSettled?: () => void;
}

/**
 * يحصر منطق رفع "الاستيراد الجماعي": تحقق الحد الأقصى ← تصفية الصور فقط ← ضغط
 * كل صورة ← رفع لـ bucket evidence ← إدخال صف bulk_import_queue لكل ملف ناجح
 * ← استدعاء فوري لدالة التصنيف process-bulk-queue بتوكن جلسة المستخدم الحالي.
 * استدعاء process-bulk-queue غير محجوب (fire-and-forget): uploadBulkImport ترجع
 * بمجرد اكتمال الرفع والإدخال في الطابور، دون انتظار التصنيف الفعلي عبر Gemini.
 * لا يستخدم هذا الملف أي secret/service key إطلاقاً — فقط جلسة المستخدم العادية
 * مثل بقية الفرونت.
 */
export function useBulkImport({ userId, onToast, onClassificationSettled }: UseBulkImportOptions) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<BulkImportProgress>({ done: 0, total: 0 });

  const uploadBulkImport = async (files: File[]) => {
    if (uploading || files.length === 0) return;

    if (files.length > MAX_FILES) {
      onToast(`الحد الأقصى ${MAX_FILES} صورة بالدفعة الواحدة، يرجى إنقاص العدد`, '⚠️');
      return;
    }

    if (!userId || !supabase) {
      onToast('غير متاح حالياً، يرجى المحاولة مجدداً', '❌');
      return;
    }

    // v1 صور فقط — أي ملف آخر (فيديو/PDF) يُرفض بصمت مع تجميع العدد للرسالة النهائية
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const rejectedCount = files.length - imageFiles.length;

    if (imageFiles.length === 0) {
      onToast('يرجى اختيار صور فقط، هذا الإصدار لا يدعم الفيديو أو PDF بعد ⚠️', '⚠️');
      return;
    }

    setUploading(true);
    setProgress({ done: 0, total: imageFiles.length });

    let uploadedCount = 0;
    let failedCount = 0;

    for (const file of imageFiles) {
      try {
        let fileToUpload: File = file;
        try {
          fileToUpload = await imageCompression(file, COMPRESSION_OPTIONS);
        } catch (compressErr) {
          console.warn('[BulkImport] فشل ضغط صورة، تم استخدام الملف الأصلي:', compressErr);
        }

        const rand = Math.random().toString(36).substring(2, 9);
        const filePath = `${userId}/bulk/${Date.now()}_${rand}.jpg`;

        const { error: upErr } = await supabase.storage
          .from('evidence')
          .upload(filePath, fileToUpload, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });
        if (upErr) throw upErr;

        const { error: insertErr } = await supabase.from('bulk_import_queue').insert({
          portfolio_id: userId,
          file_path: filePath,
          file_type: 'image',
          status: 'pending',
        });
        if (insertErr) throw insertErr;

        uploadedCount++;
      } catch (err) {
        console.error('[BulkImport] فشل رفع صورة:', err);
        failedCount++;
      } finally {
        setProgress(prev => ({ ...prev, done: prev.done + 1 }));
      }
    }

    setUploading(false);

    if (uploadedCount === 0) {
      onToast('تعذّر رفع أي صورة، يرجى المحاولة مجدداً ❌', '❌');
      return;
    }

    // استدعاء فوري لبدء التصنيف — بتوكن جلسة المستخدم الحالي حصراً (Authorization:
    // Bearer <access_token>)، وليس مفتاح anon أو secret أبداً. غير محجوب (fire-and-forget):
    // لا ننتظره هنا حتى ترجع uploadBulkImport بمجرد اكتمال الرفع، لكن نحتفظ بالـ Promise
    // ونستدعي onClassificationSettled بعد اكتماله (نجاحاً أو فشلاً) ليعرف من يستدعينا أن
    // التصنيف الفعلي انتهى. إن تعذّر الاستدعاء (مثلاً لا جلسة نشطة لحظتها) لا بأس، تُعالَج
    // الصفوف تلقائياً بالتشغيلة القادمة لـ pg_cron.
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken || !supabase) return;
      return supabase.functions.invoke('process-bulk-queue', {
        body: {},
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }).catch(invokeErr => {
      console.warn('[BulkImport] تعذّر استدعاء التصنيف الفوري، سيُعالَج تلقائياً بالتشغيلة القادمة:', invokeErr);
    }).finally(() => {
      onClassificationSettled?.();
    });

    const parts: string[] = [`تم رفع ${uploadedCount} صورة، جارٍ التصنيف بالخلفية...`];
    if (rejectedCount > 0) parts.push(`تم تجاهل ${rejectedCount} ملف غير مدعوم (صور فقط في هذا الإصدار)`);
    if (failedCount > 0) parts.push(`تعذّر رفع ${failedCount} صورة`);
    onToast(parts.join(' — '), '📋');
  };

  return { uploadBulkImport, uploading, progress };
}
