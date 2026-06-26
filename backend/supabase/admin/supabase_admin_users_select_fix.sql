-- ═══════════════════════════════════════════════════════════════════════
-- إصلاح أمني: سياسة admins_select على admin_users تكشف هوية كل الأدمن
-- ───────────────────────────────────────────────────────────────────────
-- المشكلة: ملف supabase_full_reset.sql (وملفات سابقة) أنشأ سياسة SELECT
-- بشرط (auth.role() = 'authenticated') فقط — أي أن أي معلّم مسجّل دخول
-- يستطيع تنفيذ: SELECT * FROM admin_users  ويحصل على قائمة كل user_id
-- لحسابات الأدمن في المنصة. هذه السياسة بقيت في قاعدة البيانات الفعلية
-- لأن supabase_setup_complete.sql لا يحذف أسماء السياسات القديمة على
-- admin_users (بخلاف جدول portfolios الذي ينظّف سياساته القديمة).
--
-- البنية الفعلية لجدول admin_users (من supabase_setup_complete.sql):
--   user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- لا يوجد بريد إلكتروني أو أي بيانات شخصية أخرى مخزّنة في هذا الجدول.
--
-- تحقّقت من الكود: لا يوجد أي مكوّن في الواجهة يقرأ admin_users مباشرة
-- (تحقق صلاحية الأدمن في useAppStore.ts يتم عبر قائمة بريد مُدمجة في
-- الكود، لا عبر استعلام لهذا الجدول). لذلك لا حاجة وظيفية لسياسة عامة
-- تسمح لأي مستخدم بقراءة الجدول كاملاً — سيتم حذفها بدون بديل.
--
-- شغّل هذا الملف يدوياً في Supabase ➜ SQL Editor بعد المراجعة.
-- ═══════════════════════════════════════════════════════════════════════

-- (1) حذف السياسة الفضفاضة الحالية وأي أسماء قديمة مكافئة لها من ملفات
--     supabase_*.sql السابقة (admin_fix.sql / admin_setup.sql) تجنّباً
--     لتكرار المشكلة إن كانت إحداها مطبّقة أيضاً.
DROP POLICY IF EXISTS "admins_select" ON public.admin_users;
DROP POLICY IF EXISTS "Allow authenticated users to read admin_users" ON public.admin_users;

-- (2) التأكد من بقاء سياسة القراءة المقيّدة بصاحب الصف فقط — كما هي
--     معرّفة في supabase_setup_complete.sql، لا تغيير على شرطها.
DROP POLICY IF EXISTS "admin_users_select_own" ON public.admin_users;
CREATE POLICY "admin_users_select_own" ON public.admin_users
  FOR SELECT USING (auth.uid() = user_id);

-- (3) تأكيد عدم وجود سياسة SELECT أخرى فضفاضة أُنشئت تحت اسم مختلف
--     ("Admin can read own record" من admin_setup.sql لها الشرط الصحيح
--     auth.uid() = user_id، لكنها مكرّرة باسم مختلف — نحذفها لتجنّب
--     سياستين متطابقتين بأسماء مختلفة).
DROP POLICY IF EXISTS "Admin can read own record" ON public.admin_users;

-- ════════════════════════════════════════════════════════════════════════
-- (4) تحقّق بعد التنفيذ — يجب أن تظهر سياسة SELECT واحدة فقط:
--     admin_users_select_own | (auth.uid() = user_id)
-- ════════════════════════════════════════════════════════════════════════
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'admin_users'
ORDER BY cmd, policyname;
