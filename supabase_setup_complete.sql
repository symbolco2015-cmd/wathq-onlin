-- ═══════════════════════════════════════════════════════════════════════
-- وثّق — الإعداد الكامل والنهائي لقاعدة البيانات  (آمن للتشغيل المتكرر)
-- ───────────────────────────────────────────────────────────────────────
-- شغّل هذا الملف **كاملاً مرة واحدة** في:  Supabase ➜ SQL Editor ➜ New query
-- يُصلح:
--   ١) ظهور المستخدمين الجدد فوراً في لوحة تحكم الأدمن (Trigger + Backfill)
--   ٢) عمل لوحة الإعلانات (النشر/الحذف) بربط حساب الأدمن بجدول admin_users
--   ٣) صلاحيات RLS لعمليات الأدمن (قراءة الكل / إعادة تعيين / حذف)
--
-- هذا الملف يُغني عن جميع ملفات supabase_*.sql السابقة (admin_setup / admin_fix
-- / announcements_setup / full_reset / portfolios_rls_fix). استخدم هذا فقط.
-- ⚠️ غيّر البريد في القسم (2) إن كان بريد الأدمن مختلفاً.
-- ═══════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- (1) جدول الأدمن + دالة فحص الصلاحية (SECURITY DEFINER)
--     استخدام دالة is_admin() يمنع خطأ التكرار اللانهائي في سياسات RLS
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- كل مستخدم يستطيع قراءة سجل صلاحيته فقط (غير تكراري — آمن)
DROP POLICY IF EXISTS "admin_users_select_own" ON public.admin_users;
CREATE POLICY "admin_users_select_own" ON public.admin_users
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
$$;


-- ────────────────────────────────────────────────────────────────────────
-- (2) ربط حساب الأدمن تلقائياً بالبريد الإلكتروني (لا حاجة لنسخ UUID يدوياً)
--     ⚠️ غيّر البريد أدناه إن لزم
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.admin_users (user_id)
SELECT id FROM auth.users
WHERE lower(email) = lower('azozsaleh@gmail.com')
ON CONFLICT (user_id) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────
-- (3) جدول portfolios — ضمان الأعمدة + تفعيل RLS بالسياسات الصحيحة
--     • القراءة عامة (true) للحفاظ على ميزة المشاركة عبر ?share= — راجع
--       ملاحظة الخصوصية في نهاية الملف.
--     • الكتابة لصاحب الملف فقط، والأدمن يستطيع التعديل/الحذف.
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

-- قراءة عامة (مطلوبة لميزة المشاركة + قراءة الأدمن لكل الملفات)
DROP POLICY IF EXISTS "portfolios_public_read" ON public.portfolios;
CREATE POLICY "portfolios_public_read" ON public.portfolios
  FOR SELECT USING (true);

-- إدخال: صاحب الملف فقط
DROP POLICY IF EXISTS "portfolios_owner_insert" ON public.portfolios;
CREATE POLICY "portfolios_owner_insert" ON public.portfolios
  FOR INSERT WITH CHECK (auth.uid() = id);

-- تعديل: صاحب الملف أو الأدمن (يلزم لميزة upsert ولإعادة التعيين)
DROP POLICY IF EXISTS "portfolios_owner_or_admin_update" ON public.portfolios;
CREATE POLICY "portfolios_owner_or_admin_update" ON public.portfolios
  FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- حذف: صاحب الملف أو الأدمن
DROP POLICY IF EXISTS "portfolios_owner_or_admin_delete" ON public.portfolios;
CREATE POLICY "portfolios_owner_or_admin_delete" ON public.portfolios
  FOR DELETE USING (auth.uid() = id OR public.is_admin());

-- تنظيف أسماء السياسات القديمة المتضاربة (إن وُجدت من ملفات سابقة)
DROP POLICY IF EXISTS "admin_read_all_portfolios"      ON public.portfolios;
DROP POLICY IF EXISTS "admin_update_portfolios"        ON public.portfolios;
DROP POLICY IF EXISTS "admin_delete_portfolios"        ON public.portfolios;
DROP POLICY IF EXISTS "Admin can read all portfolios"  ON public.portfolios;
DROP POLICY IF EXISTS "Admin can delete portfolios"    ON public.portfolios;


-- ────────────────────────────────────────────────────────────────────────
-- (4) جدول الإعلانات announcements + سياساته
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  content        TEXT NOT NULL,
  category       TEXT NOT NULL CHECK (category IN ('tech', 'admin', 'urgent')),
  attachment_url TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- قراءة عامة (الجميع يرى الإعلانات)
