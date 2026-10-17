import { useMemo, useState, type ReactNode } from 'react';
import { EYEBROW, PANEL, ResultComparisonMini, ResultRangeBar } from '../PublicSections';
import {
  bandCss, bandTone, fmtPct, groupPublicTests, publicPcts, publicTestMeta, SECTION_GAP_NOTE, summarizeTest,
  type ComparisonPoint, type PublicTestGroup, type PublicTestSection, type PublicTestSummary,
} from './logic';
import type { BandCount, PublicResultsAnalysisRow } from './types';
import { AR_ABSENT, AR_SECTION, AR_STUDENT, AR_TEST, countAr, countWord } from '../../utils';

/** أحدث كم اختباراً يظهر قبل «عرض كل النتائج» */
const VISIBLE_TESTS = 3;
/** أصغر عرض (نسبة) لجزء في شريط الفئات يُكتب العدد داخله */
const SEGMENT_LABEL_MIN_PCT = 8;

const STAT_NUM = 'text-[length:var(--fs-md)] font-bold text-[var(--t1)]';
const STAT_LABEL = 'text-[length:var(--fs-xs)] text-[var(--t3)]';
const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * قسم «نتائج المتعلمين» المفتوح في الصفحة العامة (والمعاينة والتقرير). وحدة
 * العرض الاختبار (groupPublicTests): بشعبة واحدة شريط المدى كما كان، وبشعبتين
 * فأكثر مقارنة على مقياس واحد. أرقام مجمّعة فقط — الصفوف العامة لا تحمل اسم
 * طالب ولا درجته. expandAll: الطباعة تعرض كل الاختبارات.
 */
export default function PublicResultsSection({ rows, comparisons, expandAll }: {
  rows: PublicResultsAnalysisRow[];
  /** تطور الشعبة عبر الزمن — حي، أو مخبوز في لقطة التقرير */
  comparisons: { subject: string; series: ComparisonPoint[] }[];
  expandAll?: boolean;
}) {
  const tests = useMemo(() => groupPublicTests(rows), [rows]);
  const [showAll, setShowAll] = useState(false);
  if (tests.length === 0) return null;

  const all = showAll || expandAll;
  const visible = all ? tests : tests.slice(0, VISIBLE_TESTS);
  const hiddenCount = tests.length - visible.length;

  return (
    <section aria-labelledby="results-title" className="mt-8">
      <div className={EYEBROW}>
        <i className="ti ti-chart-bar text-[16px]"></i>
        تحليل النتائج
      </div>
      <h2 id="results-title" className="mt-1 text-[length:var(--fs-lg)] font-bold text-[var(--t1)] print:break-after-avoid">نتائج المتعلمين</h2>
      <p className="mt-1 text-[length:var(--fs-sm)] text-[var(--t3)]">{countAr(tests.length, AR_TEST)} · أرقام مجمّعة بلا أسماء</p>

      <div className="mt-3 flex flex-col gap-3">
        {visible.map(g => <TestCard key={g.key} g={g} />)}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="print:hidden mt-3 w-full h-11 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] border border-[var(--bd2)] text-[length:var(--fs-sm)] font-bold text-[var(--t1)] cursor-pointer"
        >
          <i className="ti ti-chevron-down text-[16px]"></i>
          عرض كل النتائج ({countAr(tests.length, AR_TEST)})
        </button>
      )}

      {comparisons.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {comparisons.map(c => <ResultComparisonMini key={c.subject} subject={c.subject} series={c.series} />)}
        </div>
      )}
    </section>
  );
}

/** إضافات لوحة المعلم على بطاقة الاختبار — لا تصل إلى الزائر أبداً */
export interface TestCardOwner {
  /** يفتح تحليل الشعبة الكامل */
  onOpen: (analysisId: string) => void;
  /** تحليلات الاختبار المخفية من الصفحة العامة */
  hiddenIds: Set<string>;
  /** زر ⋯ في رأس البطاقة */
  menu?: ReactNode;
  /** تحت المقارنة: سطر القريبين من النجاح */
  footer?: ReactNode;
}

const OPEN_ROW = 'w-full text-right cursor-pointer rounded-[var(--r-sm)]';

