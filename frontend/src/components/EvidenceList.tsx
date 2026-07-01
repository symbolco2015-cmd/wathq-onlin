import React, { useState } from 'react';
import type { SupabaseEvidence, EvidenceType } from '../hooks/useSupabaseEvidence';

interface EvidenceListProps {
  sectionId: number;
  evidence: SupabaseEvidence[];
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
  onAddClick: () => void;
  /** عرض فقط — يخفي زر الحذف وزر الإضافة بالكامل (يُستخدم لأشهر الأرشيف المقفلة) */
  readOnly?: boolean;
}

const TYPE_META: Record<EvidenceType, { icon: string; label: string; color: string }> = {
  file:  { icon: 'ti-file-type-pdf', label: 'ملف',    color: '#f87171' },
  image: { icon: 'ti-photo',          label: 'صورة',   color: '#93c5fd' },
  link:  { icon: 'ti-link',           label: 'رابط',   color: '#4ade80' },
  note:  { icon: 'ti-notes',          label: 'ملاحظة', color: '#c4b5fd' },
  audio: { icon: 'ti-microphone',     label: 'صوت',    color: '#fb923c' },
  video: { icon: 'ti-video',          label: 'فيديو',  color: '#fcd34d' },
};

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
      <div className="flex items-center justify-center gap-3 py-8 text-[var(--text4)]">
        <i className="ti ti-loader animate-spin text-[20px]" />
        <span className="text-[13px]">جاري تحميل الشواهد...</span>
      </div>
    );
  }

  if (evidence.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-[var(--line)] flex items-center justify-center text-[28px] text-[var(--text4)] mb-3">
          <i className="ti ti-files-off" />
        </div>
        <p className="text-[14px] font-bold text-[var(--text3)]">لا توجد شواهد بعد</p>
        <p className="text-[12px] text-[var(--text4)] mt-1 mb-4 max-w-[260px] leading-relaxed">
          {readOnly ? 'لا توجد شواهد مسجّلة لهذا الشهر' : 'وثّق إنجازاتك بإضافة أول شاهد وابنِ ملف احترافياً'}
        </p>
        {!readOnly && (
          <button
            onClick={onAddClick}
            className="inline-flex items-center gap-2 py-2 px-5 rounded-xl bg-[var(--em7)]/10 border border-[var(--em7)]/25 text-[var(--em8)] text-[13px] font-bold hover:bg-[var(--em7)]/20 hover:-translate-y-0.5 transition-all cursor-pointer font-[var(--font)]"
          >
            <i className="ti ti-plus" /> إضافة شاهد
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {deleteError && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-[12px] font-bold">
          <i className="ti ti-alert-circle text-[15px] shrink-0" />
          {deleteError}
        </div>
      )}
      {evidence.map(ev => {
        const meta        = TYPE_META[ev.evidence_type] ?? TYPE_META.file;
        const url         = ev.file_url ?? ev.link_url ?? null;
        const date        = new Date(ev.created_at).toLocaleDateString('ar-SA', {
          year: 'numeric', month: 'short', day: 'numeric',
        });
        const isConfirming = confirmId === ev.id;

        return (
          <div
            key={ev.id}
            className="group flex items-center gap-3 py-3 px-4 bg-white/[0.03] rounded-xl border border-[var(--line)] hover:border-[var(--line2)] hover:bg-white/[0.055] transition-all duration-200"
            onClick={() => confirmId && confirmId !== ev.id && setConfirmId(null)}
          >
            {/* أيقونة النوع */}
            <div
              className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-[17px] border transition-transform duration-200 group-hover:scale-105"
              style={{
                color:           meta.color,
                borderColor:     `${meta.color}30`,
                backgroundColor: `${meta.color}15`,
              }}
            >
              <i className={`ti ${meta.icon}`} />
            </div>

            {/* المحتوى */}
            <div className="flex-1 min-w-0">
              <div
                className={`text-[13.5px] font-bold text-white truncate leading-snug ${url ? 'cursor-pointer hover:text-[var(--em8)] transition-colors' : ''}`}
                onClick={() => url && window.open(url, '_blank')}
                title={url ? 'اضغط لعرض' : undefined}
              >
                {ev.title}
              </div>

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span
                  className="text-[10.5px] font-bold rounded px-1.5 py-0.5 border"
                  style={{
                    color:           meta.color,
                    borderColor:     `${meta.color}30`,
                    backgroundColor: `${meta.color}12`,
                  }}
                >
                  {meta.label}
                </span>

                <span className="text-[11px] text-[var(--text4)] flex items-center gap-1">
                  <i className="ti ti-calendar text-[11px]" /> {date}
                </span>

                {ev.context_grade && (
                  <span className="text-[11px] text-[var(--text4)] flex items-center gap-1">
                    <i className="ti ti-school text-[11px]" /> {ev.context_grade}
                  </span>
                )}

                {ev.academic_term && (
                  <span className="text-[11px] text-[var(--text4)]">الفصل {ev.academic_term}</span>
                )}
              </div>

              {ev.description && (
                <p className="text-[11.5px] text-[var(--text4)] mt-1 line-clamp-1 leading-relaxed">
                  {ev.description}
                </p>
              )}
            </div>

            {/* أزرار الإجراءات — تظهر عند hover أو عند التأكيد */}
            <div className={`shrink-0 flex items-center gap-1.5 transition-opacity duration-200 ${isConfirming ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="w-7 h-7 rounded-lg bg-[var(--em7)]/10 border border-[var(--em7)]/20 text-[var(--em8)] text-[13px] flex items-center justify-center hover:bg-[var(--em7)]/20 transition-all"
                  title="فتح الملف"
                >
                  <i className="ti ti-external-link" />
                </a>
              )}

              {!readOnly && (isConfirming ? (
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(ev.id); }}
                  disabled={deleting}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[11px] font-bold hover:bg-red-500/30 transition-all cursor-pointer disabled:opacity-50 font-[var(--font)]"
                >
                  {deleting
                    ? <i className="ti ti-loader animate-spin text-[12px]" />
                    : <i className="ti ti-check text-[12px]" />
                  }
                  تأكيد الحذف
                </button>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(ev.id); }}
                  className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-[var(--text4)] text-[13px] flex items-center justify-center hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400 transition-all cursor-pointer"
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
  );
}
