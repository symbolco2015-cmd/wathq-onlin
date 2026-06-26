-- ═══════════════════════════════════════════════════════════════════════
-- مشاركة الملف العام — تفعيل اختياري بيد المعلم + RPC آمنة بدل القراءة المباشرة
-- شغّل هذا الملف في: Supabase ➜ SQL Editor ➜ New query
--
-- تحقّقت مباشرة عبر REST API على قاعدة الإنتاج (لا افتراض من ملفات SQL بالمستودع) أن:
--   • لا يوجد عمود is_public أو share_enabled على portfolios حالياً (42703 على كليهما)
--   • لا توجد دالة get_shared_portfolio في schema cache حالياً (PGRST202)
--   • anon لا يستطيع حالياً قراءة أي صف من portfolios مباشرة (RLS يحجب القراءة فعلاً، 200 + [])
--   • is_admin() موجودة وتعمل، وقراءة announcements العامة لا تزال تعمل (sanity check)
-- ═══════════════════════════════════════════════════════════════════════

-- (1) عمود التفعيل — افتراضي false لكل الصفوف الحالية والجديدة
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS share_enabled boolean NOT NULL DEFAULT false;


-- (2) دالة آمنة لميزة المشاركة العامة (?share=UUID)
--     SECURITY DEFINER تتجاوز RLS بشكل متحكَّم به: تتحقق من share_enabled = true
--     أولاً، ولا تُرجع شيئاً إن لم يكن مفعّلاً أو لم يوجد الصف أصلاً.
--     تُرجع حصراً الحقول المستخدمة فعلياً في src/components/Public.tsx:
--       ev, strats, csubs, profile — وتستثني notes / readAnnouncements / yearStartMonth
--       (غير معروضة في واجهة المشاركة).
CREATE OR REPLACE FUNCTION public.get_shared_portfolio(target_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ev', state->'ev',
    'strats', state->'strats',
    'csubs', state->'csubs',
    'profile', state->'profile'
  )
  FROM public.portfolios
  WHERE id = target_id
    AND share_enabled = true;
$$;

-- إزالة صلاحية التنفيذ الافتراضية من PUBLIC، ثم منحها فقط للأدوار المطلوبة.
-- ملاحظة: مُنحت لـ anon (الزائر غير المسجّل) وأيضاً authenticated، لأن تطبيق الواجهة
-- (App.tsx) يعرض صفحة المشاركة عبر ?share=USER_ID لأي زائر بهذا الرابط بصرف النظر
-- عن كونه مسجّل دخوله حالياً أم لا — فمنح authenticated مطلوب وظيفياً، وهو آمن لأن
-- الدالة نفسها تتحقق من share_enabled أولاً بصرف النظر عن هوية المستدعي.
REVOKE ALL ON FUNCTION public.get_shared_portfolio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_portfolio(uuid) TO anon, authenticated;


-- (3) دفاع إضافي: إزالة أي صلاحية SELECT مباشرة على الجدول لـ anon.
--     RLS يحجب القراءة فعلاً، لكن هذا يمنع أي قراءة مباشرة حتى لو تغيّرت سياسات RLS لاحقاً
--     بالخطأ. لا يلمس صلاحيات authenticated (المالك يقرأ صفه مباشرة من useAppStore).
REVOKE SELECT ON public.portfolios FROM anon;


-- (4) تحقّق بعد التنفيذ
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'portfolios'
ORDER BY ordinal_position;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'get_shared_portfolio';

SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_name = 'get_shared_portfolio';
