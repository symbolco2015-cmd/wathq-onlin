import { useState } from 'react';
import type { AppState, SectionData, Announcement } from '../types';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import Sidebar from './Sidebar';
import EvidenceList from './EvidenceList';
import { calculateEvaluation } from '../utils';
import { useEvidenceStore } from '../hooks/useEvidenceStore';

interface SupabaseEvHook {
  getBySection: (sectionId: number) => SupabaseEvidence[];
  deleteEvidence: (id: string) => Promise<void>;
  loading: boolean;
}

interface DashboardProps {
  state: AppState;
  sections: SectionData[];
  supabaseEv?: SupabaseEvHook;
  onAddEvClick: (sid: number, sub: string) => void;
  onAddSubClick: (sid: number) => void;
  onToggleStrat: (s: string) => void;
  onUpdateNote: (k: string, v: string) => void;
  onDeleteEv: (sid: number, sub: string, idx: number) => void;
  onAddStratClick: () => void;
  onOpenEvalClick: () => void;
  onDelSub: (sid: number, subName: string) => void;
  announcements?: Announcement[];
  onMarkAsRead?: (id: string) => void;
}

const EVT_CONFIG: Record<string, {icon: string, cls: string, label: string}> = {
  pdf: {icon: 'ti-file-type-pdf', cls: 'bg-[linear-gradient(135deg,rgba(185,28,28,.2),rgba(185,28,28,.1))] text-[#f87171] border border-[#b91c1c]/20', label: 'PDF'},
  img: {icon: 'ti-photo', cls: 'bg-[linear-gradient(135deg,rgba(29,78,216,.2),rgba(29,78,216,.1))] text-[#93c5fd] border border-[#1d4ed8]/20', label: 'صورة'},
  doc: {icon: 'ti-file-text', cls: 'bg-[linear-gradient(135deg,rgba(109,40,217,.2),rgba(109,40,217,.1))] text-[#c4b5fd] border border-[#6d28d9]/20', label: 'مستند'},
  vid: {icon: 'ti-video', cls: 'bg-[linear-gradient(135deg,rgba(180,83,9,.2),rgba(180,83,9,.1))] text-[#fcd34d] border border-[#b45309]/20', label: 'فيديو'}
};

