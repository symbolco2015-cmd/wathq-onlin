import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export interface PublicCustomIndicator {
  id: string;
  section_id: number;
  name_ar: string;
}

/** يجلب المؤشرات المخصصة لملف مُشارَك عبر get_shared_custom_indicators()
 * (التي عليها شواهد فقط) — لا قراءة مباشرة على section_indicators لأن RLS
 * تُرجع مخصص المستخدم المسجّل، لا مخصص صاحب الصفحة. */
export function usePublicCustomIndicators(userId: string | null): PublicCustomIndicator[] {
  const [data, setData] = useState<PublicCustomIndicator[]>([]);

  useEffect(() => {
    if (!userId || !supabase) {
      setData([]);
      return;
    }

    let cancelled = false;

    supabase
      .rpc('get_shared_custom_indicators', { target_id: userId })
      .then(({ data: rpcData, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[usePublicCustomIndicators]', error);
          setData([]);
          return;
        }
        const rows = Array.isArray(rpcData) ? (rpcData as PublicCustomIndicator[]) : [];
        setData(rows.filter(r => typeof r.id === 'string' && typeof r.name_ar === 'string' && Number.isFinite(Number(r.section_id)))
          .map(r => ({ id: r.id, section_id: Number(r.section_id), name_ar: r.name_ar })));
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return data;
}
