// معرض «لمحات من الممارسة الصفية» — .gal في pub() بـ docs/design/wathq-prototype.html.
import { useState } from 'react';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import { ExtraFilesBadge } from './EvidenceViewer';

/** سطح المكتب يعرض 5، والجوال يُخفي الخامس بـ CSS (4) */
const GALLERY_MAX = 5;
/** أقل من هذا العدد لا يظهر المعرض كله */
const GALLERY_MIN = 3;
const PER_SECTION = 2;

const newestFirst = (a: SupabaseEvidence, b: SupabaseEvidence) => b.created_at.localeCompare(a.created_at);

/** عناصر المعرض، بالترتيب:
 *  1. المرشّحون: صورة أو فيديو بملف، غير مخفي من اللمحات (الغائب = غير مخفي)،
 *     وليس شاهد «أبرز إنجاز». الروابط (ومنها يوتيوب) لا تدخل.
 *  2. داخل كل بند: ما له وصف أولاً، ثم الأحدث، ثم أول 2.
 *  3. بين البنود: الأحدث أولاً، ثم أول GALLERY_MAX.
 *  4. أقل من GALLERY_MIN ⇐ []. */
export function pickGalleryItems(evidence: SupabaseEvidence[], topId: string | null | undefined): SupabaseEvidence[] {
  const bySection = new Map<number, SupabaseEvidence[]>();
  for (const e of evidence) {
    if (e.section_id == null) continue;
    if (e.evidence_type !== 'image' && e.evidence_type !== 'video') continue;
    if (!e.file_url || e.hidden_from_gallery === true || e.id === topId) continue;
    const arr = bySection.get(e.section_id) ?? [];
    arr.push(e);
    bySection.set(e.section_id, arr);
  }
  const picked: SupabaseEvidence[] = [];
  for (const evs of bySection.values()) {
    const sorted = [...evs].sort((a, b) =>
      Number(!!b.description?.trim()) - Number(!!a.description?.trim()) || newestFirst(a, b));
    picked.push(...sorted.slice(0, PER_SECTION));
  }
  const items = picked.sort(newestFirst).slice(0, GALLERY_MAX);
  return items.length >= GALLERY_MIN ? items : [];
}

/** المرئي. إن تعذّر التحميل ⇐ onFail، فتأخذ البلاطة شكل الشاهد بلا مرئي
 *  (طريقة TopAchievementCard نفسها) */
function TileMedia({ e, onFail }: { e: SupabaseEvidence; onFail: () => void }) {
  const isVideo = e.evidence_type === 'video';
  const media = 'absolute inset-0 w-full h-full object-cover';
  return (
    <>
      {isVideo ? (
        <video src={`${e.file_url}#t=0.1`} preload="metadata" muted playsInline className={media} onError={onFail} />
      ) : (
        <img src={e.file_url ?? ''} alt="" loading="lazy" decoding="async" className={media} onError={onFail} />
      )}
      {isVideo && (
        <span className="relative w-10 h-10 rounded-full bg-black/45 flex items-center justify-center text-[var(--t1)]">
          <i className="ti ti-player-play text-[16px]"></i>
        </span>
      )}
      <ExtraFilesBadge n={e.extra_files?.length ?? 0} overlay />
    </>
  );
}

export default function PublicGallery({ items, sectionName, onOpen }: {
  items: SupabaseEvidence[];
  sectionName: (sectionId: number | null) => string | undefined;
  onOpen: (e: SupabaseEvidence) => void;
}) {
  // معرّفات الشواهد التي تعذّر تحميل مرئيها
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set());
  if (items.length === 0) return null;
  const n = items.length;
  const three = n === 3;
  // الجوال (عمودان، يُعرض 4 كحد أقصى): الأول عريض، والباقي أزواج. إن بقي
  // الأخير وحده في صفه (4 أو 5 عناصر ⇐ الرابع) يمتد عريضاً بنسبة 2/1.
  const mobileCount = Math.min(n, 4);
  const mobileWideLast = (mobileCount - 1) % 2 === 1 ? mobileCount - 1 : -1;
  // سطح المكتب: 3 ⇐ عمودان 2fr/1fr، والأول بارتفاع صفين. 4 ⇐ أربعة أعمدة،
  // الأول 2×2، والرابع يمتد عمودين تحت الثاني والثالث. 5 ⇐ الأول 2×2 والأربعة 2×2.
  const deskWideLast = n === 4 ? 3 : -1;
  return (
    <section className="print:hidden" aria-labelledby="gallery-title">
      <div className="flex items-center gap-1.5 text-[length:var(--fs-xs)] font-bold text-[var(--brand-gold)]">
        <i className="ti ti-photo text-[16px]"></i>
        من الشواهد
      </div>
      <h2 id="gallery-title" className="mt-1 text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">لمحات من الممارسة الصفية</h2>
      <div className={`mt-3 grid gap-2 grid-cols-2 lg:auto-rows-[180px] ${three ? 'lg:grid-cols-[2fr_1fr]' : 'lg:grid-cols-4'}`}>
        {items.map((e, i) => {
          const big = i === 0;
          const wideMobile = big || i === mobileWideLast;
          const sec = sectionName(e.section_id);
          const failed = failedIds.has(e.id);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onOpen(e)}
              aria-label={e.title}
              className={[
                'flex-col overflow-hidden rounded-[var(--r-md)] bg-[var(--s1)] text-right cursor-pointer',
                big ? 'col-span-2 lg:row-span-2' : '',
                big && !three ? 'lg:col-span-2' : '',
                big && three ? 'lg:col-span-1' : '',
                !big && i === mobileWideLast ? 'col-span-2' : '',
                !big && i === mobileWideLast && i !== deskWideLast ? 'lg:col-span-1' : '',
                !big && i === deskWideLast ? 'lg:col-span-2' : '',
                i >= 4 ? 'hidden lg:flex' : 'flex',
              ].join(' ')}
            >
              {failed ? (
                // بلا مرئي: مربع أيقونة بجانب النص، بارتفاع البلاطة نفسه (فرع !hasVisual في TopAchievementCard)
                <span className={`flex items-center gap-3 p-3 lg:flex-1 lg:min-h-0 ${wideMobile ? 'aspect-[2/1]' : 'aspect-square'} lg:aspect-auto`}>
                  <span className="w-9 h-9 shrink-0 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center">
                    <i className={`ti ${e.evidence_type === 'video' ? 'ti-video' : 'ti-photo'} text-[20px] text-[var(--t2)]`}></i>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)] line-clamp-2">{e.title}</span>
                    {sec && <span className="block text-[length:var(--fs-xs)] text-[var(--t3)] truncate">{sec}</span>}
                  </span>
                </span>
              ) : (
                <>
                  {/* المرئي بنسبة ثابتة على الجوال، ويملأ ما بقي من صف الشبكة الثابت على سطح المكتب */}
                  <span className={`relative flex items-center justify-center bg-[var(--s2)] lg:aspect-auto lg:flex-1 lg:min-h-0 ${wideMobile ? 'aspect-[2/1]' : 'aspect-square'}`}>
                    <TileMedia e={e} onFail={() => setFailedIds(prev => new Set(prev).add(e.id))} />
                  </span>
                  {/* النص في شريط مستقل تحت المرئي، لا فوقه — حتى لا يغطي ما في الصورة من كتابة */}
                  <span className="block px-2.5 py-2 bg-[var(--s1)]">
                    <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)] truncate">{e.title}</span>
                    {sec && <span className="block text-[length:var(--fs-xs)] text-[var(--t3)] truncate">{sec}</span>}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
