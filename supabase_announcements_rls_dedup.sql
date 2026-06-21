-- ═══════════════════════════════════════════════════════════════════════
-- تنظيف: سياسات RLS مكرّرة على جدول announcements (INSERT و DELETE)
-- ───────────────────────────────────────────────────────────────────────
-- الوضع الحالي: كل عملية من INSERT/DELETE محكومة بسياستين بنفس الأثر
-- العملي لكن بأسلوبين مختلفين:
--   • announcements_insert        (من supabase_full_reset.sql / announcements_setup.sql)
--     WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()))
--   • announcements_admin_insert  (من supabase_setup_complete.sql — الأحدث)
--     WITH CHECK (public.is_admin())
-- ونفس الشيء لـ announcements_delete / announcements_admin_delete.
-- النتيجة العملية متطابقة (is_admin() تستعلم admin_users بنفس الشرط
-- internally)، لكن وجود سياستين لكل عملية تكرار غير ضروري ومصدر التباس.
--
-- UPDATE لا تعاني من هذا لأنها معرّفة مرة واحدة فقط باسم
-- announcements_admin_update وتستخدم is_admin() — هذا هو الأسلوب المطلوب
-- توحيد كل العمليات عليه.
--
-- شغّل هذا يدوياً في Supabase ➜ SQL Editor بعد المراجعة.
-- ═══════════════════════════════════════════════════════════════════════

-- (1) حذف النسخ الأقدم التي تفحص admin_users مباشرة بدل is_admin()
--     (يشمل announcements_select المكرّرة مع announcements_public_read،
--     وكلاهما USING (true) بلا فرق في الأثر — اكتُشفت إضافياً عند المراجعة)
DROP POLICY IF EXISTS "announcements_insert" ON public.announcements;
DROP POLICY IF EXISTS "announcements_delete" ON public.announcements;
DROP POLICY IF EXISTS "announcements_select" ON public.announcements;

-- (2) إعادة تأكيد السياسات الموحّدة — بدون تغيير في شرطها، فقط لضمان
--     وجودها بنفس الاسم المستخدم في supabase_setup_complete.sql
DROP POLICY IF EXISTS "announcements_public_read" ON public.announcements;
CREATE POLICY "announcements_public_read" ON public.announcements
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "announcements_admin_insert" ON public.announcements;
CREATE POLICY "announcements_admin_insert" ON public.announcements
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "announcements_admin_delete" ON public.announcements;
CREATE POLICY "announcements_admin_delete" ON public.announcements
  FOR DELETE USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════
-- (3) تحقّق بعد التنفيذ — يجب أن تظهر سياسة واحدة فقط لكل عملية:
--     SELECT → announcements_public_read
--     INSERT → announcements_admin_insert
--     UPDATE → announcements_admin_update
--     DELETE → announcements_admin_delete
-- ════════════════════════════════════════════════════════════════════════
SELECT cmd, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'announcements'
ORDER BY cmd, policyname;

-- تحقق إضافي: عدد السياسات يجب أن يكون 1 لكل عملية بالضبط
SELECT cmd, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'announcements'
GROUP BY cmd
ORDER BY cmd;
