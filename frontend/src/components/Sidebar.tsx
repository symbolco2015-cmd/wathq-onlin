import type { ReactNode } from 'react';
import { BTN_PRI, LEVEL_COLOR, type Level } from './SectionView';

// عمود الملخص على سطح المكتب — aside() في docs/design/wathq-prototype.html:
// بطاقة الشهر، ثم «أضف شاهداً»، ثم البطاقة التراكمية، ثم التنقل بين الأقسام.
// كل البيانات تُحسب في Dashboard، وهنا العرض فقط.

export interface SidebarCoreItem {
  id: number;
  ttl: string;
  icon: string;
  /** المستوى التراكمي للقسم — نفس sectionLevel في رأس SectionView */
  level: Level;
}

export interface SidebarSpecialItem {
  /** يطابق activeKey حين تكون شاشته مفتوحة */
  key: string;
  title: string;
  icon: string;
  onOpen: () => void;
}

interface SidebarProps {
  monthCard: ReactNode;
  cumulativeCard: ReactNode;
  onAddEvidence: () => void;
  /** الأقسام الثمانية بترتيبها الثابت */
  coreItems: SidebarCoreItem[];
  onOpenCore: (id: number) => void;
  /** الأقسام الخاصة بترتيب شبكة .spec */
  specialItems: SidebarSpecialItem[];
  /** الشاشة المفتوحة: `core-{id}` أو نوع القسم الخاص؛ null = الرئيسية أو الأرشيف */
  activeKey: string | null;
}

const NAV_BTN = 'w-full h-9 px-2 flex items-center gap-2 rounded-[var(--r-sm)] text-right text-[length:var(--fs-sm)] transition-colors duration-150 cursor-pointer';

function navClass(active: boolean) {
  return `${NAV_BTN} ${active ? 'bg-[var(--s2)] text-[var(--t1)]' : 'text-[var(--t2)] hover:bg-[var(--s2)]'}`;
}

export default function Sidebar({ monthCard, cumulativeCard, onAddEvidence, coreItems, onOpenCore, specialItems, activeKey }: SidebarProps) {
  return (
    <aside className="hidden lg:flex flex-col gap-3 w-[332px] shrink-0 self-start sticky top-[72px] max-h-[calc(100vh-72px)] overflow-y-auto hide-scrollbar py-9 pl-8">
      {monthCard}
      <button type="button" onClick={onAddEvidence} className={`${BTN_PRI} flex-none w-full`}>
        <i className="ti ti-plus text-[20px]" /> أضف شاهداً
      </button>
      {cumulativeCard}

      <nav aria-label="الأقسام" className="p-3 rounded-[var(--r-md)] border border-[var(--bd)] bg-[var(--s1)]">
        <p className="px-2 pb-1 text-[length:var(--fs-xs)] text-[var(--t3)]">الأقسام</p>
        <div className="flex flex-col gap-0.5">
          {coreItems.map(s => {
            const active = activeKey === `core-${s.id}`;
            return (
              <button key={s.id} type="button" onClick={() => onOpenCore(s.id)} aria-current={active ? 'page' : undefined} className={navClass(active)}>
                <i className={`ti ${s.icon} text-[16px] text-[var(--t2)] shrink-0`} />
                <span className="flex-1 min-w-0 truncate">{s.ttl}</span>
                <span className="w-2 h-2 rounded-[var(--r-full)] shrink-0" style={{ backgroundColor: LEVEL_COLOR[s.level] }} />
              </button>
            );
          })}
        </div>

        {specialItems.length > 0 && (
          <>
            <p className="px-2 pt-3 pb-1 text-[length:var(--fs-xs)] text-[var(--t3)]">أقسام خاصة</p>
            <div className="flex flex-col gap-0.5">
              {specialItems.map(s => {
                const active = activeKey === s.key;
                return (
                  <button key={s.key} type="button" onClick={s.onOpen} aria-current={active ? 'page' : undefined} className={navClass(active)}>
                    <i className={`ti ${s.icon} text-[16px] text-[var(--t2)] shrink-0`} />
                    <span className="flex-1 min-w-0 truncate">{s.title}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </nav>
    </aside>
  );
}