export default function Dashboard({ state, sections, supabaseEv, onAddEvClick, onAddSubClick, onToggleStrat, onUpdateNote, onDeleteEv, onAddStratClick, onOpenEvalClick, onDelSub, announcements, onMarkAsRead }: DashboardProps) {
  const [openSecs, setOpenSecs] = useState<Record<number, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAnn, setActiveAnn] = useState<Announcement | null>(null);

  // ربط useEvidenceStore للحصول على نسب الاكتمال الحقيقية
  const { stats: evStats, getSectionStat } = useEvidenceStore({
    ev: state.ev,
    sections,
    csubs: state.csubs,
  });

  // متوسط نسب الاكتمال عبر جميع الأقسام الـ 11
  const overallPct = evStats.bySections.length > 0
    ? Math.round(
        evStats.bySections.reduce((sum, s) => sum + s.completionPct, 0) / evStats.bySections.length
      )
    : 0;

  // البند الأقل اكتمالاً — الخطوة التالية
  const incompleteSections = evStats.bySections.filter(s => s.completionPct < 100);
  const nextSectionStat = incompleteSections.length > 0
    ? incompleteSections.reduce((min, s) => s.completionPct < min.completionPct ? s : min)
    : null;
  const nextSectionData = nextSectionStat
    ? sections.find(s => s.id === nextSectionStat.sectionId) ?? null
    : null;

  // رسالة تشجيعية حسب نسبة الجاهزية
  const readinessMsg =
    overallPct === 100 ? 'أحسنت! ملفك مكتمل' :
    overallPct >= 71   ? 'اقتربت من الهدف، لا تتوقف الآن' :
    overallPct >= 31   ? 'أنت في المنتصف، واصل الإنجاز' :
                          'ابدأ رحلتك، كل شاهد يقربك من الاكتمال';

  const handleOpenAnnouncementModal = (ann: Announcement) => {
    setActiveAnn(ann);
    if (onMarkAsRead) {
      onMarkAsRead(ann.id);
    }
  };

  const handleCloseAnnModal = () => {
    setActiveAnn(null);
  };

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

  // الأقسام مرتبة: الأقل اكتمالاً أولاً (بدون إعادة ترتيب عند البحث)
  const sortedFilteredSections = searchQuery.trim()
    ? filteredSections
    : [...filteredSections].sort((a, b) => {
        const pctA = getSectionStat(a.id)?.completionPct ?? 0;
        const pctB = getSectionStat(b.id)?.completionPct ?? 0;
        return pctA - pctB;
      });

  const stats = calculateEvaluation(state, sections);
  // استخدام القيم الحقيقية من useEvidenceStore
  const totalEvs = evStats.total;
  const filledSecs = evStats.filledSectionCount;

  return (
    <div className="flex min-h-[calc(100vh-72px)]">
      <Sidebar
        state={state}
        sections={sections}
        sectionStats={evStats.bySections}
        filledCount={evStats.filledSectionCount}
        overallPct={overallPct}
      />
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

        {/* NEXT STEP CARD */}
        {nextSectionData && nextSectionStat && (
          <div className="mb-5 rounded-[22px] p-5 sm:p-6 border border-amber-500/25 bg-gradient-to-br from-amber-950/40 via-amber-900/20 to-[var(--surf3)] relative overflow-hidden" style={{ animation: 'fadeUp .55s var(--sp) both 0.05s' }}>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_100%_at_0%_50%,rgba(251,191,36,.06),transparent_70%)]" />
            <div className="absolute top-0 right-0 left-0 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-xl shrink-0 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[22px] text-amber-400">
                  <i className={`ti ${nextSectionData.icon}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-amber-400/80 tracking-wider uppercase mb-0.5 flex items-center gap-1.5">
                    <i className="ti ti-arrow-right text-[12px]" /> الخطوة التالية
                  </div>
                  <div className="text-[15px] font-extrabold text-white truncate leading-snug">{nextSectionData.ttl}</div>
                  <div className="flex items-center gap-2.5 mt-1.5">
                    <div className="h-1.5 w-28 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-700"
                        style={{ width: `${nextSectionStat.completionPct}%` }}
                      />
                    </div>
                    <span className="text-[11.5px] font-bold text-amber-400">{nextSectionStat.completionPct}% مكتمل</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onAddEvClick(nextSectionData.id, nextSectionData.subs[0] ?? 'عام')}
                className="shrink-0 inline-flex items-center gap-2 py-3 px-6 rounded-xl text-[13px] font-bold bg-gradient-to-br from-amber-500 to-amber-600 text-white border border-amber-400/20 hover:from-amber-400 hover:to-amber-500 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(251,191,36,.35)] transition-all duration-250 cursor-pointer font-[var(--font)] active:scale-95"
              >
                <i className="ti ti-plus text-[15px]" /> أضف شاهداً الآن
              </button>
            </div>
          </div>
        )}

        {/* OVERALL READINESS BAR */}
        <div className="mb-8 rounded-[22px] p-5 sm:p-6 bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] border border-[var(--line)] relative overflow-hidden" style={{ animation: 'fadeUp .6s var(--sp) both 0.1s' }}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_80%_at_100%_50%,rgba(82,196,120,.04),transparent_60%)]" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-[13.5px] font-bold text-[var(--text3)]">جاهزية ملف الإنجاز</span>
                <span className="text-[34px] font-black text-white font-[var(--font)] leading-none">
                  {overallPct}<span className="text-[18px] text-[var(--text4)] font-bold">%</span>
                </span>
              </div>
              <div className="h-3 bg-white/8 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full relative overflow-hidden"
                  style={{
                    width: `${overallPct}%`,
                    transition: 'width 1200ms cubic-bezier(.16,1,.3,1)',
                    background:
                      overallPct >= 71 ? 'linear-gradient(90deg, var(--em5), var(--em7), var(--em8))' :
                      overallPct >= 31 ? 'linear-gradient(90deg, #b45309, #d97706, #fbbf24)' :
                                         'linear-gradient(90deg, #9f1239, #dc2626, #f87171)',
                    boxShadow:
                      overallPct >= 71 ? '0 0 12px rgba(82,196,120,.45)' :
                      overallPct >= 31 ? '0 0 12px rgba(217,119,6,.35)' : 'none',
                  }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent)] bg-[length:200%_auto]" style={{ animation: 'goldShimmer 2.5s linear infinite' }} />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <i className={`ti text-[15px] ${
                  overallPct === 100 ? 'ti-star-filled text-[var(--gold)]' :
                  overallPct >= 71   ? 'ti-flame text-[var(--em8)]' :
                  overallPct >= 31   ? 'ti-trending-up text-amber-400' :
                                       'ti-seeding text-[var(--em7)]'
                }`} />
                <span className="text-[12.5px] font-semibold text-[var(--text3)]">{readinessMsg}</span>
              </div>
            </div>
            <div className="flex sm:flex-col gap-5 sm:gap-3 shrink-0 sm:border-r sm:border-[var(--line)] sm:pr-6">
              <div className="sm:text-center">
                <div className="text-[11px] font-bold text-[var(--text4)] mb-0.5">أقسام مكتملة</div>
                <div className="text-[24px] font-black text-[var(--em8)] font-[var(--font)] leading-none">
                  {filledSecs}<span className="text-[14px] text-[var(--text4)] font-semibold"> / {sections.length}</span>
                </div>
              </div>
              <div className="sm:text-center">
                <div className="text-[11px] font-bold text-[var(--text4)] mb-0.5">إجمالي الأدلة</div>
                <div className="text-[24px] font-black text-white font-[var(--font)] leading-none">{totalEvs}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ANNOUNCEMENTS SECTION */}
        {announcements && announcements.length > 0 && (
          <div className="mb-8" style={{ animation: 'fadeUp .55s var(--sp) both 0.1s' }}>
            <div className="flex items-center gap-2 mb-3.5 px-1">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--em7)] shadow-[0_0_8px_rgba(82,196,120,.5)]"></div>
              <h2 className="text-[16px] font-black text-white font-[var(--font)]">آخر التحديثات والتعاميم</h2>
              <span className="text-[11px] bg-[var(--em7)]/15 text-[var(--em8)] px-2 py-0.5 rounded-md font-extrabold">
                {announcements.filter(a => !state.readAnnouncements?.includes(a.id)).length} جديد
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {announcements.slice(0, 3).map((ann) => {
                const isRead = state.readAnnouncements?.includes(ann.id);
                const dateStr = new Date(ann.created_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
                
                // Category styling
                let catLabel = 'تحديث';
                let catClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                let catIcon = 'ti-settings';
                if (ann.category === 'admin') {
                  catLabel = 'تعميم إداري';
                  catClass = 'bg-[var(--gold)]/10 text-[var(--gold)] border-[var(--gold)]/20';
                  catIcon = 'ti-file-text';
                } else if (ann.category === 'urgent') {
                  catLabel = 'تنبيه عاجل';
                  catClass = 'bg-red-500/10 text-red-400 border-red-500/20';
                  catIcon = 'ti-alert-triangle';
                }

                return (
                  <div 
                    key={ann.id} 
                    onClick={() => handleOpenAnnouncementModal(ann)}
                    className="group relative bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] border border-[var(--line)] rounded-[20px] p-5 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-[var(--line2)] hover:shadow-[0_12px_32px_rgba(0,0,0,.4)] overflow-hidden"
                  >
                    {/* Pulsing indicator for unread */}
                    {!isRead && (
                      <span className="absolute top-4 left-4 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </span>
                    )}
                    
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[11px] font-bold border ${catClass}`}>
                        <i className={`ti ${catIcon}`}></i> {catLabel}
                      </span>
                      <span className="text-[11px] text-[var(--text4)]">{dateStr}</span>
                    </div>
                    
                    <h3 className="text-[14px] font-extrabold text-white mb-2 line-clamp-1 group-hover:text-[var(--em8)] transition-colors duration-200">
                      {ann.title}
                    </h3>
                    
                    <p className="text-[12.5px] text-[var(--text3)] line-clamp-2 leading-relaxed mb-1">
                      {ann.content}
                    </p>
                    
                    <div className="text-[11.5px] text-[var(--em8)] font-bold mt-3.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span>اقرأ المزيد</span>
                      <i className="ti ti-arrow-left text-[13px] translate-x-1 group-hover:translate-x-0 transition-transform"></i>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STATS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {[
            { id: 1, val: totalEvs, lbl: 'إجمالي الأدلة', ico: 'ti-files', bIco: 'ti-trending-up', bLbl: 'حي', theme: { bg: 'bg-gradient-to-br from-[var(--em2)]/30 to-[var(--em7)]/15', color: 'text-[var(--em7)]', badgeBg: 'bg-[var(--em7)]/10', badgeColor: 'text-[var(--em8)]' }, dly: '0.05s', sub: `${evStats.byType.pdf} PDF · ${evStats.byType.img} صور` },
            { id: 2, val: sections.length, lbl: 'أقسام التوثيق', ico: 'ti-layout-grid', bIco: 'ti-check', bLbl: `${filledSecs} موثّق`, theme: { bg: 'bg-gradient-to-br from-[#1d4ed8]/30 to-[#93c5fd]/15', color: 'text-[#93c5fd]', badgeBg: 'bg-[#93c5fd]/10', badgeColor: 'text-[#93c5fd]' }, dly: '0.1s', sub: `${evStats.byType.doc} مستندات · ${evStats.byType.vid} فيديو` },
            { id: 3, val: state.strats.length, lbl: 'استراتيجيات مفعّلة', ico: 'ti-bulb', bIco: 'ti-star', bLbl: 'نشطة', theme: { bg: 'bg-gradient-to-br from-[#b45309]/30 to-[#fcd34d]/15', color: 'text-[#fcd34d]', badgeBg: 'bg-[#fcd34d]/10', badgeColor: 'text-[#fcd34d]' }, dly: '0.15s', sub: null },
            { id: 4, val: filledSecs, lbl: 'أقسام موثّقة', ico: 'ti-trophy', bIco: 'ti-chart-bar', bLbl: `من ${sections.length}`, theme: { bg: 'bg-gradient-to-br from-[#c0399a]/30 to-[#f472b6]/15', color: 'text-[#f472b6]', badgeBg: 'bg-[#f472b6]/10', badgeColor: 'text-[#f472b6]' }, dly: '0.2s', sub: `${Math.round((filledSecs / sections.length) * 100)}% اكتمال` },
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
              {st.sub && <div className="text-[11px] text-[var(--text4)] mt-1 font-medium relative z-10 opacity-70">{st.sub}</div>}
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
          {sortedFilteredSections.map((sec, i) => {
            const allSubs = [...sec.subs, ...(state.csubs[sec.id] || [])];
            const secTotalEvs = allSubs.reduce((acc, sub) => acc + (state.ev[`${sec.id}|${sub}`] || []).length, 0);
            const isOpen = !!openSecs[sec.id];
            // نسبة الاكتمال الحقيقية من useEvidenceStore
            const secStat = getSectionStat(sec.id);
            const completionPct = secStat?.completionPct ?? 0;
            const filledSubs = secStat?.filledSubs ?? 0;
            const totalSubs = secStat?.totalSubs ?? allSubs.length;

            const borderColor =
              completionPct > 70  ? '#22c55e' :
              completionPct >= 35 ? '#f59e0b' :
                                    '#ef4444';

            return (
              <div key={sec.id} id={`sc-${sec.id}`} className="relative bg-gradient-to-br from-[var(--surf2)] to-[var(--surf3)] rounded-[20px] border border-[var(--line)] overflow-hidden transition-all duration-300 hover:border-[var(--line2)]" style={{ scrollMarginTop: '90px', animation: `fadeUp .45s var(--sp) both ${i * 0.04}s`, borderRight: `4px solid ${borderColor}` }}>
                <div className="flex items-center gap-4 py-5 px-6 cursor-pointer relative select-none hover:bg-white/5 group" onClick={() => toggleSec(sec.id)}>
                   <div className="absolute bottom-0 right-6 left-6 h-px bg-gradient-to-r from-transparent via-[var(--em7)]/15 to-transparent opacity-0 transition-opacity duration-250 group-hover:opacity-100"></div>
                   
                   <div className={`w-[42px] h-[42px] rounded-xl shrink-0 flex items-center justify-center text-[20px] border shadow-[0_4px_14px_rgba(42,122,68,.3)] transition-all duration-350 ${isOpen ? 'bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white border-transparent scale-110 !rotate-[-5deg] shadow-[0_6px_20px_rgba(42,122,68,.5)]' : 'bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] border-[var(--em7)]/20 group-hover:bg-gradient-to-br group-hover:from-[var(--em4)] group-hover:to-[var(--em7)] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-5deg] group-hover:shadow-[0_6px_20px_rgba(42,122,68,.5)]'}`}>
                     <i className={`ti ${sec.icon}`}></i>
                   </div>
                   
                   <div className="flex-1 min-w-0">
                     <div className="text-[16px] font-extrabold text-white font-[var(--font)]">{sec.ttl}</div>
                     <div className="text-[12px] text-[var(--text4)] mt-0.5">{totalSubs} قسم فرعي{secTotalEvs ? ` · ${secTotalEvs} دليل` : ''}</div>
                     {/* شريط التقدم الحقيقي */}
                     <div className="mt-2.5 flex items-center gap-2">
                       <div className="flex-1 h-[5px] rounded-full bg-white/8 overflow-hidden">
                         <div
                           className="h-full rounded-full transition-all duration-700 ease-out"
                           style={{
                             width: `${completionPct}%`,
                             background: completionPct >= 70
                               ? 'linear-gradient(90deg, var(--em6), var(--em7))'
                               : completionPct >= 35
                               ? 'linear-gradient(90deg, #b45309, #fcd34d)'
                               : 'linear-gradient(90deg, #9f1239, #f43f5e)',
                             boxShadow: completionPct >= 70 ? '0 0 8px rgba(82,196,120,.4)' : 'none'
                           }}
                         />
                       </div>
                       <span className={`text-[11px] font-black shrink-0 ${
                         completionPct >= 70 ? 'text-[var(--em8)]' :
                         completionPct >= 35 ? 'text-[#fcd34d]' : 'text-[#f87171]'
                       }`}>{completionPct}%</span>
                     </div>
                   </div>
                   
                   {secTotalEvs > 0 && (
                     <div className="flex flex-col items-center gap-0.5 shrink-0">
                       <div className="flex items-center gap-1 text-[12px] font-bold py-1.5 px-3.5 rounded-full bg-[var(--em7)]/10 text-[var(--em8)] border border-[var(--em7)]/15">
                         <i className="ti ti-files text-[13px]"></i> {secTotalEvs}
                       </div>
                       <div className="text-[10px] text-[var(--text4)] font-bold">{filledSubs}/{totalSubs} مكتمل</div>
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
                                                <div className="text-[12px] font-bold text-white truncate group-hover:text-[var(--em8)] transition-colors" dir="ltr" style={{unicodeBidi:'isolate'}}>{ev.name}</div>
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
                                        <div className="text-[13.5px] font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis group-hover:text-[var(--em8)] transition-colors" dir="ltr" style={{unicodeBidi:'isolate'}}>{ev.name}</div>
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

                  {/* ── قائمة الشواهد من Supabase ── */}
                  {supabaseEv && (
                    <div className="px-6 pb-6 border-t border-[var(--line)] pt-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-[12px] font-extrabold text-[var(--text3)] tracking-wide uppercase">
                          <i className="ti ti-files text-[16px] text-[var(--em7)]" />
                          الشواهد الموثّقة
                          {supabaseEv.getBySection(sec.id).length > 0 && (
                            <span className="text-[10px] font-black text-[var(--em8)] bg-[var(--em7)]/10 px-2 py-0.5 rounded-full border border-[var(--em7)]/20">
                              {supabaseEv.getBySection(sec.id).length}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => onAddEvClick(sec.id, sec.subs[0] ?? 'عام')}
                          className="inline-flex items-center gap-1.5 py-1.5 px-3.5 rounded-lg text-[12px] font-bold bg-[var(--em7)]/10 border border-[var(--em7)]/20 text-[var(--em8)] hover:bg-[var(--em7)]/20 transition-all cursor-pointer font-[var(--font)]"
                        >
                          <i className="ti ti-plus text-[13px]" /> إضافة شاهد
                        </button>
                      </div>
                      <EvidenceList
                        sectionId={sec.id}
                        evidence={supabaseEv.getBySection(sec.id)}
                        loading={supabaseEv.loading}
                        onDelete={supabaseEv.deleteEvidence}
                        onAddClick={() => onAddEvClick(sec.id, sec.subs[0] ?? 'عام')}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Announcement Detail Modal */}
      {activeAnn && (
        <div className="modal-overlay" style={{ zIndex: 400 }} onClick={e => { if (e.target === e.currentTarget) handleCloseAnnModal(); }}>
          <div className="user-modal max-w-lg" style={{ animation: 'scaleIn .35s var(--sp) both' }}>
            <div className="umodal-header border-b border-white/5 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[20px] ${
                  activeAnn.category === 'admin' ? 'bg-[var(--gold)]/10 text-[var(--gold)]' :
                  activeAnn.category === 'urgent' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
                }`}>
                  <i className={`ti ${activeAnn.category === 'admin' ? 'ti-file-text' : activeAnn.category === 'urgent' ? 'ti-alert-triangle' : 'ti-settings'}`}></i>
                </div>
                <div>
                  <div className="text-[11.5px] text-[var(--text4)]">
                    {activeAnn.category === 'admin' ? 'تعميم إداري' : activeAnn.category === 'urgent' ? 'تنبيه عاجل' : 'تحديث برمجي'}
                  </div>
                  <div className="text-[12px] text-[var(--text3)] mt-0.5">
                    {new Date(activeAnn.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              </div>
              <button className="umodal-close" onClick={handleCloseAnnModal}><i className="ti ti-x" /></button>
            </div>

            <div className="px-6 py-2">
              <h3 className="text-[17px] font-black text-white mb-3.5 leading-snug">{activeAnn.title}</h3>
              <p className="text-[14px] text-[var(--text2)] leading-relaxed whitespace-pre-wrap mb-5">{activeAnn.content}</p>

              {activeAnn.attachment_url && (
                <div className="mb-4">
                  <a 
                    href={activeAnn.attachment_url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="inline-flex items-center gap-2 py-2 px-4 rounded-xl text-[12.5px] font-bold bg-[var(--em7)]/15 border border-[var(--em7)]/25 text-[var(--em8)] hover:bg-[var(--em7)]/25 transition-all no-underline"
                  >
                    <i className="ti ti-paperclip"></i> تحميل الملف المرفق
                  </a>
                </div>
              )}
            </div>

            <div className="umodal-actions border-t border-white/5 pt-4 mt-2 flex justify-end gap-2">
              <button className="umodal-btn primary-btn py-2.5 px-6 rounded-xl" onClick={handleCloseAnnModal}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
