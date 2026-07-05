import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { SupabaseEvidence } from './useSupabaseEvidence';

/** يجلب شواهد جدول evidence الجديد (الغني) لملف مُشارَك عبر get_shared_evidence()
 * — لا قراءة مباشرة على evidence لأن RLS يقيّدها بالمالك فقط،
 * تماماً مثل usePublicMonthlyProgress مع جدول monthly_progress. */
export function usePublicEvidence(userId: string | null): SupabaseEvidence[] | null {
  const [data, setData] = useState<SupabaseEvidence[] | null>(null);

  useEffect(() => {
    if (!userId || !supabase) {
      setData(null);
      return;
    }

    let cancelled = false;

    supabase
      .rpc('get_shared_evidence', { target_id: userId })
      .then(({ data: rpcData, error }) => {
        if (cancelled) return;
        if (error || !rpcData) {
          console.warn('[usePublicEvidence]', error);
          setData(null);
          return;
        }
        setData(rpcData as SupabaseEvidence[]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return data;
}
