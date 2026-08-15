import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { HarvestReport } from '../types';

interface UseHarvestReportResult {
  report: HarvestReport | null;
  loading: boolean;
  error: string | null;
}

/** يجلب تقرير حصاد فصلي واحد عبر قراءة مباشرة على جدول harvest_reports —
 * بخلاف usePublicProfile/usePublicEvidence، لا حاجة هنا لأي RPC: السطر
 * "قراءة عامة بمعرفة id" على harvest_reports يسمح بـSELECT عام مباشر (المعرّف
 * uuid عشوائي يكفي وحده كحماية، تماماً كأي رابط مشاركة لا يمكن تخمينه). */
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
      .from('harvest_reports')
      .select('*')
      .eq('id', reportId)
      .single()
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
