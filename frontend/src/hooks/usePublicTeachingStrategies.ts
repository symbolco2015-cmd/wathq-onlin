import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export interface PublicTeachingStrategy {
  id: string;
  name_ar: string;
}

/** أسماء استراتيجيات التدريس المُستخدمة فعلياً في ملف مُشارَك، عبر
 * get_shared_teaching_strategies() — لا قراءة مباشرة على teaching_strategies
 * لأن RLS يمنع زوار الصفحة العامة من رؤية استراتيجيات خاصة لغير مالكها،
 * تماماً مثل usePublicEvidence مع جدول evidence. */
export function usePublicTeachingStrategies(userId: string | null): PublicTeachingStrategy[] | null {
  const [data, setData] = useState<PublicTeachingStrategy[] | null>(null);

  useEffect(() => {
    if (!userId || !supabase) {
      setData(null);
      return;
    }

    let cancelled = false;

    supabase
      .rpc('get_shared_teaching_strategies', { target_id: userId })
      .then(({ data: rpcData, error }) => {
        if (cancelled) return;
        if (error || !rpcData) {
          console.warn('[usePublicTeachingStrategies]', error);
          setData(null);
          return;
        }
        setData(rpcData as PublicTeachingStrategy[]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return data;
}
