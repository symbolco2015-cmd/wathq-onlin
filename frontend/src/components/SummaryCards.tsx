// بطاقتا الملخص في الرئيسية — .month و.cum في docs/design/wathq-prototype.html.
// عرض فقط: كل الأرقام تُحسب في Dashboard وتصل جاهزة، فيكون الرقم واحداً في
// عمود الملخص (سطح المكتب) وأعلى المحتوى (الجوال والتابلت).

/** هدف الشهر: 8 بنود × 3 شواهد */
export const MONTH_GOAL = 24;

const CARD = 'p-4 rounded-[var(--r-md)] border border-[var(--bd)] bg-[var(--s1)]';

function Meter({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-[var(--r-full)] bg-[var(--s3)] overflow-hidden">
      <div
        className="h-full rounded-[var(--r-full)] bg-[var(--accent)] transition-[width] duration-350"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** رسالة التشجيع — 24 فما فوق = اكتمل الهدف */
function monthMessage(total: number): string {
  if (total === 0) return 'لم تبدأ بعد هذا الشهر';
  if (total <= 9) return 'بداية جيدة، واصل';
  if (total <= 20) return 'أنت في المنتصف';
  if (total < MONTH_GOAL) return 'اقتربت من الهدف';
  return 'أكملت هدف الشهر';
}

export function MonthCard({ total, monthName, year, nextSection, onOpenNext }: {
  /** monthlyProgress.currentMonthTotal */
  total: number;
  monthName: string;
  year: number;
  /** القسم الأقل نشاطاً هذا الشهر؛ null = لا قسم تحت 100% */
  nextSection: { ttl: string } | null;
  onOpenNext: () => void;
}) {
  const pct = Math.min(100, Math.round((total / MONTH_GOAL) * 100));
  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">عداد الشهر الحالي</span>
        <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">{monthName} {year}</span>
      </div>
      <div className="mt-1 text-[length:var(--fs-xl)] font-bold text-[var(--t1)] leading-tight">
        {total} <small className="text-[length:var(--fs-sm)] font-normal text-[var(--t3)]">من {MONTH_GOAL}</small>
      </div>
      <div className="mt-3"><Meter pct={pct} /></div>
      <div className="mt-2 text-[length:var(--fs-xs)] text-[var(--t3)]">{monthMessage(total)}</div>
      {nextSection && (
        <button
          type="button"
          onClick={onOpenNext}
          className="mt-2 w-full flex items-center gap-1 text-right text-[length:var(--fs-xs)] text-[var(--t3)] hover:text-[var(--t1)] transition-colors duration-150 cursor-pointer"
        >
          <span className="flex-1 min-w-0 truncate">الخطوة التالية: <span className="text-[var(--t1)]">{nextSection.ttl}</span></span>
          <i className="ti ti-chevron-left text-[16px] shrink-0" />
        </button>
      )}
    </div>
  );
}

export function CumulativeCard({ overallPct, error, completedSections, totalSections, totalEvs, levelLabel }: {
  /** get_portfolio_completion.overall_pct */
  overallPct: number;
  /** تعذّر جلب الجاهزية ⇐ رسالة بدل النسبة */
  error: boolean;
  completedSections: number;
  totalSections: number;
  totalEvs: number;
  /** calculatePointsLevel().levelLabel؛ null = بلا سطر */
  levelLabel: string | null;
}) {
  const rows: [string, string][] = [
    ['أقسام مكتملة', `${completedSections} من ${totalSections}`],
    ['إجمالي الشواهد', String(totalEvs)],
  ];
  if (levelLabel) rows.push(['المستوى', levelLabel]);
  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">جاهزية الملف</span>
        {error
          ? <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">تعذّر تحميل الجاهزية</span>
          : <span className="text-[length:var(--fs-xl)] font-bold text-[var(--t1)] leading-tight">{overallPct}%</span>}
      </div>
      <div className="mt-3"><Meter pct={error ? 0 : overallPct} /></div>
      <dl className="mt-3 flex flex-col gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2 text-[length:var(--fs-xs)]">
            <dt className="text-[var(--t3)]">{label}</dt>
            <dd className="font-bold text-[var(--t1)]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
