-- ═══════════════════════════════════════════════════════════════════════
-- مؤشر الاستمرارية عبر الزمن (صفحة المشاركة العامة) — RPC آمنة
-- شغّل هذا الملف في: Supabase ➜ SQL Editor ➜ New query
--
-- لماذا RPC وليس قراءة مباشرة على monthly_progress:
--   • سياسة monthly_progress_owner الحالية تقيّد كل عمليات الجدول بـ
--     portfolio_id = auth.uid() — أي زائر غير مسجّل (أو مسجّل غير المالك)
--     لا يستطيع رؤية أي صف، حتى لو كانت المشاركة العامة مفعّلة (share_enabled).
--   • نفس المشكلة التي عولجت سابقاً لجدول portfolios عبر get_shared_portfolio()
--     في supabase_share_enabled_setup.sql — نتبع نفس النمط هنا بالضبط:
--     SECURITY DEFINER تتحقق أولاً من share_enabled، ولا تُرجع شيئاً غير ذلك.
--   • yearStartMonth ليس عموداً على portfolios، بل مخزّن داخل state (JSONB)،
--     ومستثنى حالياً من get_shared_portfolio() — هذه الدالة تُرجعه صراحة
--     لأن مؤشر الاستمرارية يحتاجه لتحديد بداية الشبكة الشهرية.
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

  -- تجميع شهري بسيط على monthly_progress (يستخدم فهرس
  -- monthly_progress_portfolio_idx الموجود) — بلا أي قراءة لتفاصيل evidence
  -- الخام، وبصرف النظر عن section_id (أي قسم كافٍ لاعتبار الشهر "نشطاً").
  SELECT jsonb_agg(jsonb_build_object('year', t.year, 'month', t.month))
    INTO months
  FROM (
    SELECT DISTINCT year, month
    FROM public.monthly_progress
    WHERE portfolio_id = target_id
      AND evidence_count > 0
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
