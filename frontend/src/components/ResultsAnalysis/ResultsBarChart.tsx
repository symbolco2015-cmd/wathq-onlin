import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalysisSummary, GradeBand } from './types';
import { DANGER_ZONE_CENTER, DANGER_ZONE_MARGIN } from './logic';

interface ResultsBarChartProps {
  summary: AnalysisSummary;
  bands: GradeBand[];
}

interface BandDatum {
  bandId: string;
  label: string;
  color: string;
  normal: number;
  danger: number;
  total: number;
}

/** يحوّل hex إلى نفس اللون بشفافية أعلى — يُستخدم لتظليل الجزء الواقع ضمن
 *  منطقة الخطر داخل عمودي "مقبول"/"ضعيف" فقط (نفس الهوية اللونية، وليست
 *  فئة بصرية جديدة). */
const withAlpha = (hex: string, alpha: string) => `${hex}${alpha}`;

function buildChartData(summary: AnalysisSummary, bands: GradeBand[]): BandDatum[] {
  return bands.map(band => {
    const total = summary.bandCounts[band.id] ?? 0;
    // التظليل يظهر فقط داخل الفئتين اللتين يتقاطع مداهما فعلياً مع منطقة
    // الخطر [55,65] — عملياً "مقبول" (60-69) و"ضعيف" (0-59) بالفئات الافتراضية،
    // لكن الشرط عام على أي مدى فعلي بدل الاعتماد على تسمية الفئة.
    const bandIntersectsDanger =
      band.min_score <= DANGER_ZONE_CENTER + DANGER_ZONE_MARGIN &&
      band.max_score >= DANGER_ZONE_CENTER - DANGER_ZONE_MARGIN;
    const danger = bandIntersectsDanger
      ? summary.students.filter(s => s.bandId === band.id && s.inDangerZone).length
      : 0;
    return {
      bandId: band.id,
      label: band.label,
      color: band.color,
      normal: total - danger,
      danger,
      total,
    };
  });
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: BandDatum = payload[0].payload;
  return (
    <div className="rounded-xl border border-[var(--line2)] bg-[var(--surf2)] px-3.5 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,.45)]">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
        <span className="text-[12.5px] font-extrabold text-white">{d.label}</span>
      </div>
      <div className="text-[12px] text-[var(--text3)]">{d.total} طالب</div>
      {d.danger > 0 && (
        <div className="text-[11.5px] text-[var(--gold3)] mt-0.5">{d.danger} منهم ضمن منطقة الخطر</div>
      )}
    </div>
  );
}

function SectionTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { section: string; average: number; count: number };
  return (
    <div className="rounded-xl border border-[var(--line2)] bg-[var(--surf2)] px-3.5 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,.45)]">
      <div className="text-[12.5px] font-extrabold text-white mb-1">{d.section}</div>
      <div className="text-[12px] text-[var(--text3)]">المتوسط {d.average.toFixed(1)} · {d.count} طالب</div>
    </div>
  );
}

export default function ResultsBarChart({ summary, bands }: ResultsBarChartProps) {
  const data = buildChartData(summary, bands);
  const hasDangerShading = data.some(d => d.danger > 0);

  return (
    <div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="18%" margin={{ top: 18, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="label"
              axisLine={{ stroke: 'var(--line2)' }}
              tickLine={false}
              tick={{ fill: 'var(--text3)', fontSize: 12, fontWeight: 700 }}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              width={28}
              tick={{ fill: 'var(--text4)', fontSize: 11 }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
            {/* الجزء الواقع ضمن منطقة الخطر — من القاعدة، بلا استدارة */}
            <Bar dataKey="danger" stackId="band" maxBarSize={24} isAnimationActive={false}>
              {data.map(d => <Cell key={d.bandId} fill={withAlpha(d.color, '55')} />)}
            </Bar>
            {/* بقية الفئة فوقه — استدارة علوية 4px فقط */}
            <Bar dataKey="normal" stackId="band" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map(d => <Cell key={d.bandId} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hasDangerShading && (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text4)] mt-1">
          <i className="ti ti-info-circle text-[12px]" />
          الجزء الفاتح من العمودين ضمن منطقة الخطر (±{DANGER_ZONE_MARGIN} حول درجة {DANGER_ZONE_CENTER})
        </div>
      )}

      {summary.sectionAverages && summary.sectionAverages.length > 1 && (
        <div className="mt-5 pt-4 border-t border-[var(--line)]">
          <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-wide uppercase mb-2">مقارنة متوسط الشعب</div>
          <div className="h-[140px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.sectionAverages} barCategoryGap="25%" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="section" axisLine={{ stroke: 'var(--line2)' }} tickLine={false} tick={{ fill: 'var(--text3)', fontSize: 11.5, fontWeight: 700 }} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} width={28} tick={{ fill: 'var(--text4)', fontSize: 11 }} />
                <Tooltip content={<SectionTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                <Bar dataKey="average" fill="var(--em6)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
