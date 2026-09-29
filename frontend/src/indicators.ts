import type { SectionData, SectionIndicator } from './types';
import type { SupabaseEvidence } from './hooks/useSupabaseEvidence';
import { supabaseEvidenceTypeToLocal, formatDate } from './utils';

// شكل العرض الذي كانت تستخدمه صفوف المؤشرات مع ev القديم في portfolios.state، مشتقّاً الآن
// من صف evidence الحقيقي — نفس الـ JSX يبقى بلا تغيير في التصميم.
export function toEvRow(e: SupabaseEvidence) {
  return {
    id: e.id,
    type: supabaseEvidenceTypeToLocal(e.evidence_type),
    name: e.title,
    date: formatDate(e.created_at, 'long'),
    url: e.file_url ?? e.link_url ?? undefined,
  };
}

export type EvRow = ReturnType<typeof toEvRow>;

// تحديد مؤشر خاص داخل قسم بجزء من اسمه — لتحديد المؤشر نفسه فقط؛ ربط الشواهد
// به يتم بعدها بـ indicator_id حصراً.
export function findIndicatorByName(section: SectionData | null, nameFragment: string): SectionIndicator | undefined {
  if (!section) return undefined;
  const found = section.indicators.find(i => i.name_ar.includes(nameFragment));
  if (!found) console.error(`[indicators] لم يُعثر على مؤشر "${nameFragment}" في القسم ${section.id}`);
  return found;
}
