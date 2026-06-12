import React from 'react';
import type { AppState } from '../types';
import { calculateEvaluation, getCompletionColor } from '../utils';

interface SidebarProps {
  state: AppState;
  sections: any[];
}

export default function Sidebar({ state, sections }: SidebarProps) {
  const stats = calculateEvaluation(state, sections);
  const filledCount = stats.filledSecs;
  const pct = Math.round((filledCount / sections.length) * 100);

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
          <span className="text-[28px] font-black text-white font-[var(--font)]">{pct}%</span>
        </div>
        <div className="relative z-10 text-[12px] text-white/50 mb-2.5">المكتمل: {filledCount} من {sections.length}</div>
        <div className="relative z-10 h-[5px] bg-white/15 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[var(--em8)] to-white/90 rounded-full transition-all duration-[1400ms] ease-out relative" style={{ width: `${pct}%` }}>
             <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent)] bg-[length:200%_auto] z-10" style={{ animation: 'goldShimmer 2s linear infinite' }}></div>
          </div>
        </div>
      </div>

      <div className="text-[10px] font-extrabold text-[var(--text4)] tracking-[1.2px] uppercase px-2.5 pb-2">الأقسام</div>
      
      {sections.map(s => {
        const subs = [...s.subs, ...(state.csubs[s.id] || [])];
        const count = subs.reduce((acc, sub) => acc + (state.ev[`${s.id}|${sub}`] || []).length, 0);
        const subTotal = subs.length;
        const filledSubs = subs.filter(sub => (state.ev[`${s.id}|${sub}`] || []).length > 0).length;
        const subPct = subTotal > 0 ? Math.round((filledSubs / subTotal) * 100) : 0;
        const color = getCompletionColor(subPct);

        return (
          <div
            key={s.id}
            onClick={() => scrollToSection(s.id)}
            className="group py-2 px-2.5 rounded-xl cursor-pointer mb-px transition-all duration-[220ms] relative hover:bg-[var(--glass2)]"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-[26px] h-[26px] rounded-lg shrink-0 bg-[var(--glass)] text-[var(--text4)] flex items-center justify-center text-[13px] border border-[var(--line)] transition-all duration-[220ms] group-hover:bg-gradient-to-br group-hover:from-[var(--em4)] group-hover:to-[var(--em6)] group-hover:text-white group-hover:border-transparent">
                <i className={`ti ${s.icon}`}></i>
              </div>
              <span className="flex-1 text-[12px] text-[var(--text2)] group-hover:text-white transition-colors leading-tight">{s.ttl}</span>
              <span className="text-[10px] font-extrabold shrink-0" style={{ color }}>{subPct}%</span>
            </div>
            <div className="h-[3px] bg-white/8 rounded-full overflow-hidden mr-[34px]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${subPct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </aside>
  );
}
