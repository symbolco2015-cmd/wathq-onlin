import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { ContinuityData } from '../types';

/** يجلب بيانات الاستمرارية الشهرية لملف مُشارَك عبر get_shared_monthly_progress()
 * — لا قراءة مباشرة على monthly_progress لأن RLS يقيّدها بالمالك فقط،
 * تماماً مثل usePublicProfile مع جدول portfolios. */
export function usePublicMonthlyProgress(userId: string | null): ContinuityData | null {
  const [data, setData] = useState<ContinuityData | null>(null);

  useEffect(() => {
    if (!userId || !supabase) {
      setData(null);
      return;
    }

    let cancelled = false;

    supabase
      .rpc('get_shared_monthly_progress', { target_id: userId })
      .then(({ data: rpcData, error }) => {
        if (cancelled) return;
        if (error || !rpcData) {
          console.warn('[usePublicMonthlyProgress]', error);
          setData(null);
          return;
        }
        setData(rpcData as ContinuityData);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return data;
}
