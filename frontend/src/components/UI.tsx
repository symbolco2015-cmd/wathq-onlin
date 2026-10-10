import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

/** زر داخل الرسالة، مثل «تراجع» — toast في النموذج الأولي */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export type ToastKind = 'success' | 'error' | 'info';

interface ToastProps {
  msg: string;
  /** رمز قديم يُستنتج منه النوع حين لا يُمرَّر kind — لا يُعرض */
  icon: string;
  show: boolean;
  action?: ToastAction;
  kind?: ToastKind;
}

// توافق مع الاستدعاءات القديمة التي تحدّد النوع برمز تعبيري؛ تُحذف بعد نقلها كلها إلى kind
const TOAST_ERROR_MARKS = ['⚠️', '⚠', '❌'];
const TOAST_SUCCESS_MARKS = ['✓', '✅', '🎉', '✨', '🚀'];
const TOAST_EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{2713}]/gu;

const TOAST_KIND_STYLE: Record<ToastKind, { icon: string; color: string }> = {
  success: { icon: 'ti-circle-check', color: 'text-[var(--accent)]' },
  error: { icon: 'ti-alert-circle', color: 'text-[var(--danger)]' },
  info: { icon: 'ti-info-circle', color: 'text-[var(--info)]' },
};

function inferToastKind(icon: string, msg: string): ToastKind {
  const mark = icon.trim() || msg.trim();
  if (TOAST_ERROR_MARKS.some(m => mark.startsWith(m))) return 'error';
  if (!icon.trim() || TOAST_SUCCESS_MARKS.some(m => mark.startsWith(m))) return 'success';
  return 'info';
}

export function Toast({ msg, icon, show, action, kind }: ToastProps) {
  // الرسالة لا تلتقط النقرات إلا وهي ظاهرة وفيها زر
  const clickable = show && !!action;
  const style = TOAST_KIND_STYLE[kind ?? inferToastKind(icon, msg)];
  const text = msg.replace(TOAST_EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
  return (
    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 w-max max-w-[calc(100vw-32px)] bg-[var(--s2)] text-[var(--t1)] py-3 px-4 rounded-[var(--r-md)] text-[length:var(--fs-sm)] font-bold z-[600] ${clickable ? 'pointer-events-auto' : 'pointer-events-none'} border border-[var(--bd2)] flex items-center gap-3 transition-all duration-[350ms] ease-[var(--sp)] ${show ? 'translate-y-0 opacity-100' : 'translate-y-[100px] opacity-0'}`}>
      <i className={`ti ${style.icon} ${style.color} text-[length:var(--fs-lg)] shrink-0`} style={{ animation: show ? 'pulse .4s var(--bounce)' : 'none' }}></i>
      <span>{text}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          tabIndex={show ? 0 : -1}
          className="h-9 px-3 -my-2 rounded-[var(--r-sm)] text-[length:var(--fs-sm)] font-bold text-[var(--t1)] underline cursor-pointer"
        >
          {action.label}
        </button>
      )}
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
  /** يعطّل زر "حفظ" فقط (وليس "إلغاء") — يُستخدم مثلاً أثناء معالجة/رفع صورة داخل المودال */
  confirmDisabled?: boolean;
  /** نص صغير يظهر بجانب زر "حفظ" أثناء تعطيله (يُتجاهل إن كان confirmDisabled غير مفعّل) */
  confirmHelperText?: string;
  /** 'danger' = نافذة حذف: أيقونة الرأس بـ --danger وزر «حذف» بأيقونة سلة بدل «حفظ» */
  tone?: 'danger';
}

export function Modal({ isOpen, onClose, title, subtitle, icon, children, onConfirm, confirmDisabled, confirmHelperText, tone }: ModalProps) {
  // Esc يسلك مسار «إلغاء» نفسه، ولا يُغلق النافذة أثناء معالجة (confirmDisabled)
  useEffect(() => {
    if (!isOpen || confirmDisabled) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, confirmDisabled, onClose]);

  if (!isOpen) return null;
  const danger = tone === 'danger';

  return (
    <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ animation: 'fadeIn .2s both' }}>
      <div className="bg-[var(--s1)] rounded-[var(--r-lg)] p-6 sm:p-8 w-full max-w-[500px] border border-[var(--bd2)] relative overflow-hidden" style={{ animation: 'scaleIn .35s var(--sp) both' }}>
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-11 h-11 rounded-[var(--r-sm)] shrink-0 flex items-center justify-center text-[length:var(--fs-lg)] bg-[var(--s2)] border ${danger
            ? 'text-[var(--danger)] border-[var(--danger)]/35'
            : 'text-[var(--t2)] border-[var(--bd)]'}`}>
            <i className={`ti ${icon}`}></i>
          </div>
          <div>
            <div className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">{title}</div>
            {subtitle && <div className="text-[length:var(--fs-sm)] text-[var(--t2)] mt-1">{subtitle}</div>}
          </div>
        </div>

        <div>{children}</div>

        <div className={`flex items-center gap-2 mt-8 ${confirmDisabled && confirmHelperText ? 'justify-between' : 'justify-end'}`}>
          {confirmDisabled && confirmHelperText && (
            <div className="text-[length:var(--fs-xs)] text-[var(--t3)] flex items-center gap-2">
              <i className="ti ti-loader animate-spin"></i>{confirmHelperText}
            </div>
          )}
          <div className="flex gap-2">
            <button className="h-11 px-4 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-transparent cursor-pointer text-[length:var(--fs-sm)] font-bold text-[var(--t2)] transition-colors duration-[250ms] hover:bg-[var(--s2)] hover:text-[var(--t1)]" onClick={onClose}>إلغاء</button>
            <button
              className={danger
                ? `flex items-center gap-2 h-11 px-4 rounded-[var(--r-sm)] border border-[var(--danger)] bg-[var(--danger)] text-[var(--bg)] text-[length:var(--fs-sm)] font-bold transition-opacity duration-[250ms] ${confirmDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`
                : `flex items-center gap-2 h-11 px-4 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)] text-[length:var(--fs-sm)] font-bold transition-opacity duration-[250ms] ${confirmDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
              onClick={onConfirm}
              disabled={confirmDisabled}
            >
              {danger ? <><i className="ti ti-trash"></i> حذف</> : <><i className="ti ti-check"></i> حفظ</>}
            </button>
          </div>
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
        <span className={selected ? 'text-[var(--t1)]' : 'text-[var(--t3)]'}>{selected ? selected.label : placeholder}</span>
        <i className={`ti ti-chevron-down text-[length:var(--fs-md)] text-[var(--t3)] transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[600]" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-[601] max-h-[240px] overflow-y-auto rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)] py-1"
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
                className="w-full text-right px-3 py-2.5 text-[length:var(--fs-sm)] text-[var(--t3)] hover:bg-[var(--s3)] transition-colors duration-150 cursor-pointer"
              >
                {placeholder}
              </button>
            )}
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full text-right px-3 py-2.5 text-[length:var(--fs-sm)] transition-colors duration-150 cursor-pointer ${
                  opt.value === value ? 'font-bold text-[var(--t1)] bg-[var(--s3)]' : 'text-[var(--t2)] hover:bg-[var(--s3)] hover:text-[var(--t1)]'
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
