import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BTN_GH_SM } from './SectionView';

// تلميح يظهر مرة واحدة بجانب عنصر في الصفحة. يتموضع من getBoundingClientRect
// للعنصر بالمعرّف targetId (حتى لو كان في Nav خارج Dashboard)، بلا سهم.
// z-[260]: فوق الزر العائم (250) وتحت الشريطين (300) وكل النوافذ والأوراق (500).

const HINT_MAX_W = 240;
const EDGE = 16;
const GAP = 8;

interface HintProps {
  targetId: string;
  text: string;
  /** تحت العنصر أو فوقه */
  placement: 'below' | 'above';
  onDismiss: () => void;
}

type Pos = { left: number; top?: number; bottom?: number };

export default function Hint({ targetId, text, placement, onDismiss }: HintProps) {
  const [pos, setPos] = useState<Pos | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const el = document.getElementById(targetId);
      const rect = el?.getBoundingClientRect();
      // العنصر غير موجود أو مخفي (display:none) — لا تلميح
      if (!rect || rect.width === 0) { setPos(null); return; }
      const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - HINT_MAX_W - EDGE));
      setPos(placement === 'below'
        ? { left, top: rect.bottom + GAP }
        : { left, bottom: window.innerHeight - rect.top + GAP });
    };
    update();
    window.addEventListener('resize', update);
    // capture: يلتقط تمرير الحاويات الداخلية (عمود الملخص) أيضاً
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [targetId, placement]);

  if (!pos) return null;

  return createPortal(
    <div
      role="status"
      className="fixed z-[260] max-w-[240px] p-3 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)] flex flex-col gap-2"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, animation: 'fadeIn .25s both' }}
    >
      <p className="text-[length:var(--fs-xs)] text-[var(--t1)] leading-relaxed">{text}</p>
      <button type="button" onClick={onDismiss} className={`${BTN_GH_SM} self-end`}>فهمت</button>
    </div>,
    document.body
  );
}
