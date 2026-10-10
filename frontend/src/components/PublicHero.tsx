// رأس الصفحة العامة — .hero في pub() بـ docs/design/wathq-prototype.html.
// عرض فقط: كل الأرقام تُحسب في Public.tsx وتصل جاهزة.
import { useId } from 'react';
import type { PublicPortfolioState } from '../types';
import { formatDate } from '../utils';
import { BTN_SM } from './SectionView';

/** تحت هذه النسبة تُعرض بطاقة «ملف في بدايته» بدل الحلقة (النموذج) */
const EARLY_PCT = 25;
/** النبذة لا تُعرض قبل هذا العدد من الشواهد (النموذج) */
const BIO_MIN_EVS = 5;

const RING_SIZE = 96;
const RING_STROKE = 9;

/** لون الحلقة من ألوان الحالة فقط — لا أحمر */
function ringColor(pct: number): string {
  if (pct >= 100) return 'var(--st-gold)';
  if (pct >= 50) return 'var(--accent)';
  return 'var(--prog)';
}

/** رابط واتساب من رقم المعلم: أرقام فقط، و05… أو 5… ⇐ 9665…، و00… ⇐ بلا الصفرين */
function toWhatsAppUrl(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('05')) digits = `966${digits.slice(1)}`;
  else if (digits.startsWith('5') && digits.length === 9) digits = `966${digits}`;
  return digits ? `https://wa.me/${digits}` : null;
}

/** رابط خارجي يكتبه المعلم: http(s) كما هو، وغيره يُسبق بـ https:// (لا javascript:) */
function externalUrl(value: string): string {
  const v = value.trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^[a-z]+:\/*/i, '')}`;
}

/** نقش PAT من النموذج — المعرّفات من useId حتى لا تتصادم */
function HeroPattern() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const pat = `pk${uid}`, grad = `pm${uid}`, mask = `pmk${uid}`;
  return (
    <svg aria-hidden="true" className="print-decor absolute inset-0 w-full h-full pointer-events-none">
      <defs>
        <pattern id={pat} width="56" height="56" patternUnits="userSpaceOnUse">
          {/* rgba(255,255,255,.06) من النموذج — لا رمز مقابل في DESIGN.md (--bd = .08) */}
          <g fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1">
            <path d="M28 6 34 22 50 28 34 34 28 50 22 34 6 28 22 22Z" />
            <rect x="16" y="16" width="24" height="24" transform="rotate(45 28 28)" />
            <rect x="16" y="16" width="24" height="24" />
          </g>
        </pattern>
        <radialGradient id={grad} cx="80%" cy="10%" r="75%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={mask}>
          <rect width="100%" height="100%" fill={`url(#${grad})`} />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${pat})`} mask={`url(#${mask})`} />
    </svg>
  );
}

/** حلقة الجاهزية — اللون عبر currentColor، فتأخذ الطباعة لون النص الموحّد تلقائياً */
function ReadinessRing({ pct }: { pct: number }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const half = RING_SIZE / 2;
  return (
    <div
      role="img"
      aria-label={`نسبة الجاهزية ${pct}%`}
      className="relative shrink-0"
      style={{ width: RING_SIZE, height: RING_SIZE, color: ringColor(pct) }}
    >
      <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} width={RING_SIZE} height={RING_SIZE} aria-hidden="true">
        <circle cx={half} cy={half} r={r} fill="none" stroke="var(--bd)" strokeWidth={RING_STROKE} />
        <circle
          cx={half} cy={half} r={r} fill="none"
          stroke="currentColor" strokeWidth={RING_STROKE} strokeLinecap="round"
          strokeDasharray={`${(c * Math.min(100, Math.max(0, pct))) / 100} ${c}`}
          transform={`rotate(-90 ${half} ${half})`}
        />
      </svg>
      <b className="absolute inset-0 flex flex-col items-center justify-center text-[length:var(--fs-xl)] font-bold text-[var(--t1)] leading-tight">
        {pct}%
        <small className="text-[length:var(--fs-xs)] font-normal text-[var(--t3)]">تغطية المعايير</small>
      </b>
    </div>
  );
}

/** خانة رقم + تسمية (.pst) */
function StatTile({ value, suffix, label }: { value: number; suffix?: string; label: string }) {
  return (
    // rgba(0,0,0,.2) من النموذج — لا رمز مقابل في DESIGN.md
    <div className="text-center py-2 px-1 rounded-[var(--r-sm)] bg-[rgba(0,0,0,.2)] print:bg-white print:border">
      <b className="block text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">
        {value}
        {suffix && <small className="text-[length:var(--fs-xs)] font-normal text-[var(--t3)]">{suffix}</small>}
      </b>
      <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">{label}</span>
    </div>
  );
}

