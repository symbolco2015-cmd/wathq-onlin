-- =====================================================================
-- المرحلة 2 — الخطوة 2.3
-- جدول public_settings: إعدادات عامة يقرؤها أي زائر، مثل بيانات الدعم
-- في شاشة «تعذّر الاتصال». لا يوضع فيه أي سر.
-- القراءة للجميع، والإضافة والتعديل والحذف للأدمن فقط.
-- الملف قابل للتشغيل أكثر من مرة.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.public_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.public_settings IS
  'إعدادات عامة يجوز أن يراها أي زائر فقط (مثل بيانات الدعم). يقرؤها الجميع بلا تسجيل دخول، فلا يوضع فيها أي سر أو مفتاح.';

ALTER TABLE public.public_settings ENABLE ROW LEVEL SECURITY;

-- القراءة صريحة للزائر والمستخدم. TRUNCATE لا يخضع لـ RLS فيُسحب من
-- مستوى الجدول، وكذلك الكتابة من anon.
GRANT SELECT ON public.public_settings TO anon, authenticated;
REVOKE TRUNCATE ON public.public_settings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.public_settings FROM anon;

DROP POLICY IF EXISTS "الجميع يقرأ الإعدادات العامة" ON public.public_settings;
CREATE POLICY "الجميع يقرأ الإعدادات العامة"
  ON public.public_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "الأدمن يضيف إعداداً عاماً" ON public.public_settings;
CREATE POLICY "الأدمن يضيف إعداداً عاماً"
  ON public.public_settings
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "الأدمن يعدّل إعداداً عاماً" ON public.public_settings;
CREATE POLICY "الأدمن يعدّل إعداداً عاماً"
  ON public.public_settings
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "الأدمن يحذف إعداداً عاماً" ON public.public_settings;
CREATE POLICY "الأدمن يحذف إعداداً عاماً"
  ON public.public_settings
  FOR DELETE
  USING (public.is_admin());

-- واتساب بالصيغة الدولية: بلا + ولا صفر أول
INSERT INTO public.public_settings (key, value) VALUES
  ('support_email',    'symbolco2015@gmail.com'),
  ('support_whatsapp', '966569961179')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- =====================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.public_settings;
-- COMMIT;
