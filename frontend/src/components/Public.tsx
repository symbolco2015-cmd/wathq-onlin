import React, { useState } from 'react';
import type { Evidence, PublicPortfolioState, SectionData } from '../types';
import { calculateEvaluation, getCompletionColor, getCompletionLabel } from '../utils';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient';
import './Public.print.css';

/** تدرج رمادي واحد فقط لوضع الطباعة، تتحكم النسبة بدرجته — لا يُستخدم على
 * الشاشة أبداً، فقط كقيمة لمتغيّر CSS (--print-gray) يُفعَّل عبر @media print.
 * نسبة منخفضة → رمادي فاتح جداً، نسبة عالية → قريب من الأسود. */
function printGray(pct: number): string {
  const clamped = Math.min(100, Math.max(0, pct));
  const v = Math.round(232 - (clamped / 100) * 204);
  const hex = v.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

interface PublicProps {
  state: PublicPortfolioState;
  sections: SectionData[];
  /** When true, this view is accessed via a public share link (no auth required) */
  isSharedView?: boolean;
}

/** يستخرج معرّف فيديو يوتيوب من أي صيغة رابط شائعة (watch؟v=, youtu.be/, embed/, shorts/)،
 * أو null إن لم يكن رابط يوتيوب صالحاً — يُستخدم لبناء مصغّرة img.youtube.com. */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(embed|shorts)\/([^/?]+)/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

/** اسم الدومين فقط (بدون www.) لعرضه بجانب أيقونة رابط عام غير معروف */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const EVT_CONFIG: Record<string, {icon: string, cls: string, label: string}> = {
  pdf: {icon: 'ti-file-type-pdf', cls: 'bg-gradient-to-br from-[#b91c1c]/20 to-[#b91c1c]/10 text-[#f87171] border border-[#b91c1c]/20', label: 'PDF'},
  img: {icon: 'ti-photo', cls: 'bg-gradient-to-br from-[#1d4ed8]/20 to-[#1d4ed8]/10 text-[#93c5fd] border border-[#1d4ed8]/20', label: 'صورة'},
  doc: {icon: 'ti-file-text', cls: 'bg-gradient-to-br from-[#6d28d9]/20 to-[#6d28d9]/10 text-[#c4b5fd] border border-[#6d28d9]/20', label: 'مستند'},
  vid: {icon: 'ti-video', cls: 'bg-gradient-to-br from-[#b45309]/20 to-[#b45309]/10 text-[#fcd34d] border border-[#b45309]/20', label: 'فيديو'}
};

type SectionWithPct = SectionData & {
  fullName: string;
  evCount: number;
  evs: (Evidence & { sub: string })[];
  pct: number;
};

/** صف أيقونات التواصل (هاتف/بريد + روابط اجتماعية) — تُعرض الأيقونة فقط إن
 * كان الحقل المقابل لها غير فارغ. مُستخرج لتجنّب تكرار الشرط الخماسي مرتين
 * بين تخطيط الجوال وتخطيط الديسكتوب (البند 4). */
function SocialIconsRow({ profile, justify }: { profile: PublicPortfolioState['profile']; justify: string }) {
  const links: { key: string; href: string; icon: string; hover: string }[] = [];
  if (profile.phone) links.push({ key: 'phone', href: `tel:${profile.phone}`, icon: 'ti-phone', hover: 'hover:bg-[var(--em7)]/20 hover:text-[var(--em8)]' });
  if (profile.email) links.push({ key: 'email', href: `mailto:${profile.email}`, icon: 'ti-mail', hover: 'hover:bg-[var(--em7)]/20 hover:text-[var(--em8)]' });
  if (profile.twitter) links.push({ key: 'twitter', href: profile.twitter, icon: 'ti-brand-twitter', hover: 'hover:bg-[#1da1f2]/20 hover:text-[#1da1f2]' });
  if (profile.linkedin) links.push({ key: 'linkedin', href: profile.linkedin, icon: 'ti-brand-linkedin', hover: 'hover:bg-[#0077b5]/20 hover:text-[#0077b5]' });
  if (profile.youtube) links.push({ key: 'youtube', href: profile.youtube, icon: 'ti-brand-youtube', hover: 'hover:bg-[#ff0000]/20 hover:text-[#ff0000]' });

  return (
    <div className={`print-decor flex ${justify} gap-3 relative z-10`}>
      {links.map(l => (
        <a
          key={l.key}
          href={l.href}
          {...(l.key !== 'phone' && l.key !== 'email' ? { target: '_blank', rel: 'noreferrer' } : {})}
          className={`w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white transition-all ${l.hover}`}
        >
          <i className={`ti ${l.icon}`}></i>
        </a>
      ))}
    </div>
  );
}

function StatsRow({ totalEvs, sectionsCount, years, justify }: { totalEvs: number; sectionsCount: number; years: number; justify: string }) {
  return (
    <div className={`relative z-10 flex ${justify}`}>
      <div className="flex flex-col sm:flex-row gap-0 bg-white/5 border border-[var(--line)] rounded-2xl inline-flex overflow-hidden">
        <div className="py-4 px-8 text-center text-white border-b sm:border-b-0 sm:border-l border-[var(--line)]">
          <div className="text-[28px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-br from-[var(--em8)] to-[var(--gold3)]">{totalEvs}</div>
          <div className="text-[11px] text-[var(--text4)] mt-1">أدلة موثّقة</div>
        </div>
        <div className="py-4 px-8 text-center text-white border-b sm:border-b-0 sm:border-l border-[var(--line)]">
          <div className="text-[28px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-br from-[var(--em8)] to-[var(--gold3)]">{sectionsCount}</div>
          <div className="text-[11px] text-[var(--text4)] mt-1">قسم</div>
        </div>
        <div className="py-4 px-8 text-center text-white">
          <div className="text-[28px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-br from-[var(--em8)] to-[var(--gold3)]">{years}</div>
          <div className="text-[11px] text-[var(--text4)] mt-1">سنة خبرة</div>
        </div>
      </div>
    </div>
  );
}

function BadgesRow({ stats, justify }: { stats: ReturnType<typeof calculateEvaluation>; justify: string }) {
  return (
    <div className={`flex ${justify} gap-2 flex-wrap relative z-10`}>
      <div className="inline-flex items-center gap-1.5 py-1.5 px-4 bg-white/5 border border-white/10 rounded-full text-[12.5px] text-[var(--text2)] backdrop-blur-md cursor-default transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/25 hover:-translate-y-0.5">
        <i className={`ti ${stats.levelIcon} ${stats.isVerified ? 'text-[var(--gold)]' : 'text-[var(--em8)]'}`}></i> ملف إنجاز {stats.levelStr}
      </div>
      <div className="inline-flex items-center gap-1.5 py-1.5 px-4 bg-white/5 border border-white/10 rounded-full text-[12.5px] text-[var(--text2)] backdrop-blur-md cursor-default transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/25 hover:-translate-y-0.5">
        <i className="ti ti-school text-[var(--gold)]"></i> وزارة التعليم
      </div>
      <div className="inline-flex items-center gap-1.5 py-1.5 px-4 bg-white/5 border border-white/10 rounded-full text-[12.5px] text-[var(--text2)] backdrop-blur-md cursor-default transition-all duration-250 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/25 hover:-translate-y-0.5">
        <i className="ti ti-map-pin text-[var(--gold)]"></i> المملكة العربية السعودية
      </div>
    </div>
  );
}

function Avatar({ profile, size }: { profile: PublicPortfolioState['profile']; size: number }) {
  return (
    <div className="inline-block relative z-10" style={{ width: size, height: size }}>
      <div
        className="print-avatar rounded-full bg-gradient-to-br from-[var(--em3)] to-[var(--em6)] text-white inline-flex items-center justify-center font-black border-2 border-white/15 shadow-[0_0_0_8px_rgba(42,122,68,.1),0_0_0_16px_rgba(42,122,68,.05),0_20px_60px_rgba(0,0,0,.5)] relative z-10 bg-cover bg-center overflow-hidden"
        style={{ width: size, height: size, fontSize: size * 0.39, ...(profile.avatar ? { backgroundImage: `url(${profile.avatar})` } : {}) }}
      >
        {!profile.avatar && profile.name.substring(0, 2)}
      </div>
      <div className="print-decor absolute -inset-3 rounded-full border border-[var(--gold)]/20 z-0" style={{ animation: 'spin 12s linear infinite' }}></div>
      <div className="print-decor absolute -inset-5 rounded-full border border-[var(--em7)]/10 z-0" style={{ animation: 'spin 20s linear infinite reverse' }}></div>
      <div className="print-decor absolute bottom-2 left-2 w-5 h-5 bg-[#4ade80] border-[3px] border-[var(--em2)] rounded-full shadow-[0_0_10px_rgba(74,222,128,.5)] z-20" style={{ animation: 'pulse 2s infinite' }}></div>
    </div>
  );
}

/** بطاقة قسم واحدة — تُستخدم لكل من الأقسام النشطة (المستوى 2) والأقسام
 * الفارغة الموسّعة (المستوى 3)، حتى لا يتكرر تصميم البطاقة في أكثر من مكان.
 * اللون مأخوذ بالكامل من getCompletionColor(pct) في utils.ts. */
function SectionCard({ sec, isTop, onClick, style }: { sec: SectionWithPct; isTop?: boolean; onClick: () => void; style?: React.CSSProperties }) {
  const color = getCompletionColor(sec.pct);
  // العمق التراكمي = إجمالي الأدلة (evCount) ÷ عدد المؤشرات الفرعية المغطاة تراكمياً
  const filledSubsCount = new Set(sec.evs.map(e => e.sub)).size;
  const depth = filledSubsCount > 0 ? sec.evCount / filledSubsCount : 0;
  return (
    <div
      className={`print-card group bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl shadow-lg cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,0,0,.3)] relative overflow-hidden ${isTop ? 'p-6 border-2' : 'p-5 border'}`}
      style={{ borderColor: isTop ? color : 'var(--line)', ...style }}
      onClick={onClick}
      title={depth > 1 ? `متوسط ${depth.toFixed(1)} دليل لكل مؤشر مغطى` : undefined}
    >
      {(isTop || sec.evCount > 3) && (
        <div className="print-decor absolute top-3 left-3 z-20 flex flex-row items-center gap-1.5">
          {isTop && (
            <div className="flex items-center gap-1 py-0.5 px-2 rounded-full text-[9px] font-black text-white shrink-0" style={{ backgroundColor: color }}>
              <i className="ti ti-trophy text-[10px]"></i> أبرز إنجاز
            </div>
          )}
          {/* شارة "تجاوز الهدف" — الرقم المطلق للأدلة التراكمية (لا "+N") لأن
              الجمهور الخارجي لا يعرف سقف الهدف الشهري الداخلي؛ تظهر فقط إن > 3 */}
          {sec.evCount > 3 && (
            <div className="flex items-center justify-center gap-[1px] rounded-full text-[var(--gold)] bg-[var(--gold)]/15 border border-[var(--gold)]/30 shrink-0" style={{ width: 24, height: 24 }}>
              <i className="ti ti-bolt text-[9px]"></i>
              <span className="text-[9px] font-black leading-none">{sec.evCount}</span>
            </div>
          )}
        </div>
      )}
      <div className="print-decor absolute top-0 left-0 w-full h-[3px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: color }}></div>

      <div className="flex items-center gap-4 mb-4 relative z-10">
        <div
          className={`print-decor rounded-2xl flex items-center justify-center border shrink-0 transition-all duration-300 ${isTop ? 'w-14 h-14 text-[28px]' : 'w-12 h-12 text-[24px]'}`}
          style={{ color, borderColor: `${color}40`, background: `${color}1a` }}
        >
          <i className={`ti ${sec.icon}`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-white leading-tight overflow-hidden text-ellipsis whitespace-nowrap ${isTop ? 'text-[16.5px]' : 'text-[15px]'}`}>{sec.fullName}</h3>
          <p className="text-[12px] text-[var(--text4)] mt-1.5">{sec.isStrat ? 'الاستراتيجيات المضافة' : 'الأدلة الموثقة'}: <strong className="text-white">{sec.evCount}</strong></p>
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between text-[11px] font-bold mb-2">
          <span className="text-[var(--text3)]">نسبة الاكتمال</span>
          <span style={{ color }}>{sec.pct}%</span>
        </div>
        <div className="print-progress-track h-2 w-full bg-[#060f0a] rounded-full overflow-hidden border border-white/5">
          <div
            className="print-progress-fill h-full transition-all duration-1000 ease-out rounded-full relative"
            style={{ width: `${sec.pct}%`, backgroundColor: color, '--print-gray': printGray(sec.pct) } as React.CSSProperties}
          >
            <div className="print-decor absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent)] animate-[shimmer_2s_infinite]"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** مصغّرة دليل واحد ضمن بطاقة الاستراتيجيات — صورة فعلية / مصغّرة يوتيوب /
 * أيقونة ملف+اسم / أيقونة رابط+دومين / أيقونة ملاحظة، حسب نوع الدليل ورابطه. */
function EvidenceThumb({ e }: { e: Evidence }) {
  if (e.type === 'img' && e.url) {
    return <img src={e.url} alt={e.name} className="w-full h-[88px] object-cover rounded-xl border border-white/10" />;
  }

  const ytId = e.url ? extractYouTubeId(e.url) : null;
  if (ytId) {
    return (
      <a href={e.url} target="_blank" rel="noreferrer" className="block relative group">
        <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={e.name} className="w-full h-[88px] object-cover rounded-xl border border-white/10" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors rounded-xl">
          <i className="ti ti-player-play-filled text-white text-[26px] drop-shadow-lg"></i>
        </span>
      </a>
    );
  }

  if (e.type === 'pdf' || e.type === 'vid') {
    const t = EVT_CONFIG[e.type];
    return (
      <a
        {...(e.url ? { href: e.url, target: '_blank', rel: 'noreferrer' } : {})}
        className={`flex items-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 ${e.url ? 'hover:bg-white/10 cursor-pointer' : ''}`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[16px] shrink-0 ${t.cls}`}>
          <i className={`ti ${t.icon}`}></i>
        </div>
        <span className="text-[12px] font-bold text-white truncate">{e.name}</span>
      </a>
    );
  }

  if (e.type === 'doc' && e.url) {
    return (
      <a href={e.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-[var(--em8)] hover:bg-white/10 transition-colors">
        <i className="ti ti-link text-[18px]"></i>
        <span className="text-[12px] font-bold truncate" dir="ltr">{getDomain(e.url)}</span>
      </a>
    );
  }

  // ملاحظة نصية بلا رابط أو ملف
  return (
    <div className="flex items-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-[var(--text3)]">
      <i className="ti ti-notes text-[18px]"></i>
      <span className="text-[12px] font-bold truncate">{e.name}</span>
    </div>
  );
}

/** الحقول السياقية الخمسة لدليل استراتيجية — تُعرض فقط إن وُجدت قيمة لها؛
 * الأدلة القديمة بلا هذي الحقول لا تُعرض لها أي شارة (لا "غير محدد" مكرّرة). */
function EvidenceContextTags({ e }: { e: Evidence }) {
  const hasContext = !!(e.stratDate || e.stratStage || e.stratGrade || e.stratPeriod != null || e.stratSubject);
  if (!hasContext) return null;

  const tag = (icon: string, label: string) => (
    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-[var(--text4)] bg-white/5 border border-white/10 rounded-md py-0.5 px-1.5">
      <i className={`ti ${icon} text-[9.5px]`}></i> {label}
    </span>
  );

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {e.stratDate && tag('ti-calendar', e.stratDate)}
      {e.stratStage && tag('ti-school', e.stratStage)}
      {e.stratGrade && tag('ti-users', e.stratGrade)}
      {e.stratPeriod != null && tag('ti-clock', `الحصة ${e.stratPeriod}`)}
      {e.stratSubject && tag('ti-book', e.stratSubject)}
    </div>
  );
}

