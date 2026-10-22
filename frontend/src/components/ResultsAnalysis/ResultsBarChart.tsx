import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalysisSummary, GradeBand } from './types';
import { bandTone, DANGER_ZONE_CENTER, DANGER_ZONE_MARGIN, fmtPct, fmtPm, type BandTone } from './logic';
import { AR_STUDENT, countAr } from '../../utils';

interface ResultsBarChartProps {
  summary: AnalysisSummary;
  bands: GradeBand[];
}

interface BandDatum {
  bandId: string;
  label: string;
  /** لون صريح (من getComputedStyle) لا var() — يُقرأ في كل المتصفحات وينسخه html-to-image */
  color: string;
  opacity: number;
  normal: number;
  danger: number;
  total: number;
}

/** شفافية جزء منطقة الخطر نسبةً إلى شفافية الفئة، بحد أدنى يبقيه مرئياً.
 *  على الخلفية الداكنة يظهر هذا الجزء أغمق من بقية العمود. */
const DANGER_PART_OPACITY = 0.45;
const DANGER_PART_MIN_OPACITY = 0.3;
export const dangerPartOpacity = (opacity: number) => Math.max(opacity * DANGER_PART_OPACITY, DANGER_PART_MIN_OPACITY);

function readVar(name: string): string {
  return typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
}

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** قيمة متغير اللون صريحةً، وvar() احتياطاً إن لم تُقرأ. المزج مع --warn
 *  (bandTone) يُحسب هنا رقمياً، لأن recharts وhtml-to-image يحتاجان لوناً صريحاً. */
function resolveTone(t: BandTone): string {
  const base = readVar(t.base);
  if (t.mixWarn !== undefined) {
    const a = hexRgb(base);
    const b = hexRgb(readVar('--warn'));
    if (!a || !b) return `color-mix(in srgb, var(${t.base}) ${t.mixWarn}%, var(--warn))`;
    const p = t.mixWarn / 100;
    return `rgb(${a.map((c, i) => Math.round(c * p + b[i] * (1 - p))).join(',')})`;
  }
  return base || `var(${t.base})`;
}

const TOOLTIP_CLS = 'rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)] px-3 py-2';
// ألوان SVG تُمرَّر خصائص لا أصنافاً؛ المتصفحات تقبل var() في سمات fill/stroke
const AXIS_LINE = { stroke: 'var(--bd2)' };
const X_TICK = { fill: 'var(--t2)', fontSize: 12, fontWeight: 700 };
const Y_TICK = { fill: 'var(--t3)', fontSize: 12 };
const CURSOR = { fill: 'var(--bd)' };

function buildChartData(summary: AnalysisSummary, bands: GradeBand[]): BandDatum[] {
  return bands.map((band, index) => {
    const tone = bandTone(index, bands.length);
    const total = summary.bandCounts[band.id] ?? 0;
    // التظليل يظهر فقط داخل الفئتين اللتين يتقاطع مداهما فعلياً مع منطقة
    // الخطر [55%,65%] — عملياً "مقبول" (60-69) و"ضعيف" (0-59) بالفئات الافتراضية،
    // لكن الشرط عام على أي مدى فعلي بدل الاعتماد على تسمية الفئة. حدود الفئات
    // والمنطقة كلاهما نسب مئوية.
    const bandIntersectsDanger =
      band.min_score <= DANGER_ZONE_CENTER + DANGER_ZONE_MARGIN &&
      band.max_score >= DANGER_ZONE_CENTER - DANGER_ZONE_MARGIN;
    const danger = bandIntersectsDanger
      ? summary.students.filter(s => s.bandId === band.id && s.inDangerZone).length
      : 0;
    return {
      bandId: band.id,
      label: band.label,
      color: resolveTone(tone),
      opacity: tone.opacity,
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
        <span className="w-2.5 h-2.5 rounded-[var(--r-full)]" style={{ background: d.color, opacity: d.opacity }} />
        <span className="text-[length:var(--fs-xs)] font-bold text-[var(--t1)]">{d.label}</span>
      </div>
      <div className="text-[length:var(--fs-xs)] text-[var(--t2)]">{countAr(d.total, AR_STUDENT)}</div>
      {d.danger > 0 && (
        <div className="text-[length:var(--fs-xs)] text-[var(--warn)] mt-0.5">{d.danger} منهم ضمن منطقة الخطر</div>
      )}
    </div>
  );
}

export default function ResultsBarChart({ summary, bands }: ResultsBarChartProps) {
  const data = buildChartData(summary, bands);
  const hasDangerShading = data.some(d => d.danger > 0);

  return (
    <div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height={220}>
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
              {data.map(d => <Cell key={d.bandId} fill={d.color} fillOpacity={dangerPartOpacity(d.opacity)} />)}
            </Bar>
            {/* بقية الفئة فوقه — استدارة علوية 4px فقط */}
            <Bar dataKey="normal" stackId="band" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map(d => <Cell key={d.bandId} fill={d.color} fillOpacity={d.opacity} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hasDangerShading && (
        <div className="flex items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">
          <i className="ti ti-info-circle text-[16px]" />
          الجزء الغامق أسفل العمودين ضمن منطقة الخطر ({fmtPm(DANGER_ZONE_MARGIN)} حول {fmtPct(DANGER_ZONE_CENTER)})
        </div>
      )}
    </div>
  );
}
