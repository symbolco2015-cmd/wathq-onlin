import { useEffect, useRef, useState } from 'react';
import BottomSheet from './BottomSheet';
import { useBulkImport } from '../hooks/useBulkImport';
import { BTN_PRI, BTN_GH_SM } from './SectionView';
import type { ToastKind } from './UI';

const MAX_FILES = 30;

interface BulkImportPickerProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  onToast: (msg: string, kind: ToastKind) => void;
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
      <div className="flex items-center justify-between gap-2 px-4 pb-3 border-b border-[var(--bd)] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-[var(--r-sm)] shrink-0 flex items-center justify-center bg-[var(--s2)] border border-[var(--bd)] text-[var(--t2)] text-[length:var(--fs-lg)]">
            <i className="ti ti-photo-up" />
          </div>
          <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">استيراد جماعي</div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          disabled={uploading}
          aria-label="إغلاق"
          className={`${BTN_GH_SM} w-11 h-11 px-0 disabled:cursor-wait`}
        >
          <i className="ti ti-x text-[length:var(--fs-lg)]" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4">
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
          className="w-full h-11 flex items-center justify-center gap-2 rounded-[var(--r-sm)] border border-dashed border-[var(--bd2)] text-[length:var(--fs-sm)] font-bold text-[var(--t1)] hover:bg-[var(--s2)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-wait"
        >
          <i className="ti ti-photo-plus text-[length:var(--fs-lg)] text-[var(--t2)]" />
          {pending.length === 0 ? 'اختر الصور' : 'إضافة المزيد من الصور'}
        </button>

        {pending.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <span className={`text-[length:var(--fs-sm)] font-bold ${isOverLimit ? 'text-[var(--danger)]' : 'text-[var(--t2)]'}`}>
                {pending.length} من {MAX_FILES}
              </span>
            </div>

            {isOverLimit && (
              <div className="rounded-[var(--r-sm)] border border-[var(--danger)]/35 bg-[var(--s2)] px-3 py-2 text-[length:var(--fs-xs)] font-bold text-[var(--danger)] flex items-center gap-2">
                <i className="ti ti-alert-triangle text-[length:var(--fs-md)] shrink-0" />
                تجاوزت الحد الأقصى ({MAX_FILES} صورة) — أزل {pending.length - MAX_FILES} صورة على الأقل للمتابعة
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {pending.map((p, idx) => (
                <div key={p.previewUrl} className="relative min-w-0 aspect-square rounded-[var(--r-sm)] overflow-hidden border border-[var(--bd)] bg-[var(--s2)]">
                  <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => removeAt(idx)}
                      title="إزالة"
                      aria-label="إزالة"
                      className="absolute top-0 left-0 w-11 h-11 flex items-start justify-start p-1 cursor-pointer"
                    >
                      <span className="w-7 h-7 rounded-[var(--r-full)] bg-[var(--s1)] border border-[var(--bd2)] text-[var(--t1)] flex items-center justify-center text-[length:var(--fs-sm)]">
                        <i className="ti ti-x" />
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {pending.length > 0 && (
        <div className="p-4 border-t border-[var(--bd)] bg-[var(--s1)] shrink-0 space-y-3">
          {uploading && (
            <div className="space-y-2">
              <div className="h-2 w-full bg-[var(--s2)] rounded-[var(--r-full)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-[var(--r-full)] transition-[width] duration-[250ms]"
                  style={{ width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                />
              </div>
              <p className="text-[length:var(--fs-xs)] text-[var(--t2)] text-center font-bold">
                جارٍ الرفع {progress.done} من {progress.total}...
              </p>
            </div>
          )}
          <button
            type="button"
            disabled={isOverLimit || uploading}
            onClick={handleStart}
            className={`${BTN_PRI} w-full disabled:opacity-40 disabled:cursor-wait`}
          >
            {uploading ? (
              <><i className="ti ti-loader animate-spin text-[length:var(--fs-md)]" /> جارٍ الاستيراد...</>
            ) : (
              <><i className="ti ti-upload text-[length:var(--fs-md)]" /> بدء الاستيراد</>
            )}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
