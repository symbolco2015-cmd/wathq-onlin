import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

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

export interface SelectDropdownOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  options: SelectDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** classes للزر الظاهر (المُشغّل) — مرّر نفس كلاس حقل الإدخال المستخدم في
   *  النموذج المستدعي ليطابق شكل باقي الحقول */
  triggerClassName: string;
  /** يعرض صفاً علوياً في القائمة لمسح التحديد (قيمة فارغة) — استخدمه فقط
   *  حين تحتاج حالة "بلا اختيار" فعلية (وليس لقوائم تكون قيمة دائماً محدّدة) */
  allowClear?: boolean;
}

// بديل مخصّص لـ <select>/<option> الأصليين — Safari/iOS يتجاهل تنسيق
// <option> بالكامل تقريباً (خلفية بيضاء ثابتة من النظام)، فلا يمكن مطابقة
// الهوية البصرية الداكنة عبر CSS وحده على كل المتصفحات المستهدفة (والمنصة
// 90% استخدام جوال). القائمة تُعرض عبر createPortal إلى document.body
// بموضع fixed محسوب من getBoundingClientRect بدل absolute داخل الشجرة، حتى
// لا يقصّها أي حاوٍ أب بـ overflow-hidden/overflow-y-auto (مودالات وbottom
// sheets في التطبيق). عُمِّم هذا المكوّن من IndicatorSelectDropdown في
// EvidenceForm.tsx بعد أن ثبتت صلاحية النمط هناك.
const SELECT_MENU_MAX_H = 240;

export function SelectDropdown({ options, value, onChange, placeholder, triggerClassName, allowClear = false }: SelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUpward: boolean }>({ top: 0, left: 0, width: 0, openUpward: false });

  useLayoutEffect(() => {
    if (!isOpen || !btnRef.current) return;
    const update = () => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < SELECT_MENU_MAX_H && rect.top > SELECT_MENU_MAX_H;
      setPos({
        top: openUpward ? rect.top - 6 : rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        openUpward,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const selected = options.find(o => o.value === value);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className={triggerClassName + ' flex items-center justify-between gap-2'}
      >
        <span className={selected ? 'text-white' : 'text-[var(--text4)]'}>{selected ? selected.label : placeholder}</span>
        <i className={`ti ti-chevron-down text-[13px] text-[var(--text4)] transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[600]" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-[601] max-h-[240px] overflow-y-auto rounded-xl border border-[var(--line2)] bg-[var(--surf2)] shadow-[0_12px_32px_rgba(0,0,0,.45)] py-1.5"
            style={{
              top: pos.openUpward ? undefined : pos.top,
              bottom: pos.openUpward ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              width: pos.width,
              animation: 'scaleIn .15s var(--sp) both',
            }}
          >
            {allowClear && (
              <button
                type="button"
                onClick={() => { onChange(''); setIsOpen(false); }}
                className="w-full text-right px-3.5 py-2.5 text-[12.5px] font-bold text-[var(--text4)] hover:bg-white/5 transition-colors cursor-pointer"
              >
                {placeholder}
              </button>
            )}
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full text-right px-3.5 py-2.5 text-[12.5px] font-bold transition-colors cursor-pointer ${
                  opt.value === value ? 'text-[var(--gold3)] bg-[var(--gold)]/10' : 'text-white hover:bg-[var(--gold)]/10 hover:text-[var(--gold3)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