export function HiddenNote({ text = 'مخفي من الصفحة العامة' }: { text?: string }) {
  return (
    <span className="flex items-center gap-1 text-[length:var(--fs-xs)] text-[var(--t3)]">
      <i className="ti ti-eye-off text-[16px] shrink-0" aria-hidden="true"></i>
      <span>{text}</span>
    </span>
  );
}

/** «الاختبار مخفي…» أو «شعبتان مخفيتان…» — null إن لم يُخفَ شيء */
function hiddenTestText(hidden: number, total: number): string | null {
  if (hidden === 0) return null;
  if (hidden === total) return total === 1 ? 'مخفي من الصفحة العامة' : 'الاختبار مخفي من الصفحة العامة';
  const adj = hidden === 1 ? 'مخفية' : hidden === 2 ? 'مخفيتان' : 'مخفية';
  return `${countAr(hidden, AR_SECTION)} ${adj} من الصفحة العامة`;
}

export function TestCard({ g, owner }: { g: PublicTestGroup; owner?: TestCardOwner }) {
  const meta = publicTestMeta(g);
  const hiddenCount = owner ? g.sections.filter(s => owner.hiddenIds.has(s.row.id)).length : 0;
  const hiddenText = hiddenTestText(hiddenCount, g.sections.length);
  return (
    <div className={PANEL}>
      <div className="flex items-start justify-between gap-2">
        {/* مسافة حقيقية بين المادة وما بعدها، لا هامش فقط: بدونها تتصل الحروف
            عبر العنصرين (رياضيات+ثاني) */}
        <h3 className="text-[length:var(--fs-sm)] text-[var(--t1)] break-words min-w-0">
          <span className="font-bold">{g.subject}</span>
          {meta && <>{' '}<span className="text-[var(--t2)]">· {meta}</span></>}
        </h3>
        {owner?.menu}
      </div>
      {hiddenText && <div className="mt-1"><HiddenNote text={hiddenText} /></div>}
      {g.comparison
        ? <SectionsComparison g={g} owner={owner} />
        : owner
          ? (
            <button type="button" onClick={() => owner.onOpen(g.sections[0].row.id)} className={`${OPEN_ROW} block`}>
              <SingleSection section={g.sections[0]} />
            </button>
          )
          : <SingleSection section={g.sections[0]} />}
      {owner?.footer}
    </div>
  );
}

function presenceLine(present: number, absent: number): string {
  return `${countAr(present, AR_STUDENT)}${absent > 0 ? ` · ${countAr(absent, AR_ABSENT)}` : ''}`;
}

/** صف الأرقام في بطاقة الاختبار — multi: أرقام «كل الشعب» في بطاقة المقارنة */
function TestStats({ s, multi }: { s: PublicTestSummary; multi: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
      <div>
        <div className={STAT_NUM}>{s.present}</div>
        <div className={STAT_LABEL}>{countWord(s.present, AR_STUDENT)}{multi ? ' في كل الشعب' : ''}</div>
      </div>
      {s.absent > 0 && (
        <div>
          <div className={STAT_NUM}>{s.absent}</div>
          <div className={STAT_LABEL}>{countWord(s.absent, AR_ABSENT)}</div>
        </div>
      )}
      <div>
        <div className={STAT_NUM}>{fmtPct(s.averagePct)}</div>
        <div className={STAT_LABEL}>{multi ? 'المتوسط العام' : 'المتوسط'}</div>
      </div>
      {s.passPct !== null && (
        <div>
          <div className={STAT_NUM}>{fmtPct(s.passPct)}</div>
          <div className={STAT_LABEL}>نسبة النجاح (60% فأكثر)</div>
        </div>
      )}
    </div>
  );
}

/** اختبار بشعبة واحدة: الأرقام، ودائرة الفئات ومفتاحها، وشريط المدى، وسطر
 *  يشرح غياب المقارنة. لقطة قديمة بلا band_counts: بلا دائرة. */
