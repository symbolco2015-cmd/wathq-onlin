// قائمة البنود ونافذة البند في الصفحة العامة — .areas و.area في pub()، و.sheet.secm
// في pubSec() بـ docs/design/wathq-prototype.html. البنود الخاصة الأربعة مجموعة
// ثانية بنفس الصف (ليست في النموذج)، ومحتواها بالمنطق السابق نفسه بألوان DESIGN.md.
import React, { useEffect, useRef, useState } from 'react';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import { toEvRow } from '../indicators';
import { extractYouTubeId, publicKind, type PublicKind, type ViewerItem } from './EvidenceViewer';
import { LEVEL_COLOR, LEVEL_LABEL, nEv, type Level } from './SectionView';
import type { PublicResultsAnalysisRow } from './ResultsAnalysis/types';
import type { ComparisonPoint } from './ResultsAnalysis/logic';
import { comparisonDelta } from './ResultsAnalysis/logic';

/** صف عرض شاهد: صف المؤشرات المعتاد + نوع العرض العام والوصف (لمعاينة الملاحظة). */
export function toPublicRow(e: SupabaseEvidence) {
  return { ...toEvRow(e), kind: publicKind(e), description: e.description };
}
export type PublicRow = ReturnType<typeof toPublicRow>;

export type EvidenceGroup = { key: string; label: string; evs: PublicRow[] };

export type SpecialKey = 'strat' | 'indiv' | 'analysis' | 'improvement';
export type OpenSec = { kind: 'core'; id: number } | { kind: SpecialKey };

/** صف بند واحد في القائمة. level غائب للبنود الخاصة (لا تدخل أي نسبة). */
export interface AreaItem {
  key: string;
  open: OpenSec;
  icon: string;
  title: string;
  count: string;
  level?: Level;
  summary?: string | null;
}

// «جارٍ» يتشوّه تنوينه في الخط الصغير، فتُكتب «قيد التقدم» في الصفحة العامة فقط
const PUBLIC_LEVEL_LABEL: Record<Level, string> = { ...LEVEL_LABEL, p: 'قيد التقدم' };

/** شارة المستوى في الصفحة العامة — LevelBadge في SectionView.tsx بنص PUBLIC_LEVEL_LABEL */
function PublicLevelBadge({ level }: { level: Level }) {
  return (
    <span
      className="inline-flex items-center rounded-[var(--r-full)] bg-[var(--s2)] print:bg-transparent print:border px-2 py-0.5 text-[length:var(--fs-xs)] font-bold whitespace-nowrap"
      style={{ color: LEVEL_COLOR[level] }}
    >
      {PUBLIC_LEVEL_LABEL[level]}
    </span>
  );
}

const KIND_ICON: Record<PublicKind, string> = {
  img: 'ti-photo', pdf: 'ti-file-text', vid: 'ti-player-play',
  audio: 'ti-microphone', link: 'ti-link', note: 'ti-notes',
};

const EYEBROW = 'flex items-center gap-1.5 text-[length:var(--fs-xs)] font-bold text-[var(--brand-gold)]';
const PILL = 'inline-flex items-center rounded-[var(--r-full)] bg-[var(--s2)] print:bg-transparent print:border px-2 py-0.5 text-[length:var(--fs-xs)] font-bold text-[var(--t2)] whitespace-nowrap';
const PANEL = 'rounded-[var(--r-md)] bg-[var(--s2)] print:bg-transparent border border-[var(--bd)] p-4';

/** اسم الدومين فقط (بدون www.) لعرضه بجانب أيقونة رابط عام غير معروف */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** .btile — أيقونة البند بلون الهوية في الصفحة العامة */
function BrandTile({ icon, small }: { icon: string; small?: boolean }) {
  return (
    <span
      className={`print-decor shrink-0 flex items-center justify-center rounded-[var(--r-sm)] bg-[var(--brand)] text-[var(--brand-cream)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand-gold)_25%,transparent)] ${small ? 'w-9 h-9 text-[20px]' : 'w-11 h-11 text-[24px]'}`}
    >
      <i className={`ti ${icon}`}></i>
    </span>
  );
}

