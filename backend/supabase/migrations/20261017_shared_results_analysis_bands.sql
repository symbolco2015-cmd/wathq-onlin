-- تحليل النتائج — ج1: نسبة النجاح وأعداد الفئات في get_shared_results_analysis
-- إضافة فقط: الأعمدة السبعة عشر الحالية بأسمائها وترتيبها، وعمودان في الآخر.
-- أعداد مجمّعة فقط: لا اسم ولا درجة طالب بعينه.

BEGIN;

DROP FUNCTION IF EXISTS public.get_shared_results_analysis(uuid);

CREATE FUNCTION public.get_shared_results_analysis(target_id uuid)
 RETURNS TABLE(
   id uuid, subject text, stage text, class_section smallint, created_at timestamp with time zone,
   total_students integer, average numeric, min_score numeric, max_score numeric,
   grade_level smallint, test_type text, test_seq smallint, full_mark numeric,
   absent_count integer, average_pct numeric, min_pct numeric, max_pct numeric,
   pass_count integer, band_counts jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT ra.id, ra.subject, ra.stage, ra.class_section, ra.created_at,
    st.n AS total_students,
    COALESCE(round(st.avg_raw, 2), 0) AS average,
    COALESCE(st.min_raw, 0) AS min_score,
    COALESCE(st.max_raw, 0) AS max_score,
    ra.grade_level, ra.test_type, ra.test_seq,
    fm.v AS full_mark,
    COALESCE((ra.summary->>'absentCount')::int, 0) AS absent_count,
    COALESCE(round(st.avg_raw / fm.v * 100, 1), 0) AS average_pct,
    COALESCE(round(st.min_raw / fm.v * 100, 1), 0) AS min_pct,
    COALESCE(round(st.max_raw / fm.v * 100, 1), 0) AS max_pct,
    st.pass_n AS pass_count,
    bc.counts AS band_counts
  FROM results_analysis ra
  CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(ra.full_mark, 0), 100) AS v) fm
  -- نسب الحاضرين: الشروط نفسها التي في الإصدار السابق
  CROSS JOIN LATERAL (
    SELECT array_agg(x.sc) AS scores
      FROM (SELECT (s->>'score')::numeric AS sc
              FROM jsonb_array_elements(COALESCE(ra.summary->'students', '[]'::jsonb)) s
             WHERE jsonb_typeof(s->'score') = 'number'
               AND COALESCE((s->>'absent')::boolean, false) = false) x
  ) sa
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS n, avg(u.sc) AS avg_raw, min(u.sc) AS min_raw, max(u.sc) AS max_raw,
           count(*) FILTER (WHERE u.sc / fm.v * 100 >= 60)::int AS pass_n
      FROM unnest(COALESCE(sa.scores, '{}'::numeric[])) AS u(sc)
  ) st
  -- الفئة كما في matchBand (logic.ts): أعلى فئة حدها الأدنى ≤ النسبة، وإلا الأدنى.
  -- كل الفئات بلا شرط على stage، في gb وفي g، لأن الواجهة كذلك: fetchGradeBands
  -- في useResultsAnalysis.ts تقرأ grade_bands كلها، وmatchBand لا تصفّي. إن
  -- أُضيفت يوماً فئات خاصة بمرحلة، يُضاف الشرط هنا وفي الواجهة معاً.
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', gb.label, 'count', COALESCE(c.n, 0))
                              ORDER BY gb.display_order), '[]'::jsonb) AS counts
      FROM grade_bands gb
      LEFT JOIN (
        SELECT b.id, count(*)::int AS n
          FROM unnest(COALESCE(sa.scores, '{}'::numeric[])) AS u(sc)
          CROSS JOIN LATERAL (
            SELECT g.id FROM grade_bands g
             ORDER BY (g.min_score <= u.sc / fm.v * 100) DESC,
                      CASE WHEN g.min_score <= u.sc / fm.v * 100 THEN g.min_score END DESC NULLS LAST,
                      g.min_score ASC
             LIMIT 1) b
         GROUP BY b.id
      ) c ON c.id = gb.id
  ) bc
  WHERE ra.portfolio_id = target_id
    AND EXISTS (SELECT 1 FROM portfolios p WHERE p.id = target_id AND p.share_enabled IS TRUE)
  ORDER BY ra.created_at ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_results_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_results_analysis(uuid) TO anon, authenticated, service_role;

COMMIT;

-- تحقق بعد التنفيذ (حساب الاختبار):
-- SELECT subject, class_section, total_students, pass_count, band_counts
--   FROM public.get_shared_results_analysis('<test-portfolio-id>');
-- مجموع count في band_counts = total_students لكل صف.

-- التراجع: نص الدالة في 20261015_results_analysis_full_mark.sql (سطر 42-81).
