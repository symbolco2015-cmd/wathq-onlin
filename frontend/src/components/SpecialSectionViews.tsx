import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import { SectionHeader, EvRow, nEv } from './SectionView';

// شاشات الأقسام الخاصة «مراعاة الفروق الفردية» و«التنويع في استراتيجيات
// التدريس» و«تحليل نتائج المتعلمين» و«تحسين نتائج المتعلمين» — بتصميم شاشة القسم العادي (SectionView)،
// بلا مستوى ولا شريط مؤشرات ولا «تعديل». الحسابات كلها في Dashboard، وهنا العرض فقط.

const newestFirst = (evs: SupabaseEvidence[]) =>
  [...evs].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

/** قائمة ⋯ مفتوحة لشاهد واحد على الأكثر، وEscape يغلقها — كما في SectionView */
function useEvMenu() {
  const [menuEvId, setMenuEvId] = useState<string | null>(null);
  useEffect(() => {
    if (!menuEvId) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuEvId(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuEvId]);
  return [menuEvId, setMenuEvId] as const;
}

/** بطاقة المؤشر في SectionView: الدائرة (اختيارية) والاسم والعدد وزر «+» ثم الشواهد */
function ItemCard({ name, evidence, circle, addLabel, onAdd, onDeleteEv, menuEvId, setMenuEvId }: {
  name: string;
  evidence: SupabaseEvidence[];
  /** حالة الدائرة؛ undefined = بلا دائرة */
  circle?: 'x' | 'g' | '';
  addLabel: string;
  onAdd: () => void;
  onDeleteEv: (evidenceId: string) => void;
  menuEvId: string | null;
  setMenuEvId: Dispatch<SetStateAction<string | null>>;
}) {
  const evs = newestFirst(evidence);
  const count = evs.length;
  let circleEl: ReactNode = null;
  if (circle !== undefined) {
    circleEl = (
      <span
        className={`w-[26px] h-[26px] rounded-[var(--r-full)] shrink-0 flex items-center justify-center text-[14px] border-[1.5px] ${
          circle === 'x' ? 'border-[var(--st-gold)] bg-[var(--st-gold)] text-[var(--bg)]'
          : circle === 'g' ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]'
          : 'border-[var(--idle)] text-[var(--t3)]'
        }`}
      >
        {count > 0 && <i className="ti ti-check" />}
      </span>
    );
  }

  return (
    <div className="rounded-[var(--r-md)] bg-[var(--s1)] border border-[var(--bd)]">
      <div className="relative flex items-center gap-2.5 py-3 px-3.5">
        {circleEl}
        <span className="min-w-0 flex-1">
          <b className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)] leading-normal">{name}</b>
          <small className="text-[length:var(--fs-xs)] text-[var(--t3)]">{nEv(count)}</small>
        </span>
        <button
          type="button"
          aria-label={addLabel}
          onClick={onAdd}
          className="w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] flex items-center justify-center text-[20px] text-[var(--accent)] shrink-0 cursor-pointer"
        >
          <i className="ti ti-plus" />
        </button>
      </div>

      {count > 0 && (
        <div className="border-t border-[var(--bd)] divide-y divide-[var(--bd)]">
          {evs.map(ev => (
            <EvRow
              key={ev.id}
              ev={ev}
              canEdit={false}
              menuOpen={menuEvId === ev.id}
              onToggleMenu={() => setMenuEvId(prev => (prev === ev.id ? null : ev.id))}
              onCloseMenu={() => setMenuEvId(null)}
              onDelete={() => onDeleteEv(ev.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** شاشة «مراعاة الفروق الفردية» — مؤشر واحد في قسم الاستراتيجيات */
export function IndivDiffView({ title, evidence, onBack, onAdd, onDeleteEv }: {
  title: string;
  evidence: SupabaseEvidence[];
  onBack: () => void;
  onAdd: () => void;
  onDeleteEv: (evidenceId: string) => void;
}) {
  const [menuEvId, setMenuEvId] = useEvMenu();
  const n = evidence.length;
  return (
    <div className="flex flex-col gap-3 max-w-3xl pb-24 lg:pb-0">
      <SectionHeader onBack={onBack} icon="ti-users" title={title} evCount={n} />
      <ItemCard
        name={title}
        evidence={evidence}
        circle={n >= 2 ? 'x' : n === 1 ? 'g' : ''}
        addLabel="إضافة شاهد لهذا المؤشر"
        onAdd={onAdd}
        onDeleteEv={onDeleteEv}
        menuEvId={menuEvId}
        setMenuEvId={setMenuEvId}
      />
    </div>
  );
}

export interface StrategyGroup {
  id: string;
  name: string;
  evidence: SupabaseEvidence[];
}

/** شاشة «التنويع في استراتيجيات التدريس» — بطاقة لكل استراتيجية لها شاهد */
export function StrategiesView({ icon, title, evCount, yearEvCount, monthName, usedThisMonth, groups, onBack, onAddForGroup, onAddStrategy, onDeleteEv }: {
  icon: string;
  title: string;
  /** كل شواهد الاستراتيجيات — شارة الرأس، تطابق القائمة أدناه */
  evCount: number;
  /** شواهد السنة الدراسية الحالية — نفس رقم بطاقة الرئيسية */
  yearEvCount: number;
  /** اسم الشهر الحالي — بدونه لا يُعرض سطر العدّادين */
  monthName?: string;
  usedThisMonth: number;
  groups: StrategyGroup[];
  onBack: () => void;
  onAddForGroup: (group: StrategyGroup) => void;
  onAddStrategy: () => void;
  onDeleteEv: (evidenceId: string) => void;
}) {
  const [menuEvId, setMenuEvId] = useEvMenu();
  return (
    <div className="flex flex-col gap-3 max-w-3xl pb-24 lg:pb-0">
      <SectionHeader onBack={onBack} icon={icon} title={title} evCount={evCount} />

      {monthName && (
        <p className="px-1 text-[length:var(--fs-xs)] text-[var(--t3)]">
          استراتيجيات {monthName}: {usedThisMonth} · شواهد هذا العام: {yearEvCount}
        </p>
      )}

      {groups.length > 0 ? groups.map(group => (
        <ItemCard
          key={group.id}
          name={group.name}
          evidence={group.evidence}
          addLabel="إرفاق دليل آخر"
          onAdd={() => onAddForGroup(group)}
          onDeleteEv={onDeleteEv}
          menuEvId={menuEvId}
          setMenuEvId={setMenuEvId}
        />
      )) : (
        <p className="px-1 text-[length:var(--fs-sm)] text-[var(--t3)]">لا توجد استراتيجيات موثّقة بدليل بعد.</p>
      )}

      <button
        type="button"
        onClick={onAddStrategy}
        className="w-full h-11 rounded-[var(--r-md)] border-[1.5px] border-dashed border-[var(--bd2)] text-[length:var(--fs-sm)] font-bold text-[var(--t2)] flex items-center justify-center gap-2 cursor-pointer"
      >
        <i className="ti ti-plus text-[16px]" />إضافة استراتيجية جديدة
      </button>
    </div>
  );
}

/** شاشة «تحليل نتائج المتعلمين» — الرأس وسطر الحالة، والأداة (AnalysisSectionBody)
 *  تصل من Dashboard كـ children ولا تُركَّب إلا بعد انتهاء التحميل */
export function AnalysisView({ icon, title, analysisCount, loading, onBack, children }: {
  icon: string;
  title: string;
  analysisCount: number;
  loading: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 max-w-3xl pb-24 lg:pb-0">
      <SectionHeader onBack={onBack} icon={icon} title={title} />

      <p className="px-1 text-[length:var(--fs-xs)] text-[var(--t3)]">
        {loading ? 'جارٍ التحميل…' : analysisCount > 0 ? `تحليلات محفوظة: ${analysisCount}` : 'لا تحليلات بعد'}
      </p>

      {!loading && (
        <div className="bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
          {children}
        </div>
      )}
    </div>
  );
}

/** شاشة «تحسين نتائج المتعلمين» — الرأس وسطر الحالة، والتنبيهات
 *  (ImprovementActionsBody) تصل من Dashboard كـ children، كل تنبيه بطاقة مستقلة */
export function ImprovementView({ icon, title, actionCount, loading, onBack, children }: {
  icon: string;
  title: string;
  actionCount: number;
  loading: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 max-w-3xl pb-24 lg:pb-0">
      <SectionHeader onBack={onBack} icon={icon} title={title} />

      <p className="px-1 text-[length:var(--fs-xs)] text-[var(--t3)]">
        {loading ? 'جارٍ التحميل…' : actionCount > 0 ? `إجراءات تحتاج متابعة: ${actionCount}` : 'لا إجراءات حالياً'}
      </p>

      {!loading && children}
    </div>
  );
}
