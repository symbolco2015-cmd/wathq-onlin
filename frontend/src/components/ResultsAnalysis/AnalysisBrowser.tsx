import { useState, type ReactNode } from 'react';
import { TestCard } from './PublicResultsSection';
import { fmtPct, formatClass, nearSuccessTotal, type FilterOption, type PublicTestGroup, type SectionTimeline } from './logic';
import type { GradeBand, ResultsAnalysisRow } from './types';
import { AR_STUDENT, AR_TEST, countAr } from '../../utils';

// ---------------------------------------------------------------------------
// حالة التنقل المحفوظة
// ---------------------------------------------------------------------------

export type BrowseView = 'tests' | 'sections';
/** 'all' أو مفتاح من subjectFilterOptions/gradeFilterOptions */
export interface NavPrefs {
  subject: string | null;
  grade: string;
  view: BrowseView;
}

export const ALL = 'all';
const NAV_KEY = 'wathq:results-nav';

/** آخر اختيار في هذا المتصفح، أو null. التخزين قد يكون مغلقاً (تصفح خاص). */
export function loadNavPrefs(): NavPrefs | null {
  try {
    const raw = window.localStorage.getItem(NAV_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<NavPrefs>;
    return {
      subject: typeof v.subject === 'string' ? v.subject : null,
      grade: typeof v.grade === 'string' ? v.grade : ALL,
      view: v.view === 'sections' ? 'sections' : 'tests',
    };
  } catch {
    return null;
  }
}

export function saveNavPrefs(p: NavPrefs) {
  try {
    window.localStorage.setItem(NAV_KEY, JSON.stringify(p));
  } catch {
    // التفضيل للراحة فقط
  }
}

// ---------------------------------------------------------------------------
// شريط التصفية
// ---------------------------------------------------------------------------

const CHIP = 'shrink-0 h-9 px-3 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border text-[length:var(--fs-sm)] font-bold whitespace-nowrap cursor-pointer';
const chipCls = (on: boolean) => `${CHIP} ${on ? 'bg-[var(--s2)] border-[var(--bd2)] text-[var(--t1)]' : 'border-[var(--bd)] text-[var(--t2)]'}`;

function ChipRow({ label, options, value, onChange, withAll }: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (key: string) => void;
  withAll: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
      {options.map(o => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} className={chipCls(value === o.key)}>
          {o.label}
        </button>
      ))}
      {withAll && (
        <button type="button" aria-pressed={value === ALL} onClick={() => onChange(ALL)} className={chipCls(value === ALL)}>
          الكل
        </button>
      )}
    </div>
  );
}

