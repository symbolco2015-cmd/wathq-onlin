import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ComparisonPoint } from './logic';
import { comparisonDelta } from './logic';

interface ComparisonChartProps {
  subject: string;
  series: ComparisonPoint[];
}

function CompareTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: ComparisonPoint = payload[0].payload;
  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)] px-3 py-2">
      <div className="text-[length:var(--fs-xs)] font-bold text-[var(--t1)] mb-1">{d.label}</div>
      <div className="text-[length:var(--fs-xs)] text-[var(--t2)]">المتوسط {d.average.toFixed(1)}</div>
    </div>
  );
}

/** رسم خطي لمتوسط كل تحليل عبر الزمن لنفس المادة — يظهر فقط عبر تبويب
 *  "مقارنة" التلقائي (عنصران فأكثر بنفس subject، انظر AnalysisSectionCard). */
export default function ComparisonChart({ subject, series }: ComparisonChartProps) {
  const delta = comparisonDelta(series);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">مقارنة — {subject}</div>
          <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-0.5">{series.length} تحليلات مرتبة زمنياً</div>
        </div>
        {delta && (
          <div className={`shrink-0 inline-flex items-center gap-1.5 py-1 px-3 rounded-[var(--r-full)] bg-[var(--s2)] border text-[length:var(--fs-xs)] font-bold ${delta.improved ? 'text-[var(--accent)] border-[var(--accent)]/35' : 'text-[var(--danger)] border-[var(--danger)]/35'}`}>
            <i className={`ti ${delta.improved ? 'ti-trending-up' : 'ti-trending-down'}`} />
            {delta.improved ? 'تحسّن' : 'تراجع'} {delta.improved ? '+' : ''}{delta.diff}
          </div>
        )}
      </div>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 12, right: 12, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="label"
              axisLine={{ stroke: 'var(--bd2)' }}
              tickLine={false}
              tick={{ fill: 'var(--t2)', fontSize: 12, fontWeight: 700 }}
            />
            <YAxis
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              width={28}
              tick={{ fill: 'var(--t3)', fontSize: 12 }}
            />
            <Tooltip content={<CompareTooltip />} cursor={{ stroke: 'var(--t3)', strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Line
              type="monotone"
              dataKey="average"
              stroke="var(--t2)"
              strokeWidth={2.5}
              dot={{ fill: 'var(--t2)', r: 4 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
