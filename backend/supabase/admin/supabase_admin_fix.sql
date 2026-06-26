-- ═══════════════════════════════════════════════════════════
-- وثّق — إصلاح صلاحيات جدول admin_users
-- قم بتشغيل هذه الأوامر في Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. إنشاء جدول admin_users (إذا لم يكن موجوداً)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 2. تفعيل Row Level Security
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3. إضافة سياسة تسمح للمستخدمين المسجلين بقراءة بياناتهم
--    هذه الخطوة ضرورية لكي يعمل فحص isAdmin بشكل صحيح
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow authenticated users to read admin_users" ON public.admin_users;
CREATE POLICY "Allow authenticated users to read admin_users"
  ON public.admin_users
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- 4. إضافة سياسة تسمح للأدمن بإضافة أدمن آخر
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow admins to insert admin_users" ON public.admin_users;
CREATE POLICY "Allow admins to insert admin_users"
  ON public.admin_users
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- 5. إضافة الأدمن الأول يدوياً — استبدل YOUR_USER_ID بمعرّف حسابك
--    يمكنك إيجاد معرّف حسابك من: Supabase > Authentication > Users
-- ────────────────────────────────────────────────────────────

-- ⚠️ استبدل 'YOUR_USER_ID_HERE' بمعرّف حسابك الفعلي من لوحة Supabase
-- مثال: INSERT INTO public.admin_users (user_id) VALUES ('550e8400-e29b-41d4-a716-446655440000');

-- INSERT INTO public.admin_users (user_id)
-- VALUES ('YOUR_USER_ID_HERE')
-- ON CONFLICT (user_id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 6. التحقق — يجب أن يُظهر هذا الاستعلام سجلاتك
-- ────────────────────────────────────────────────────────────
-- SELECT * FROM public.admin_users;