function SingleSection({ section }: { section: PublicTestSection }) {
  const r = section.row;
  const parts = [r.class_section !== null && r.class_section !== undefined && String(r.class_section) !== '' ? `شعبة ${r.class_section}` : '', presenceLine(r.total_students, r.absent_count ?? 0)];
  const s = summarizeTest([r]);
  const bandTotal = s.bands ? s.bands.reduce((n, b) => n + b.count, 0) : 0;
  return (
    <>
      <div className="mt-1 text-[length:var(--fs-xs)] text-[var(--t3)]">{parts.filter(Boolean).join(' · ')}</div>
      <TestStats s={s} multi={false} />

      {s.bands && bandTotal > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <BandDonut
            bands={s.bands}
            value={s.passPct ?? s.averagePct}
            label={s.passPct !== null ? 'نجاح' : 'المتوسط'}
          />
          <div className="min-w-0 flex-1">
            <BandLegend bands={s.bands} />
          </div>
        </div>
      )}

      <div className="mt-4">
        <ResultRangeBar row={r} />
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[length:var(--fs-xs)] text-[var(--t3)]">
        <i className="ti ti-info-circle text-[16px] shrink-0" aria-hidden="true"></i>
        <span>اختبار لشعبة واحدة، فلا مقارنة بين الشعب. تظهر المقارنة حين يُضاف الاختبار نفسه لشعبة أخرى.</span>
      </p>
    </>
  );
}

const DONUT_SIZE = 120;
const DONUT_STROKE = 16;

/** دائرة مفرّغة لتوزيع الفئات — SVG يدوي (يُطبع كما هو، بلا recharts). من
 *  الأعلى مع عقارب الساعة، بترتيب الفئات من الأقوى. الفئة الصفرية لا تُرسم. */
