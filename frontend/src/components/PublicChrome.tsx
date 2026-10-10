// الشريط العلوي وصفحة «غير متاح» لمساري ?share= و?report= (App.tsx)
// شكل BTN_PRI (SectionView) بلا flex-1، فهو هنا وحده في عمود
const BTN_LINK = 'mt-3 h-11 px-4 inline-flex items-center justify-center rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--accent)] text-[length:var(--fs-sm)] font-bold text-[var(--bg)] no-underline';

/** شريط الزائر: الشعار و«وثّق» فقط. مخفي في الطباعة بقاعدة nav في Public.print.css */
export function PublicTopBar() {
  return (
    <nav className="sticky top-0 z-[300] h-[72px] bg-[var(--bg)] border-b border-[var(--bd)] flex items-center px-4 sm:px-9">
      <a href="/" className="h-11 inline-flex items-center gap-2 no-underline">
        <img src="/brand/mark.svg" alt="" aria-hidden="true" className="h-[28px] w-auto" />
        <span className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">وثّق</span>
      </a>
    </nav>
  );
}

/** صفحة واحدة لكل حالات عدم الإتاحة — لا تكشف السبب ولا وجود الحساب */
export function PublicUnavailable({ kind }: { kind: 'profile' | 'report' }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <PublicTopBar />
      <main className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-4 py-8">
        <img src="/brand/logo-horizontal-dark.svg" alt="وثّق" className="w-[170px] h-auto mb-3" />
        <h1 className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">
          {kind === 'report' ? 'هذا التقرير غير متاح' : 'هذا الملف غير متاح'}
        </h1>
        <p className="max-w-sm text-[length:var(--fs-sm)] leading-[1.8] text-[var(--t2)]">
          قد يكون صاحبه أوقف المشاركة، أو أن الرابط غير صحيح.
        </p>
        <a href="https://wathq.online" className={BTN_LINK}>
          تعرّف على وثّق
        </a>
      </main>
    </div>
  );
}
