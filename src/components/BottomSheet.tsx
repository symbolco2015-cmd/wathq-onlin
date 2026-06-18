import React, { useEffect, useRef, useState } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const CLOSE_MS = 280;
const DRAG_CLOSE_THRESHOLD = 110;

/**
 * Bottom sheet للجوال: ينزلق من الأسفل، خلفية شفافة تُغلقه عند الضغط عليها،
 * ومقبض سحب يدعم الإغلاق بالسحب للأسفل.
 */
export default function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setDragY(0);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(raf);
    }
    if (mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), CLOSE_MS);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!mounted) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    draggingRef.current = true;
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggingRef.current) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) setDragY(delta);
  };

  const handleTouchEnd = () => {
    draggingRef.current = false;
    if (dragY > DRAG_CLOSE_THRESHOLD) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity .25s ease' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative overflow-hidden w-full max-w-2xl flex flex-col rounded-t-3xl border-t border-x border-[var(--em7)]/15 shadow-[0_-24px_60px_rgba(0,0,0,.6)] max-h-[88vh]"
        style={{
          background: 'var(--surf2)',
          transform: `translateY(${visible ? dragY : '100%'}px)`,
          transition: draggingRef.current ? 'none' : 'transform .32s var(--sp)',
        }}
      >
        {/* مقبض السحب */}
        <div
          className="flex justify-center pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1.5 rounded-full bg-[var(--text3)]/35" />
        </div>

        {children}
      </div>
    </div>
  );
}
