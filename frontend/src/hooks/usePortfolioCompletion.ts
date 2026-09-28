import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { PublicPortfolioState } from '../types';
import type { SupabaseEvidence } from './useSupabaseEvidence';

/** نفس شكل completion الذي ترجعه get_shared_portfolio للعرض العام */
export type PortfolioCompletion = NonNullable<PublicPortfolioState['completion']>;

// نسبة الجاهزية العامة الموحّدة — المصدر الوحيد لـoverall_pct/completed_sections/
// total_sections في لوحة التحكم ومعاينة المالك لصفحته العامة. تراكمية عبر تغطية
// evidence.indicator_id (بلا علاقة بعدّاد الشهر). يُعاد الجلب كلما تغيّرت الشواهد
// فعلاً: إضافة، حذف، أو تغيير indicator_id/section_id عند إعادة التصنيف.
export function usePortfolioCompletion(userId: string | null, evidence: SupabaseEvidence[]) {
  const [completion, setCompletion] = useState<PortfolioCompletion | null>(null);
  const [error, setError] = useState(false);
  const requestIdRef = useRef(0);

  // مفتاح نصي مرتّب من المعرّفات والمؤشرات والأقسام — مستقل عن ترتيب المصفوفة
  // ومرجعها، فإعادة جلب الشواهد بنفس المحتوى لا تطلق طلباً جديداً
  const evidenceKey = useMemo(
    () => evidence
      .map(e => `${e.id}:${e.indicator_id ?? ''}:${e.section_id ?? ''}`)
      .sort()
      .join('|'),
    [evidence]
  );

  const refetch = useCallback(() => {
    const requestId = ++requestIdRef.current;
    if (!supabase || !userId) { setCompletion(null); setError(false); return; }
    supabase
      .rpc('get_portfolio_completion', { p_portfolio_id: userId })
      .then(({ data, error: rpcError }) => {
        // رد طلب أقدم وصل بعد طلب أحدث — يُتجاهل
        if (requestId !== requestIdRef.current) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (rpcError || !row) {
          console.warn('[usePortfolioCompletion] تعذّر جلب نسبة الجاهزية:', rpcError?.message);
          setCompletion(null);
          setError(true);
          return;
        }
        setError(false);
        setCompletion({
          overall_pct: row.overall_pct ?? 0,
          completed_sections: row.completed_sections ?? 0,
          total_sections: row.total_sections ?? 0,
        });
      });
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch, evidenceKey]);

  return { completion, error, refetch };
}