export default function Public({ state, sections, isSharedView }: PublicProps) {
  const [selectedSecId, setSelectedSecId] = useState<number | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [printDate, setPrintDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [previewFile, setPreviewFile] = useState<{
    name: string;
    url: string;
    type: 'pdf' | 'img' | 'doc' | 'vid';
  } | null>(null);

  const stats = calculateEvaluation(state, sections);
  const totalEvs = stats.totalEvs;

  // قسم "التنويع في استراتيجيات التدريس" مُستبعد كلياً من نظام النسب (المستويات
  // 1-2-3 أدناه) — له بطاقة طولية مستقلة بلا أي رقم نسبة (انظر أسفل الصفحة).
  const stratSection = sections.find(s => s.isStrat) ?? null;
  const nonStratSections = sections.filter(s => !s.isStrat);

  const chartData = nonStratSections.map(sec => {
    const allSubs = [...sec.subs, ...(state.csubs[sec.id] || [])];
    const evs = allSubs.flatMap(s => (state.ev[`${sec.id}|${s}`] || []).map(e => ({ ...e, sub: s })));

    return {
      ...sec,
      name: sec.ttl.split(' ')[0] + (sec.ttl.split(' ')[1] ? ' ' + sec.ttl.split(' ')[1] : ''),
      fullName: sec.ttl,
      evCount: evs.length,
      evs,
    };
  });

  // المستويات الثلاثة (البند 3) تُبنى جميعها من نفس حساب pct لكل قسم — منطق
  // التغطية نفسه المستخدم سابقاً (target/filled/maxTarget) بلا أي تغيير، فقط
  // محسوب مرة واحدة هنا بدل تكراره في كل من شبكة البطاقات والدوائر القديمة.
  // (قسم الاستراتيجيات isStrat مُستبعد أصلاً من nonStratSections أعلاه)
  const sectionsWithPct: SectionWithPct[] = chartData.map(data => {
    const target = data.subs.length + (state.csubs[data.id] || []).length;
    const allSubs = [...data.subs, ...(state.csubs[data.id] || [])];
    const filled = allSubs.filter(s => (state.ev[`${data.id}|${s}`] || []).length > 0).length;
    const maxTarget = Math.max(target, filled, 1);
    const pct = Math.min(100, Math.round((filled / maxTarget) * 100));
    return { ...data, pct };
  });

  // مؤشر الجاهزية الإجمالي (المستوى 1) — متوسط pct عبر كل الأقسام، بما فيها الفارغة
  const overallPct = Math.round(sectionsWithPct.reduce((sum, s) => sum + s.pct, 0) / sectionsWithPct.length);

  // تنازلياً بـpct، وعند التساوي (شائع بسبب سقف maxTarget أعلاه) يُرجَّح القسم
  // الأعلى إجمالي أدلة تراكمية (evCount) — يعكس عمق التوثيق الفعلي رغم تساوي النسبة
  const activeSecs = sectionsWithPct.filter(s => s.pct > 0).sort((a, b) => {
    const pctDiff = b.pct - a.pct;
    if (pctDiff !== 0) return pctDiff;
    return b.evCount - a.evCount;
  });
  const emptySecs = sectionsWithPct.filter(s => s.pct === 0);

  const exportToPDF = () => {
    // تاريخ التصدير الفعلي لحظة الطباعة (وليس تاريخاً ثابتاً من لحظة تحميل
    // الصفحة) — يُحدَّث في الترويسة المخصّصة لوضع الطباعة قبل فتح حوار الطباعة.
    setPrintDate(new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }));
    // ننتظر دورة رسم واحدة (requestAnimationFrame) لضمان وصول التاريخ الجديد
    // إلى الـDOM قبل أن يأخذ المتصفح "لقطته" الخاصة بحوار الطباعة.
    requestAnimationFrame(() => window.print());
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

  const selectedSecData = selectedSecId ? sectionsWithPct.find(c => c.id === selectedSecId) : null;

  return (
    <div>
      <div id="public-portfolio-content" className="bg-[#060f0a] min-h-screen">
        {/* ترويسة خاصة بوضع الطباعة فقط — مخفية دائماً على الشاشة (انظر Public.print.css) */}
        <div className="print-header-block">
          <div className="print-header-row">
            <div>
              <div className="print-header-name">{state.profile.name}</div>
              <div className="print-header-meta">{state.profile.role} — {state.profile.school}</div>
            </div>
            <div className="print-header-brand">
              <div className="print-header-title">وثّق — ملف الإنجاز الرقمي</div>
              <div className="print-header-date">{printDate}</div>
              <div className="print-header-url">wathq.online</div>
            </div>
          </div>
          <div className="print-header-rule"></div>
        </div>

        <div className="print-hero relative overflow-hidden bg-gradient-to-br from-[var(--em1)] via-[var(--em2)] to-[rgba(20,60,35,.9)] pt-20 px-8 pb-16 text-center">

          <div id="pdf-action-buttons" className="absolute top-6 left-6 z-20 flex gap-2 print:hidden">
            <button
              onClick={exportToPDF}
              className="flex items-center gap-2 py-2 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[13px] font-bold transition-all backdrop-blur-md cursor-pointer"
            >
              <i className="ti ti-download text-[16px]"></i>
              <span className="hidden sm:inline">تصدير PDF</span>
            </button>
            <button
              onClick={handleOpenShare}
              className="flex items-center gap-2 py-2 px-4 rounded-xl bg-[var(--em7)]/20 hover:bg-[var(--em7)]/40 border border-[var(--em7)]/30 text-white text-[13px] font-bold transition-all cursor-pointer backdrop-blur-md"
            >
              <i className="ti ti-share text-[16px]"></i>
              <span className="hidden sm:inline">مشاركة</span>
            </button>
          </div>

          <div className="print-decor absolute inset-0 z-0 bg-[linear-gradient(rgba(82,196,120,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(82,196,120,.04)_1px,transparent_1px)] bg-[length:40px_40px]"></div>
          <div className="print-decor absolute w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(82,196,120,.15),transparent_70%)] -top-50 left-1/2 -translate-x-1/2 pointer-events-none z-0"></div>

          {/* تخطيط الجوال (الحالي والمستقر) — يبقى دون أي تغيير، مخفي من lg فصاعداً */}
          <div className="lg:hidden">
            <div className="mb-7">
              <Avatar profile={state.profile} size={112} />
            </div>

            <h1 className="text-[34px] font-black text-white tracking-tight mb-2 relative z-10">{state.profile.name}</h1>
            <p className="text-[15px] text-[var(--text3)] mb-5 relative z-10">{state.profile.role} — {state.profile.school}</p>

            <div className="mb-7">
              <SocialIconsRow profile={state.profile} justify="justify-center" />
            </div>

            <div className="mb-6">
              <StatsRow totalEvs={totalEvs} sectionsCount={sections.length} years={state.profile.yearsOfExperience} justify="justify-center" />
            </div>

            <div className="mt-5">
              <BadgesRow stats={stats} justify="justify-center" />
            </div>
          </div>

          {/* تخطيط الديسكتوب الجديد (البند 4): الصورة يسار البطاقة مرفوعة عن
              المنتصف، البيانات النصية يمين البطاقة — flex-row-reverse يضع أول
              عنصر (الصورة) على يسار البطاقة فعلياً داخل سياق RTL. */}
          <div className="hidden lg:flex lg:flex-row-reverse lg:items-start lg:justify-center lg:gap-12 lg:max-w-4xl lg:mx-auto lg:text-right">
            <div className="lg:mt-3 lg:shrink-0">
              <Avatar profile={state.profile} size={132} />
            </div>

            <div className="flex-1 flex flex-col gap-5 items-end">
              <div>
                <h1 className="text-[34px] font-black text-white tracking-tight mb-2 relative z-10">{state.profile.name}</h1>
                <p className="text-[15px] text-[var(--text3)] relative z-10">{state.profile.role} — {state.profile.school}</p>
              </div>

              <SocialIconsRow profile={state.profile} justify="justify-end" />
              <StatsRow totalEvs={totalEvs} sectionsCount={sections.length} years={state.profile.yearsOfExperience} justify="justify-end" />
              <BadgesRow stats={stats} justify="justify-end" />
            </div>
          </div>
        </div>

        <div className="max-w-[1000px] mx-auto py-10 px-4 sm:px-7">

          {/* المستوى 1: مؤشر الجاهزية الإجمالي — بارز فوق كل شيء */}
          <div className="print-card mb-8 bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--line)] shadow-lg p-6 sm:p-8 relative overflow-hidden">
            <div className="print-decor absolute top-0 left-0 w-full h-[4px]" style={{ backgroundColor: getCompletionColor(overallPct) }}></div>
            <div className="flex items-center justify-between flex-wrap gap-4 mb-4 relative z-10">
              <div>
                <h2 className="text-[15px] font-bold text-[var(--text3)] flex items-center gap-2">
                  <i className="ti ti-gauge text-[var(--em8)]"></i> مؤشر الجاهزية العام
                </h2>
                <p className="text-[12px] text-[var(--text4)] mt-1">متوسط نسبة الاكتمال عبر {sectionsWithPct.length} مجالات أساسية</p>
              </div>
              <div className="text-[40px] sm:text-[48px] font-black leading-none" style={{ color: getCompletionColor(overallPct) }}>{overallPct}%</div>
            </div>
            <div className="print-progress-track h-3.5 w-full bg-[#060f0a] rounded-full overflow-hidden border border-white/5 relative z-10">
              <div
                className="print-progress-fill h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${overallPct}%`, backgroundColor: getCompletionColor(overallPct), '--print-gray': printGray(overallPct) } as React.CSSProperties}
              ></div>
            </div>
            <div className="mt-3 text-[12.5px] font-bold relative z-10" style={{ color: getCompletionColor(overallPct) }}>{getCompletionLabel(overallPct)}</div>
          </div>

          <div className="mb-6 flex justify-between items-end flex-wrap gap-4">
            <div>
              <h2 className="text-[20px] font-black text-white flex items-center gap-2">
                <i className="ti ti-apps text-[var(--em8)]"></i>
                أقسام الملف
              </h2>
              <p className="text-[13px] text-[var(--text3)] mt-1">اضغط على أي قسم لاستعراض التفاصيل والأدلة الخاصة به</p>
            </div>
          </div>

          {/* المستوى 2: الأقسام النشطة، مرتبة تنازلياً، أبرزها يحصل على تمييز بصري */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSecs.map((sec, i) => (
              <SectionCard
                key={sec.id}
                sec={sec}
                isTop={i === 0}
                onClick={() => setSelectedSecId(sec.id)}
                style={{ animation: `fadeUp .4s var(--sp) both ${i * 0.05}s` }}
              />
            ))}
          </div>

          {/* المستوى 3: الأقسام الفارغة — سطر مختصر قابل للتوسيع على الشاشة */}
          {emptySecs.length > 0 && (
            <div className="print:hidden mt-5">
              <button
                onClick={() => setShowEmpty(v => !v)}
                className="w-full flex items-center justify-between gap-3 py-3.5 px-5 bg-white/3 hover:bg-white/5 border border-[var(--line)] rounded-2xl text-[13px] font-bold text-[var(--text3)] transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <i className="ti ti-folder-plus text-[var(--em8)]"></i>
                  +{emptySecs.length} مجالات أخرى قيد التطوير
                </span>
                <i className={`ti ti-chevron-down transition-transform duration-300 ${showEmpty ? 'rotate-180' : ''}`}></i>
              </button>
              <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-hidden transition-all duration-300 ${showEmpty ? 'mt-4 max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {emptySecs.map(sec => (
                  <SectionCard key={sec.id} sec={sec} onClick={() => setSelectedSecId(sec.id)} />
                ))}
              </div>
            </div>
          )}

          {/* نسخة الطباعة فقط: تعرض كل الأقسام الفارغة كبطاقات مباشرة بدون أكورديون */}
          {emptySecs.length > 0 && (
            <div className="hidden print:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {emptySecs.map(sec => (
                <SectionCard key={`print-${sec.id}`} sec={sec} onClick={() => setSelectedSecId(sec.id)} />
              ))}
            </div>
          )}

          {/* بطاقة استراتيجيات التدريس — مستقلة كلياً عن نظام النسب أعلاه، بدون أي رقم نسبة */}
          {stratSection && (
            <div className="print-card mt-8 bg-gradient-to-br from-[var(--surf1)] to-[var(--surf2)] rounded-3xl border border-[var(--gold)]/20 shadow-lg p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-2">
                <i className="ti ti-bulb text-[var(--gold)] text-[20px]"></i>
                <h2 className="text-[18px] font-black text-white">استراتيجيات التدريس المتنوعة</h2>
              </div>

              {state.strats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-[22px] text-[var(--text4)] mb-3">
                    <i className="ti ti-bulb-off"></i>
                  </div>
                  <p className="text-[var(--text3)] text-[13.5px]">لا توجد استراتيجيات مسجّلة بعد</p>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {state.strats.map(name => {
                    const evs = state.ev[`${stratSection.id}|strat:${name}`] || [];
                    return (
                      <div key={name} className="bg-white/5 rounded-2xl p-4 border border-[var(--gold)]/10">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full bg-[var(--gold)] shrink-0"></div>
                          <span className="text-[14px] font-bold text-white">{name}</span>
                          {evs.length > 0 && <span className="text-[11px] font-black text-[var(--gold)] bg-[var(--gold)]/10 px-2 py-0.5 rounded-md">{evs.length} شواهد</span>}
                        </div>
                        {evs.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {evs.map((e, idx) => (
                              <div key={idx}>
                                <EvidenceThumb e={e} />
                                <EvidenceContextTags e={e} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[12px] text-[var(--text4)] italic">لا توجد شواهد مرفقة لهذه الاستراتيجية حالياً.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
