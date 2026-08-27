import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

/** يجلب ملخص بند "إعداد خطة التعلم" (section_id=6) بالذكاء الاصطناعي لملف
 * مُشارَك عبر get_shared_lesson_plan_summary() — لا قراءة مباشرة على
 * section_ai_summaries لأن RLS يقيّدها بالمالك فقط، تماماً مثل
 * usePublicEvidence مع جدول evidence. */
export function usePublicLessonPlanSummary(userId: string | null): string | null {
  const [data, setData] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !supabase) {
      setData(null);
      return;
    }

    let cancelled = false;

    supabase
      .rpc('get_shared_lesson_plan_summary', { target_id: userId })
      .then(({ data: rpcData, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[usePublicLessonPlanSummary]', error);
          setData(null);
          return;
        }
        setData((rpcData as string | null) ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return data;
}
