// بطاقة «أبرز إنجاز» في الصفحة العامة — .feat في pub() بـ docs/design/wathq-prototype.html.
// الذهبي هنا --brand-gold (عنصر هوية)، لا ذهبي الحالة.
import { useState } from 'react';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import { formatDate } from '../utils';
import { ExtraFilesBadge, ExtraFilesPrintLine, extractYouTubeId, publicKind, type PublicKind } from './EvidenceViewer';

const KIND_ICON: Record<PublicKind, string> = {
  pdf: 'ti-file-text', img: 'ti-photo', vid: 'ti-video', audio: 'ti-microphone', link: 'ti-link', note: 'ti-notes',
};

const RIBBON = 'text-[length:var(--fs-xs)] font-bold text-[var(--bg)] bg-[var(--brand-gold)] px-2.5 py-0.5 rounded-[var(--r-full)]';

/** المرئي: صورة أو فيديو أو مصغّرة يوتيوب. إن تعذّر التحميل ⇐ onFail، فتأخذ
 *  البطاقة شكل الشاهد بلا مرئي (خانة الأيقونة الضيقة) */
function FeatVisual({ evidence, ytId, onFail }: { evidence: SupabaseEvidence; ytId: string | null; onFail: () => void }) {
  const kind = publicKind(evidence);
  const media = 'absolute inset-0 w-full h-full object-cover';
  const play = (
    <span className="relative w-10 h-10 rounded-full bg-black/45 flex items-center justify-center text-[var(--t1)]">
      <i className="ti ti-player-play text-[20px]"></i>
    </span>
  );

  if (kind === 'img' && evidence.file_url) {
    return <img src={evidence.file_url} alt="" loading="lazy" decoding="async" className={media} onError={onFail} />;
  }
  if (kind === 'vid' && evidence.file_url) {
    return (
      <>
        <video src={`${evidence.file_url}#t=0.1`} preload="metadata" muted playsInline className={media} onError={onFail} />
        {play}
      </>
    );
  }
  return (
    <>
      <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" className={media} onError={onFail} />
      {play}
    </>
  );
}

export default function TopAchievementCard({ evidence, source, sectionName, indicatorName, onOpen }: {
  evidence: SupabaseEvidence;
  source: 'teacher' | 'ai' | null | undefined;
  sectionName?: string;
  indicatorName?: string;
  onOpen: () => void;
}) {
  // اقتراح الذكاء الاصطناعي لا يظهر إلا بعد موافقة المعلم، فالزائر يرى أن المعلم هو من اختار
  const sourceLabel = source === 'ai' ? 'اعتمده المعلم' : 'اختاره المعلم';
  const meta = [sectionName, indicatorName, formatDate(evidence.created_at, 'long')].filter(Boolean).join(' · ');
  const description = evidence.description?.trim();
  const extra = evidence.extra_files?.length ?? 0;
  const kind = publicKind(evidence);
  const ytId = kind === 'link' && evidence.link_url ? extractYouTubeId(evidence.link_url) : null;
  // معرّف الشاهد الذي تعذّر تحميل مرئيه — يسقط تلقائياً إن تغيّر الشاهد
  const [failedId, setFailedId] = useState<string | null>(null);
  // مرئي حقيقي (صورة، فيديو، يوتيوب) حُمّل ⇐ نصف البطاقة. غيره ⇐ خانة أيقونة ضيقة
  const hasVisual = (((kind === 'img' || kind === 'vid') && !!evidence.file_url) || !!ytId) && failedId !== evidence.id;

  const text = (
    <>
      <b className="block text-[length:var(--fs-md)] font-bold leading-[1.5] text-[var(--t1)]">{evidence.title}</b>
      {/* الشارة على الشاشة، والمرئي مخفي في الطباعة — فيُكرَّر المصدر نصاً هنا للطباعة فقط */}
      <span className="hidden print:block mt-1 text-[length:var(--fs-xs)] text-[var(--t2)]">{sourceLabel}</span>
      {description && (
        <p className="mt-1.5 text-[length:var(--fs-sm)] leading-[1.8] text-[var(--t2)] whitespace-pre-line">{description}</p>
      )}
      <small className="block mt-2.5 text-[length:var(--fs-xs)] text-[var(--t3)]">{meta}</small>
      <ExtraFilesPrintLine n={extra} />
    </>
  );

  // print-card على الزر نفسه (حامل خلفية --s1)، لا على الغلاف — Public.print.css
  // يبيّض خلفية .print-card فقط، فخلفية عنصر داخلها كانت تبقى داكنة.
  const shell = 'print-card mt-3 w-full text-right rounded-[var(--r-lg)] overflow-hidden border border-[var(--brand-gold)]/30 bg-[var(--s1)] cursor-pointer';

  return (
    <section aria-labelledby="top-achievement-label">
      <div id="top-achievement-label" className="flex items-center gap-1.5 text-[length:var(--fs-xs)] font-bold text-[var(--brand-gold)] print:break-after-avoid">
        <i className="ti ti-star text-[16px]"></i>
        أبرز إنجاز
      </div>
      {hasVisual ? (
        <button type="button" onClick={onOpen} className={`${shell} grid lg:grid-cols-[1.1fr_1fr] print:grid-cols-1`}>
          <div className="print:hidden relative min-h-[190px] bg-[var(--s2)] flex items-center justify-center">
            <FeatVisual evidence={evidence} ytId={ytId} onFail={() => setFailedId(evidence.id)} />
            <span className={`absolute top-3 right-3 ${RIBBON}`}>{sourceLabel}</span>
            <ExtraFilesBadge n={extra} overlay />
          </div>
          <div className="p-4">{text}</div>
        </button>
      ) : (
        <button type="button" onClick={onOpen} className={`${shell} flex items-stretch`}>
          {/* سطح المكتب: خانة أيقونة بعرض 96px */}
          <div className="print:hidden hidden lg:flex w-24 shrink-0 bg-[var(--s2)] items-center justify-center">
            <i className={`ti ${KIND_ICON[kind]} text-[24px] text-[var(--t2)]`}></i>
          </div>
          <div className="flex-1 min-w-0 p-4">
            <span className={`print:hidden inline-block mb-2 ${RIBBON}`}>{sourceLabel}</span>
            {extra > 0 && <span className="ms-2 inline-block align-top"><ExtraFilesBadge n={extra} /></span>}
            <div className="flex items-start gap-3">
              {/* الجوال: أيقونة صغيرة بجانب العنوان */}
              <span className="print:hidden lg:hidden w-9 h-9 shrink-0 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center">
                <i className={`ti ${KIND_ICON[kind]} text-[20px] text-[var(--t2)]`}></i>
              </span>
              <div className="flex-1 min-w-0">{text}</div>
            </div>
          </div>
        </button>
      )}
    </section>
  );
}

/** معاينة المالك فقط: مكان البطاقة حين لا يوجد «أبرز إنجاز» — الزائر لا يراه أبداً */
export function TopAchievementPlaceholder() {
  return (
    <div className="print:hidden border border-dashed border-[var(--t3)] rounded-[var(--r-md)] px-4 py-3 text-[length:var(--fs-sm)] text-[var(--t3)]">
      لم تختر أبرز إنجاز بعد. ثبّت أحد شواهدك من قائمة ⋯ في لوحة التحكم.
    </div>
  );
}
