-- ═══════════════════════════════════════════════════════════════════════
-- كشف جدول evidence (النظام الجديد الغني) لصفحة المشاركة العامة
-- شغّل هذا الملف في: Supabase ➜ SQL Editor ➜ New query
--
-- لماذا RPC وليس قراءة مباشرة على evidence:
--   • RLS الحالية على evidence تقيّد كل عمليات الجدول بمالك الملف (نفس نمط
--     monthly_progress) — أي زائر غير مسجّل (أو مسجّل غير المالك) لا يستطيع
--     رؤية أي صف، حتى لو كانت المشاركة العامة مفعّلة (share_enabled).
--   • نفس النمط المستخدم سابقاً في get_shared_monthly_progress() (انظر
--     supabase_shared_monthly_progress_setup.sql): SECURITY DEFINER تتحقق
--     أولاً من share_enabled عبر portfolios، ولا تُرجع شيئاً غير ذلك.
--   • impact و self_reflection حقول تأمل خاصة بالمعلم لنفسه — تُستبعد من
--     العرض العام (تُرجَع NULL صراحة) بنفس روح استبعاد notes في
--     get_shared_portfolio، بينما تبقى بقية الحقول مطابقة تماماً لواجهة
--     SupabaseEvidence في frontend/src/hooks/useSupabaseEvidence.ts.
--
-- ملاحظة: لا توجد في هذا المستودع أي migration تُنشئ جدول evidence نفسه
-- (أُنشئ مباشرة عبر SQL Editor) — تحقّق من أسماء/أنواع الأعمدة الفعلية على
-- الجدول الحي قبل تشغيل هذا الملف.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_shared_evidence(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  is_shared boolean;
  result    jsonb;
BEGIN
  SELECT share_enabled INTO is_shared
  FROM public.portfolios
  WHERE id = target_id;

  IF is_shared IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::jsonb)
    INTO result
  FROM (
    SELECT
      ev.id, ev.portfolio_id, ev.section_id, ev.indicator_id,
      ev.title, ev.description,
      NULL::text AS impact,              -- حقل تأمل خاص، مستبعد من العرض العام
      ev.context_grade, ev.context_subject, ev.academic_term,
      ev.evidence_type, ev.file_url, ev.link_url,
      NULL::text AS self_reflection,     -- حقل تأمل خاص، مستبعد من العرض العام
      ev.created_at
    FROM public.evidence ev
    WHERE ev.portfolio_id = target_id
  ) e;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_evidence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_evidence(uuid) TO anon, authenticated;

-- دفاع إضافي: إزالة أي صلاحية SELECT مباشرة على الجدول لـ anon، بنفس نمط
-- get_shared_portfolio — لا يلمس صلاحيات authenticated (المالك يقرأ شواهده
-- مباشرة عبر useSupabaseEvidence).
REVOKE SELECT ON public.evidence FROM anon;

-- ════════════════════════════════════════════════════════════════════════
-- تحقّق بعد التنفيذ
-- ════════════════════════════════════════════════════════════════════════
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'get_shared_evidence';

SELECT grantee, privilege_type FROM information_schema.role_routine_grants
WHERE routine_name = 'get_shared_evidence';