DROP POLICY IF EXISTS "announcements_public_read" ON public.announcements;
CREATE POLICY "announcements_public_read" ON public.announcements
  FOR SELECT USING (true);

-- إدخال/تعديل/حذف: الأدمن فقط
DROP POLICY IF EXISTS "announcements_admin_insert" ON public.announcements;
CREATE POLICY "announcements_admin_insert" ON public.announcements
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "announcements_admin_update" ON public.announcements;
CREATE POLICY "announcements_admin_update" ON public.announcements
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "announcements_admin_delete" ON public.announcements;
CREATE POLICY "announcements_admin_delete" ON public.announcements
  FOR DELETE USING (public.is_admin());


-- ────────────────────────────────────────────────────────────────────────
-- (5) ✦ الإصلاح الجوهري ✦  إنشاء ملف portfolio تلقائياً لكل مستخدم جديد
--     يضمن ظهور المستخدم في لوحة الأدمن **فور التسجيل** — حتى لو لم يؤكد
--     بريده أو لم يسجّل دخوله بعد.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.portfolios (id, state, created_at, updated_at)
  VALUES (
    NEW.id,
    jsonb_build_object(
      'ev',     '{}'::jsonb,
      'strats', jsonb_build_array('الصف المقلوب', 'التعلم التعاوني', 'التعلم النشط'),
      'csubs',  '{}'::jsonb,
      'notes',  '{}'::jsonb,
      'readAnnouncements', '[]'::jsonb,
      'profile', jsonb_build_object(
        'name',  COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1), 'مستخدم جديد'),
        'role',  'غير محدد',
        'school','غير محدد',
        'phone', '',
        'email', COALESCE(NEW.email, ''),
        'twitter','', 'linkedin','', 'youtube','', 'avatar','',
        'yearsOfExperience', 0
      )
    ),
    COALESCE(NEW.created_at, NOW()),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ────────────────────────────────────────────────────────────────────────
-- (6) Backfill — إنشاء ملفات للمستخدمين المسجّلين سابقاً ممن لا يملكون صفاً
--     (هؤلاء هم المستخدمون "المفقودون" من لوحة الأدمن)
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.portfolios (id, state, created_at, updated_at)
SELECT
  u.id,
  jsonb_build_object(
    'ev',     '{}'::jsonb,
    'strats', jsonb_build_array('الصف المقلوب', 'التعلم التعاوني', 'التعلم النشط'),
    'csubs',  '{}'::jsonb,
    'notes',  '{}'::jsonb,
    'readAnnouncements', '[]'::jsonb,
    'profile', jsonb_build_object(
      'name',  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1), 'مستخدم'),
      'role',  'غير محدد',
      'school','غير محدد',
      'phone', '',
      'email', COALESCE(u.email, ''),
      'twitter','', 'linkedin','', 'youtube','', 'avatar','',
      'yearsOfExperience', 0
    )
  ),
  COALESCE(u.created_at, NOW()),
  NOW()
FROM auth.users u
LEFT JOIN public.portfolios p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════
-- (7) التحقّق — يجب أن تُظهر هذه الاستعلامات النتائج الصحيحة
-- ════════════════════════════════════════════════════════════════════════

-- أ) هل حساب الأدمن مُسجّل؟  (يجب أن يظهر بريدك)
SELECT 'admin_users' AS check, u.email, au.created_at
FROM public.admin_users au
JOIN auth.users u ON u.id = au.user_id;

-- ب) عدد المستخدمين مقابل عدد الملفات (يجب أن يتطابقا الآن)
SELECT
  (SELECT COUNT(*) FROM auth.users)         AS total_auth_users,
  (SELECT COUNT(*) FROM public.portfolios)  AS total_portfolios;

-- ج) قائمة السياسات المُطبّقة (للمراجعة)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('portfolios', 'announcements', 'admin_users')
ORDER BY tablename, cmd;

-- ════════════════════════════════════════════════════════════════════════
-- 🔒 ملاحظة خصوصية (اختيارية للمعالجة لاحقاً):
-- سياسة "portfolios_public_read" تجعل قراءة كل الملفات متاحة لأي شخص يملك
-- مفتاح anon (وهو مضمَّن في كود الواجهة). هذا ضروري لميزة المشاركة الحالية،
-- لكنه يكشف الأسماء والإيميلات والجوالات. الحل الأنظف: تقييد القراءة لصاحب
-- الملف/الأدمن، وإضافة دالة RPC عامة تُرجع ملفاً واحداً عبر معرّفه فقط، ثم
-- تعديل usePublicProfile لاستدعائها. أخبرني إن رغبت بتطبيق هذا التحسين.
-- ════════════════════════════════════════════════════════════════════════
