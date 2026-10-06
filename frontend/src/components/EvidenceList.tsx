import React, { useState } from 'react';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import { formatDate } from '../utils';
import { TYPE_ICON, TYPE_LABEL, BTN_SM } from './SectionView';

interface EvidenceListProps {
  sectionId: number;
  evidence: SupabaseEvidence[];
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
  onAddClick: () => void;
  /** عرض فقط — يخفي زر الحذف وزر الإضافة بالكامل (يُستخدم لأشهر الأرشيف المقفلة) */
  readOnly?: boolean;
}

/** أيقونة نوع الشاهد — نمط EvRow في SectionView: مربع --s2 بأيقونة --t2،
 * ومصغّرة الصورة الفعلية (file_url) للشواهد من نوع 'image'، مع رجوع تلقائي
 * للأيقونة العامة إن فشل تحميل الصورة (رابط معطوب). */
function EvidenceTypeIcon({ ev }: { ev: SupabaseEvidence }) {
  const [imgError, setImgError] = useState(false);
  const showImage = ev.evidence_type === 'image' && !!ev.file_url && !imgError;

  return (
    <span className="w-8 h-8 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[16px] text-[var(--t2)] shrink-0 overflow-hidden">
      {showImage ? (
        <img
          src={ev.file_url!}
          alt={ev.title}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <i className={`ti ${TYPE_ICON[ev.evidence_type] ?? 'ti-file-text'}`} />
      )}
    </span>
  );
}

const ICON_BTN = 'w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] flex items-center justify-center text-[16px] text-[var(--t2)] shrink-0 cursor-pointer';

export default function EvidenceList({ evidence, loading, onDelete, onAddClick, readOnly = false }: EvidenceListProps) {
  const [confirmId,   setConfirmId]   = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (confirmId !== id) { setConfirmId(id); setDeleteError(null); return; }
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'فشل حذف الشاهد، حاول مجدداً');
    } finally {
      setDeleting(false);
      setConfirmId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-8 text-[var(--t3)]">
        <i className="ti ti-loader animate-spin text-[20px]" />
        <span className="text-[length:var(--fs-sm)]">جاري تحميل الشواهد...</span>
      </div>
    );
  }

  if (evidence.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 px-4 text-center">
        <div className="w-12 h-12 rounded-[var(--r-md)] bg-[var(--s2)] flex items-center justify-center text-[32px] text-[var(--t3)] mb-3">
          <i className="ti ti-files-off" />
        </div>
        <p className="text-[length:var(--fs-sm)] font-bold text-[var(--t2)]">لا توجد شواهد بعد</p>
        <p className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1 mb-4 max-w-[260px] leading-relaxed">
          {readOnly ? 'لا توجد شواهد مسجّلة لهذا الشهر' : 'وثّق إنجازاتك بإضافة أول شاهد وابنِ ملف احترافياً'}
        </p>
        {!readOnly && (
          <div>
            <button type="button" onClick={onAddClick} className={BTN_SM}>
              <i className="ti ti-plus text-[16px]" /> إضافة شاهد
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {deleteError && (
        <div className="flex items-center gap-2 m-3 px-3 py-2.5 rounded-[var(--r-sm)] border border-[var(--danger)]/35 text-[var(--danger)] text-[length:var(--fs-xs)] font-bold">
          <i className="ti ti-alert-circle text-[16px] shrink-0" />
          {deleteError}
        </div>
      )}
      <div className="divide-y divide-[var(--bd)]">
        {evidence.map(ev => {
          const url          = ev.file_url ?? ev.link_url ?? null;
          const date         = formatDate(ev.created_at, 'long');
          const isConfirming = confirmId === ev.id;
          const meta = [
            TYPE_LABEL[ev.evidence_type] ?? 'ملف',
            date,
            ev.context_grade,
            ev.academic_term ? `الفصل ${ev.academic_term}` : null,
          ].filter(Boolean).join(' · ');

          return (
            <div
              key={ev.id}
              className="group flex items-center gap-2 py-2.5 px-3.5"
              onClick={() => confirmId && confirmId !== ev.id && setConfirmId(null)}
            >
              <EvidenceTypeIcon ev={ev} />

              {/* المحتوى */}
              <div className="flex-1 min-w-0">
                <b
                  dir="auto"
                  className={`block font-normal text-[length:var(--fs-sm)] text-[var(--t1)] truncate ${url ? 'cursor-pointer' : ''}`}
                  onClick={() => url && window.open(url, '_blank')}
                  title={url ? 'اضغط لعرض' : undefined}
                >
                  {ev.title}
                </b>
                <small className="block text-[length:var(--fs-xs)] text-[var(--t3)]">{meta}</small>
                {ev.description && (
                  <p className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1 leading-relaxed whitespace-pre-wrap break-words">
                    {ev.description}
                  </p>
                )}
              </div>

              {/* أزرار الإجراءات — تظهر عند hover أو عند التأكيد */}
              <div className={`shrink-0 flex items-center gap-1.5 transition-opacity duration-150 ${isConfirming ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'}`}>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className={ICON_BTN}
                    title="فتح الملف"
                  >
                    <i className="ti ti-external-link" />
                  </a>
                )}

                {!readOnly && (isConfirming ? (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleDelete(ev.id); }}
                    disabled={deleting}
                    className="h-9 px-3 inline-flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--danger)]/35 text-[length:var(--fs-sm)] font-bold text-[var(--danger)] whitespace-nowrap cursor-pointer disabled:opacity-40"
                  >
                    {deleting
                      ? <i className="ti ti-loader animate-spin text-[16px]" />
                      : <i className="ti ti-check text-[16px]" />
                    }
                    تأكيد الحذف
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleDelete(ev.id); }}
                    className={`${ICON_BTN} hover:text-[var(--danger)]`}
                    title="حذف"
                  >
                    <i className="ti ti-trash" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