function BandDonut({ bands, value, label }: { bands: BandCount[]; value: number; label: string }) {
  const total = bands.reduce((n, b) => n + b.count, 0);
  const tones = bands.map((_, i) => bandTone(i, bands.length));
  const c = DONUT_SIZE / 2;
  const rad = (DONUT_SIZE - DONUT_STROKE) / 2;
  const circ = 2 * Math.PI * rad;
  let offset = 0;
  return (
    <div className="relative shrink-0 self-center sm:self-auto" style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
      <svg
        width={DONUT_SIZE}
        height={DONUT_SIZE}
        viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
        className="block"
        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
        role="img"
        aria-label={bands.map(b => `${b.label} ${b.count}`).join('، ')}
      >
        <circle cx={c} cy={c} r={rad} fill="none" strokeWidth={DONUT_STROKE} style={{ stroke: 'var(--s3)' }} />
        <g transform={`rotate(-90 ${c} ${c})`}>
          {bands.map((b, i) => {
            if (b.count === 0) return null;
            const len = (b.count / total) * circ;
            const seg = (
              <circle
                key={b.label}
                cx={c}
                cy={c}
                r={rad}
                fill="none"
                strokeWidth={DONUT_STROKE}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
                style={{ stroke: bandCss(tones[i]) }}
              >
                <title>{`${b.label}: ${countAr(b.count, AR_STUDENT)}`}</title>
              </circle>
            );
            offset += len;
            return seg;
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">{fmtPct(value)}</span>
        <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">{label}</span>
      </div>
    </div>
  );
}

function SectionsComparison({ g, owner }: { g: PublicTestGroup; owner?: TestCardOwner }) {
  const c = g.comparison!;
  const avgPos = clamp(c.averagePct);
  return (
    <>
      <TestStats s={c} multi />

      {c.bands && <BandDistribution bands={c.bands} />}

      <div className="mt-4 pt-4 border-t border-[var(--bd)] flex flex-col gap-3">
        {g.sections.map(s => owner
          ? (
            <button key={s.row.id} type="button" onClick={() => owner.onOpen(s.row.id)} className={`${OPEN_ROW} min-h-11 flex flex-col gap-1`}>
              <span className="w-full flex items-center gap-2">
                <span className="flex-1 min-w-0"><SectionBar s={s} avgPos={avgPos} /></span>
                <i className="ti ti-chevron-left text-[16px] text-[var(--t3)] shrink-0" aria-hidden="true"></i>
              </span>
              {owner.hiddenIds.has(s.row.id) && <HiddenNote />}
            </button>
          )
          : <SectionBar key={s.row.id} s={s} avgPos={avgPos} />)}
        <div className="flex items-center gap-2 text-[length:var(--fs-xs)] text-[var(--t3)]">
          <span className="w-0.5 h-3 bg-[var(--brand-gold)] shrink-0" aria-hidden="true"></span>
          <span>المتوسط العام {fmtPct(c.averagePct)}</span>
        </div>
      </div>

      {c.gap >= SECTION_GAP_NOTE && (
        <p className="mt-3 text-[length:var(--fs-xs)] text-[var(--t2)]">الفرق بين أعلى شعبة وأدناها {c.gap} نقطة.</p>
      )}
    </>
  );
}

/** سطر شعبة: الاسم والعدد، وشريط المتوسط من 0% إلى 100%، والخط الذهبي عند
 *  المتوسط العام في الموضع نفسه في كل الأسطر، فيبدو خطاً واحداً ممتداً. */
function SectionBar({ s, avgPos }: { s: PublicTestSection; avgPos: number }) {
  const r = s.row;
  const pcts = publicPcts(r);
  const mark = s.isTop ? 'أعلى شعبة' : s.isBottom ? 'أدنى شعبة' : '';
  return (
    <div className="flex items-center gap-3" title={`الأعلى ${fmtPct(pcts.max)} · الأدنى ${fmtPct(pcts.min)}`}>
      <div className="w-16 shrink-0">
        <div className="flex items-center gap-1 text-[length:var(--fs-xs)] font-bold text-[var(--t1)]">
          <span>شعبة {r.class_section ?? ''}</span>
          {mark && (
            <i className={`ti ${s.isTop ? 'ti-arrow-up' : 'ti-arrow-down'} text-[16px] text-[var(--t2)]`} title={mark} aria-label={mark}></i>
          )}
        </div>
        <div className="text-[length:var(--fs-xs)] text-[var(--t3)]">{countAr(r.total_students, AR_STUDENT)}</div>
      </div>
      <div dir="ltr" className="relative flex-1 h-2 rounded-[var(--r-full)] bg-[var(--s3)]">
        <div className="absolute inset-y-0 left-0 rounded-[var(--r-full)] bg-[var(--accent)]" style={{ width: `${clamp(s.averagePct)}%` }}></div>
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-[var(--brand-gold)]" style={{ left: `${avgPos}%`, marginLeft: '-1px' }} aria-hidden="true"></div>
      </div>
      <div className={`w-12 shrink-0 text-left text-[length:var(--fs-xs)] font-bold ${s.isTop ? 'text-[var(--accent)]' : 'text-[var(--t1)]'}`}>
        {fmtPct(s.averagePct)}
        {mark && <span className="hidden print:inline">{' '}({s.isTop ? 'الأعلى' : 'الأدنى'})</span>}
      </div>
    </div>
  );
}

/** شريط واحد مقسوم بأعداد الفئات، ومفتاح بالاسم والعدد — لا اعتماد على اللون وحده */
function BandDistribution({ bands }: { bands: BandCount[] }) {
  const total = bands.reduce((n, b) => n + b.count, 0);
  if (total === 0) return null;
  const tones = bands.map((_, i) => bandTone(i, bands.length));
  return (
    <div className="mt-4">
      <div className="flex h-6 rounded-[var(--r-sm)] overflow-hidden bg-[var(--s3)]">
        {bands.map((b, i) => {
          if (b.count === 0) return null;
          const pct = (b.count / total) * 100;
          return (
            <div
              key={b.label}
              className="h-full flex items-center justify-center text-[length:var(--fs-xs)] font-bold"
              style={{ width: `${pct}%`, background: bandCss(tones[i]), color: tones[i].opacity >= 1 ? 'var(--bg)' : 'var(--t1)' }}
              title={`${b.label}: ${countAr(b.count, AR_STUDENT)}`}
            >
              {pct >= SEGMENT_LABEL_MIN_PCT ? b.count : ''}
            </div>
          );
        })}
      </div>
      <div className="mt-2">
        <BandLegend bands={bands} />
      </div>
    </div>
  );
}

/** مفتاح الفئات بالاسم والعدد — الفئة الصفرية تبقى فيه */
function BandLegend({ bands }: { bands: BandCount[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {bands.map((b, i) => (
        <span key={b.label} className="inline-flex items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--t2)]">
          <span className="w-2.5 h-2.5 rounded-[var(--r-full)] shrink-0" style={{ background: bandCss(bandTone(i, bands.length)) }} aria-hidden="true"></span>
          <span>{b.label} {b.count}</span>
        </span>
      ))}
    </div>
  );
}
