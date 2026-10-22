import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimelinePoint } from './logic';
import { fmtNum, fmtPct, fmtPointsDelta } from './logic';

interface ComparisonChartProps {
  /** عنوان الشعبة: «رياضيات · ثاني متوسط · شعبة 3» */
  title: string;
  /** buildSectionTimeline — تصاعدياً بالترتيب في الفصل */
  points: TimelinePoint[];
  /** يفتح تحليل اختبار من الجدول */
  onOpen?: (analysisId: string) => void;
}

/** خط المتوسط متصل بـ --accent، وخط النجاح متقطع بـ --t2: الذهبي محجوز في
 *  الشاشة نفسها لـ«المتوسط العام» في مقارنة الشعب، فلا يحمل معنى ثانياً هنا. */
const AVG_COLOR = 'var(--accent)';
const PASS_COLOR = 'var(--t2)';
const PASS_DASH = '5 4';

function TimelineTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: TimelinePoint = payload[0].payload;
  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)] px-3 py-2">
      <div className="text-[length:var(--fs-xs)] font-bold text-[var(--t1)] mb-1">{d.label}</div>
      <div className="text-[length:var(--fs-xs)] text-[var(--t2)]">المتوسط {fmtPct(d.averagePct)}</div>
      <div className="text-[length:var(--fs-xs)] text-[var(--t2)]">النجاح {fmtPct(d.passPct)}</div>
    </div>
  );
}

function LegendItem({ color, dashed, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--t2)]">
      <svg width="20" height="8" aria-hidden="true">
        <line x1="1" y1="4" x2="19" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? '4 3' : undefined} strokeLinecap="round" />
      </svg>
      <span>{label}</span>
    </span>
  );
}

/** تسمية المحور: الأولى تبدأ من نقطتها والأخيرة تنتهي عندها، فلا تُقص عند
 *  حافتي الرسم. ما بينهما في الوسط. */
/** تسميات المحور الأفقي متمركزة، وpreserveStartEnd تُبقي الطرفين داخل الرسم.
 *  capHeight = 12px يضع خط القاعدة على y+12 كما كان dy={12} في التسمية المخصصة
 *  السابقة (الافتراضي 0.71em)؛ verticalAnchor لا يمر عبر كائن tick. */
const X_TICK = { fill: 'var(--t2)', fontSize: 12, fontWeight: 700, capHeight: '12px' };

const CELL = 'py-2.5 px-2 text-[length:var(--fs-xs)]';

/** الشعبة نفسها عبر اختبارات الفصل، بالنسب على محور ثابت 0–100%. اختبار
 *  واحد: سطر بلا رسم. */
export default function ComparisonChart({ title, points, onOpen }: ComparisonChartProps) {
  return (
    <div>
      <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)] break-words">{title}</div>

      {points.length < 2 ? (
        <p className="mt-2 text-[length:var(--fs-sm)] text-[var(--t2)]">لا توجد اختبارات أخرى لهذه الشعبة بعد.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <LegendItem color={AVG_COLOR} label="المتوسط" />
            <LegendItem color={PASS_COLOR} dashed label="نسبة النجاح (60% فأكثر)" />
          </div>
          <div className="mt-2 h-[220px] w-full">
            <ResponsiveContainer width="100%" height={220}>
              {/* هامش أفقي 32: Recharts تقيس التسمية بوزن 400 والمرسوم 700، فيبقى للطرفين متّسع */}
              <LineChart data={points} margin={{ top: 12, right: 32, left: 32, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  axisLine={{ stroke: 'var(--bd2)' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  tick={X_TICK}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  tick={{ fill: 'var(--t3)', fontSize: 12 }}
                />
                <Tooltip content={<TimelineTooltip />} cursor={{ stroke: 'var(--t3)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Line
                  type="linear"
                  dataKey="passPct"
                  stroke={PASS_COLOR}
                  strokeWidth={2}
                  strokeDasharray={PASS_DASH}
                  dot={{ fill: PASS_COLOR, r: 3 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="averagePct"
                  stroke={AVG_COLOR}
                  strokeWidth={2.5}
                  dot={{ fill: AVG_COLOR, r: 4 }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="mt-4 rounded-[var(--r-md)] border border-[var(--bd)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[var(--t3)] text-right">
              <th className={`${CELL} font-bold`}>الاختبار</th>
              <th className={`${CELL} font-bold w-16`}>المتوسط</th>
              <th className={`${CELL} font-bold w-16`}>النجاح</th>
              <th className={`${CELL} font-bold w-20`}>التغيّر</th>
            </tr>
          </thead>
          <tbody>
            {points.map(p => (
              <tr
                key={p.id}
                onClick={onOpen ? () => onOpen(p.id) : undefined}
                className={`border-t border-[var(--bd)] text-[var(--t1)] ${onOpen ? 'cursor-pointer' : ''}`}
              >
                <td className={`${CELL} break-words`}>
                  {onOpen ? (
                    <button type="button" onClick={e => { e.stopPropagation(); onOpen(p.id); }} className="text-right font-bold cursor-pointer">
                      {p.label}
                    </button>
                  ) : <span className="font-bold">{p.label}</span>}
                  {' '}<span className="text-[var(--t3)]">· من {fmtNum(p.fullMark)}</span>
                </td>
                <td className={CELL}>{fmtPct(p.averagePct)}</td>
                <td className={CELL}>{fmtPct(p.passPct)}</td>
                <td className={`${CELL} font-bold ${p.delta === null ? 'text-[var(--t3)]' : p.delta > 0 ? 'text-[var(--accent)]' : p.delta < 0 ? 'text-[var(--warn)]' : 'text-[var(--t2)]'}`}>
                  {p.delta === null ? '—' : fmtPointsDelta(p.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
