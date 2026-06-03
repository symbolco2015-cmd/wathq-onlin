-- ═══════════════════════════════════════════════════════════
-- وثّق — إعداد جدول التعاميم والتحديثات في Supabase
-- قم بتشغيل هذه الأوامر في Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. إنشاء جدول announcements
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('tech', 'admin', 'urgent')),
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────
-- 2. تفعيل Row Level Security على جدول announcements
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- السماح للجميع بقراءة التعاميم
DROP POLICY IF EXISTS "Allow public read access to announcements" ON public.announcements;
CREATE POLICY "Allow public read access to announcements"
  ON public.announcements
  FOR SELECT
  USING (true);

-- السماح للمشرفين فقط (الأدمن) بكتابة التعاميم
DROP POLICY IF EXISTS "Allow admins to insert announcements" ON public.announcements;
CREATE POLICY "Allow admins to insert announcements"
  ON public.announcements
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
    )
  );

-- السماح للمشرفين فقط بتعديل التعاميم
DROP POLICY IF EXISTS "Allow admins to update announcements" ON public.announcements;
CREATE POLICY "Allow admins to update announcements"
  ON public.announcements
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
    )
  );

-- السماح للمشرفين فقط بحذف التعاميم
DROP POLICY IF EXISTS "Allow admins to delete announcements" ON public.announcements;
CREATE POLICY "Allow admins to delete announcements"
  ON public.announcements
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
    )
  );
