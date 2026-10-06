import type { SectionData } from '../types';
import { BTN_GH_SM, DOT_COLOR, type Level } from './SectionView';

/** صف قائمة في المنتقيات (البند، المؤشر) */
const PICK_ROW = 'w-full h-11 px-3 flex items-center gap-3 rounded-[var(--r-sm)] text-right text-[length:var(--fs-sm)] text-[var(--t1)] hover:bg-[var(--s2)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-wait';
/** نفس الصف بسطر فرعي — ارتفاع أدنى بدل الثابت */
const PICK_ROW_2L = PICK_ROW.replace('h-11', 'min-h-11 py-2');

/** الخطوة الأولى: قائمة الأقسام — عرض فقط، الحالة عند المستهلك.
 *  levelById اختياري: إن مُرّر تظهر نقطة مستوى القسم */
export function SectionPickList({ sections, levelById, onPick }: {
  sections: SectionData[];
  levelById?: Map<number, Level>;
  onPick: (sec: SectionData) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {sections.map(sec => (
        <button key={sec.id} type="button" onClick={() => onPick(sec)} className={PICK_ROW}>
          <i className={`ti ${sec.icon} text-[20px] text-[var(--t2)] shrink-0`} />
          <span className="flex-1 min-w-0 truncate">{sec.ttl}</span>
          {levelById && (
            <span className="w-2 h-2 rounded-[var(--r-full)] shrink-0" style={{ backgroundColor: DOT_COLOR[levelById.get(sec.id) ?? 'n'] }} />
          )}
        </button>
      ))}
    </div>
  );
}

export interface IndicatorPickItem {
  id: string;
  name_ar: string;
  isCustom?: boolean;
  /** سطر فرعي اختياري تحت الاسم */
  sub?: string;
}

/** الخطوة الثانية: مؤشرات القسم المختار مع زر الرجوع — عرض فقط */
export function IndicatorPickStep<T extends IndicatorPickItem>({ sectionTitle, backLabel, onBack, loading, disabled, busy, items, onPick }: {
  sectionTitle: string;
  backLabel: string;
  onBack: () => void;
  loading?: boolean;
  /** يعطّل الرجوع والصفوف (أثناء الحفظ مثلاً) */
  disabled?: boolean;
  /** مؤشر تحميل بجانب كل صف أثناء الحفظ */
  busy?: boolean;
  items: T[];
  onPick: (item: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onBack}
        disabled={disabled}
        className={`${BTN_GH_SM} self-start disabled:cursor-wait`}
      >
        <i className="ti ti-arrow-right text-[16px]" /> {backLabel}
      </button>
      <div className="px-3 pt-1 text-[length:var(--fs-xs)] text-[var(--t3)]">{sectionTitle}</div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <i className="ti ti-loader animate-spin text-[24px] text-[var(--t2)]" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-[length:var(--fs-sm)] text-[var(--t3)] text-center py-6">لا توجد مؤشرات متاحة لهذا البند حالياً</p>
      ) : (
        items.map(ind => (
          <button
            key={ind.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(ind)}
            className={ind.sub !== undefined ? PICK_ROW_2L : PICK_ROW}
          >
            <i className="ti ti-list-check text-[20px] text-[var(--t2)] shrink-0" />
            {ind.sub !== undefined ? (
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="truncate">
                  {ind.name_ar}
                  {ind.isCustom && <small className="text-[length:var(--fs-xs)] text-[var(--t3)]"> · مخصص</small>}
                </span>
                <small className="text-[length:var(--fs-xs)] text-[var(--t3)]">{ind.sub}</small>
              </span>
            ) : (
              <span className="flex-1 min-w-0 truncate">
                {ind.name_ar}
                {ind.isCustom && <small className="text-[length:var(--fs-xs)] text-[var(--t3)]"> · مخصص</small>}
              </span>
            )}
            {busy && <i className="ti ti-loader animate-spin text-[16px] text-[var(--t2)]" />}
          </button>
        ))
      )}
    </div>
  );
}
