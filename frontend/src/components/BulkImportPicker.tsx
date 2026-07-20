import { useEffect, useRef, useState } from 'react';
import BottomSheet from './BottomSheet';
import { useBulkImport } from '../hooks/useBulkImport';

const MAX_FILES = 30;

interface BulkImportPickerProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  onToast: (msg: string, icon?: string) => void;
  onClassificationSettled?: () => void;
}

interface PendingFile {
  file: File;
  previewUrl: string;
}

/**
 * BottomSheet "استيراد جماعي": اختيار حتى 30 صورة دفعة واحدة (شبكة مصغّرات
 * قابلة للحذف الفردي) ثم رفعها عبر useBulkImport. مكوّن عرض بحت — كل منطق
 * الرفع/الضغط/الاستدعاء يعيش في الهوك، هذا الملف لا يلمس أي مفتاح أو جلسة.
 */
export default function BulkImportPicker({ isOpen, onClose, userId, onToast, onClassificationSettled }: BulkImportPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const { uploadBulkImport, uploading, progress } = useBulkImport({ userId, onToast, onClassificationSettled });
  // قفل صريح مستقل عن state uploading — الهوك يعيد uploading إلى false قبل
  // اكتمال كل العمل (نداء process-bulk-queue + toast النهائي)، فتبقى فجوة زمنية
  // يُعاد فيها تفعيل الزر قبل أن يُغلق الشيت فعلياً؛ هذا القفل يمنع أي استدعاء
  // ثانٍ لـhandleStart طوال تلك الفجوة بصرف النظر عن حالة uploading
  const isSubmittingRef = useRef(false);

  const revokeAll = (list: PendingFile[]) => list.forEach(p => URL.revokeObjectURL(p.previewUrl));

  // تصفير كامل عند إغلاق الشيت (سواء بنجاح الرفع أو بإلغاء المستخدم) — يمنع
  // تسريب object URLs السابقة ويضمن شاشة فارغة عند الفتح التالي
  useEffect(() => {
    if (!isOpen) {
      setPending(prev => { revokeAll(prev); return []; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (selected.length === 0) return;
    setPending(prev => [...prev, ...selected.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  };

  const removeAt = (idx: number) => {
    setPending(prev => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const isOverLimit = pending.length > MAX_FILES;

  const handleClose = () => {
    if (uploading) return; // تعطيل الإغلاق أثناء الرفع الفعلي لتفادي رفع منتصف مقطوع
    onClose();
  };

  const handleStart = async () => {
    if (isSubmittingRef.current || uploading || pending.length === 0 || isOverLimit) return;
    isSubmittingRef.current = true;
    try {
      await uploadBulkImport(pending.map(p => p.file));
      // تصفير فوري لقائمة pending بعد الرفع — دفاع مضاعف: حتى لو تأخر onClose()
      // أو لم يُغلق الشيت فعلياً لأي سبب، لا يبقى شيء قابل لإعادة الرفع
      setPending(prev => { revokeAll(prev); return []; });
      // الهوك يعرض toast الملخّص من تلقاء نفسه (نجاح جزئي أو كلي) — نغلق الشيت بعده مباشرة
      onClose();
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose}>
      <div className="flex items-center justify-between px-6 pt-1 pb-4 border-b border-[var(--line)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] flex items-center justify-center text-[18px] border border-[var(--em7)]/20 shadow-[0_4px_14px_rgba(42,122,68,.3)]">
            <i className="ti ti-photo-up" />
          </div>
          <div className="text-[16px] font-black text-white">استيراد جماعي</div>
        </div>
        <button
          onClick={handleClose}
          disabled={uploading}
          className="w-9 h-9 rounded-xl bg-white/5 border border-[var(--line)] text-[var(--text4)] hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-[18px] disabled:opacity-40 disabled:cursor-wait"
        >
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-5 space-y-4">
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          ref={fileInputRef}
          onChange={handleFilesSelected}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl border-[1.5px] border-dashed border-[var(--line2)] hover:border-[var(--em7)]/40 hover:bg-[var(--em7)]/5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-wait text-[13.5px] font-bold text-[var(--text2)]"
        >
          <i className="ti ti-photo-plus text-[18px] text-[var(--em7)]" />
          {pending.length === 0 ? 'اختر الصور' : 'إضافة المزيد من الصور'}
        </button>

        {pending.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <span className={`text-[13px] font-bold ${isOverLimit ? 'text-red-400' : 'text-[var(--text3)]'}`}>
                {pending.length} من {MAX_FILES}
              </span>
            </div>

            {isOverLimit && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[12.5px] font-bold text-red-400 flex items-center gap-2">
                <i className="ti ti-alert-triangle text-[15px] shrink-0" />
                تجاوزت الحد الأقصى ({MAX_FILES} صورة) — أزل {pending.length - MAX_FILES} صورة على الأقل للمتابعة
              </div>
            )}

            <div className="grid grid-cols-3 gap-2.5">
              {pending.map((p, idx) => (
                <div key={p.previewUrl} className="relative aspect-square rounded-xl overflow-hidden border border-[var(--line)]">
                  <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => removeAt(idx)}
                      title="إزالة"
                      className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/65 text-white flex items-center justify-center text-[12px] cursor-pointer hover:bg-black/85 transition-colors"
                    >
                      <i className="ti ti-x" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {uploading && (
          <div className="space-y-2">
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--em4)] to-[var(--em7)] rounded-full transition-all duration-300"
                style={{ width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-[12px] text-[var(--text4)] text-center font-bold">
              جارٍ الرفع {progress.done} من {progress.total}...
            </p>
          </div>
        )}

        {pending.length > 0 && (
          <button
            type="button"
            disabled={isOverLimit || uploading}
            onClick={handleStart}
            className="w-full py-3.5 rounded-xl text-[14px] font-bold bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white disabled:opacity-40 disabled:cursor-wait cursor-pointer flex items-center justify-center gap-2"
          >
            {uploading ? (
              <><i className="ti ti-loader animate-spin" /> جارٍ الاستيراد...</>
            ) : (
              <><i className="ti ti-upload" /> بدء الاستيراد</>
            )}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
