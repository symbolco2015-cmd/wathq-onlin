import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { HarvestReport } from '../types';

interface UseHarvestReportResult {
  report: HarvestReport | null;
  loading: boolean;
  error: string | null;
}

/** يجلب تقرير حصاد فصلي واحد عبر RPC get_harvest_report(report_id) —
 * RLS على harvest_reports تقصر القراءة المباشرة على المالك والأدمن، والدالة
 * (SECURITY DEFINER) تُرجع التقرير المطلوب بمعرّفه فقط أو null إن لم يوجد.
 * لا شرط share_enabled: المعرّف uuid عشوائي يكفي وحده كحماية، تماماً كأي
 * رابط مشاركة لا يمكن تخمينه. */
export function useHarvestReport(reportId: string | null): UseHarvestReportResult {
  const [report, setReport] = useState<HarvestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId) {
      setReport(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (!supabase) {
      setError('لا يمكن تحميل التقرير — الاتصال بقاعدة البيانات غير متاح.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .rpc('get_harvest_report', { report_id: reportId })
      .then(({ data, error: sbError }) => {
        if (cancelled) return;

        if (sbError || !data) {
          if (sbError) console.error('[useHarvestReport]', sbError);
          setError('لم يتم العثور على هذا التقرير. الرابط غير صحيح أو لم يعد متاحاً.');
          setReport(null);
        } else {
          setReport(data as HarvestReport);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  return { report, loading, error };
}
