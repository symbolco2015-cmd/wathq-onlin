-- ═══════════════════════════════════════════════════════════════════════
-- تحديث get_shared_monthly_progress لإضافة evidenceCount لكل شهر — يلزم
-- لنظام النقاط/المستويات في صفحة المشاركة العامة (Public.tsx)
-- شغّل هذا الملف في: Supabase ➜ SQL Editor ➜ New query
--
-- لماذا هذا التعديل ضروري:
--   • النسخة الحالية من الدالة (supabase_shared_monthly_progress_setup.sql)
--     تُرجع فقط قائمة الأشهر النشطة (activeMonths: {year, month}) بلا رقم
--     evidence_count الفعلي — كافية لمؤشر الاستمرارية (شبكة 12 مربعاً) لكنها
--     غير كافية لحساب النقاط، لأن نظام النقاط يحتاج المجموع الرقمي الخام
--     لكل شهر (1 دليل موثق = 1 نقطة)، بصرف النظر عن القسم.
--   • هذا التعديل يستبدل SELECT DISTINCT year, month بتجميع
--     SUM(evidence_count) AS evidence_count لكل (year, month) عبر كل الأقسام،
--     ويضيف الحقل evidenceCount داخل كل عنصر من activeMonths.
--   • توافق كامل مع الاستخدام الحالي: ContinuityGrid (مؤشر الاستمرارية) يقرأ
--     فقط year/month من كل عنصر ويتجاهل أي حقل إضافي — لا كسر لأي شيء موجود.
--   • RLS/الأمان بلا أي تغيير: نفس فحص share_enabled عبر SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_shared_monthly_progress(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  is_shared     boolean;
  y_start_month integer;
  months        jsonb;
BEGIN
  SELECT share_enabled, COALESCE((state->>'yearStartMonth')::integer, 9)
    INTO is_shared, y_start_month
  FROM public.portfolios
  WHERE id = target_id;

  IF is_shared IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- تجميع شهري على monthly_progress (يستخدم فهرس monthly_progress_portfolio_idx
  -- الموجود) — SUM(evidence_count) عبر كل الأقسام لكل (year, month)، بصرف النظر
  -- عن section_id، ليكون رقم evidenceCount مطابقاً تماماً لمصدر نظام النقاط
  -- المستخدم في لوحة التحكم (مجموع evidence_count الخام بلا أي ترجيح).
  SELECT jsonb_agg(jsonb_build_object(
           'year', t.year,
           'month', t.month,
           'evidenceCount', t.evidence_count
         ))
    INTO months
  FROM (
    SELECT year, month, SUM(evidence_count) AS evidence_count
    FROM public.monthly_progress
    WHERE portfolio_id = target_id
    GROUP BY year, month
    HAVING SUM(evidence_count) > 0
  ) t;

  RETURN jsonb_build_object(
    'yearStartMonth', y_start_month,
    'activeMonths', COALESCE(months, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_monthly_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_monthly_progress(uuid) TO anon, authenticated;

-- تحقّق بعد التنفيذ
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'get_shared_monthly_progress';

SELECT grantee, privilege_type FROM information_schema.role_routine_grants
WHERE routine_name = 'get_shared_monthly_progress';
