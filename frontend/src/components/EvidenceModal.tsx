import EvidenceForm from './EvidenceForm';
import type { EvidenceFormProps } from './EvidenceForm';

type EvidenceModalProps = EvidenceFormProps;

export default function EvidenceModal(props: EvidenceModalProps) {
  const { isOpen, onClose } = props;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-[500] flex items-center justify-center p-4"
      style={{ animation: 'fadeIn .2s both' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[28px] w-full max-w-2xl border border-[var(--em7)]/15 shadow-[0_40px_100px_rgba(0,0,0,.8),inset_0_0_0_1px_rgba(82,196,120,.08)] relative overflow-hidden flex flex-col max-h-[90vh]"
        style={{ animation: 'scaleIn .35s var(--sp) both' }}
      >
        <EvidenceForm {...props} />
      </div>
    </div>
  );
}
