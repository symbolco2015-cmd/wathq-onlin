-- ═══════════════════════════════════════════════════════════════════════
-- إصلاح: سياسة SELECT الناقصة على portfolios (سبب تعطّل قراءة الأدمن لكل
-- المستخدمين بعد حذف السياسة المفتوحة "Enable read access for all users")
-- شغّل هذا الملف في: Supabase ➜ SQL Editor ➜ New query
--
-- تأكدت فعلياً (أنت) عبر:
--   SELECT policyname, cmd, qual FROM pg_policies
--   WHERE tablename = 'portfolios' AND cmd = 'SELECT';
-- أن النتيجة سياستان مكرّرتان، كلتاهما تشترطان auth.uid() = id فقط،
-- بلا أي شرط is_admin():
--   • "Users can view their own portfolio"
--   • "portfolios_owner_only_read"
-- أي أنه لم تكن توجد قط سياسة admin-aware فعلية لأمر SELECT على هذا الجدول —
-- صفحة الأدمن كانت تعمل سابقاً فقط بفضل السياسة المفتوحة المحذوفة اليوم، وليس
-- بسياسة أدمن صحيحة. هذا يطابق نمط النقص نفسه المكتشف سابقاً في ملفات SQL
-- بالمستودع التي لم تُطبَّق فعلياً على الإنتاج (get_shared_portfolio, share_enabled).
-- ═══════════════════════════════════════════════════════════════════════

-- (1) حذف السياستين المكرّرتين الناقصتين
DROP POLICY IF EXISTS "Users can view their own portfolio" ON public.portfolios;
DROP POLICY IF EXISTS "portfolios_owner_only_read" ON public.portfolios;

-- (2) سياسة واحدة صحيحة فقط — بنفس نمط portfolios_owner_or_admin_update /
--     portfolios_owner_or_admin_delete الموجودتين والعاملتين فعلياً بنجاح
DROP POLICY IF EXISTS "portfolios_owner_or_admin_read" ON public.portfolios;
CREATE POLICY "portfolios_owner_or_admin_read" ON public.portfolios
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

-- (3) تحقّق بعد التنفيذ — يجب أن تظهر سياسة واحدة فقط لـ SELECT، بهذا الشرط بالضبط
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'portfolios' AND cmd = 'SELECT';
