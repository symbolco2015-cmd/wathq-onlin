import type { ReactNode } from 'react';

// شبكة الأقسام الخاصة في الرئيسية (.spec في النموذج المرجعي): الاستراتيجيات
// والفروق الفردية وتحليل النتائج وتحسينها. كل بطاقة زر واحد يفتح شاشة قسمها،
// والأرقام كلها تُحسب في Dashboard، وهنا العرض فقط.

/** نقطة الحالة — نفس منطق الدائرة في شاشة الفروق الفردية */
export type SpecDot = 'idle' | 'basic' | 'over';

const DOT_COLOR: Record<SpecDot, string> = {
  idle: 'bg-[var(--idle)]',
  basic: 'bg-[var(--accent)]',
  over: 'bg-[var(--st-gold)]',
};

export function SpecCard({ id, icon, title, desc, status, dot, onOpen }: {
  /** معرّف DOM — يستهلكه التمرير عند الرجوع إلى الرئيسية (sc-*) */
  id: string;
  icon: string;
  title: string;
  desc: string;
  /** سطر الحالة؛ غائب = بلا سطر */
  status?: string;
  dot?: SpecDot;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onOpen}
      className="w-full text-right flex flex-col items-start gap-2 px-4 py-3 rounded-[var(--r-md)] bg-[var(--s1)] border border-[var(--bd)] hover:border-[var(--bd2)] transition-colors duration-150 cursor-pointer scroll-mt-24 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t2)]"
    >
      <span className="w-full flex items-center">
        <span className="w-10 h-10 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[20px] text-[var(--t2)] shrink-0">
          <i className={`ti ${icon}`} />
        </span>
        <i className="ti ti-chevron-left ms-auto text-[20px] text-[var(--t3)]" />
      </span>
      <b className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)] leading-normal">{title}</b>
      <small className="text-[length:var(--fs-xs)] text-[var(--t3)]">{desc}</small>
      {status && (
        <span className="flex items-center gap-2 text-[length:var(--fs-xs)] text-[var(--t2)]">
          {dot && <span className={`w-2 h-2 rounded-[var(--r-full)] shrink-0 ${DOT_COLOR[dot]}`} />}
          {status}
        </span>
      )}
    </button>
  );
}

export function SpecGrid({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <p className="px-1 text-[length:var(--fs-xs)] text-[var(--t3)]">أقسام خاصة</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{children}</div>
    </section>
  );
}
