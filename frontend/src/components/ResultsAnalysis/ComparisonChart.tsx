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
    <div className="rounded-xl border border-[var(--line2)] bg-[var(--surf2)] px-3.5 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,.45)]">
      <div className="text-[12.5px] font-extrabold text-white mb-1">{d.label}</div>
      <div className="text-[12px] text-[var(--text3)]">المتوسط {d.average.toFixed(1)}</div>
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
          <div className="text-[15px] font-black text-white">مقارنة — {subject}</div>
          <div className="text-[11.5px] text-[var(--text4)] mt-0.5">{series.length} تحليلات مرتبة زمنياً</div>
        </div>
        {delta && (
          <div className={`shrink-0 inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full text-[12px] font-bold ${delta.improved ? 'text-[var(--em8)] bg-[var(--em7)]/10 border border-[var(--em7)]/25' : 'text-red-400 bg-red-500/10 border border-red-500/25'}`}>
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
              axisLine={{ stroke: 'var(--line2)' }}
              tickLine={false}
              tick={{ fill: 'var(--text3)', fontSize: 11.5, fontWeight: 700 }}
            />
            <YAxis
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              width={28}
              tick={{ fill: 'var(--text4)', fontSize: 11 }}
            />
            <Tooltip content={<CompareTooltip />} cursor={{ stroke: 'var(--em7)', strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Line
              type="monotone"
              dataKey="average"
              stroke="var(--em6)"
              strokeWidth={2.5}
              dot={{ fill: 'var(--em6)', r: 4 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
