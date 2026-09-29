-- =====================================================================
-- المرحلة 1 — الخطوة 1.5
-- (1) الدالة admin_list_users(): تُرجع للأدمن فقط البريد وتاريخ الإنشاء
--     وآخر دخول فعلي من auth.users، لكل مستخدم له صف في portfolios.
--     غير الأدمن يحصل على خطأ 42501.
-- (2) جدول admin_audit_log: سجل عمليات الأدمن، للإضافة فقط. القراءة
--     للأدمن، والإضافة للأدمن باسمه هو فقط، ولا تعديل ولا حذف.
-- الملف قابل للتشغيل أكثر من مرة.
-- =====================================================================

BEGIN;

-- (1) قائمة المستخدمين للوحة الأدمن
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرّح' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at
  FROM auth.users u
  WHERE EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = u.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- (2) سجل عمليات الأدمن
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_portfolio_id uuid,  -- بلا مفتاح أجنبي: يبقى السجل بعد حذف المعلم
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- TRUNCATE لا يخضع لـ RLS، فتُسحب صلاحيات التعديل والحذف من مستوى الجدول أيضاً
REVOKE ALL ON public.admin_audit_log FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_log FROM authenticated;

DROP POLICY IF EXISTS "الأدمن يقرأ سجل العمليات" ON public.admin_audit_log;
CREATE POLICY "الأدمن يقرأ سجل العمليات"
  ON public.admin_audit_log
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "الأدمن يضيف إلى سجل العمليات باسمه" ON public.admin_audit_log;
CREATE POLICY "الأدمن يضيف إلى سجل العمليات باسمه"
  ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (public.is_admin() AND admin_id = (select auth.uid()));

-- لا سياسات UPDATE ولا DELETE: السجل للإضافة فقط

COMMIT;

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- =====================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.admin_audit_log;
-- DROP FUNCTION IF EXISTS public.admin_list_users();
-- COMMIT;
