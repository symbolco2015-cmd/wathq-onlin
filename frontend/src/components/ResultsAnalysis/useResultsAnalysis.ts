import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import type { AnalysisMeta, AnalysisSummary, GradeBand, ResultsAnalysisRow } from './types';

/** نافذة زمنية حول تاريخ إنشاء التحليل يُبحَث ضمنها عن شاهد ذي صلة —
 *  ±30 يوماً، ثابت قابل للتعديل لاحقاً. */
const SMART_CHECK_WINDOW_DAYS = 30;

/** كلمات مفتاحية للفحص التقريبي — بحث نصي بسيط (ILIKE)، بلا أي ذكاء اصطناعي.
 *  "إخفاق" يبحث عن أثر خطة علاجية، "تفوق" يبحث عن أثر تكريم. */
const REMEDIAL_KEYWORDS = ['علاج'];
const HONOR_KEYWORDS = ['تكريم', 'شهادة شكر'];

export type SaveAnalysisResult =
  | { row: ResultsAnalysisRow; duplicate: false }
  | { row: null; duplicate: boolean };

export type SaveAnalysisFn = (meta: AnalysisMeta, summary: AnalysisSummary, replaceId?: string) => Promise<SaveAnalysisResult>;

export interface SmartCheckResult {
  found: boolean;
  evidenceTitle?: string;
}

export function useResultsAnalysis(userId: string | undefined) {
  const [gradeBands, setGradeBands] = useState<GradeBand[]>([]);
  const [analyses, setAnalyses] = useState<ResultsAnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGradeBands = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('grade_bands')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) { console.error('[ResultsAnalysis] تعذّر تحميل فئات التقدير:', error.message); return; }
    setGradeBands((data ?? []) as GradeBand[]);
  }, []);

  const fetchAnalyses = useCallback(async () => {
    if (!supabase || !userId) { setAnalyses([]); return; }
    const { data, error } = await supabase
      .from('results_analysis')
      .select('*')
      .eq('portfolio_id', userId)
      .order('created_at', { ascending: false });
    if (error) { console.error('[ResultsAnalysis] تعذّر تحميل التحليلات السابقة:', error.message); return; }
    setAnalyses((data ?? []) as ResultsAnalysisRow[]);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchGradeBands(), fetchAnalyses()]).finally(() => setLoading(false));
  }, [fetchGradeBands, fetchAnalyses]);

  /** يحفظ تحليل شعبة. replaceId: «استبدال» تحليل محفوظ بالمفتاح نفسه —
   *  تحديث (UPDATE) للصف القديم في عملية واحدة، فيبقى id وcreated_at، ولا
   *  تمر لحظة يكون فيها القديم محذوفاً والجديد لم يُنشأ. duplicate: رفضه
   *  الفهرس الفريد results_analysis_unique_test (23505). */
  const saveAnalysis = useCallback(async (
    meta: AnalysisMeta,
    summary: AnalysisSummary,
    replaceId?: string,
  ): Promise<SaveAnalysisResult> => {
    if (!supabase || !userId) return { row: null, duplicate: false };
    const fields = {
      subject: meta.subject,
      stage: meta.stage,
      grade_level: meta.grade_level,
      class_section: meta.class_section,
      test_type: meta.test_type,
      test_seq: meta.test_seq,
      full_mark: meta.full_mark,
      summary,
      student_names_included: true, // مخزن داخلي فقط — الأسماء تُحفظ دائماً هنا
    };
    const { data, error } = replaceId
      ? await supabase.from('results_analysis').update(fields).eq('id', replaceId).eq('portfolio_id', userId).select().single()
      : await supabase.from('results_analysis').insert({ portfolio_id: userId, ...fields }).select().single();
    if (error) {
      console.error('[ResultsAnalysis] تعذّر حفظ التحليل:', error.message);
      return { row: null, duplicate: error.code === '23505' };
    }
    const row = data as ResultsAnalysisRow;
    setAnalyses(prev => replaceId ? prev.map(a => a.id === row.id ? row : a) : [row, ...prev]);
    return { row, duplicate: false };
  }, [userId]);

  /** فحص تقريبي بالكلمات المفتاحية فقط (ILIKE) — لا ذكاء اصطناعي إطلاقاً. */
  const runSmartCheck = useCallback(async (
    analysis: ResultsAnalysisRow,
    kind: 'remedial' | 'honor',
  ): Promise<SmartCheckResult> => {
    if (!supabase || !userId) return { found: false };
    const keywords = kind === 'remedial' ? REMEDIAL_KEYWORDS : HONOR_KEYWORDS;
    const createdAt = new Date(analysis.created_at);
    const from = new Date(createdAt.getTime() - SMART_CHECK_WINDOW_DAYS * 86400000).toISOString();
    const to = new Date(createdAt.getTime() + SMART_CHECK_WINDOW_DAYS * 86400000).toISOString();

    const orFilter = keywords
      .flatMap(kw => [`title.ilike.%${kw}%`, `description.ilike.%${kw}%`])
      .join(',');

    const { data, error } = await supabase
      .from('evidence')
      .select('title, created_at')
      .eq('portfolio_id', userId)
      .gte('created_at', from)
      .lte('created_at', to)
      .or(orFilter)
      .limit(1);

    if (error) { console.error('[ResultsAnalysis] تعذّر تنفيذ الفحص الذكي:', error.message); return { found: false }; }
    if (data && data.length > 0) return { found: true, evidenceTitle: data[0].title };
    return { found: false };
  }, [userId]);

  return {
    gradeBands,
    analyses,
    loading,
    saveAnalysis,
    runSmartCheck,
    refetch: fetchAnalyses,
  };
}
