-- =====================================================================
-- المرحلة 3 — الخطوة 3.3ب: إصلاح «إعادة تعيين الملف» من لوحة الأدمن
-- admin_reset_portfolio_data كانت تفشل لأي ملف له «أبرز إنجاز»
-- (portfolios_ai_top_achievement_evidence_id_fkey أثناء حذف الشواهد).
-- الإصلاح: تفريغ حقول الملخص في portfolios قبل أي DELETE.
-- التعريف هو البند 8 من 20260930_custom_indicators_foundation.sql حرفياً،
-- والفرق الوحيد موضع كتلة UPDATE. التحقق والتراجع في آخر الملف (تعليق).
-- =====================================================================

BEGIN;

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

  -- قبل أي حذف: trg_mark_summary_stale يحدّث صف الملف عند حذف كل شاهد، فيُعاد فحص
  -- مفتاح ai_top_achievement_evidence_id على شاهد محذوف ويفشل قبل أن يصل ON DELETE SET NULL.
  UPDATE public.portfolios
     SET ai_summary = NULL,
         ai_top_achievement_evidence_id = NULL,
         ai_summary_generated_at = NULL
   WHERE id = p_portfolio_id;

  -- الجداول التي قد تشير إلى evidence أولاً، ثم evidence، ثم المؤشرات المخصصة والاستراتيجيات
  DELETE FROM public.harvest_reports        WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('harvest_reports', v_n);

  DELETE FROM public.results_analysis       WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('results_analysis', v_n);

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

  DELETE FROM public.section_indicators     WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('custom_indicators', v_n);

  DELETE FROM public.teaching_strategies    WHERE created_by = p_portfolio_id AND is_global = false;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('teaching_strategies', v_n);

  -- لا حذف من ai_usage_log ولا من portfolio_feature_overrides (قرار صاحب المشروع)
  RETURN v_counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reset_portfolio_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_portfolio_data(uuid) TO service_role;

COMMIT;

-- =====================================================================
-- التحقق
-- =====================================================================
-- SELECT pg_get_functiondef('public.admin_reset_portfolio_data(uuid)'::regprocedure);
--   → يجب أن يأتي «UPDATE public.portfolios» بعد «END IF;» مباشرة، وقبل أول
--     «DELETE» (DELETE FROM public.harvest_reports).
--
-- ثم على حساب الاختبار فقط: ولّد له «أبرز إنجاز» حتى يصير
-- ai_top_achievement_evidence_id غير فارغ، ثم نفّذ «إعادة التعيين» من لوحة الأدمن.
-- يجب أن تنجح، وأن تبقى الحقول الثلاثة فارغة بعدها:
-- SELECT ai_summary, ai_top_achievement_evidence_id, ai_summary_generated_at
--   FROM public.portfolios WHERE id = '<test-id>';

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- يعيد البند 8 من 20260930_custom_indicators_foundation.sql كما هو، ومعه الخطأ.
-- =====================================================================
-- BEGIN;
--
-- CREATE OR REPLACE FUNCTION public.admin_reset_portfolio_data(p_portfolio_id uuid)
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_counts jsonb := '{}'::jsonb;
--   v_n integer;
-- BEGIN
--   -- قفل صف الملف: يمنع تنفيذين متزامنين، ويتحقق من وجوده
--   PERFORM 1 FROM public.portfolios WHERE id = p_portfolio_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'portfolio_not_found' USING ERRCODE = 'P0002';
--   END IF;
--
--   -- الجداول التي قد تشير إلى evidence أولاً، ثم evidence، ثم المؤشرات المخصصة والاستراتيجيات
--   DELETE FROM public.harvest_reports        WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('harvest_reports', v_n);
--
--   DELETE FROM public.results_analysis       WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('results_analysis', v_n);
--
--   DELETE FROM public.section_ai_summaries   WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('section_ai_summaries', v_n);
--
--   DELETE FROM public.lesson_plan_templates  WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('lesson_plan_templates', v_n);
--
--   DELETE FROM public.bulk_import_queue      WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bulk_import_queue', v_n);
--
--   DELETE FROM public.monthly_progress       WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('monthly_progress', v_n);
--
--   DELETE FROM public.evidence               WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('evidence', v_n);
--
--   DELETE FROM public.section_indicators     WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('custom_indicators', v_n);
--
--   DELETE FROM public.teaching_strategies    WHERE created_by = p_portfolio_id AND is_global = false;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('teaching_strategies', v_n);
--
--   UPDATE public.portfolios
--      SET ai_summary = NULL,
--          ai_top_achievement_evidence_id = NULL,
--          ai_summary_generated_at = NULL
--    WHERE id = p_portfolio_id;
--
--   -- لا حذف من ai_usage_log ولا من portfolio_feature_overrides (قرار صاحب المشروع)
--   RETURN v_counts;
-- END;
-- $function$;
--
-- REVOKE ALL ON FUNCTION public.admin_reset_portfolio_data(uuid) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.admin_reset_portfolio_data(uuid) TO service_role;
--
-- COMMIT;
