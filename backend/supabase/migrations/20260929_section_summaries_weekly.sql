-- =====================================================================
-- المرحلة 3 — الخطوة 3.1ب: ملخصات الأقسام تُولَّد أسبوعياً من النظام
-- (1) section_ai_summaries: عمودا hidden وsource_key، والمعلم يقرأ ويغيّر
--     hidden فقط. الكتابة من generate-portfolio-summaries بمفتاح الخدمة.
-- (2) get_shared_section_summaries(): ملخصات الأقسام العادية للصفحة العامة.
-- (3) حذف get_shared_lesson_plan_summary. جدول indicator_ai_summaries يبقى
--     مؤقتاً لأن admin_reset_portfolio_data() ما زالت تحذف منه.
-- (4) صف feature_flags 'section_summary' مفعّل، يظهر في لوحة الأدمن ← الميزات.
-- الملف قابل للتشغيل أكثر من مرة.
-- =====================================================================

-- تحقق قبل التنفيذ (شغّله وحده أولاً): يجب أن يُرجع صفاً واحداً
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'evidence' AND column_name = 'updated_at';

BEGIN;

-- (1) الأعمدة
ALTER TABLE public.section_ai_summaries ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.section_ai_summaries ADD COLUMN IF NOT EXISTS source_key text;

-- القيد الفريد الذي يعتمد عليه upsert (موجود من supabase_section_ai_summaries.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.section_ai_summaries'::regclass
       AND contype = 'u'
       AND conkey = ARRAY[
         (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.section_ai_summaries'::regclass AND attname = 'portfolio_id'),
         (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.section_ai_summaries'::regclass AND attname = 'section_id')
       ]::smallint[]
  ) THEN
    ALTER TABLE public.section_ai_summaries
      ADD CONSTRAINT section_ai_summaries_portfolio_id_section_id_key UNIQUE (portfolio_id, section_id);
  END IF;
END $$;

-- السياسات
DROP POLICY IF EXISTS "المعلم يدير ملخصات أقسامه فقط" ON public.section_ai_summaries;
DROP POLICY IF EXISTS "section_ai_summaries_owner_select" ON public.section_ai_summaries;
DROP POLICY IF EXISTS "section_ai_summaries_owner_update" ON public.section_ai_summaries;

CREATE POLICY "section_ai_summaries_owner_select" ON public.section_ai_summaries
  FOR SELECT TO authenticated
  USING (portfolio_id = (select auth.uid()));

CREATE POLICY "section_ai_summaries_owner_update" ON public.section_ai_summaries
  FOR UPDATE TO authenticated
  USING (portfolio_id = (select auth.uid()))
  WITH CHECK (portfolio_id = (select auth.uid()));

-- الصلاحيات: المعلم يقرأ ويغيّر hidden فقط
REVOKE ALL ON public.section_ai_summaries FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.section_ai_summaries FROM authenticated;
GRANT SELECT ON public.section_ai_summaries TO authenticated;
GRANT UPDATE (hidden) ON public.section_ai_summaries TO authenticated;

-- (2) القراءة العامة
CREATE OR REPLACE FUNCTION public.get_shared_section_summaries(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE is_shared boolean; result jsonb;
BEGIN
  SELECT share_enabled INTO is_shared FROM public.portfolios WHERE id = target_id;
  IF is_shared IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_object_agg(s.section_id::text, s.ai_sentence), '{}'::jsonb)
    INTO result
    FROM public.section_ai_summaries s
    JOIN public.sections sec ON sec.id = s.section_id AND sec.section_type = 'core'
   WHERE s.portfolio_id = target_id
     AND s.hidden = false
     AND EXISTS (SELECT 1 FROM public.evidence e
                  WHERE e.portfolio_id = target_id AND e.section_id = s.section_id);
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_section_summaries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_section_summaries(uuid) TO anon, authenticated;

-- (3) الحذف
DROP FUNCTION IF EXISTS public.get_shared_lesson_plan_summary(uuid);

-- (4) مفتاح الميزة: check_and_log_ai_usage تستدعي is_feature_enabled، وفي
-- مسار الخدمة لا يوجد auth.uid()، فيُعتمد على هذا الصف العام وحده
INSERT INTO public.feature_flags (feature, enabled)
VALUES ('section_summary', true)
ON CONFLICT (feature) DO NOTHING;

COMMIT;

-- تحقق بعد التنفيذ
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'section_ai_summaries';
-- SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
--  WHERE table_name = 'section_ai_summaries' AND grantee IN ('anon','authenticated');
-- SELECT public.get_shared_section_summaries('<test-portfolio-id>');
-- SELECT * FROM public.feature_flags WHERE feature = 'section_summary';

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- =====================================================================
-- BEGIN;
-- DELETE FROM public.feature_flags WHERE feature = 'section_summary';
-- DROP FUNCTION IF EXISTS public.get_shared_section_summaries(uuid);
-- DROP POLICY IF EXISTS "section_ai_summaries_owner_select" ON public.section_ai_summaries;
-- DROP POLICY IF EXISTS "section_ai_summaries_owner_update" ON public.section_ai_summaries;
-- CREATE POLICY "المعلم يدير ملخصات أقسامه فقط" ON public.section_ai_summaries FOR ALL
--   USING (portfolio_id = auth.uid()) WITH CHECK (portfolio_id = auth.uid());
-- GRANT ALL ON public.section_ai_summaries TO anon, authenticated;
-- CREATE OR REPLACE FUNCTION public.get_shared_lesson_plan_summary(target_id uuid)
--  RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
-- DECLARE is_shared boolean; result text;
-- BEGIN
--   SELECT share_enabled INTO is_shared FROM public.portfolios WHERE id = target_id;
--   IF is_shared IS NOT TRUE THEN RETURN NULL; END IF;
--   SELECT ai_sentence INTO result FROM public.section_ai_summaries
--   WHERE portfolio_id = target_id AND section_id = 6;
--   RETURN result;
-- END; $function$;
-- REVOKE ALL ON FUNCTION public.get_shared_lesson_plan_summary(uuid) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_shared_lesson_plan_summary(uuid) TO anon, authenticated;
-- (العمودان hidden وsource_key يبقيان، فلا ضرر منهما)
-- COMMIT;