function AreaRow({ item, onOpen }: { item: AreaItem; onOpen: (open: OpenSec, el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      onClick={ev => onOpen(item.open, ev.currentTarget)}
      className="print-card flex flex-col gap-3 p-4 rounded-[var(--r-md)] bg-[var(--s1)] border border-[var(--bd)] text-right cursor-pointer transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--brand-gold)_35%,transparent)]"
    >
      <span className="flex items-center gap-3 w-full">
        <BrandTile icon={item.icon} />
        <span className="min-w-0 flex-1 text-[length:var(--fs-sm)] font-bold leading-[1.5] text-[var(--t1)]">{item.title}</span>
      </span>
      {item.summary && (
        <span className="flex items-center gap-1.5 w-full min-w-0 text-[length:var(--fs-xs)] text-[var(--t2)]">
          <i className="ti ti-sparkles text-[16px] text-[var(--t3)] shrink-0"></i>
          <span className="truncate">{item.summary}</span>
        </span>
      )}
      <span className="flex items-center gap-2 text-[length:var(--fs-xs)] text-[var(--t3)]">
        <span>{item.count}</span>
        {item.level && <PublicLevelBadge level={item.level} />}
      </span>
    </button>
  );
}

/** قائمة البنود الثمانية (التي عليها شواهد فقط، كـ acts في النموذج) ثم مجموعة البنود الخاصة */
export function SectionsList({ core, special, coveredCount, totalSections, onOpen }: {
  core: AreaItem[];
  special: AreaItem[];
  coveredCount: number;
  totalSections: number;
  onOpen: (open: OpenSec, el: HTMLElement) => void;
}) {
  return (
    <section aria-labelledby="areas-title">
      <div className={EYEBROW}>
        <i className="ti ti-layout-grid text-[16px]"></i>
        المجالات الموثّقة
      </div>
      <h2 id="areas-title" className="mt-1 text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">ممارسات موثّقة بالشواهد</h2>
      <p className="mt-1 text-[length:var(--fs-sm)] text-[var(--t3)]">{coveredCount} من {totalSections} مجالات للأداء المهني</p>
      {core.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
          {core.map(item => <AreaRow key={item.key} item={item} onOpen={onOpen} />)}
        </div>
      ) : (
        <p className="mt-3 text-[length:var(--fs-sm)] text-[var(--t3)]">لم تُوثَّق مجالات بعد.</p>
      )}

      {special.length > 0 && (
        <>
          <div className={`${EYEBROW} mt-6`}>
            <i className="ti ti-layout-list text-[16px]"></i>
            بنود خاصة
          </div>
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
            {special.map(item => <AreaRow key={item.key} item={item} onOpen={onOpen} />)}
          </div>
        </>
      )}
    </section>
  );
}

/** نافذة البند الموحّدة — ورقة سفلية على الجوال، ونافذة في الوسط بعرض 520px من lg.
 *  Esc يُتجاهل ما دامت نافذة العرض (EvidenceViewer، z أعلى) مفتوحة فوقها. */
export function SectionSheet({ icon, title, onClose, returnFocusTo, viewerOpenRef, children }: {
  icon: string;
  title: string;
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
  viewerOpenRef: React.RefObject<boolean>;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || viewerOpenRef.current) return;
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      returnFocusTo?.focus();
    };
  }, [returnFocusTo, viewerOpenRef]);

  return (
    <div className="print:hidden fixed inset-0 z-[400] flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden="true"></div>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-sheet-title"
        className="relative w-full lg:w-[520px] max-h-[92vh] lg:max-h-[86vh] flex flex-col bg-[var(--s1)] rounded-t-[var(--r-lg)] lg:rounded-[var(--r-lg)] border-t lg:border border-[var(--bd2)]"
      >
        <div className="lg:hidden w-10 h-1 mx-auto mt-2 rounded-[var(--r-full)] bg-[var(--bd2)]"></div>
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <BrandTile icon={icon} small />
          <h3 id="section-sheet-title" className="flex-1 min-w-0 text-[length:var(--fs-md)] font-bold text-[var(--t1)]">{title}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-[var(--r-sm)] border border-[var(--bd2)] text-[var(--t2)] text-[16px] cursor-pointer"
          >
            <i className="ti ti-x"></i>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

/** ملخص البند الآلي كاملاً — فوق الشواهد في نافذة البند */
function SummaryBox({ text }: { text: string }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-[var(--r-md)] bg-[var(--s2)] border border-[var(--bd)] px-3 py-3">
      <i className="ti ti-sparkles text-[16px] text-[var(--t3)] mt-0.5 shrink-0"></i>
      <p className="text-[length:var(--fs-sm)] leading-relaxed text-[var(--t2)]">{text}</p>
    </div>
  );
}

