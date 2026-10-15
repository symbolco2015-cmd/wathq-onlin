-- تحليل النتائج — الخطوة أ: الدرجة العظمى والاختبار والصف، والشعبة رقماً
--
-- استعلامات التحقق شُغّلت قبل الكتابة: الجدول فارغ، ولا views ولا rules عليه،
-- وحدود grade_bands من 100 وstage فيها null، والدالة القديمة RETURNS TABLE
-- بلغة sql (نصها في قسم التراجع أسفل الملف). admin_reset_portfolio_data
-- تحذف صفوف الجدول فقط، فلا يمسّها تغيير الأعمدة.
--
-- الرموز في القاعدة إنجليزية، والنصوص العربية من دوال العرض في
-- frontend/src/components/ResultsAnalysis/logic.ts.

BEGIN;

-- الجدول يجب أن يكون فارغاً، لأن class_section يتحول من نص إلى رقم
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.results_analysis) THEN
    RAISE EXCEPTION 'results_analysis ليس فارغاً — أوقف التنفيذ وراجع الترحيل';
  END IF;
END $$;

ALTER TABLE public.results_analysis
  ADD COLUMN grade_level smallint,
  ADD COLUMN test_type   text,
  ADD COLUMN test_seq    smallint,
  ADD COLUMN full_mark   numeric NOT NULL DEFAULT 100;

ALTER TABLE public.results_analysis
  ALTER COLUMN class_section TYPE smallint USING NULLIF(trim(class_section), '')::smallint;

ALTER TABLE public.results_analysis
  ADD CONSTRAINT results_analysis_full_mark_chk     CHECK (full_mark > 0),
  ADD CONSTRAINT results_analysis_test_type_chk     CHECK (test_type IS NULL OR test_type IN
      ('midterm','final','quiz','oral','project','coursework')),
  ADD CONSTRAINT results_analysis_test_seq_chk      CHECK (test_seq IS NULL OR test_seq BETWEEN 1 AND 4),
  ADD CONSTRAINT results_analysis_stage_chk         CHECK (stage IS NULL OR stage IN ('primary','intermediate','secondary')),
  ADD CONSTRAINT results_analysis_grade_level_chk   CHECK (grade_level IS NULL OR (grade_level BETWEEN 1 AND 6
      AND (grade_level <= 3 OR stage IS NULL OR stage = 'primary'))),
  ADD CONSTRAINT results_analysis_class_section_chk CHECK (class_section IS NULL OR class_section BETWEEN 1 AND 50);

-- أعمدة الناتج تتغير (نوع class_section وأعمدة جديدة)، فيلزم الحذف ثم الإنشاء.
-- الأعمدة التسعة الأولى بأسمائها وترتيبها ومعانيها كما كانت، ليبقى الكود
-- الحالي على الموقع يعمل بعد التنفيذ وقبل دمج الكود الجديد.
DROP FUNCTION IF EXISTS public.get_shared_results_analysis(uuid);

-- أرقام مجمّعة فقط: لا اسم ولا درجة طالب بعينه. total_students والمتوسط
-- والأدنى والأعلى من الحاضرين فقط: الغائب ليس في students أصلاً، وأي عنصر
-- بلا score رقمي أو معلَّم absent يُستبعد احتياطاً. min_score/max_score خام.
CREATE FUNCTION public.get_shared_results_analysis(target_id uuid)
 RETURNS TABLE(
   id uuid, subject text, stage text, class_section smallint, created_at timestamp with time zone,
   total_students integer, average numeric, min_score numeric, max_score numeric,
   grade_level smallint, test_type text, test_seq smallint, full_mark numeric,
   absent_count integer, average_pct numeric, min_pct numeric, max_pct numeric)
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
    COALESCE(round(st.max_raw / fm.v * 100, 1), 0) AS max_pct
  FROM results_analysis ra
  CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(ra.full_mark, 0), 100) AS v) fm
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS n, avg(x.sc) AS avg_raw, min(x.sc) AS min_raw, max(x.sc) AS max_raw
      FROM (SELECT (s->>'score')::numeric AS sc
              FROM jsonb_array_elements(COALESCE(ra.summary->'students', '[]'::jsonb)) s
             WHERE jsonb_typeof(s->'score') = 'number'
               AND COALESCE((s->>'absent')::boolean, false) = false) x
  ) st
  WHERE ra.portfolio_id = target_id
    AND EXISTS (SELECT 1 FROM portfolios p WHERE p.id = target_id AND p.share_enabled IS TRUE)
  ORDER BY ra.created_at ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_results_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_results_analysis(uuid) TO anon, authenticated;

COMMIT;

-- تحقق بعد التنفيذ
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.results_analysis'::regclass;
-- SELECT column_name, data_type, column_default FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'results_analysis' ORDER BY ordinal_position;
-- SELECT * FROM public.get_shared_results_analysis('<test-portfolio-id>');

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- =====================================================================
-- BEGIN;
-- ALTER TABLE public.results_analysis
--   DROP CONSTRAINT results_analysis_full_mark_chk, DROP CONSTRAINT results_analysis_test_type_chk,
--   DROP CONSTRAINT results_analysis_test_seq_chk, DROP CONSTRAINT results_analysis_stage_chk,
--   DROP CONSTRAINT results_analysis_grade_level_chk, DROP CONSTRAINT results_analysis_class_section_chk;
-- ALTER TABLE public.results_analysis
--   DROP COLUMN grade_level, DROP COLUMN test_type, DROP COLUMN test_seq, DROP COLUMN full_mark;
-- DROP FUNCTION IF EXISTS public.get_shared_results_analysis(uuid);
-- ALTER TABLE public.results_analysis ALTER COLUMN class_section TYPE text USING class_section::text;
-- CREATE FUNCTION public.get_shared_results_analysis(target_id uuid)
--  RETURNS TABLE(id uuid, subject text, stage text, class_section text, created_at timestamp with time zone, total_students integer, average numeric, min_score numeric, max_score numeric)
--  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
--   SELECT ra.id, ra.subject, ra.stage, ra.class_section, ra.created_at,
--     (ra.summary->>'totalStudents')::int AS total_students,
--     (ra.summary->>'average')::numeric AS average,
--     (SELECT MIN((s->>'score')::numeric) FROM jsonb_array_elements(ra.summary->'students') s) AS min_score,
--     (SELECT MAX((s->>'score')::numeric) FROM jsonb_array_elements(ra.summary->'students') s) AS max_score
--   FROM results_analysis ra
--   WHERE ra.portfolio_id = target_id
--     AND EXISTS (SELECT 1 FROM portfolios p WHERE p.id = target_id AND p.share_enabled IS TRUE)
--   ORDER BY ra.created_at ASC;
-- $function$;
-- REVOKE ALL ON FUNCTION public.get_shared_results_analysis(uuid) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_shared_results_analysis(uuid) TO anon, authenticated;
-- COMMIT;
