import type { AppState } from '../types';
import { getCompletionColor } from '../utils';

function getBorderColor(pct: number): string {
  if (pct > 70) return '#22c55e';
  if (pct >= 35) return '#f59e0b';
  return '#ef4444';
}

interface StatusBadge {
  label: string;
  bg: string;
  text: string;
}

function getStatusBadge(pct: number): StatusBadge {
  if (pct === 0) return { label: 'لم يبدأ', bg: 'rgba(255,255,255,.06)', text: '#6b7280' };
  if (pct <= 34) return { label: 'يحتاج اهتماماً', bg: 'rgba(216,90,48,.15)', text: '#f87171' };
  if (pct <= 70) return { label: 'قيد التقدم', bg: 'rgba(186,117,23,.15)', text: '#fbbf24' };
  if (pct <= 99) return { label: 'شبه مكتمل', bg: 'rgba(29,158,117,.15)', text: '#6ee7b7' };
  return { label: '✓ مكتمل', bg: 'rgba(29,158,117,.22)', text: '#34d399' };
}

interface SidebarProps {
  state: AppState;
  sections: any[];
  filledCount: number;
  overallPct: number;
  monthlyProgress?: { getSectionMonthCount: (sectionId: number) => number };
}

export default function Sidebar({ state, sections, filledCount, overallPct, monthlyProgress }: SidebarProps) {
  const scrollToSection = (id: number) => {
    document.getElementById(`sc-${id}`)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <aside className="w-[268px] shrink-0 bg-[#08120c]/90 border-l border-[var(--line)] py-6 px-3.5 sticky top-[72px] max-h-[calc(100vh-72px)] overflow-y-auto hidden lg:block hide-scrollbar" style={{ animation: 'slideL .6s var(--sp) both .1s' }}>
      <div className="flex items-center gap-3 py-4 px-3.5 mb-5.5 bg-gradient-to-br from-[var(--surf3)] to-[var(--surf2)] rounded-2xl border border-[var(--line)] relative overflow-hidden">
        <div className="absolute top-0 right-0 left-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--em7)]/30 to-transparent"></div>
        <div className="w-[46px] h-[46px] rounded-full shrink-0 bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white flex items-center justify-center text-[16px] font-black shadow-[0_0_0_2px_rgba(82,196,120,.25),0_4px_14px_rgba(42,122,68,.4)] bg-cover bg-center overflow-hidden"
          style={state.profile.avatar ? { backgroundImage: `url(${state.profile.avatar})` } : {}}>
          {!state.profile.avatar && state.profile.name.substring(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-extrabold text-[var(--text)] truncate">{state.profile.name}</div>
          <div className="text-[11px] text-[var(--text4)] mt-0.5 truncate">{state.profile.role}</div>
        </div>
      </div>

      <div className="p-4 mb-5.5 bg-gradient-to-br from-[var(--em2)] to-[var(--em4)] rounded-2xl border border-[var(--em7)]/20 relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-10" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='20' cy='20' r='1' fill='white'/%3E%3C/svg%3E\")" }}></div>
        <div className="relative z-10 flex justify-between items-baseline mb-2">
          <span className="text-[11.5px] text-white/70 tracking-wide uppercase">التقدم العام</span>
          <span className="text-[28px] font-black text-white font-[var(--font)]">{overallPct}%</span>
        </div>
        <div className="relative z-10 text-[12px] text-white/50 mb-2.5">المكتمل: {filledCount} من {sections.length}</div>
        <div className="relative z-10 h-[5px] bg-white/15 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[var(--em8)] to-white/90 rounded-full transition-all duration-[1400ms] ease-out relative" style={{ width: `${overallPct}%` }}>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent)] bg-[length:200%_auto] z-10" style={{ animation: 'goldShimmer 2s linear infinite' }}></div>
          </div>
        </div>
      </div>

      <div className="text-[10px] font-extrabold text-[var(--text4)] tracking-[1.2px] uppercase px-2.5 pb-2">الأقسام</div>

      {[...sections]
        .sort((a, b) => {
          const pctA = Math.min(100, Math.round(((monthlyProgress?.getSectionMonthCount(a.id) ?? 0) / 3) * 100));
          const pctB = Math.min(100, Math.round(((monthlyProgress?.getSectionMonthCount(b.id) ?? 0) / 3) * 100));
          return pctA - pctB;
        })
        .map(s => {
          const subPct = Math.min(100, Math.round(((monthlyProgress?.getSectionMonthCount(s.id) ?? 0) / 3) * 100));
          const color = getCompletionColor(subPct);
          const badge = getStatusBadge(subPct);

          return (
            <div
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              className="group py-2 px-2.5 rounded-xl cursor-pointer mb-px transition-all duration-[220ms] relative hover:bg-[var(--glass2)]"
              style={{ borderRight: `4px solid ${getBorderColor(subPct)}`, borderRadius: '12px 4px 4px 12px' }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-[26px] h-[26px] rounded-lg shrink-0 bg-[var(--glass)] text-[var(--text4)] flex items-center justify-center text-[13px] border border-[var(--line)] transition-all duration-[220ms] group-hover:bg-gradient-to-br group-hover:from-[var(--em4)] group-hover:to-[var(--em6)] group-hover:text-white group-hover:border-transparent">
                  <i className={`ti ${s.icon}`}></i>
                </div>
                <span className="flex-1 text-[12px] text-[var(--text2)] group-hover:text-white transition-colors leading-tight">{s.ttl}</span>
                <span className="text-[10px] font-extrabold shrink-0" style={{ color }}>{subPct}%</span>
              </div>
              <div className="flex items-center justify-between mr-[34px]">
                <div className="flex-1 h-[3px] bg-white/8 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${subPct}%`, backgroundColor: color }}
                  />
                </div>
                <span
                  className="mr-2 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                  style={{ background: badge.bg, color: badge.text }}
                >
                  {badge.label}
                </span>
              </div>
            </div>
          );
        })}
    </aside>
  );
}