// ثوابت الحقول والأزرار المشتركة بين النوافذ وصفحة الدخول — DESIGN.md
// الحقل 16px على الجوال حتى لا يكبّر iOS الصفحة عند التركيز، و14px من sm فما فوق
export const FIELD = 'w-full h-11 px-3 bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-sm)] text-[length:var(--fs-md)] sm:text-[length:var(--fs-sm)] text-[var(--t1)] placeholder:text-[var(--t3)] outline-none transition-colors duration-150 focus:border-[var(--accent)]';
export const LABEL = 'text-[length:var(--fs-xs)] font-bold text-[var(--t2)] mb-2 flex items-center gap-2';
export const HINT = 'text-[length:var(--fs-xs)] text-[var(--t3)] mt-1';
export const SECTION_TITLE = 'flex items-center gap-2 text-[length:var(--fs-sm)] font-bold text-[var(--t2)] mb-3';
export const BTN_2ND = 'h-11 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] border bg-transparent text-[length:var(--fs-sm)] font-bold whitespace-nowrap transition-colors duration-150';

// زرّا تبديل بين وضعين: محايد، فالأخضر محجوز للإجراء الرئيسي
export const toggleBtn = (active: boolean) =>
  `flex-1 h-11 rounded-[var(--r-sm)] border text-[length:var(--fs-sm)] font-bold cursor-pointer transition-colors duration-150 ${active
    ? 'bg-[var(--s2)] border-[var(--bd2)] text-[var(--t1)]'
    : 'bg-transparent border-[var(--bd)] text-[var(--t3)] hover:text-[var(--t2)]'}`;
