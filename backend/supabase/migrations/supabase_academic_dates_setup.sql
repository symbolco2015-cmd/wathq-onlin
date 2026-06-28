-- ═══════════════════════════════════════════════════════════
-- وثّق — إعداد جدول المواعيد الدراسية (academic_dates) في Supabase
-- قم بتشغيل هذه الأوامر في Supabase SQL Editor
-- يفترض هذا الملف أن public.is_admin() معرّفة مسبقاً
-- (راجع supabase_setup_complete.sql)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. إنشاء جدول academic_dates
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academic_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  hijri_label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────
-- 2. تفعيل Row Level Security
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.academic_dates ENABLE ROW LEVEL SECURITY;

-- قراءة علنية لكل المستخدمين — نفس نمط announcements_public_read بالضبط
DROP POLICY IF EXISTS "academic_dates_public_read" ON public.academic_dates;
CREATE POLICY "academic_dates_public_read" ON public.academic_dates
  FOR SELECT USING (true);

-- إدخال/تعديل/حذف: الأدمن فقط (نفس نمط announcements_admin_*)
DROP POLICY IF EXISTS "academic_dates_admin_insert" ON public.academic_dates;
CREATE POLICY "academic_dates_admin_insert" ON public.academic_dates
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "academic_dates_admin_update" ON public.academic_dates;
CREATE POLICY "academic_dates_admin_update" ON public.academic_dates
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "academic_dates_admin_delete" ON public.academic_dates;
CREATE POLICY "academic_dates_admin_delete" ON public.academic_dates
  FOR DELETE USING (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- 3. الموعد الأول المؤكد
-- ────────────────────────────────────────────────────────────
INSERT INTO public.academic_dates (title, date, hijri_label) VALUES
  ('عودة المعلمين والمعلمات الممارسين للتدريس', '2026-08-23', '١٠ صفر ١٤٤٨ هـ');
