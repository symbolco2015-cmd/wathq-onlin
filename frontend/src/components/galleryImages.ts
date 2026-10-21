// صور فسيفساء «لمحات» ومنطق تبديلها — دوال نقية بلا استيراد وقت التشغيل (يختبرها npx tsx)
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';

/** أقصى عدد صور في مجمّع الفسيفساء، حفاظاً على الأداء */
export const GALLERY_MAX = 24;
/** أقل من هذا العدد لا يظهر القسم كله */
export const GALLERY_MIN = 3;

export interface GalleryImage {
  key: string;
  url: string;
  ev: SupabaseEvidence;
  /** موقع الصورة في ملفات الشاهد (الغلاف 0) — نافذة العرض تفتح عليه */
  fileIdx: number;
}

/** صور الشاهد بترتيب ملفاته: الغلاف إن كان صورة، ثم كل عنصر صورة في
 *  extra_files. المستندات لا تدخل، لكنها تُحسب في fileIdx. */
function evidenceImages(e: SupabaseEvidence): GalleryImage[] {
  if (!e.file_url || (e.evidence_type !== 'image' && e.evidence_type !== 'file')) return [];
  const files = [{ url: e.file_url, type: e.evidence_type }, ...(e.extra_files ?? [])];
  const out: GalleryImage[] = [];
  files.forEach((f, i) => {
    if (f.type === 'image' && f.url) out.push({ key: `${e.id}:${i}`, url: f.url, ev: e, fileIdx: i });
  });
  return out;
}

/** مجمّع الفسيفساء (أول عرض يأخذ أوله بالترتيب):
 *  1. المرشّحون: له بند، غير مخفي من اللمحات (الغائب = غير مخفي)، وليس
 *     شاهد «أبرز إنجاز». الفيديو والروابط والملاحظات لا تدخل.
 *  2. الشواهد من الأحدث، والصور بالتناوب: الأولى من كل شاهد، ثم الثانية…
 *  3. أول GALLERY_MAX. أقل من GALLERY_MIN ⇐ []. */
export function pickGalleryImages(evidence: SupabaseEvidence[], topId: string | null | undefined): GalleryImage[] {
  const lists = evidence
    .filter(e => e.section_id != null && e.hidden_from_gallery !== true && e.id !== topId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(evidenceImages)
    .filter(l => l.length > 0);
  const out: GalleryImage[] = [];
  for (let round = 0; out.length < GALLERY_MAX; round++) {
    let any = false;
    for (const l of lists) {
      if (round >= l.length) continue;
      any = true;
      out.push(l[round]);
      if (out.length === GALLERY_MAX) break;
    }
    if (!any) break;
  }
  return out.length >= GALLERY_MIN ? out : [];
}

export type GalleryLayout = 'mobile' | 'desktop';

/** عدد خانات الفسيفساء. الخانة 0 هي الكبيرة دائماً.
 *  سطح المكتب: 5 (كبيرة و4 حولها)، وأقل من 5 صور ⇐ 3 (كبيرة وصغيرتان).
 *  الجوال: 4 (كبيرة و3 تحتها)، و3 صور ⇐ 3. أقل من GALLERY_MIN ⇐ 0. */
export function gallerySlotCount(n: number, layout: GalleryLayout): number {
  if (n < GALLERY_MIN) return 0;
  if (layout === 'desktop') return n >= 5 ? 5 : 3;
  return n >= 4 ? 4 : 3;
}

/** وزن الكبيرة في اختيار الخانة (الصغيرة 1): تتبدل بنصف احتمالها */
export const BIG_SLOT_WEIGHT = 0.5;

/** replace: صورة جديدة من المجمّع في خانة. swap: خانتان تتبادلان صورتيهما
 *  (المجمّع كله معروض، فلا صورة جديدة). */
export type GalleryMove =
  | { kind: 'replace'; slot: number; image: GalleryImage }
  | { kind: 'swap'; a: number; b: number };

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

/** التبديل التالي. shown: صور الخانات بالترتيب، pool: المجمّع بلا الصور التي
 *  تعذّر تحميلها، lastSlot: خانة التبديل السابق، rand: مثل Math.random.
 *  - الخانة: كل الخانات عدا lastSlot، والكبيرة بوزن BIG_SLOT_WEIGHT.
 *  - الصورة: من المجمّع غير المعروضة، ويُفضَّل ما ليس من شاهد في خانة أخرى.
 *  - لا صورة غير معروضة ⇐ تبادل مع خانة أخرى (غير lastSlot إن أمكن).
 *  أقل من خانتين ⇐ null. */
export function pickNextMove(
  shown: GalleryImage[],
  pool: GalleryImage[],
  lastSlot: number | null,
  rand: () => number,
): GalleryMove | null {
  if (shown.length < 2) return null;
  const slots = shown.map((_, i) => i).filter(i => i !== lastSlot);
  const weight = (i: number) => (i === 0 ? BIG_SLOT_WEIGHT : 1);
  let r = rand() * slots.reduce((sum, i) => sum + weight(i), 0);
  let slot = slots[slots.length - 1];
  for (const i of slots) {
    r -= weight(i);
    if (r < 0) { slot = i; break; }
  }

  const shownKeys = new Set(shown.map(img => img.key));
  const free = pool.filter(img => !shownKeys.has(img.key));
  if (free.length === 0) {
    const others = shown.map((_, i) => i).filter(i => i !== slot);
    const preferred = others.filter(i => i !== lastSlot);
    return { kind: 'swap', a: slot, b: pick(preferred.length > 0 ? preferred : others, rand) };
  }
  const otherEv = new Set(shown.filter((_, i) => i !== slot).map(img => img.ev.id));
  const fresh = free.filter(img => !otherEv.has(img.ev.id));
  return { kind: 'replace', slot, image: pick(fresh.length > 0 ? fresh : free, rand) };
}
