import { useEffect, useState } from 'react';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import { BTN_SM, EvRow, type EvHighlightActions } from './SectionView';

interface EvidenceListProps {
  sectionId: number;
  evidence: SupabaseEvidence[];
  loading: boolean;
  onAddClick: () => void;
  /** يفتح نموذج الشاهد في وضع التعديل */
  onEditEv: (ev: SupabaseEvidence) => void;
  /** الحذف الموحّد بنافذة تأكيد (handleDeleteEv في App.tsx) */
  onDeleteEv: (evidenceId: string) => void;
  highlight?: EvHighlightActions;
  /** شهر أرشيف مقفل — يخفي زر الإضافة. «تعديل» و«حذف» يخفيهما EvRow نفسه (isEvidenceLocked) */
  readOnly?: boolean;
}

/** شواهد بند في شهر من الأرشيف — صفوف EvRow نفسها في شاشة البند */
export default function EvidenceList({ evidence, loading, onAddClick, onEditEv, onDeleteEv, highlight, readOnly = false }: EvidenceListProps) {
  // قائمة ⋯ مفتوحة لشاهد واحد على الأكثر، وEscape يغلقها — كما في SectionView
  const [menuEvId, setMenuEvId] = useState<string | null>(null);
  useEffect(() => {
    if (!menuEvId) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuEvId(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuEvId]);

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
    <div className="divide-y divide-[var(--bd)]">
      {evidence.map(ev => (
        <EvRow
          key={ev.id}
          ev={ev}
          menuOpen={menuEvId === ev.id}
          onToggleMenu={() => setMenuEvId(prev => (prev === ev.id ? null : ev.id))}
          onCloseMenu={() => setMenuEvId(null)}
          onEdit={() => onEditEv(ev)}
          onDelete={() => onDeleteEv(ev.id)}
          highlight={highlight}
        />
      ))}
    </div>
  );
}
