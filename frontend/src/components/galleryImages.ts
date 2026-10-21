// اختيار صور شريط «لمحات» — دالة نقية بلا استيراد وقت التشغيل (يختبرها npx tsx)
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';

/** أقصى عدد صور في الشريط، حفاظاً على الأداء */
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

/** صور الشريط:
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
