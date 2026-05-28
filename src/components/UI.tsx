import React from 'react';

interface ToastProps {
  msg: string;
  icon: string;
  show: boolean;
}

export function Toast({ msg, icon, show }: ToastProps) {
  return (
    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 bg-gradient-to-br from-[var(--em2)] to-[var(--em4)] text-white py-3.5 px-7 rounded-[18px] text-[14px] font-bold z-[600] whitespace-nowrap pointer-events-none border border-[var(--em7)]/30 shadow-[inset_0_0_0_1px_rgba(82,196,120,.1),0_12px_40px_rgba(0,0,0,.6),0_0_30px_rgba(42,122,68,.3)] flex items-center gap-2.5 transition-all duration-500 ease-[var(--sp)] ${show ? 'translate-y-0 opacity-100' : 'translate-y-[100px] opacity-0'}`}>
      <span className="text-[20px]" style={{ animation: show ? 'pulse .4s var(--bounce)' : 'none' }}>{icon}</span>
      <span>{msg}</span>
    </div>
  );
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  icon: string;
  children: React.ReactNode;
  onConfirm: () => void;
}

export function Modal({ isOpen, onClose, title, subtitle, icon, children, onConfirm }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[500] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ animation: 'fadeIn .2s both' }}>
      <div className="bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[28px] p-10 w-full max-w-[500px] border border-[var(--em7)]/15 shadow-[0_40px_100px_rgba(0,0,0,.8),inset_0_0_0_1px_rgba(82,196,120,.08)] relative overflow-hidden" style={{ animation: 'scaleIn .4s var(--sp) both' }}>
        <div className="absolute top-0 right-[15%] left-[15%] h-[1.5px] bg-gradient-to-r from-transparent via-[var(--em7)] via-[var(--gold)] via-[var(--em7)] to-transparent"></div>
        
        <div className="flex items-center gap-4 mb-7">
          <div className="w-[54px] h-[54px] rounded-2xl shrink-0 bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] flex items-center justify-center text-[26px] border border-[var(--em7)]/20 shadow-[0_4px_16px_rgba(42,122,68,.3)]">
            <i className={`ti ${icon}`}></i>
          </div>
          <div>
            <div className="text-[20px] font-black text-white">{title}</div>
            {subtitle && <div className="text-[13px] text-[var(--text4)] mt-1">{subtitle}</div>}
          </div>
        </div>

        <div>{children}</div>

        <div className="flex gap-2.5 mt-8 justify-end">
          <button className="py-3 px-6 rounded-xl border border-[var(--line2)] bg-transparent cursor-pointer font-[var(--font)] text-[14px] text-[var(--text3)] transition-all duration-200 hover:bg-[var(--glass2)] hover:text-white" onClick={onClose}>إلغاء</button>
          <button className="flex items-center gap-2 py-3 px-6 rounded-xl border-none bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white cursor-pointer font-[var(--font)] text-[14px] font-extrabold shadow-[0_6px_20px_rgba(42,122,68,.5)] transition-all duration-250 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(42,122,68,.6)]" onClick={onConfirm}>
            <i className="ti ti-check"></i> حفظ
          </button>
        </div>
      </div>
    </div>
  );
}
