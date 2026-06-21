import React, { useState } from 'react';
import type { PublicPortfolioState, SectionData } from '../types';
import { calculateEvaluation } from '../utils';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient';
import { RadialBarChart, RadialBar, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PublicProps {
  state: PublicPortfolioState;
  sections: SectionData[];
  /** When true, this view is accessed via a public share link (no auth required) */
  isSharedView?: boolean;
}

const EVT_CONFIG: Record<string, {icon: string, cls: string, label: string}> = {
  pdf: {icon: 'ti-file-type-pdf', cls: 'bg-gradient-to-br from-[#b91c1c]/20 to-[#b91c1c]/10 text-[#f87171] border border-[#b91c1c]/20', label: 'PDF'},
  img: {icon: 'ti-photo', cls: 'bg-gradient-to-br from-[#1d4ed8]/20 to-[#1d4ed8]/10 text-[#93c5fd] border border-[#1d4ed8]/20', label: 'صورة'},
  doc: {icon: 'ti-file-text', cls: 'bg-gradient-to-br from-[#6d28d9]/20 to-[#6d28d9]/10 text-[#c4b5fd] border border-[#6d28d9]/20', label: 'مستند'},
  vid: {icon: 'ti-video', cls: 'bg-gradient-to-br from-[#b45309]/20 to-[#b45309]/10 text-[#fcd34d] border border-[#b45309]/20', label: 'فيديو'}
};

export default function Public({ state, sections, isSharedView }: PublicProps) {
  const [selectedSecId, setSelectedSecId] = useState<number | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [previewFile, setPreviewFile] = useState<{
    name: string;
    url: string;
    type: 'pdf' | 'img' | 'doc' | 'vid';
  } | null>(null);

  const stats = calculateEvaluation(state, sections);
  const totalEvs = stats.totalEvs;
  
  const chartData = sections.map(sec => {
    const allSubs = [...sec.subs, ...(state.csubs[sec.id] || [])];
    const evs = allSubs.flatMap(s => (state.ev[`${sec.id}|${s}`] || []).map(e => ({ ...e, sub: s })));
    
    if (sec.isStrat) {
      state.strats.forEach(sn => {
        const k = `strat:${sn}`;
        const sevs = (state.ev[`${sec.id}|${k}`] || []).map(e => ({ ...e, sub: sn }));
        evs.push(...sevs);
      });
    }

    return {
      ...sec,
      name: sec.ttl.split(' ')[0] + (sec.ttl.split(' ')[1] ? ' ' + sec.ttl.split(' ')[1] : ''),
      fullName: sec.ttl,
      evCount: evs.length,
      evs,
      fill: sec.isStrat ? '#f59e0b' : '#10b981'
    };
  });

  const exportToPDF = async () => {
    const element = document.getElementById('public-portfolio-content');
    if (!element) return;
    
    setIsExporting(true);
    try {
      const { toJpeg } = await import('html-to-image');
      const { jsPDF } = await import('jspdf');
      
      // We give it a little more time to ensure fonts are ready
      await new Promise(resolve => setTimeout(resolve, 500));

      const dataUrl = await toJpeg(element, {
        quality: 0.95,
        backgroundColor: '#060f0a',
        pixelRatio: 2, // Better crispness
        skipFonts: false, // We want fonts, crossorigin in index.html should fix the errors
        style: {
          borderRadius: '0',
          transform: 'none'
        }
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate image dimensions to fit PDF width
      const imgProps = pdf.getImageProperties(dataUrl);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(dataUrl, 'JPEG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Add subsequent pages if content spans more than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`تطوير_ذاتي_${state.profile.name}.pdf`);
    } catch (err) {
      console.error('PDF Export failed', err);
      // Fallback to native print
      window.print();
    } finally {
      setIsExporting(false);
    }
  };

  const buildShareUrl = async (): Promise<string> => {
    // If we already have a share URL cached, return it
    if (shareUrl) return shareUrl;

    // Try to get current user ID from Supabase
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const url = `${window.location.origin}${window.location.pathname}?share=${user.id}`;
        setShareUrl(url);
        return url;
      }
    }

    // Fallback: current URL (e.g. if already in shared view)
    return window.location.href;
  };

  const handleOpenShare = async () => {
    await buildShareUrl();
    setShowShare(true);
  };

  const copyLink = async () => {
    const url = await buildShareUrl();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedSecData = selectedSecId ? chartData.find(c => c.id === selectedSecId) : null;

  return (
    <div>
      <div id="public-portfolio-content" className="bg-[#060f0a] min-h-screen">
        <div className="relative overflow-hidden bg-gradient-to-br from-[var(--em1)] via-[var(--em2)] to-[rgba(20,60,35,.9)] pt-20 px-8 pb-16 text-center">
          
          <div id="pdf-action-buttons" className="absolute top-6 left-6 z-20 flex gap-2 print:hidden">
            <button 
              onClick={exportToPDF}
              disabled={isExporting}
              className={`flex items-center gap-2 py-2 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[13px] font-bold transition-all backdrop-blur-md ${isExporting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {isExporting ? <i className="ti ti-loader animate-spin text-[16px]"></i> : <i className="ti ti-download text-[16px]"></i>}
              <span className="hidden sm:inline">{isExporting ? 'جاري التصدير...' : 'تصدير PDF'}</span>
            </button>
            <button 
              onClick={handleOpenShare}
              className="flex items-center gap-2 py-2 px-4 rounded-xl bg-[var(--em7)]/20 hover:bg-[var(--em7)]/40 border border-[var(--em7)]/30 text-white text-[13px] font-bold transition-all cursor-pointer backdrop-blur-md"
            >
              <i className="ti ti-share text-[16px]"></i>
              <span className="hidden sm:inline">مشاركة</span>
            </button>
          </div>

          <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(82,196,120,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(82,196,120,.04)_1px,transparent_1px)] bg-[length:40px_40px]"></div>
          <div className="absolute w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(82,196,120,.15),transparent_70%)] -top-50 left-1/2 -translate-x-1/2 pointer-events-none z-0"></div>
          
          <div className="inline-block relative mb-7 z-10">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[var(--em3)] to-[var(--em6)] text-white inline-flex items-center justify-center text-[44px] font-black border-2 border-white/15 shadow-[0_0_0_8px_rgba(42,122,68,.1),0_0_0_16px_rgba(42,122,68,.05),0_20px_60px_rgba(0,0,0,.5)] relative z-10 bg-cover bg-center overflow-hidden"
                 style={state.profile.avatar ? { backgroundImage: `url(${state.profile.avatar})` } : {}}>
              {!state.profile.avatar && state.profile.name.substring(0, 2)}
            </div>
            <div className="absolute -inset-3 rounded-full border border-[var(--gold)]/20 z-0" style={{ animation: 'spin 12s linear infinite' }}></div>
            <div className="absolute -inset-5 rounded-full border border-[var(--em7)]/10 z-0" style={{ animation: 'spin 20s linear infinite reverse' }}></div>
            <div className="absolute bottom-2 left-2 w-5 h-5 bg-[#4ade80] border-[3px] border-[var(--em2)] rounded-full shadow-[0_0_10px_rgba(74,222,128,.5)] z-20" style={{ animation: 'pulse 2s infinite' }}></div>
          </div>

          <h1 className="text-[34px] font-black text-white tracking-tight mb-2 relative z-10">{state.profile.name}</h1>
          <p className="text-[15px] text-[var(--text3)] mb-5 relative z-10">{state.profile.role} — {state.profile.school}</p>

          <div className="flex justify-center gap-3 mb-7 relative z-10">
            {state.profile.phone && (
              <a href={`tel:${state.profile.phone}`} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-[var(--em7)]/20 hover:text-[var(--em8)] transition-all">
                <i className="ti ti-phone"></i>
              </a>
            )}
            {state.profile.email && (
              <a href={`mailto:${state.profile.email}`} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-[var(--em7)]/20 hover:text-[var(--em8)] transition-all">
                <i className="ti ti-mail"></i>
              </a>
            )}
            {state.profile.twitter && (
              <a href={state.profile.twitter} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-[#1da1f2]/20 hover:text-[#1da1f2] transition-all">
                <i className="ti ti-brand-twitter"></i>
              </a>
            )}
            {state.profile.linkedin && (
              <a href={state.profile.linkedin} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-[#0077b5]/20 hover:text-[#0077b5] transition-all">
                <i className="ti ti-brand-linkedin"></i>
              </a>
            )}
            {state.profile.youtube && (
              <a href={state.profile.youtube} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-[#ff0000]/20 hover:text-[#ff0000] transition-all">
                <i className="ti ti-brand-youtube"></i>
              </a>
            )}
          </div>

          <div className="mb-6 relative z-10">
            <div className="flex flex-col sm:flex-row justify-center gap-0 bg-white/5 border border-[var(--line)] rounded-2xl inline-flex overflow-hidden">
              <div className="py-4 px-8 text-center text-white border-b sm:border-b-0 sm:border-l border-[var(--line)]">
                <div className="text-[28px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-br from-[var(--em8)] to-[var(--gold3)]">{totalEvs}</div>
                <div className="text-[11px] text-[var(--text4)] mt-1">أدلة موثّقة</div>
              </div>
              <div className="py-4 px-8 text-center text-white border-b sm:border-b-0 sm:border-l border-[var(--line)]">
                <div className="text-[28px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-br from-[var(--em8)] to-[var(--gold3)]">{sections.length}</div>
                <div className="text-[11px] text-[var(--text4)] mt-1">قسم</div>
              </div>
              <div className="py-4 px-8 text-center text-white">
                <div className="text-[28px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-br from-[var(--em8)] to-[var(--gold3)]">{state.profile.yearsOfExperience}</div>
                <div className="text-[11px] text-[var(--text4)] mt-1">سنة خبرة</div>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-2 flex-wrap mt-5 relative z-10">
            <div className={`inline-flex items-center gap-1.5 py-1.5 px-4 bg-white/5 border border-white/10 rounded-full text-[12.5px] text-[var(--text2)] backdrop-blur-md cursor-default transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/25 hover:-translate-y-0.5`}>
              <i className={`ti ${stats.levelIcon} text-[var(--gold)] ${stats.isVerified ? 'text-[var(--gold)]' : 'text-[var(--em8)]'}`}></i> ملف إنجاز {stats.levelStr}
            </div>
            <div className="inline-flex items-center gap-1.5 py-1.5 px-4 bg-white/5 border border-white/10 rounded-full text-[12.5px] text-[var(--text2)] backdrop-blur-md cursor-default transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/25 hover:-translate-y-0.5">
              <i className="ti ti-school text-[var(--gold)]"></i> وزارة التعليم
            </div>
            <div className="inline-flex items-center gap-1.5 py-1.5 px-4 bg-white/5 border border-white/10 rounded-full text-[12.5px] text-[var(--text2)] backdrop-blur-md cursor-default transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/25 hover:-translate-y-0.5">
              <i className="ti ti-map-pin text-[var(--gold)]"></i> المملكة العربية السعودية
            </div>
          </div>
        </div>

        <div className="max-w-[1000px] mx-auto py-10 px-4 sm:px-7">
          <div className="mb-6 flex justify-between items-end flex-wrap gap-4">
            <div>
              <h2 className="text-[20px] font-black text-white flex items-center gap-2">
                <i className="ti ti-apps text-[var(--em8)]"></i>
                أقسام الملف
              </h2>
              <p className="text-[13px] text-[var(--text3)] mt-1">اضغط على أي قسم لاستعراض التفاصيل والأدلة الخاصة به</p>
            </div>
          </div>
            
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {chartData.map((data, i) => {
               const target = data.isStrat ? 10 : (data.subs.length + (state.csubs[data.id] || []).length);
               let filled = 0;
               if (data.isStrat) {
                 filled = state.strats.length;
               } else {
                 const allSubs = [...data.subs, ...(state.csubs[data.id] || [])];
                 filled = allSubs.filter(s => (state.ev[`${data.id}|${s}`] || []).length > 0).length;
               }
               const maxTarget = Math.max(target, filled, 1);
               const pct = Math.min(100, Math.round((filled / maxTarget) * 100));

               return (
                 <div 
                   key={data.id} 
                   className="group bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--line)] shadow-lg p-5 cursor-pointer transition-all duration-300 hover:border-[var(--em7)]/40 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,0,0,.3)] relative overflow-hidden"
                   onClick={() => setSelectedSecId(data.id)}
                   style={{ animation: `fadeUp .4s var(--sp) both ${i * 0.05}s` }}
                 >
                   <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-[var(--em4)] to-[var(--em7)] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   
                   <div className="flex items-center gap-4 mb-4 relative z-10">
                     <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--em3)]/20 to-[var(--em5)]/20 text-[var(--em8)] flex items-center justify-center text-[24px] border border-[var(--em7)]/20 group-hover:bg-gradient-to-br group-hover:from-[var(--em4)] group-hover:to-[var(--em7)] group-hover:text-white transition-all duration-300 shrink-0">
                       <i className={`ti ${data.icon}`}></i>
                     </div>
                     <div className="flex-1 min-w-0">
                       <h3 className="text-[15px] font-bold text-white leading-tight overflow-hidden text-ellipsis whitespace-nowrap">{data.fullName}</h3>
                       <p className="text-[12px] text-[var(--text4)] mt-1.5">{data.isStrat ? 'الاستراتيجيات المضافة' : 'الأدلة الموثقة'}: <strong className="text-white">{data.evCount}</strong></p>
                     </div>
                   </div>

                   <div className="relative z-10">
                     <div className="flex justify-between text-[11px] font-bold mb-2">
                       <span className="text-[var(--text3)]">نسبة الاكتمال</span>
                       <span className="text-[var(--em8)]">{pct}%</span>
                     </div>
                     <div className="h-2 w-full bg-[#060f0a] rounded-full overflow-hidden border border-white/5">
                       <div 
                         className="h-full bg-gradient-to-r from-[var(--em4)] to-[var(--em7)] transition-all duration-1000 ease-out rounded-full relative" 
                         style={{ width: `${pct}%` }}
                       >
                         <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent)] animate-[shimmer_2s_infinite]"></div>
                       </div>
                     </div>
                   </div>
                 </div>
               );
            })}
          </div>
        </div>

        {/* RADIAL CHART - Visual Completion */}
        <div className="max-w-[1000px] mx-auto pb-6 px-4 sm:px-7">
          <div className="bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--line)] p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-[18px] font-black text-white flex items-center gap-2">
                <i className="ti ti-chart-donut text-[var(--em8)]"></i>
                نسب اكتمال الأقسام
              </h2>
              <p className="text-[13px] text-[var(--text3)] mt-1">عرض بصري لمدى اكتمال كل قسم من أقسام الملف</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {chartData.map((data, i) => {
                const target = data.isStrat ? 10 : (data.subs.length + (state.csubs[data.id] || []).length);
                let filled = 0;
                if (data.isStrat) {
                  filled = state.strats.length;
                } else {
                  const allSubs = [...data.subs, ...(state.csubs[data.id] || [])];
                  filled = allSubs.filter(s => (state.ev[`${data.id}|${s}`] || []).length > 0).length;
                }
                const pct = Math.min(100, Math.round((filled / Math.max(target, filled, 1)) * 100));
                const colors = ['#10b981','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#f97316','#84cc16','#14b8a6','#6366f1','#e11d48'];
                const color = colors[i % colors.length];
                const circumference = 2 * Math.PI * 28;
                const dashOffset = circumference * (1 - pct / 100);
                return (
                  <div key={data.id} className="flex flex-col items-center gap-2 p-3 bg-white/3 rounded-2xl border border-white/5 hover:border-white/10 transition-all" style={{ animation: `fadeUp .4s var(--sp) both ${i * 0.04}s` }}>
                    <div className="relative w-[70px] h-[70px]">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
                        <circle
                          cx="32" cy="32" r="28"
                          fill="none"
                          stroke={color}
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={dashOffset}
                          style={{ transition: 'stroke-dashoffset 1s ease' }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[14px] font-black text-white">{pct}%</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--text3)] text-center leading-tight font-semibold">{data.name}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showShare && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowShare(false)}></div>
          <div className="relative bg-[var(--surf1)] w-full max-w-sm rounded-[24px] border border-[var(--line)] shadow-2xl flex flex-col overflow-hidden" style={{ animation: 'jumpIn .4s var(--sp) both' }}>
            <div className="flex items-center justify-between py-4 px-6 border-b border-[var(--line)] bg-[var(--surf0)]">
              <h3 className="text-[16px] font-black text-white flex items-center gap-2">
                <i className="ti ti-share text-[var(--em8)]"></i> مشاركة الملف
              </h3>
              <button 
                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text3)] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                onClick={() => setShowShare(false)}
              >
                <i className="ti ti-x text-[16px]"></i>
              </button>
            </div>
            
            <div className="p-6 flex flex-col items-center">
              <div className="bg-white p-4 rounded-2xl mb-5 shadow-[0_8px_30px_rgba(0,0,0,.3)]">
                <QRCodeSVG 
                  value={shareUrl || window.location.href} 
                  size={180} 
                  level="H" 
                  fgColor="#000000" 
                  imageSettings={state.profile.avatar ? {
                    src: state.profile.avatar,
                    x: undefined,
                    y: undefined,
                    height: 40,
                    width: 40,
                    excavate: true,
                  } : undefined}
                />
              </div>
              <p className="text-[13px] text-[var(--text3)] text-center mb-5">امسح الرمز أو انسخ الرابط المباشر لمشاركة ملف الإنجاز — <strong className="text-[var(--em8)]">لا يحتاج تسجيل دخول</strong></p>
              
              <div className="flex w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surf0)]">
                <button 
                  onClick={copyLink}
                  className="bg-[var(--em7)]/20 hover:bg-[var(--em7)]/30 text-[var(--em8)] px-4 py-3 font-bold text-[13px] transition-colors whitespace-nowrap border-l border-[var(--line)] cursor-pointer"
                >
                  {copied ? <i className="ti ti-check text-[16px]"></i> : <i className="ti ti-copy text-[16px]"></i>}
                </button>
                <div className="flex-1 px-4 py-3 text-[12px] text-[var(--text4)] overflow-hidden text-ellipsis whitespace-nowrap bg-[var(--surf0)] text-left" dir="ltr">
                  {shareUrl || window.location.href}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSecId && selectedSecData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSecId(null)}></div>
          <div className="relative bg-[var(--surf1)] w-full max-w-3xl rounded-[24px] border border-[var(--line)] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden" style={{ animation: 'jumpIn .4s var(--sp) both' }}>
            <div className="flex items-center justify-between py-4 px-6 border-b border-[var(--line)] bg-[var(--surf0)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--em7)]/10 text-[var(--em8)] flex items-center justify-center text-[20px]">
                  <i className={`ti ${selectedSecData.icon}`}></i>
                </div>
                <div>
                  <h3 className="text-[16px] font-black text-white">{selectedSecData.fullName}</h3>
                  <p className="text-[12px] text-[var(--text3)] mt-0.5">{selectedSecData.isStrat ? 'الاستراتيجيات المفعلة' : 'الأدلة والشواهد الموثقة'}</p>
                </div>
              </div>
              <button 
                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text3)] hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setSelectedSecId(null)}
              >
                <i className="ti ti-x text-[16px]"></i>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6" dir="rtl">
              {selectedSecData.isStrat ? (
                state.strats.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap gap-2.5">
                      {state.strats.map(s => (
                        <span key={s} className="py-2 px-5 rounded-full text-[14px] font-bold bg-[var(--em7)]/10 text-[var(--em8)] border border-[var(--em7)]/15 flex items-center gap-2">
                          <i className="ti ti-check text-[14px]"></i> {s}
                        </span>
                      ))}
                    </div>
                    {selectedSecData.evs.length > 0 && (
                      <div className="mt-4">
                        <div className="text-[14px] font-bold text-white mb-3 flex items-center gap-2">
                          <i className="ti ti-files text-[var(--em8)]"></i> الشواهد المرفقة للاستراتيجيات:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedSecData.evs.map((e, idx) => {
                            const t = EVT_CONFIG[e.type] || EVT_CONFIG.doc;
                            return (
                              <div 
                                key={idx} 
                                className={`flex items-center gap-3 py-3 px-4 bg-[var(--surf2)] rounded-xl border border-[var(--line)] transition-all duration-250 ${e.url ? 'cursor-pointer hover:border-[var(--em7)]/40 hover:bg-[var(--surf3)] hover:-translate-y-0.5' : ''}`}
                                onClick={() => e.url && setPreviewFile({ name: e.name, url: e.url, type: e.type })}
                                title={e.url ? 'انقر لمعاينة الدليل فوراً' : ''}
                              >
                                <div className={`w-[36px] h-[36px] rounded-lg text-[18px] flex items-center justify-center shrink-0 ${t.cls}`}>
                                  <i className={`ti ${t.icon}`}></i>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[13px] font-bold text-white truncate group-hover:text-[var(--em8)] transition-colors">{e.name}</div>
                                  <div className="text-[11px] text-[var(--text4)] mt-1 truncate">
                                    {e.sub} · {e.date}
                                    {e.url && <span className="text-[var(--em8)] mr-1.5 font-bold"><i className="ti ti-eye"></i> معاينة</span>}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-[24px] text-[var(--text4)] mb-3">
                      <i className="ti ti-ghost"></i>
                    </div>
                    <p className="text-[var(--text3)] text-[14px]">لم يتم تحديد استراتيجيات بعد</p>
                  </div>
                )
              ) : (
                selectedSecData.evs.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedSecData.evs.map((e, idx) => {
                      const t = EVT_CONFIG[e.type] || EVT_CONFIG.doc;
                      return (
                        <div 
                          key={idx} 
                          className={`flex items-center gap-3 py-3 px-4 bg-[var(--surf2)] rounded-xl border border-[var(--line)] transition-all duration-200 ${e.url ? 'cursor-pointer hover:border-[var(--em7)]/40 hover:bg-[var(--surf3)] hover:-translate-y-0.5' : ''}`}
                          onClick={() => e.url && setPreviewFile({ name: e.name, url: e.url, type: e.type })}
                          title={e.url ? 'انقر لمعاينة الدليل فوراً' : ''}
                        >
                          <div className={`w-[40px] h-[40px] rounded-lg text-[20px] flex items-center justify-center shrink-0 ${t.cls}`}>
                            <i className={`ti ${t.icon}`}></i>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-bold text-white truncate group-hover:text-[var(--em8)] transition-colors">{e.name}</div>
                            <div className="text-[11px] text-[var(--text4)] mt-1 truncate">
                              {e.sub} · {e.date}
                              {e.url && <span className="text-[var(--em8)] mr-1.5 font-bold"><i className="ti ti-eye"></i> معاينة</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-[24px] text-[var(--text4)] mb-3">
                      <i className="ti ti-folder-open"></i>
                    </div>
                    <p className="text-[var(--text3)] text-[14px]">لا توجد أدلة موثقة في هذا القسم</p>
                  </div>
                )
              )}
            </div>
            <div className="p-4 border-t border-[var(--line)] bg-[var(--surf0)] flex justify-end">
              <button 
                className="py-2 px-6 rounded-xl bg-white/5 border border-[var(--line2)] text-[13px] font-bold text-white hover:bg-white/10 transition-colors"
                onClick={() => setSelectedSecId(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setPreviewFile(null)}></div>
          <div className="relative bg-[#0c1c12]/95 border border-[var(--em7)]/25 w-full max-w-4xl rounded-[28px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" style={{ animation: 'jumpIn .4s var(--sp) both' }}>
            
            <div className="absolute -top-px right-[15%] left-[15%] h-px bg-gradient-to-r from-transparent via-[var(--em7)] via-[var(--gold)] via-[var(--em7)] to-transparent opacity-60"></div>
            
            <div className="flex items-center justify-between py-4.5 px-7 border-b border-white/10 bg-black/20 relative z-10">
              <div className="flex items-center gap-3">
                <div className={`w-[42px] h-[42px] rounded-xl flex items-center justify-center text-[22px] ${EVT_CONFIG[previewFile.type]?.cls || EVT_CONFIG.doc.cls}`}>
                  <i className={`ti ${EVT_CONFIG[previewFile.type]?.icon || EVT_CONFIG.doc.icon}`}></i>
                </div>
                <div className="min-w-0">
                  <h3 className="text-[16px] font-black text-white truncate max-w-[280px] sm:max-w-[450px]" dir="rtl">{previewFile.name}</h3>
                  <p className="text-[12px] text-[var(--text4)] mt-0.5">معاينة الدليل الرقمي الآمن</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2.5">
                <a 
                  href={previewFile.url} 
                  download={previewFile.name}
                  target="_blank" 
                  rel="noreferrer"
                  className="py-2.5 px-4.5 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white text-[13px] font-bold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(42,122,68,.4)] flex items-center gap-2 no-underline cursor-pointer border-none"
                  title="تحميل الملف للجهاز"
                >
                  <i className="ti ti-download text-[16px]"></i>
                  <span>تحميل</span>
                </a>
                
                <button 
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text3)] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all cursor-pointer"
                  onClick={() => setPreviewFile(null)}
                >
                  <i className="ti ti-x text-[18px]"></i>
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-black/10 flex items-center justify-center">
              {previewFile.type === 'img' && (
                <div className="relative group max-w-full max-h-[68vh] overflow-hidden rounded-2xl shadow-2xl">
                  <img 
                    src={previewFile.url} 
                    alt={previewFile.name} 
                    className="max-w-full max-h-[68vh] object-contain rounded-2xl"
                  />
                </div>
              )}
              
              {previewFile.type === 'pdf' && (
                <div className="w-full h-[68vh] rounded-2xl overflow-hidden bg-[var(--surf2)] shadow-inner">
                  <iframe 
                    src={`${previewFile.url}#toolbar=0`} 
                    className="w-full h-full border-none rounded-2xl" 
                    title={previewFile.name}
                  />
                </div>
              )}
              
              {previewFile.type === 'vid' && (
                <div className="w-full max-h-[68vh] rounded-2xl overflow-hidden shadow-2xl bg-black flex items-center justify-center">
                  <video 
                    src={previewFile.url} 
                    controls 
                    className="max-w-full max-h-[68vh] rounded-2xl"
                  />
                </div>
              )}
              
              {previewFile.type === 'doc' && (
                <div className="text-center p-8 max-w-md bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md shadow-2xl">
                  <div className="w-16 h-16 rounded-2xl bg-[#c4b5fd]/15 text-[#c4b5fd] flex items-center justify-center text-[34px] mx-auto mb-5 border border-[#c4b5fd]/20 animate-pulse">
                    <i className="ti ti-file-text"></i>
                  </div>
                  <h4 className="text-[17px] font-black text-white mb-2.5">معاينة هذا المستند غير متوفرة مباشرة</h4>
                  <p className="text-[13px] text-[var(--text4)] leading-relaxed mb-6">
                    بما أن هذا الملف مستند ميكروسوفت (Word/Excel)، فيرجى الضغط على زر تحميل أدناه لاستعراض كامل محتوياته على جهازك بكل يسر وسهولة.
                  </p>
                  <a 
                    href={previewFile.url} 
                    download={previewFile.name}
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 py-3.5 px-7 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white text-[14px] font-black transition-all duration-300 hover:-translate-y-[3px] hover:shadow-[0_6px_20px_rgba(42,122,68,.5)] no-underline cursor-pointer border-none"
                  >
                    <i className="ti ti-download text-[18px]"></i>
                    تحميل مستند الشاهد
                  </a>
                </div>
              )}
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
