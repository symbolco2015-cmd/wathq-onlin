import React, { useState } from 'react';
import type { AppState, SectionData } from '../types';
import Sidebar from './Sidebar';
import { calculateEvaluation } from '../utils';

interface DashboardProps {
  state: AppState;
  sections: SectionData[];
  onAddEvClick: (sid: number, sub: string) => void;
  onAddSubClick: (sid: number) => void;
  onToggleStrat: (s: string) => void;
  onUpdateNote: (k: string, v: string) => void;
  onDeleteEv: (sid: number, sub: string, idx: number) => void;
  onAddStratClick: () => void;
  onOpenEvalClick: () => void;
  onDelSub: (sid: number, subName: string) => void;
}

const EVT_CONFIG: Record<string, {icon: string, cls: string, label: string}> = {
  pdf: {icon: 'ti-file-type-pdf', cls: 'bg-[linear-gradient(135deg,rgba(185,28,28,.2),rgba(185,28,28,.1))] text-[#f87171] border border-[#b91c1c]/20', label: 'PDF'},
  img: {icon: 'ti-photo', cls: 'bg-[linear-gradient(135deg,rgba(29,78,216,.2),rgba(29,78,216,.1))] text-[#93c5fd] border border-[#1d4ed8]/20', label: 'صورة'},
  doc: {icon: 'ti-file-text', cls: 'bg-[linear-gradient(135deg,rgba(109,40,217,.2),rgba(109,40,217,.1))] text-[#c4b5fd] border border-[#6d28d9]/20', label: 'مستند'},
  vid: {icon: 'ti-video', cls: 'bg-[linear-gradient(135deg,rgba(180,83,9,.2),rgba(180,83,9,.1))] text-[#fcd34d] border border-[#b45309]/20', label: 'فيديو'}
};

