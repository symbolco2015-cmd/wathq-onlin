-- ⚠️ SUPERSEDED — DO NOT RUN — replaced by supabase_share_enabled_setup.sql
-- (unsafe: returns full state without checking share_enabled flag)
--
-- تحقّقنا مباشرة على قاعدة الإنتاج بتاريخ 2026-06-21 أن هذا الملف لم يُطبَّق فعلياً
-- (لا عمود share_enabled موجود، ولا دالة get_shared_portfolio في schema cache).
-- لو طُبّق كما هو فسيُرجع كامل state (شاملاً notes) لأي زائر يعرف الـ UUID، بدون أي
-- تحقق من رغبة المعلم بالمشاركة. استخدم supabase_share_enabled_setup.sql بدلاً منه.
--
-- ═══════════════════════════════════════════════════════════════════════
-- إصلاح RLS — تقييد قراءة portfolios + دالة آمنة لميزة المشاركة
-- شغّل هذا الملف في: Supabase ➜ SQL Editor ➜ New query
-- ═══════════════════════════════════════════════════════════════════════

-- (1) استبدال السياسة المفتوحة بسياسة تقيّد القراءة على المالك والأدمن فقط
DROP POLICY IF EXISTS "portfolios_public_read" ON public.portfolios;
CREATE POLICY "portfolios_owner_or_admin_read" ON public.portfolios
  FOR SELECT USING (auth.uid() = id OR public.is_admin());


-- (2) دالة آمنة لميزة المشاركة العامة (?share=UUID)
--     SECURITY DEFINER تجعلها تعمل خارج RLS بشكل متحكّم —
--     تُرجع فقط state لملف واحد بمعرّفه، ولا تسمح بتعداد الملفات.
CREATE OR REPLACE FUNCTION public.get_shared_portfolio(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT state INTO result
  FROM public.portfolios
  WHERE id = target_id;

  RETURN result;
END;
$$;

-- منح الصلاحية للزوار وللمستخدمين المسجّلين
GRANT EXECUTE ON FUNCTION public.get_shared_portfolio(uuid) TO anon, authenticated;


-- (3) التحقّق — يجب أن تظهر السياسة الجديدة بدلاً من portfolios_public_read
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'portfolios'
ORDER BY cmd;
