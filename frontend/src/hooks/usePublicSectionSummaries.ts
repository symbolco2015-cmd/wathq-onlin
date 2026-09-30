import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

/** يجلب ملخصات الأقسام العادية لملف مُشارَك عبر get_shared_section_summaries()
 * (الملخصات غير المخفية فقط) — لا قراءة مباشرة على section_ai_summaries لأن
 * RLS يقيّدها بالمالك فقط. المفتاح رقم القسم، والقيمة الجملة. */
export function usePublicSectionSummaries(userId: string | null): Record<number, string> {
  const [data, setData] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!userId || !supabase) {
      setData({});
      return;
    }

    let cancelled = false;

    supabase
      .rpc('get_shared_section_summaries', { target_id: userId })
      .then(({ data: rpcData, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[usePublicSectionSummaries]', error);
          setData({});
          return;
        }
        const map: Record<number, string> = {};
        for (const [key, sentence] of Object.entries((rpcData as Record<string, string> | null) ?? {})) {
          const sectionId = Number(key);
          if (Number.isFinite(sectionId) && typeof sentence === 'string') map[sectionId] = sentence;
        }
        setData(map);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return data;
}
