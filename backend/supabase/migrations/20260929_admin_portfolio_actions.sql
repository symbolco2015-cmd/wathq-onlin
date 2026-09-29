-- =====================================================================
-- المرحلة 1 — الخطوة 1.6أ
-- (1) إصلاح قيد monthly_progress_portfolio_id_fkey ليصبح ON DELETE CASCADE،
--     فيصبح حذف صف portfolios ممكناً لمعلم له عدّاد شهري.
-- (2) الدالة admin_reset_portfolio_data(): تحذف محتوى المعلم وتُبقي ملفه
--     الشخصي وإعداداته وسجل استخدام الذكاء الاصطناعي. لا يستدعيها إلا
--     service_role (من Edge Function admin-portfolio-action).
-- لا دالة SQL للحذف: الـ Edge Function تحذف صف portfolios بمفتاح الخدمة،
-- والـ CASCADE يتكفل بالباقي.
-- الملف قابل للتشغيل أكثر من مرة.
-- =====================================================================

BEGIN;

-- (1) القيد
ALTER TABLE public.monthly_progress
  DROP CONSTRAINT IF EXISTS monthly_progress_portfolio_id_fkey;

ALTER TABLE public.monthly_progress
  ADD CONSTRAINT monthly_progress_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id) ON DELETE CASCADE;

-- (2) إعادة التعيين
CREATE OR REPLACE FUNCTION public.admin_reset_portfolio_data(p_portfolio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  -- قفل صف الملف: يمنع تنفيذين متزامنين، ويتحقق من وجوده
  PERFORM 1 FROM public.portfolios WHERE id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portfolio_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- الجداول التي قد تشير إلى evidence أولاً، ثم evidence، ثم الاستراتيجيات
  DELETE FROM public.harvest_reports        WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('harvest_reports', v_n);

  DELETE FROM public.results_analysis       WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('results_analysis', v_n);

  DELETE FROM public.indicator_ai_summaries WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('indicator_ai_summaries', v_n);

  DELETE FROM public.section_ai_summaries   WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('section_ai_summaries', v_n);

  DELETE FROM public.lesson_plan_templates  WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('lesson_plan_templates', v_n);

  DELETE FROM public.bulk_import_queue      WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bulk_import_queue', v_n);

  DELETE FROM public.monthly_progress       WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('monthly_progress', v_n);

  DELETE FROM public.evidence               WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('evidence', v_n);

  DELETE FROM public.teaching_strategies    WHERE created_by = p_portfolio_id AND is_global = false;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('teaching_strategies', v_n);

  UPDATE public.portfolios
     SET ai_summary = NULL,
         ai_top_achievement_evidence_id = NULL,
         ai_summary_generated_at = NULL
   WHERE id = p_portfolio_id;

  -- لا حذف من ai_usage_log ولا من portfolio_feature_overrides (قرار صاحب المشروع)
  RETURN v_counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reset_portfolio_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_portfolio_data(uuid) TO service_role;

COMMIT;

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- =====================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.admin_reset_portfolio_data(uuid);
-- ALTER TABLE public.monthly_progress DROP CONSTRAINT IF EXISTS monthly_progress_portfolio_id_fkey;
-- ALTER TABLE public.monthly_progress
--   ADD CONSTRAINT monthly_progress_portfolio_id_fkey
--   FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id);
-- COMMIT;
