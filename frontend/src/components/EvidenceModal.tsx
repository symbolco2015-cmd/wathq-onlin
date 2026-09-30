import { useRef } from 'react';
import EvidenceForm from './EvidenceForm';
import type { EvidenceFormHandle, EvidenceFormProps } from './EvidenceForm';

type EvidenceModalProps = EvidenceFormProps;

/**
 * حاوية نموذج الشاهد: نافذة في الوسط بعرض 520px على الشاشات الواسعة، وورقة
 * ملتصقة بالأسفل على الضيقة (مطابقة لـ .sheet في النموذج الأولي). الضغط على
 * الخلفية يمر عبر requestClose() حتى يسأل النموذج قبل تجاهل ما كُتب.
 */
export default function EvidenceModal(props: EvidenceModalProps) {
  const { isOpen } = props;
  const formRef = useRef<EvidenceFormHandle>(null);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[500] flex items-end sm:items-center justify-center sm:p-4"
      style={{ animation: 'fadeIn .25s both' }}
      onClick={e => { if (e.target === e.currentTarget) formRef.current?.requestClose(); }}
    >
      <div className="relative overflow-hidden flex flex-col w-full sm:w-[520px] max-h-[92vh] sm:max-h-[86vh] bg-[var(--s1)] border-t sm:border border-[var(--bd2)] rounded-t-[var(--r-lg)] sm:rounded-[var(--r-lg)]">
        <EvidenceForm ref={formRef} {...props} />
      </div>
    </div>
  );
}
