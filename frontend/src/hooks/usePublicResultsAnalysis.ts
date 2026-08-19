import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { PublicResultsAnalysisRow } from '../components/ResultsAnalysis/types';

/** يجلب صفوف بند 10 (تحليل نتائج المتعلمين) المبسَّطة الآمنة لملف مُشارَك
 * عبر get_shared_results_analysis() — لا قراءة مباشرة على results_analysis
 * لأن RLS يقيّدها بالمالك فقط، تماماً مثل usePublicEvidence مع جدول evidence.
 * الشكل المُرجَع لا يحتوي summary/students إطلاقاً — الدالة نفسها لا تُرجعها. */
export function usePublicResultsAnalysis(userId: string | null): PublicResultsAnalysisRow[] | null {
  const [data, setData] = useState<PublicResultsAnalysisRow[] | null>(null);

  useEffect(() => {
    if (!userId || !supabase) {
      setData(null);
      return;
    }

    let cancelled = false;

    supabase
      .rpc('get_shared_results_analysis', { target_id: userId })
      .then(({ data: rpcData, error }) => {
        if (cancelled) return;
        if (error || !rpcData) {
          console.warn('[usePublicResultsAnalysis]', error);
          setData(null);
          return;
        }
        setData(rpcData as PublicResultsAnalysisRow[]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return data;
}