/** محتوى بند عادي — .ig و.row في pubSec(): عنوان لكل مؤشر عليه شواهد، ثم صف
 *  زر لكل شاهد. onActivate يقرر المعاينة أو فتح الرابط. */
export function CoreSectionBody({ groups, summary, onActivate }: {
  groups: EvidenceGroup[];
  summary?: string | null;
  onActivate: (row: PublicRow, groupLabel: string) => void;
}) {
  return (
    <div>
      {summary && <SummaryBox text={summary} />}
      {groups.map(g => (
        <section key={g.key} className="mt-4">
          <h4 className="flex items-center gap-2 text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">
            <span className="min-w-0">{g.label}</span>
            <span className={`${PILL} mr-auto`}>{nEv(g.evs.length)}</span>
          </h4>
          {g.evs.map(e => {
            const isLink = e.kind === 'link' && !!e.url && !extractYouTubeId(e.url);
            const clickable = isLink || e.kind === 'note' || !!e.url;
            const content = (
              <>
                <span className="w-8 h-8 shrink-0 flex items-center justify-center rounded-[var(--r-sm)] bg-[var(--s2)] text-[var(--t2)] text-[16px]">
                  <i className={`ti ${KIND_ICON[e.kind]}`}></i>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[length:var(--fs-sm)] text-[var(--t1)] break-words">{e.name}</span>
                  {e.description?.trim() && e.kind !== 'note' && (
                    <span className="block mt-0.5 text-[length:var(--fs-xs)] text-[var(--t3)] line-clamp-2">{e.description}</span>
                  )}
                </span>
                <span className="shrink-0 flex items-center gap-1 text-[length:var(--fs-xs)] text-[var(--t3)] whitespace-nowrap">
                  {isLink && <i className="ti ti-external-link text-[16px]"></i>}
                  {e.date}
                </span>
              </>
            );
            const rowCls = 'w-full flex items-center gap-3 py-2 border-b border-[var(--bd)] text-right';
            return clickable ? (
              <button
                key={e.id}
                type="button"
                className={`${rowCls} cursor-pointer`}
                title={isLink ? 'يفتح الرابط في تبويب جديد' : undefined}
                onClick={ev => { ev.currentTarget.focus(); onActivate(e, g.label); }}
              >
                {content}
              </button>
            ) : (
              <div key={e.id} className={rowCls}>{content}</div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** مصغّرة شاهد في البنود الخاصة — صورة / مصغّرة يوتيوب / أيقونة ملف+اسم /
 *  رابط+دومين / ملاحظة. القابل للمعاينة <button>، والرابط العادي <a> في تبويب جديد.
 *  eager: نسخة الطباعة، حتى تُحمَّل الصور قبل حوار الطباعة. */
function EvidenceThumb({ e, onClick, eager }: { e: ViewerItem; onClick?: (e: ViewerItem) => void; eager?: boolean }) {
  const loading = eager ? 'eager' : 'lazy';
  const activate = (ev: React.MouseEvent<HTMLButtonElement>) => {
    ev.currentTarget.focus();
    onClick?.(e);
  };
  const tileCls = 'w-full flex items-center gap-2 py-2 px-3 rounded-[var(--r-sm)] bg-[var(--s2)] print:bg-transparent border border-[var(--bd)] text-right';
  const nameCls = 'text-[length:var(--fs-xs)] font-bold text-[var(--t1)] truncate';

  if (e.kind === 'img' && e.url) {
    const img = <img src={e.url} alt={e.name} loading={loading} className="w-full h-[88px] object-cover rounded-[var(--r-sm)] border border-[var(--bd)]" />;
    return onClick
      ? <button type="button" onClick={activate} aria-label={e.name} className="block w-full cursor-pointer">{img}</button>
      : img;
  }

  const ytId = e.url ? extractYouTubeId(e.url) : null;
  if (ytId) {
    const inner = (
      <>
        <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={e.name} loading={loading} className="w-full h-[88px] object-cover rounded-[var(--r-sm)] border border-[var(--bd)]" />
        <span className="absolute inset-0 flex items-center justify-center print:hidden">
          <span className="w-9 h-9 rounded-[var(--r-full)] bg-black/45 flex items-center justify-center text-[20px] text-[var(--t1)]">
            <i className="ti ti-player-play"></i>
          </span>
        </span>
      </>
    );
    return onClick
      ? <button type="button" onClick={activate} aria-label={e.name} className="relative block w-full cursor-pointer">{inner}</button>
      : <div className="relative">{inner}</div>;
  }

  if (e.kind === 'link' && e.url) {
    return (
      <a href={e.url} target="_blank" rel="noreferrer" className={`${tileCls} text-[var(--t2)]`}>
        <i className="ti ti-link text-[16px] shrink-0"></i>
        <span className="text-[length:var(--fs-xs)] font-bold truncate" dir="ltr">{getDomain(e.url)}</span>
      </a>
    );
  }

  // ملف (pdf/فيديو/صوت) أو ملاحظة — الملف بلا رابط غير قابل للضغط
  const clickable = !!onClick && (e.kind === 'note' || !!e.url);
  const inner = (
    <>
      <span className="w-8 h-8 shrink-0 flex items-center justify-center rounded-[var(--r-sm)] bg-[var(--s1)] text-[var(--t2)] text-[16px] print:hidden">
        <i className={`ti ${KIND_ICON[e.kind]}`}></i>
      </span>
      <span className={nameCls}>{e.name}</span>
    </>
  );
  return clickable
    ? <button type="button" onClick={activate} className={`${tileCls} cursor-pointer`}>{inner}</button>
    : <div className={tileCls}>{inner}</div>;
}

const THUMB_GRID = 'grid grid-cols-2 sm:grid-cols-3 gap-3';

/** مجموعات شواهد بعنوان صغير لكل مجموعة (مؤشر، أو «بلا مؤشر»، أو «شواهد أخرى»). */
function IndicatorGroups({ groups, onPreview, eager }: { groups: EvidenceGroup[]; onPreview: (e: ViewerItem) => void; eager?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map(g => (
        <div key={g.key} className={PANEL}>
          <div className="flex items-center gap-2 mb-3">
            <span className="flex-1 text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{g.label}</span>
            <span className={PILL}>{nEv(g.evs.length)}</span>
          </div>
          <div className={THUMB_GRID}>
            {g.evs.map(e => <EvidenceThumb key={e.id} e={e} onClick={onPreview} eager={eager} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyNote({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-12 h-12 rounded-[var(--r-full)] bg-[var(--s2)] flex items-center justify-center text-[24px] text-[var(--t3)] mb-3">
        <i className={`ti ${icon}`}></i>
      </div>
      <p className="text-[length:var(--fs-sm)] text-[var(--t3)]">{text}</p>
    </div>
  );
}

/** «استراتيجيات التدريس المتنوعة» — مجموعة لكل strategy_id، كل مجموعة تُطوى
 *  وحدها (مفتوحة افتراضياً)، ثم «شواهد أخرى». forceOpen: نسخة الطباعة. */
export function StrategiesContent({ groups, otherEvs, onPreview, forceOpen, eager }: {
  groups: { id: string; name: string; evidence: SupabaseEvidence[] }[];
  otherEvs: PublicRow[];
  onPreview: (e: ViewerItem) => void;
  forceOpen?: boolean;
  eager?: boolean;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setClosed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (groups.length === 0 && otherEvs.length === 0) {
    return <EmptyNote icon="ti-bulb-off" text="لا توجد استراتيجيات موثّقة بدليل بعد" />;
  }
  return (
    <div className="flex flex-col gap-3 mt-2">
      {groups.map(group => {
        const open = forceOpen || !closed.has(group.id);
        return (
          <div key={group.id} className={PANEL}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(group.id)}
              className="w-full flex items-center gap-2 text-right cursor-pointer"
            >
              <span className="flex-1 text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{group.name}</span>
              <span className={PILL}>{nEv(group.evidence.length)}</span>
              <i className={`ti ti-chevron-down text-[16px] text-[var(--t3)] transition-transform duration-250 print:hidden ${open ? 'rotate-180' : ''}`}></i>
            </button>
            {open && (
              <div className={`${THUMB_GRID} mt-3`}>
                {group.evidence.map(e => <EvidenceThumb key={e.id} e={toPublicRow(e)} onClick={onPreview} eager={eager} />)}
              </div>
            )}
          </div>
        );
      })}
      {otherEvs.length > 0 && (
        <IndicatorGroups groups={[{ key: 'other', label: 'شواهد أخرى', evs: otherEvs }]} onPreview={onPreview} eager={eager} />
      )}
    </div>
  );
}

/** «مراعاة الفروق الفردية بين المتعلمين» — شواهد المؤشر وحده (بلا strategy_id) */
export function IndivDiffContent({ evs, onPreview, eager }: { evs: PublicRow[]; onPreview: (e: ViewerItem) => void; eager?: boolean }) {
  if (evs.length === 0) return <EmptyNote icon="ti-ghost" text="لا توجد شواهد موثّقة بعد لهذا المؤشر" />;
  return (
    <div className={`${THUMB_GRID} mt-2`}>
      {evs.map(e => <EvidenceThumb key={e.id} e={e} onClick={onPreview} eager={eager} />)}
    </div>
  );
}

/** سطر تحليل واحد ببند 10 — بلا رسم توزيع فئات أو قائمة طلاب (بيانات داخلية
 *  فقط)، فقط شريط مدى (0-100) يوضّح موقع الأدنى/الأعلى، وعلامة لموقع المتوسط.
 *  dir="ltr" مقصود ومعزول عن اتجاه الصفحة: شريط رقمي كهذا يحتاج تموضعاً مطلقاً
 *  (left: min%→max%)، وقيم الدرجات تُقرأ تقليدياً من اليسار لليمين. الأدنى
 *  والأعلى يُحسبان بـ min/max احتياطاً، فلا ينقلب الشريط أياً كان المصدر. */
function ResultRangeRow({ row }: { row: PublicResultsAnalysisRow }) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const lo = Math.min(row.min_score, row.max_score);
  const hi = Math.max(row.min_score, row.max_score);
  const minPct = clamp(lo);
  const maxPct = clamp(hi);
  const avgPct = clamp(row.average);
  const metaParts = [row.stage, row.class_section].filter(Boolean) as string[];

  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{row.subject}</span>
          {metaParts.length > 0 && (
            <span className="text-[length:var(--fs-xs)] text-[var(--t3)] mr-2">{metaParts.join(' · ')}</span>
          )}
        </div>
        <span className={`${PILL} shrink-0`}>{row.total_students} طالب</span>
      </div>

      <div dir="ltr">
        <div className="print-progress-track relative h-2 rounded-[var(--r-full)] bg-[var(--s3)]">
          <div
            className="print-progress-fill absolute top-0 h-2 rounded-[var(--r-full)] bg-[var(--t3)]"
            style={{ left: `${minPct}%`, width: `${Math.max(1, maxPct - minPct)}%` }}
          ></div>
          <div
            className="absolute top-1/2 w-[3px] h-3 rounded-[var(--r-full)] bg-[var(--t1)] print:bg-black -translate-y-1/2"
            style={{ left: `${avgPct}%`, marginLeft: '-1.5px' }}
            title={`المتوسط ${row.average.toFixed(1)}`}
          ></div>
        </div>
        <div className="flex items-center justify-between text-[length:var(--fs-xs)] text-[var(--t3)] font-bold mt-2">
          <span>أدنى {lo}</span>
          <span className="text-[var(--t1)]">متوسط {row.average.toFixed(1)}</span>
          <span>أعلى {hi}</span>
        </div>
      </div>
    </div>
  );
}

/** عنصر مقارنة مصغّر لمادة بها تحليلان فأكثر — آخر نقطتين فقط + نص الفرق
 *  (comparisonDelta، نفس منطق ComparisonChart.tsx). لا يُعرض لو أقل من نقطتين. */
function ResultComparisonMini({ subject, series }: { subject: string; series: ComparisonPoint[] }) {
  const delta = comparisonDelta(series);
  if (!delta) return null;

  const last2 = series.slice(-2);
  const values = last2.map(p => p.average);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const norm = (v: number) => (hi === lo ? 0.5 : (v - lo) / (hi - lo));
  const w = 60, h = 24, pad = 4;
  const y1 = pad + (1 - norm(values[0])) * (h - pad * 2);
  const y2 = pad + (1 - norm(values[1])) * (h - pad * 2);

  return (
    <div className={`${PANEL} flex items-center justify-between gap-4 flex-wrap`}>
      <div className="flex items-center gap-2 min-w-0">
        <i className="ti ti-chart-line text-[16px] text-[var(--t3)] shrink-0"></i>
        <span className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)] truncate">مقارنة — {subject}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0" dir="ltr">
        <svg width={w} height={h}>
          <line x1={pad} y1={y1} x2={w - pad} y2={y2} stroke="var(--t2)" strokeWidth={2} strokeLinecap="round" />
          <circle cx={pad} cy={y1} r={2.5} fill="var(--t2)" />
          <circle cx={w - pad} cy={y2} r={2.5} fill="var(--t1)" />
        </svg>
        <span className={`text-[length:var(--fs-xs)] font-bold whitespace-nowrap ${delta.improved ? 'text-[var(--accent)]' : 'text-[var(--warn)]'}`}>
          {delta.improved ? 'تحسّن' : 'تراجع'} {delta.improved ? '+' : ''}{delta.diff}
        </span>
      </div>
    </div>
  );
}

/** «تحليل نتائج المتعلمين» — التحليلات المبسَّطة ثم المقارنات ثم شواهد البند.
 *  rows مرتّبة سلفاً (الأحدث أولاً) في Public.tsx. */
export function AnalysisContent({ rows, comparisons, groups, onPreview, eager }: {
  rows: PublicResultsAnalysisRow[] | null | undefined;
  comparisons: { subject: string; series: ComparisonPoint[] }[];
  groups: EvidenceGroup[];
  onPreview: (e: ViewerItem) => void;
  eager?: boolean;
}) {
  return (
    <div className="mt-2">
      {rows && (rows.length === 0 ? (
        <EmptyNote icon="ti-ghost" text="لا توجد تحليلات نتائج موثّقة بعد لهذا البند" />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(row => <ResultRangeRow key={row.id} row={row} />)}
          {comparisons.map(c => <ResultComparisonMini key={c.subject} subject={c.subject} series={c.series} />)}
        </div>
      ))}
      {groups.length > 0 && (
        <div className={rows ? 'mt-3' : ''}>
          <IndicatorGroups groups={groups} onPreview={onPreview} eager={eager} />
        </div>
      )}
    </div>
  );
}

/** «تحسين نتائج المتعلمين» — شواهد البند مجمّعة حسب المؤشر، قراءة فقط */
export function ImprovementContent({ groups, onPreview, eager }: { groups: EvidenceGroup[]; onPreview: (e: ViewerItem) => void; eager?: boolean }) {
  if (groups.length === 0) return <EmptyNote icon="ti-ghost" text="لا توجد شواهد موثّقة بعد لهذا البند" />;
  return (
    <div className="mt-2">
      <IndicatorGroups groups={groups} onPreview={onPreview} eager={eager} />
    </div>
  );
}