export default function Dashboard({ state, sections, onAddEvClick, onAddSubClick, onToggleStrat, onUpdateNote, onDeleteEv, onAddStratClick, onOpenEvalClick, onDelSub }: DashboardProps) {
  const [openSecs, setOpenSecs] = useState<Record<number, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSec = (id: number) => {
    setOpenSecs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter sections by search query
  const filteredSections = searchQuery.trim()
    ? sections.filter(sec => {
        const q = searchQuery.toLowerCase();
        if (sec.ttl.includes(q)) return true;
        const allSubs = [...sec.subs, ...(state.csubs[sec.id] || [])];
        return allSubs.some(s => s.includes(q));
      })
    : sections;

  const stats = calculateEvaluation(state, sections);
  const totalEvs = stats.totalEvs;
  const filledSecs = stats.filledSecs;

  return (
    <div className="flex min-h-[calc(100vh-72px)]">
      <Sidebar state={state} sections={sections} />
      <main className="flex-1 p-5 md:py-9 md:px-8 min-w-0 overflow-x-hidden">
        {/* HERO BANNER */}
        <div className="relative overflow-hidden rounded-[28px] py-10 px-6 sm:px-12 mb-8 bg-gradient-to-br from-[var(--em1)] via-[var(--em3)] to-[rgba(30,90,50,.8)] border border-[var(--em7)]/15 shadow-[inset_0_2px_0_rgba(82,196,120,.1),0_24px_64px_rgba(0,0,0,.5)]" style={{ animation: 'fadeUp .6s var(--sp) both' }}>
          <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_50%_80%_at_80%_50%,rgba(201,162,39,.08),transparent_60%)]"></div>
          <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--em7)] via-30% via-[var(--gold)] via-50% via-[var(--em7)] via-70% to-transparent opacity-70 z-0"></div>
          
          <div className="absolute border border-[var(--em7)]/5 rounded-full w-[500px] h-[500px] -top-[200px] -left-[150px] z-0 pointer-events-none"></div>
          <div className="absolute border border-[var(--em7)]/5 rounded-full w-[300px] h-[300px] -bottom-[150px] right-[10%] z-0 pointer-events-none"></div>

          <div className="relative z-10 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-2 text-[11.5px] font-bold text-[var(--em8)] tracking-wide uppercase bg-[var(--em7)]/10 border border-[var(--em7)]/20 py-1 px-3.5 rounded-full mb-3.5">
                <i className={`ti ${stats.levelIcon} text-[14px] ${stats.levelClass.includes('gold') ? 'text-[var(--gold)]' : 'text-[var(--em8)]'}`}></i> ملف إنجاز {stats.levelStr}
              </div>
              <div className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight mb-2">{state.profile.name}</div>
              <div className="text-[14.5px] text-[var(--text3)] mb-5.5 leading-relaxed">{state.profile.role} — {state.profile.school} · وزارة التعليم</div>
              <div className="flex gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1.5 py-1.5 px-4 rounded-full text-[12.5px] font-bold bg-white/5 border border-white/10 text-[var(--text2)] backdrop-blur-md cursor-default transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/30 hover:-translate-y-0.5">
                  <i className="ti ti-calendar text-[14px]"></i> السنة الدراسية 1446
                </div>
                <button className="inline-flex items-center gap-1.5 py-1.5 px-4 rounded-full text-[12.5px] font-bold bg-[var(--em7)]/10 border border-[var(--em7)]/30 text-[var(--em8)] backdrop-blur-md cursor-pointer transition-all duration-250 hover:bg-[var(--em7)]/20 hover:border-[var(--em7)]/50 hover:-translate-y-0.5 shadow-[0_4px_12px_rgba(42,122,68,.2)]" onClick={onOpenEvalClick}>
                  <i className="ti ti-chart-pie text-[14px]"></i> التقييم والتوثيق
                </button>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-center gap-3.5 self-start xl:self-auto">
              <div className="w-[100px] h-[100px] rounded-3xl bg-white/5 border-[1.5px] border-white/10 flex items-center justify-center text-[50px] text-[var(--em8)] backdrop-blur-md shadow-[0_0_0_1px_rgba(82,196,120,.1),0_8px_32px_rgba(0,0,0,.4),inset_0_1px_0_rgba(255,255,255,.08)]" style={{ animation: 'float 4s ease-in-out infinite' }}>
                <i className="ti ti-school"></i>
              </div>
              <div className="flex gap-2.5">
                <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-center text-white backdrop-blur-md transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/20 hover:-translate-y-0.5">
                  <div className="text-[22px] font-black">{totalEvs}</div>
                  <div className="text-[11px] text-[var(--text3)] mt-0.5">أدلة</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-center text-white backdrop-blur-md transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/20 hover:-translate-y-0.5">
                  <div className="text-[22px] font-black">{filledSecs}</div>
                  <div className="text-[11px] text-[var(--text3)] mt-0.5">أقسام</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* STATS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {[
            { id: 1, val: totalEvs, lbl: 'إجمالي الأدلة', ico: 'ti-files', bIco: 'ti-trending-up', bLbl: 'حي', theme: { bg: 'bg-gradient-to-br from-[var(--em2)]/30 to-[var(--em7)]/15', color: 'text-[var(--em7)]', badgeBg: 'bg-[var(--em7)]/10', badgeColor: 'text-[var(--em8)]' }, dly: '0.05s' },
            { id: 2, val: 11, lbl: 'أقسام التوثيق', ico: 'ti-layout-grid', bIco: 'ti-check', bLbl: 'مكتمل', theme: { bg: 'bg-gradient-to-br from-[#1d4ed8]/30 to-[#93c5fd]/15', color: 'text-[#93c5fd]', badgeBg: 'bg-[#93c5fd]/10', badgeColor: 'text-[#93c5fd]' }, dly: '0.1s' },
            { id: 3, val: state.strats.length, lbl: 'استراتيجيات مفعّلة', ico: 'ti-bulb', bIco: 'ti-star', bLbl: 'نشطة', theme: { bg: 'bg-gradient-to-br from-[#b45309]/30 to-[#fcd34d]/15', color: 'text-[#fcd34d]', badgeBg: 'bg-[#fcd34d]/10', badgeColor: 'text-[#fcd34d]' }, dly: '0.15s' },
            { id: 4, val: filledSecs, lbl: 'أقسام موثّقة', ico: 'ti-trophy', bIco: 'ti-chart-bar', bLbl: 'من 11', theme: { bg: 'bg-gradient-to-br from-[#c0399a]/30 to-[#f472b6]/15', color: 'text-[#f472b6]', badgeBg: 'bg-[#f472b6]/10', badgeColor: 'text-[#f472b6]' }, dly: '0.2s' }
          ].map(st => (
            <div key={st.id} className="group bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[20px] p-6 border border-[var(--line)] relative overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:border-[var(--line2)] hover:shadow-[0_20px_50px_rgba(0,0,0,.5)] cursor-default" style={{ animation: `fadeUp .5s var(--sp) both ${st.dly}` }}>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,.03),transparent_60%)]"></div>
              <div className="flex justify-between items-start mb-4.5 relative z-10">
                <div className={`w-[54px] h-[54px] rounded-2xl flex items-center justify-center text-[26px] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-8deg] relative ${st.theme.bg}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent rounded-2xl"></div>
                   <i className={`ti ${st.ico} relative z-10 ${st.theme.color}`}></i>
                </div>
                <div className={`text-[11px] font-bold py-1 px-2.5 rounded-lg flex items-center gap-1 ${st.theme.badgeBg} ${st.theme.badgeColor}`}>
                  <i className={`ti ${st.bIco}`}></i> {st.bLbl}
                </div>
              </div>
              <div className="text-[36px] font-black leading-none text-white transition-all duration-300 font-[var(--font)] group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-[linear-gradient(135deg,var(--em7),var(--gold))] relative z-10">{st.val}</div>
              <div className="text-[13px] text-[var(--text3)] mt-1.5 font-medium relative z-10">{st.lbl}</div>
            </div>
          ))}
        </div>

        {/* SEARCH BAR */}
        <div className="relative mb-5" style={{ animation: 'fadeUp .4s var(--sp) both 0.25s' }}>
          <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
            <i className="ti ti-search text-[18px] text-[var(--text4)]"></i>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث عن قسم أو قسم فرعي..."
            className="w-full py-3.5 pr-12 pl-5 bg-white/5 border border-[var(--line2)] rounded-2xl text-[14px] font-[var(--font)] text-white outline-none transition-all duration-250 placeholder-[var(--text4)] focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/40 focus:shadow-[0_0_0_4px_rgba(42,122,68,.1)]"
          />
          {searchQuery && (
            <button
              className="absolute inset-y-0 left-4 flex items-center text-[var(--text4)] hover:text-white transition-colors"
              onClick={() => setSearchQuery('')}
            >
              <i className="ti ti-x text-[16px]"></i>
            </button>
          )}
        </div>

        {/* No results */}
        {filteredSections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-[28px] text-[var(--text4)] mb-3">
              <i className="ti ti-search-off"></i>
            </div>
            <p className="text-[var(--text3)] text-[15px] font-bold">لا توجد نتائج لـ "{searchQuery}"</p>
            <p className="text-[var(--text4)] text-[13px] mt-1">جرب كلمة بحث مختلفة</p>
          </div>
        )}

        {/* SECTIONS */}
        <div className="flex flex-col gap-3.5">
          {filteredSections.map((sec, i) => {
            const allSubs = [...sec.subs, ...(state.csubs[sec.id] || [])];
            const secTotalEvs = allSubs.reduce((acc, sub) => acc + (state.ev[`${sec.id}|${sub}`] || []).length, 0);
            const isOpen = !!openSecs[sec.id];

            return (
              <div key={sec.id} id={`sc-${sec.id}`} className="bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[20px] border border-[var(--line)] overflow-hidden transition-all duration-300 hover:border-[var(--line2)]" style={{ scrollMarginTop: '90px', animation: `fadeUp .45s var(--sp) both ${i * 0.04}s` }}>
                <div className="flex items-center gap-4 py-5 px-6 cursor-pointer relative select-none hover:bg-white/5 group" onClick={() => toggleSec(sec.id)}>
                   <div className="absolute bottom-0 right-6 left-6 h-px bg-gradient-to-r from-transparent via-[var(--em7)]/15 to-transparent opacity-0 transition-opacity duration-250 group-hover:opacity-100"></div>
                   
                   <div className={`w-[42px] h-[42px] rounded-xl shrink-0 flex items-center justify-center text-[20px] border shadow-[0_4px_14px_rgba(42,122,68,.3)] transition-all duration-350 ${isOpen ? 'bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white border-transparent scale-110 !rotate-[-5deg] shadow-[0_6px_20px_rgba(42,122,68,.5)]' : 'bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] border-[var(--em7)]/20 group-hover:bg-gradient-to-br group-hover:from-[var(--em4)] group-hover:to-[var(--em7)] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-5deg] group-hover:shadow-[0_6px_20px_rgba(42,122,68,.5)]'}`}>
                     <i className={`ti ${sec.icon}`}></i>
                   </div>
                   
                   <div className="flex-1">
                     <div className="text-[16px] font-extrabold text-white font-[var(--font)]">{sec.ttl}</div>
                     <div className="text-[12px] text-[var(--text4)] mt-0.5">{allSubs.length} قسم فرعي{secTotalEvs ? ` · ${secTotalEvs} دليل` : ''}</div>
                   </div>
                   
                   {secTotalEvs > 0 && (
                     <div className="flex items-center gap-1 text-[12px] font-bold py-1.5 px-3.5 rounded-full bg-[var(--em7)]/10 text-[var(--em8)] border border-[var(--em7)]/15">
                       <i className="ti ti-files text-[13px]"></i> {secTotalEvs}
                     </div>
                   )}
                   
                   <i className={`ti ti-chevron-down text-[22px] shrink-0 transition-all duration-400 ${isOpen ? 'rotate-180 text-[var(--em7)]' : 'text-[var(--text4)]'}`}></i>
                </div>
                
                <div className={`overflow-hidden transition-all duration-500 ease-[var(--ease)] ${isOpen ? 'max-h-[9999px] opacity-100 border-t border-[var(--line)]' : 'max-h-0 opacity-0 border-t-0'}`}>
                  
                   {sec.isStrat && (
                      <div className="py-5 px-6 border-b border-white/5 bg-[var(--gold)]/5">
                         <div className="flex items-center gap-2 text-[13px] font-extrabold text-[var(--text2)] mb-4 tracking-wide">
                           <i className="ti ti-bulb text-[20px] text-[var(--gold)]"></i> استراتيجيات التدريس المتاحة
                         </div>
                         <div className="flex flex-wrap gap-2 mb-5">
                           {sec.strats?.map(s => {
                              const isOn = state.strats.includes(s);
                              return (
                                <div 
                                  key={s} 
                                  className={`group relative flex items-center gap-1.5 py-2 px-4 rounded-full text-[13px] font-semibold cursor-pointer border-[1.5px] transition-all duration-250 overflow-hidden hover:-translate-y-0.5 ${isOn ? 'text-white border-transparent shadow-[0_6px_18px_rgba(42,122,68,.5)]' : 'border-white/10 text-[var(--text3)] bg-white/5 hover:border-[var(--em7)]/30'}`}
                                  onClick={() => onToggleStrat(s)}
                                >
                                  <div className={`absolute inset-0 bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] transition-opacity duration-250 ${isOn ? 'opacity-100' : 'opacity-0'}`}></div>
                                  <i className={`ti ${isOn ? 'ti-check' : 'ti-plus'} text-[15px] relative z-10`}></i>
                                  <span className="relative z-10">{s}</span>
                                </div>
                              );
                           })}
                         </div>

                         {/* Active Strategies Details with Evidence Attachment */}
                         {state.strats.length > 0 && (
                           <div className="flex flex-col gap-4 mt-2">
                             <div className="text-[12px] font-bold text-[var(--em8)] border-b border-[var(--em7)]/10 pb-2 mb-1">توثيق الاستراتيجيات المفعّلة:</div>
                             {state.strats.map(stratName => {
                               const k = `strat:${stratName}`;
                               const evs = state.ev[`${sec.id}|${k}`] || [];
                               return (
                                 <div key={stratName} className="bg-white/5 rounded-2xl p-4 border border-[var(--em7)]/10">
                                   <div className="flex items-center justify-between mb-3">
                                     <div className="flex items-center gap-2">
                                       <div className="w-2 h-2 rounded-full bg-[var(--gold)] shadow-[0_0_8px_rgba(201,162,39,.5)]"></div>
                                       <span className="text-[14px] font-bold text-white">{stratName}</span>
                                       {evs.length > 0 && <span className="text-[11px] font-black text-[var(--em8)] bg-[var(--em7)]/10 px-2 py-0.5 rounded-md">{evs.length} شواهد</span>}
                                     </div>
                                     <button 
                                       className="py-1.5 px-3 rounded-lg bg-[var(--em7)]/10 border border-[var(--em7)]/20 text-[12px] font-bold text-[var(--em8)] hover:bg-[var(--em7)]/20 transition-all flex items-center gap-1.5"
                                       onClick={() => onAddEvClick(sec.id, k)}
                                     >
                                       <i className="ti ti-paperclip"></i> إرفاق شواهد
                                     </button>
                                   </div>
                                   
                                   {evs.length > 0 && (
                                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                       {evs.map((ev, ei) => {
                                         const t = EVT_CONFIG[ev.type] || EVT_CONFIG.doc;
                                         return (
                                           <div key={ei} className="flex items-center gap-2.5 py-2 px-3 bg-black/20 rounded-xl border border-white/5 relative group">
                                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[16px] shrink-0 ${t.cls}`}>
                                               <i className={`ti ${t.icon}`}></i>
                                             </div>
                                             <div 
                                                className={`flex-1 min-w-0 ${ev.url ? 'cursor-pointer hover:opacity-80 transition-all' : ''}`}
                                                onClick={() => ev.url && window.open(ev.url, '_blank')}
                                                title={ev.url ? 'اضغط لعرض الملف' : ''}
                                              >
                                                <div className="text-[12px] font-bold text-white truncate group-hover:text-[var(--em8)] transition-colors">{ev.name}</div>
                                                {ev.url && <div className="text-[10px] text-[var(--em8)] mt-0.5 flex items-center gap-0.5 font-bold"><i className="ti ti-external-link"></i> استعراض</div>}
                                              </div>
                                             <button className="text-[var(--text4)] hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onDeleteEv(sec.id, k, ei)}>
                                               <i className="ti ti-trash"></i>
                                             </button>
                                           </div>
                                         );
                                       })}
                                     </div>
                                   )}
                                   
                                   {evs.length === 0 && (
                                     <div className="text-[12px] text-[var(--text4)] italic opacity-60">لا توجد شواهد مرفقة لهذه الاستراتيجية حالياً.</div>
                                   )}
                                 </div>
                               );
                             })}
                           </div>
                         )}

                         <button className="mt-4 inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-[12.5px] font-bold cursor-pointer border-[1.5px] border-[var(--em7)]/20 text-[var(--em7)] bg-[var(--em7)]/5 hover:bg-gradient-to-br hover:from-[var(--em4)] hover:to-[var(--em6)] hover:text-white hover:border-transparent hover:shadow-[0_6px_18px_rgba(42,122,68,.5)] hover:-translate-y-0.5 group transition-all duration-250" onClick={onAddStratClick}>
                            <i className="ti ti-plus text-[15px] transition-transform duration-300 group-hover:scale-125 group-hover:rotate-[-5deg]"></i> إضافة استراتيجية جديدة
                         </button>
                      </div>
                   )}

                  {allSubs.map((sub, idx) => {
                     const isCustom = idx >= sec.subs.length;
                     const k = `${sec.id}|${sub}`;
                     const evs = state.ev[k] || [];
                     const note = state.notes[k] || '';

                     return (
                        <div key={sub} className="py-5 px-6 border-b border-white/5 hover:bg-white/[0.015] transition-colors duration-200 last:border-b-0">
                           <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-3">
                               <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-gradient-to-br from-[var(--em6)] to-[var(--gold)] shadow-[0_0_8px_rgba(82,196,120,.5)]" style={{ animation: 'pulse 3s ease-in-out infinite' }}></div>
                               <div className="text-[15px] font-bold text-[var(--text2)]">{sub}</div>
                               {evs.length > 0 && <span className="text-[12px] font-extrabold text-transparent bg-clip-text bg-[linear-gradient(135deg,var(--em7),var(--gold))]">{evs.length}</span>}
                               {isCustom && <span className="text-[11px] bg-[var(--gold)]/10 text-[var(--gold)] border border-[var(--gold)]/20 py-0.5 px-2 rounded-lg font-bold">جديد</span>}
                             </div>
                             <div className="flex gap-1.5">
                                {isCustom && (
                                  <button
                                    className="inline-flex items-center gap-1 py-2 px-3 rounded-xl text-[12px] font-bold cursor-pointer border border-red-500/20 text-red-400 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/40 transition-all duration-250"
                                    onClick={() => onDelSub(sec.id, sub)}
                                    title="حذف القسم الفرعي"
                                  >
                                    <i className="ti ti-trash text-[13px]"></i>
                                  </button>
                                )}
                               <button className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-[12.5px] font-bold cursor-pointer border-[1.5px] whitespace-nowrap border-[var(--em7)]/20 text-[var(--em7)] bg-[var(--em7)]/10 hover:bg-gradient-to-br hover:from-[var(--em4)] hover:to-[var(--em6)] hover:text-white hover:border-transparent hover:shadow-[0_6px_18px_rgba(42,122,68,.5)] hover:-translate-y-0.5 group transition-all duration-250 active:scale-95" onClick={() => onAddEvClick(sec.id, sub)}>
                                 <i className="ti ti-plus text-[15px] transition-transform duration-300 group-hover:scale-125 group-hover:rotate-[-5deg]"></i> إضافة دليل
                               </button>
                             </div>
                           </div>

                           {evs.length > 0 && (
                             <div className="flex flex-col gap-2 mb-3">
                               {evs.map((ev, ei) => {
                                 const t = EVT_CONFIG[ev.type] || EVT_CONFIG.doc;
                                 return (
                                   <div key={ei} className="flex items-center gap-3.5 py-3 px-4 bg-white/5 rounded-xl border border-[var(--line)] transition-all duration-250 hover:bg-white/10 hover:border-[var(--line2)] hover:-translate-x-1 hover:shadow-[0_4px_20px_rgba(0,0,0,.3)] group" style={{ animation: 'slideR .3s var(--sp) both' }}>
                                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[20px] shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-5deg] ${t.cls}`}>
                                       <i className={`ti ${t.icon}`}></i>
                                     </div>
                                     <div 
                                        className={`flex-1 min-w-0 ${ev.url ? 'cursor-pointer hover:opacity-80 transition-all' : ''}`}
                                        onClick={() => ev.url && window.open(ev.url, '_blank')}
                                        title={ev.url ? 'اضغط لعرض الملف' : ''}
                                      >
                                        <div className="text-[13.5px] font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis group-hover:text-[var(--em8)] transition-colors">{ev.name}</div>
                                        <div className="text-[11px] text-[var(--text4)] mt-1 flex items-center gap-1.5">
                                          <i className="ti ti-calendar"></i>{ev.date} · <i className="ti ti-tag"></i>{t.label}
                                          {ev.url && <span className="text-[var(--em8)] flex items-center gap-0.5 font-bold"><i className="ti ti-external-link"></i> استعراض</span>}
                                        </div>
                                      </div>
                                     <button className="bg-transparent border-none text-[var(--text4)] cursor-pointer p-2 rounded-lg text-[16px] shrink-0 transition-all duration-200 hover:text-red-400 hover:bg-red-400/10 hover:scale-115" onClick={() => onDeleteEv(sec.id, sub, ei)} title="حذف">
                                       <i className="ti ti-trash"></i>
                                     </button>
                                   </div>
                                 );
                               })}
                             </div>
                           )}

                           <button className="flex items-center gap-2.5 w-full py-3 px-4 border-[1.5px] border-dashed border-[var(--em7)]/20 rounded-xl cursor-pointer bg-transparent font-[var(--font)] text-[var(--text4)] text-[13.5px] transition-all duration-250 group overflow-hidden relative hover:border-[var(--em7)]/40 hover:text-[var(--em7)] hover:bg-[var(--em7)]/5" onClick={() => onAddEvClick(sec.id, sub)}>
                              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(82,196,120,.05),transparent)] translate-x-full transition-transform duration-500 group-hover:-translate-x-full"></div>
                              <i className="ti ti-paperclip text-[20px] transition-transform duration-350 group-hover:rotate-90 group-hover:scale-110"></i>
                              <span className="relative z-10">إرفاق ملف أو دليل...</span>
                           </button>

                           <textarea 
                             className="w-full p-4 mt-3 bg-white/5 border-[1.5px] border-[var(--line)] rounded-xl text-[13px] font-[var(--font)] text-white outline-none resize-none transition-all duration-250 leading-relaxed placeholder-[var(--text4)] focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/30 focus:shadow-[0_0_0_4px_rgba(42,122,68,.1)]" 
                             rows={2} 
                             placeholder="ملاحظة أو وصف..." 
                             value={note} 
                             onChange={(e) => onUpdateNote(k, e.target.value)}
                           ></textarea>

                        </div>
                     )
                  })}
                  
                  <div className="py-3.5 px-6 border-t border-[var(--line)]">
                    <button className="flex items-center gap-2 py-2.5 px-4 rounded-xl border-[1.5px] border-dashed border-[var(--line2)] bg-transparent text-[var(--text4)] text-[13px] cursor-pointer transition-all duration-250 group hover:border-[var(--em7)]/30 hover:text-[var(--em7)] hover:bg-[var(--em7)]/5" onClick={() => onAddSubClick(sec.id)}>
                      <i className="ti ti-folder-plus text-[18px] transition-transform duration-300 group-hover:rotate-90"></i> إضافة قسم فرعي جديد
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
