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

const TOOLTIP_CLS = 'rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)] px-3 py-2';
// ألوان SVG تُمرَّر خصائص لا أصنافاً؛ المتصفحات تقبل var() في سمات fill/stroke
const AXIS_LINE = { stroke: 'var(--bd2)' };
const X_TICK = { fill: 'var(--t2)', fontSize: 12, fontWeight: 700 };
const Y_TICK = { fill: 'var(--t3)', fontSize: 12 };
const CURSOR = { fill: 'var(--bd)' };

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
    <div className={TOOLTIP_CLS}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-[var(--r-full)]" style={{ background: d.color }} />
        <span className="text-[length:var(--fs-xs)] font-bold text-[var(--t1)]">{d.label}</span>
      </div>
      <div className="text-[length:var(--fs-xs)] text-[var(--t2)]">{d.total} طالب</div>
      {d.danger > 0 && (
        <div className="text-[length:var(--fs-xs)] text-[var(--warn)] mt-0.5">{d.danger} منهم ضمن منطقة الخطر</div>
      )}
    </div>
  );
}

function SectionTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { section: string; average: number; count: number };
  return (
    <div className={TOOLTIP_CLS}>
      <div className="text-[length:var(--fs-xs)] font-bold text-[var(--t1)] mb-1">{d.section}</div>
      <div className="text-[length:var(--fs-xs)] text-[var(--t2)]">المتوسط {d.average.toFixed(1)} · {d.count} طالب</div>
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
              axisLine={AXIS_LINE}
              tickLine={false}
              tick={X_TICK}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              width={28}
              tick={Y_TICK}
            />
            <Tooltip content={<ChartTooltip />} cursor={CURSOR} />
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
        <div className="flex items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">
          <i className="ti ti-info-circle text-[16px]" />
          الجزء الفاتح من العمودين ضمن منطقة الخطر (±{DANGER_ZONE_MARGIN} حول درجة {DANGER_ZONE_CENTER})
        </div>
      )}

      {summary.sectionAverages && summary.sectionAverages.length > 1 && (
        <div className="mt-6 pt-4 border-t border-[var(--bd)]">
          <div className="text-[length:var(--fs-xs)] font-bold text-[var(--t3)] mb-2">مقارنة متوسط الشعب</div>
          <div className="h-[140px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.sectionAverages} barCategoryGap="25%" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="section" axisLine={AXIS_LINE} tickLine={false} tick={X_TICK} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} width={28} tick={Y_TICK} />
                <Tooltip content={<SectionTooltip />} cursor={CURSOR} />
                <Bar dataKey="average" fill="var(--t2)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
