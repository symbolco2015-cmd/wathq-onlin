-- تحليل النتائج — ج2: إخفاء تحليل من الصفحة العامة
-- عمود جديد، وشرط واحد في get_shared_results_analysis. الأعمدة التسعة عشر
-- كما هي، والتوقيع نفسه، فيكفي CREATE OR REPLACE وتبقى الصلاحيات.
-- نفّذه قبل نشر الواجهة: زر الإخفاء يكتب في هذا العمود.

BEGIN;

ALTER TABLE public.results_analysis
  ADD COLUMN hidden_public boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_shared_results_analysis(target_id uuid)
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
    AND ra.hidden_public = false
    AND EXISTS (SELECT 1 FROM portfolios p WHERE p.id = target_id AND p.share_enabled IS TRUE)
  ORDER BY ra.created_at ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_results_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_results_analysis(uuid) TO anon, authenticated, service_role;

COMMIT;

-- تحقق بعد التنفيذ (قراءة فقط؛ تجربة الإخفاء نفسها من الواجهة):
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'results_analysis' AND column_name = 'hidden_public';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'results_analysis';
--   -- سياسة UPDATE للمالك موجودة (زر «تعديل البيانات» يستعملها اليوم)
-- SELECT grantee, privilege_type FROM information_schema.column_privileges
--  WHERE table_name = 'results_analysis' AND column_name = 'hidden_public';
--   -- لا قيود أعمدة على الجدول = صلاحية الجدول كله
-- SELECT count(*) FROM public.get_shared_results_analysis('<test-portfolio-id>');
--   -- بعد إخفاء تحليل من الواجهة ينقص العدد واحداً

-- التراجع (الدالة أولاً لأنها تشير إلى العمود):
-- BEGIN;
-- نص CREATE OR REPLACE أعلاه بلا سطر «AND ra.hidden_public = false»
--   (أي نص الدالة في 20261017_shared_results_analysis_bands.sql بـ CREATE OR REPLACE)
-- ALTER TABLE public.results_analysis DROP COLUMN hidden_public;
-- COMMIT;
