-- ═══════════════════════════════════════════════════════════════════════
-- قوالب خطة الدرس (lesson_plan_templates) — عامة (أدمن) + شخصية (كل معلم)
-- شغّل هذا الملف في: Supabase ➜ SQL Editor ➜ New query
--
-- السياق: زر "اكتب خطة من الصفر" في نموذج إضافة دليل لمؤشر "إعداد خطة فصلية
-- موزعة" (بند 6 — إعداد خطة التعلم) يعرض منتقي قوالب جاهزة قبل الكتابة
-- الحرة. تحقّقنا مباشرة على قاعدة الإنتاج (information_schema.tables) أن هذا
-- الجدول غير موجود فعلياً رغم افتراضه في المواصفة الأصلية — هذا الملف جديد
-- بالكامل، لا تعديل على أي شيء قائم.
--
-- portfolio_id NULL = قالب عام (يُنشئه الأدمن، يظهر لكل المعلمين)
-- portfolio_id = uuid معلم = قالب شخصي (يظهر لصاحبه فقط، بجانب العامة)
--
-- نمط الصلاحيات مطابق لـ is_admin() المُعرَّفة في supabase_setup_complete.sql
-- (نفس نمط academic_dates/feature_flags: قراءة عامة أو بالملكية، كتابة
-- بالملكية أو is_admin()) — لا صلاحيات مرتفعة جديدة، لا دالة SECURITY
-- DEFINER جديدة.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.lesson_plan_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE CASCADE,
  title        text NOT NULL,
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_plan_templates ENABLE ROW LEVEL SECURITY;

-- قراءة: القوالب العامة (portfolio_id IS NULL) للجميع + قوالب المعلم الخاصة له
DROP POLICY IF EXISTS "lesson_plan_templates_read" ON public.lesson_plan_templates;
CREATE POLICY "lesson_plan_templates_read" ON public.lesson_plan_templates
  FOR SELECT USING (portfolio_id IS NULL OR portfolio_id = auth.uid());

-- كتابة القوالب الشخصية: المعلم لنفسه فقط (portfolio_id يطابق جلسته حصراً)
DROP POLICY IF EXISTS "lesson_plan_templates_owner_insert" ON public.lesson_plan_templates;
CREATE POLICY "lesson_plan_templates_owner_insert" ON public.lesson_plan_templates
  FOR INSERT WITH CHECK (portfolio_id = auth.uid());

DROP POLICY IF EXISTS "lesson_plan_templates_owner_update" ON public.lesson_plan_templates;
CREATE POLICY "lesson_plan_templates_owner_update" ON public.lesson_plan_templates
  FOR UPDATE USING (portfolio_id = auth.uid()) WITH CHECK (portfolio_id = auth.uid());

DROP POLICY IF EXISTS "lesson_plan_templates_owner_delete" ON public.lesson_plan_templates;
CREATE POLICY "lesson_plan_templates_owner_delete" ON public.lesson_plan_templates
  FOR DELETE USING (portfolio_id = auth.uid());

-- كتابة القوالب العامة: الأدمن فقط (نفس شرط academic_dates_admin_*)
DROP POLICY IF EXISTS "lesson_plan_templates_admin_insert" ON public.lesson_plan_templates;
CREATE POLICY "lesson_plan_templates_admin_insert" ON public.lesson_plan_templates
  FOR INSERT WITH CHECK (portfolio_id IS NULL AND public.is_admin());

DROP POLICY IF EXISTS "lesson_plan_templates_admin_update" ON public.lesson_plan_templates;
CREATE POLICY "lesson_plan_templates_admin_update" ON public.lesson_plan_templates
  FOR UPDATE USING (portfolio_id IS NULL AND public.is_admin()) WITH CHECK (portfolio_id IS NULL AND public.is_admin());

DROP POLICY IF EXISTS "lesson_plan_templates_admin_delete" ON public.lesson_plan_templates;
CREATE POLICY "lesson_plan_templates_admin_delete" ON public.lesson_plan_templates
  FOR DELETE USING (portfolio_id IS NULL AND public.is_admin());

-- ════════════════════════════════════════════════════════════════════════
-- تحقّق بعد التنفيذ
-- ════════════════════════════════════════════════════════════════════════
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'lesson_plan_templates';
