-- ═══════════════════════════════════════════════════════════
-- وثّق — إعداد لوحة تحكم الأدمن في Supabase
-- قم بتشغيل هذه الأوامر في Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. إنشاء جدول admin_users
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 2. تفعيل Row Level Security على جدول admin_users
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- السماح للأدمن بقراءة سجله فقط (للتحقق من صلاحياته)
CREATE POLICY "Admin can read own record"
  ON public.admin_users
  FOR SELECT
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 3. سياسة RLS على جدول portfolios — السماح للأدمن بقراءة الكل
-- ────────────────────────────────────────────────────────────

-- أولاً: إزالة السياسات القديمة إن وجدت
DROP POLICY IF EXISTS "Admin can read all portfolios" ON public.portfolios;

-- إضافة سياسة تسمح للأدمن بقراءة جميع البيانات
CREATE POLICY "Admin can read all portfolios"
  ON public.portfolios
  FOR SELECT
  USING (
    -- المستخدم يقرأ ملفه الشخصي
    auth.uid() = id
    OR
    -- الأدمن يقرأ ملفات الجميع
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
    )
  );

-- سياسة الحذف للأدمن
DROP POLICY IF EXISTS "Admin can delete portfolios" ON public.portfolios;

CREATE POLICY "Admin can delete portfolios"
  ON public.portfolios
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- 4. إضافة عمود created_at لجدول portfolios (إن لم يكن موجوداً)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ────────────────────────────────────────────────────────────
-- 5. إضافة مستخدم أدمن
-- استبدل 'YOUR-USER-ID-HERE' بمعرّف حسابك من Supabase Auth
-- يمكنك إيجاده من: Authentication > Users > نسخ الـ UUID
-- ────────────────────────────────────────────────────────────
INSERT INTO public.admin_users (user_id)
VALUES ('YOUR-USER-ID-HERE')
ON CONFLICT (user_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 6. للتحقق من الإعداد — تشغيل هذا الاستعلام
-- ────────────────────────────────────────────────────────────
SELECT
  au.user_id,
  u.email,
  au.created_at AS admin_since
FROM public.admin_users au
JOIN auth.users u ON u.id = au.user_id;