// مربعات التواصل 40px. after: مساحة ضغط 44px دون تغيير الشكل (2px من كل جهة)،
// والمسافة بينها gap-2 = 8px فيبقى 4px بين كل مربعين في الاتجاهين.
const CONTACT_BOX = 'w-10 h-10 rounded-[var(--r-sm)] bg-[var(--s2)] border border-[var(--bd2)] flex items-center justify-center text-[20px] text-[var(--t1)] no-underline transition-colors duration-150 motion-reduce:transition-none hover:border-[var(--t3)] relative after:absolute after:-inset-0.5';

function ContactLinks({ profile }: { profile: PublicPortfolioState['profile'] }) {
  const email = profile.email?.trim();
  const twitter = profile.twitter?.trim();
  const linkedin = profile.linkedin?.trim();
  const youtube = profile.youtube?.trim();
  const phone = profile.phone?.trim();
  const waUrl = phone ? toWhatsAppUrl(phone) : null;
  const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

  if (!email && !twitter && !linkedin && !youtube && !waUrl) return null;
  return (
    <div className="print-decor flex flex-wrap gap-2 mt-4">
      {email && (
        <a href={`mailto:${email}`} aria-label="البريد الإلكتروني" className={CONTACT_BOX}><i className="ti ti-mail" /></a>
      )}
      {twitter && (
        <a href={externalUrl(twitter)} {...external} aria-label="X" className={CONTACT_BOX}><i className="ti ti-brand-x" /></a>
      )}
      {linkedin && (
        <a href={externalUrl(linkedin)} {...external} aria-label="لينكدإن" className={CONTACT_BOX}><i className="ti ti-brand-linkedin" /></a>
      )}
      {youtube && (
        <a href={externalUrl(youtube)} {...external} aria-label="يوتيوب" className={CONTACT_BOX}><i className="ti ti-brand-youtube" /></a>
      )}
      {waUrl && phone && (
        <a
          href={waUrl}
          {...external}
          aria-label={`واتساب ${phone}`}
          dir="ltr"
          className={`${CONTACT_BOX} w-auto px-3 gap-2 text-[length:var(--fs-sm)] font-bold`}
        >
          <i className="ti ti-brand-whatsapp text-[20px]" />{phone}
        </a>
      )}
    </div>
  );
}

const AVATAR_SIZE = 74;
const AVATAR_RING = 'shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand-gold)_35%,transparent)]';

function HeroAvatar({ profile }: { profile: PublicPortfolioState['profile'] }) {
  if (profile.avatar) {
    return (
      <img
        src={profile.avatar}
        alt={profile.name}
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        className={`print-avatar shrink-0 rounded-[var(--r-full)] object-cover ${AVATAR_RING}`}
        style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
      />
    );
  }
  return (
    <span
      className={`print-avatar shrink-0 rounded-[var(--r-full)] flex items-center justify-center bg-[var(--s2)] text-[var(--t1)] text-[length:var(--fs-xl)] font-bold ${AVATAR_RING}`}
      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
    >
      {profile.name.substring(0, 2)}
    </span>
  );
}

/** سطر فترة التقرير + تاريخ التوليد — وضع ?report= فقط */
function ReportPeriodBanner({ periodLabel, generatedAt }: { periodLabel: string; generatedAt: string }) {
  return (
    <div className="inline-flex flex-col gap-1 mb-4 py-2 px-4 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand-gold)_35%,transparent)]">
      <span className="flex items-center gap-2 text-[length:var(--fs-sm)] font-bold text-[var(--brand-gold)]">
        <i className="ti ti-file-report text-[16px]" /> {periodLabel}
      </span>
      <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">تقرير مُولَّد بتاريخ {formatDate(generatedAt, 'long')}</span>
    </div>
  );
}

// زرا الرأس 36px: مساحة ضغط عمودية فقط إلى 44px، فلا تتداخل مع الزر المجاور
const HERO_BTN = `${BTN_SM} relative after:absolute after:-inset-y-1 after:inset-x-0`;

interface PublicHeroProps {
  profile: PublicPortfolioState['profile'];
  /** get_portfolio_completion عبر get_shared_portfolio، أو لقطة التقرير */
  completion?: PublicPortfolioState['completion'];
  aiSummary?: string | null;
  /** الشواهد المعروضة في الصفحة */
  totalEvs: number;
  /** البنود العادية التي فيها شاهد واحد على الأقل */
  coveredCount: number;
  totalSections: number;
  reportMeta?: { periodLabel: string; generatedAt: string };
  onExportPdf: () => void;
  onShare: () => void;
}

