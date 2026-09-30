-- =====================================================================
-- إصلاح للخطوة 3.1ب: القيد ai_usage_log_feature_check لم يكن يسمح بـ
-- 'section_summary'، فكانت check_and_log_ai_usage تفشل وتُوقف توليد
-- ملخصات الأقسام. نُفّذ يدوياً في 30 سبتمبر 2026.
-- =====================================================================
BEGIN;
ALTER TABLE public.ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_feature_check;
ALTER TABLE public.ai_usage_log ADD CONSTRAINT ai_usage_log_feature_check
  CHECK (feature = ANY (ARRAY['image_suggestion','voice_documentation','bulk_import','public_summary','link_import','section_summary']));
COMMIT;

-- التراجع (تعليق فقط):
-- ALTER TABLE public.ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_feature_check;
-- ALTER TABLE public.ai_usage_log ADD CONSTRAINT ai_usage_log_feature_check
--   CHECK (feature = ANY (ARRAY['image_suggestion','voice_documentation','bulk_import','public_summary','link_import']));