export function FilterBar({ subjects, subject, onSubject, grades, grade, onGrade, view, onView }: {
  subjects: FilterOption[];
  subject: string;
  onSubject: (key: string) => void;
  grades: FilterOption[];
  grade: string;
  onGrade: (key: string) => void;
  view: BrowseView;
  onView: (v: BrowseView) => void;
}) {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <ChipRow label="المادة" options={subjects} value={subject} onChange={onSubject} withAll={subjects.length > 1} />
      {grades.length > 1 && (
        <ChipRow label="المرحلة والصف" options={grades} value={grade} onChange={onGrade} withAll />
      )}
      <div role="group" aria-label="طريقة العرض" className="flex items-center gap-2">
        <button type="button" aria-pressed={view === 'tests'} onClick={() => onView('tests')} className={chipCls(view === 'tests')}>
          <i className="ti ti-list-details text-[16px]" /> حسب الاختبار
        </button>
        <button type="button" aria-pressed={view === 'sections'} onClick={() => onView('sections')} className={chipCls(view === 'sections')}>
          <i className="ti ti-chart-line text-[16px]" /> حسب الشعبة
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// قائمة ⋯
// ---------------------------------------------------------------------------

export const MENU_ITEM = 'w-full h-9 px-3 flex items-center gap-2 text-right text-[length:var(--fs-sm)] font-bold whitespace-nowrap cursor-pointer';

export interface MenuEntry {
  key: string;
  icon: string;
  label: string;
  danger?: boolean;
  onSelect: () => void;
}

/** نمط قائمة الشاهد في SectionView: 36px بصرياً، ومساحة الضغط 44px */
export function OptionsMenu({ label, items }: { label: string; items: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0 print:hidden">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] flex items-center justify-center text-[16px] text-[var(--t2)] shrink-0 cursor-pointer before:absolute before:-inset-1 before:content-['']"
      >
        <i className="ti ti-dots" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 top-full mt-1 z-30 min-w-[140px] py-1 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)]">
            {items.map(it => (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); it.onSelect(); }}
                className={`${MENU_ITEM} ${it.danger ? 'text-[var(--danger)]' : 'text-[var(--t1)]'}`}
              >
                <i className={`ti ${it.icon} text-[16px]`} /> {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** عنصرا الإخفاء والإظهار لمجموعة تحليلات (تحليل واحد أو اختبار كامل) */
export function visibilityItems(
  rows: ResultsAnalysisRow[],
  scope: 'analysis' | 'test',
  onSet: (ids: string[], hidden: boolean) => void,
): MenuEntry[] {
  const ids = rows.map(r => r.id);
  const hiddenCount = rows.filter(r => r.hidden_public === true).length;
  const noun = scope === 'test' ? 'الاختبار ' : '';
  const out: MenuEntry[] = [];
  if (hiddenCount < rows.length) {
    out.push({ key: 'hide', icon: 'ti-eye-off', label: `إخفاء ${noun}من الصفحة العامة`, onSelect: () => onSet(ids, true) });
  }
  if (hiddenCount > 0) {
    out.push({ key: 'show', icon: 'ti-eye', label: `إظهار ${noun}في الصفحة العامة`, onSelect: () => onSet(ids, false) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// العرضان
// ---------------------------------------------------------------------------

/** «حسب الاختبار»: بطاقة الصفحة العامة نفسها (TestCard)، وفوقها للمعلم وحده:
 *  ضغط سطر الشعبة، وعلامة الإخفاء، وقائمة الإخفاء، وسطر القريبين من النجاح. */
export function TestsList({ tests, byId, bands, onOpen, onSetHidden }: {
  tests: PublicTestGroup[];
  byId: Map<string, ResultsAnalysisRow>;
  bands: GradeBand[];
  onOpen: (id: string) => void;
  onSetHidden?: (ids: string[], hidden: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {tests.map(g => {
        const rows = g.sections.map(s => byId.get(s.row.id)).filter((r): r is ResultsAnalysisRow => !!r);
        const hiddenIds = new Set(rows.filter(r => r.hidden_public === true).map(r => r.id));
        const near = g.comparison ? nearSuccessTotal(rows, bands) : 0;
        let footer: ReactNode = null;
        if (near > 0) {
          footer = (
            <p className="mt-3 text-[length:var(--fs-xs)] text-[var(--t2)]">
              قريبون من النجاح في كل الشعب:{' '}<span className="font-bold text-[var(--warn)]">{countAr(near, AR_STUDENT)}</span>
            </p>
          );
        }
        return (
          <TestCard
            key={g.key}
            g={g}
            owner={{
              onOpen,
              hiddenIds,
              footer,
              menu: onSetHidden ? <OptionsMenu label="خيارات الاختبار" items={visibilityItems(rows, 'test', onSetHidden)} /> : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/** «حسب الشعبة»: سطر لكل شعبة، والضغط يفتح المقارنة عبر الزمن */
export function SectionsList({ timelines, showSubject, onOpen }: {
  timelines: SectionTimeline[];
  showSubject: boolean;
  onOpen: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {timelines.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onOpen(t.key)}
          className="w-full min-h-11 p-3 flex items-center gap-3 text-right rounded-[var(--r-md)] border border-[var(--bd)] bg-[var(--s2)] cursor-pointer"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)] break-words">
              {showSubject ? t.title : formatClass(t.stage, t.grade, t.section)}
            </span>
            <span className="block mt-0.5 text-[length:var(--fs-xs)] text-[var(--t3)]">
              {countAr(t.points.length, AR_TEST)} · آخر متوسط {fmtPct(t.latestAveragePct)}
            </span>
          </span>
          <i className="ti ti-chevron-left text-[16px] text-[var(--t3)] shrink-0" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