export default function PublicHero({ profile, completion, aiSummary, totalEvs, coveredCount, totalSections, reportMeta, onExportPdf, onShare }: PublicHeroProps) {
  const pct = completion?.overall_pct ?? 0;
  // تقرير قديم بلا جاهزية مخبوزة ⇐ لا حلقة ولا بطاقة بداية، الخانات فقط
  const hideReadiness = !!reportMeta && !completion;
  const early = pct < EARLY_PCT;
  const roleLine = [
    profile.role?.trim(),
    profile.school?.trim(),
    profile.yearsOfExperience > 0 ? `${profile.yearsOfExperience} سنة خبرة` : '',
  ].filter(Boolean).join(' · ');
  const bio = aiSummary?.trim() && totalEvs >= BIO_MIN_EVS ? aiSummary.trim() : '';
  const areasSuffix = `/${totalSections}`;

  return (
    <header className="print-hero relative overflow-hidden bg-[var(--brand)] px-4 pt-6 pb-6 lg:px-8 lg:pb-8">
      <HeroPattern />

      <div className="relative max-w-[1100px] mx-auto">
        <div id="pdf-action-buttons" className="flex justify-end gap-2 mb-4 print:hidden">
          <button type="button" onClick={onExportPdf} className={HERO_BTN}>
            <i className="ti ti-download text-[16px]" />تصدير PDF
          </button>
          <button type="button" onClick={onShare} className={HERO_BTN}>
            <i className="ti ti-share text-[16px]" />مشاركة
          </button>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
          <div className="flex-1 min-w-0">
            {reportMeta && <ReportPeriodBanner periodLabel={reportMeta.periodLabel} generatedAt={reportMeta.generatedAt} />}

            <div className="flex items-center gap-4">
              <HeroAvatar profile={profile} />
              <div className="min-w-0">
                <h1 className="text-[length:var(--fs-xl)] font-bold text-[var(--t1)] leading-[1.35] break-words">{profile.name}</h1>
                {roleLine && <div className="text-[length:var(--fs-sm)] text-[var(--t2)] mt-1">{roleLine}</div>}
                <span className="print-decor inline-flex items-center gap-1 mt-2 py-1 px-3 rounded-[var(--r-full)] text-[length:var(--fs-xs)] font-bold text-[var(--brand-gold)] bg-[color-mix(in_srgb,var(--brand-gold)_12%,transparent)]">
                  <i className="ti ti-rosette-discount-check text-[16px]" />ملف موثّق عبر وثّق
                </span>
              </div>
            </div>

            {bio && (
              <div className="mt-4 max-w-[620px] border-r-[3px] border-[var(--brand-gold)] pr-3 text-[length:var(--fs-sm)] leading-[1.95] text-[var(--t2)]">
                {bio}
                <small className="flex items-center gap-1 mt-1 text-[length:var(--fs-xs)] text-[var(--t3)]">
                  <i className="ti ti-sparkles text-[16px]" /> نبذة مولّدة من شواهد المعلم
                </small>
              </div>
            )}

            <ContactLinks profile={profile} />
          </div>

          <div className="print-card w-full lg:w-[340px] shrink-0 p-4 rounded-[var(--r-lg)] bg-[var(--s1)] border border-[var(--bd2)]">
            {!hideReadiness && (early ? (
              <>
                {reportMeta && <div className="mb-2 text-[length:var(--fs-xs)] text-[var(--t3)]">جاهزية الفترة</div>}
                <div className="flex items-center gap-4" role="img" aria-label={`نسبة الجاهزية ${pct}%، ملف في بدايته`}>
                  <div className="w-16 h-16 shrink-0 rounded-[var(--r-full)] flex items-center justify-center text-[32px] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
                    <i className="ti ti-seeding" />
                  </div>
                  <div>
                    <h3 className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">ملف في بدايته</h3>
                    <p className="mt-1 text-[length:var(--fs-xs)] leading-[1.7] text-[var(--t3)]">يُحدَّث باستمرار مع كل شاهد جديد.</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <ReadinessRing pct={pct} />
                <div>
                  <h3 className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">{reportMeta ? 'جاهزية الفترة' : 'جاهزية ملف الإنجاز'}</h3>
                  <p className="mt-1 text-[length:var(--fs-xs)] leading-[1.7] text-[var(--t3)]">
                    {pct >= 60 ? 'ملف متنامٍ يغطي جزءاً واسعاً من معايير الأداء.' : 'ملف يُبنى ويُحدَّث باستمرار.'}
                  </p>
                </div>
              </div>
            ))}

            {early || hideReadiness ? (
              <div className={`grid grid-cols-2 gap-2 ${hideReadiness ? '' : 'mt-4'}`}>
                <StatTile value={totalEvs} label={totalEvs === 1 ? 'شاهد موثّق' : 'شواهد موثّقة'} />
                <StatTile value={coveredCount} suffix={areasSuffix} label="مجالات موثّقة" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 mt-4">
                <StatTile value={totalEvs} label="شاهداً" />
                <StatTile value={coveredCount} suffix={areasSuffix} label="مجالات" />
                <StatTile value={completion?.completed_sections ?? 0} label="مكتملة" />
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
