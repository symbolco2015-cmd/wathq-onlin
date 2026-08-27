-- ═══════════════════════════════════════════════════════════════════════
-- كشف ملخص بند "إعداد خطة التعلم" (section_id=6) لصفحة المشاركة العامة
-- شغّل هذا الملف في: Supabase ➜ SQL Editor ➜ New query
-- بعد تنفيذ supabase_section_ai_summaries.sql أولاً (الجدول المصدر).
--
-- لماذا RPC وليس قراءة مباشرة على section_ai_summaries:
--   • RLS الحالية تقيّد كل عمليات الجدول بمالك الملف (نفس نمط evidence/
--     monthly_progress) — أي زائر غير مسجّل (أو مسجّل غير المالك) لا
--     يستطيع رؤية أي صف، حتى لو كانت المشاركة العامة مفعّلة
--     (share_enabled).
--   • نفس النمط المستخدم سابقاً في get_shared_evidence()/
--     get_shared_results_analysis(): SECURITY DEFINER تتحقق أولاً من
--     share_enabled عبر portfolios، ولا تُرجع شيئاً غير ذلك.
--   • section_id=6 مكتوب حرفياً هنا عمداً — هذه الدالة مخصصة لبند
--     "إعداد خطة التعلم" تحديداً، لا RPC عامة لأي قسم (بنفس روح
--     LESSON_PLAN_DISTRIBUTION_INDICATOR_ID الحرفي في
--     frontend/src/components/EvidenceForm.tsx).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_shared_lesson_plan_summary(target_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  is_shared boolean;
  result    text;
BEGIN
  SELECT share_enabled INTO is_shared
  FROM public.portfolios
  WHERE id = target_id;

  IF is_shared IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT ai_sentence INTO result
  FROM public.section_ai_summaries
  WHERE portfolio_id = target_id
    AND section_id = 6;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_lesson_plan_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_lesson_plan_summary(uuid) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- تحقّق بعد التنفيذ
-- ════════════════════════════════════════════════════════════════════════
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'get_shared_lesson_plan_summary';

SELECT grantee, privilege_type FROM information_schema.role_routine_grants
WHERE routine_name = 'get_shared_lesson_plan_summary';
