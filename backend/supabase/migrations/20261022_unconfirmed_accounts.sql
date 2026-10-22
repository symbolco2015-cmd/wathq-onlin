-- =====================================================================
-- الحسابات غير المؤكدة
-- (1) admin_list_users(): تُرجع email_confirmed_at أيضاً، لشارة «غير مؤكد» في
--     لوحة الإدارة. المصدر: pg_get_functiondef من القاعدة الحية 2026-10-22،
--     والفرق الوحيد العمود الأخير في RETURNS TABLE وفي SELECT. تغيير نوع
--     الإرجاع يحتاج DROP ثم CREATE، فتُعاد الصلاحيات بعده. الواجهة الحالية
--     تتجاهل العمود الجديد، ولا ترى الدالة غائبة لأن كل شيء في معاملة واحدة.
-- (2) list_unconfirmed_purge_candidates(p_limit): لـ service_role فقط، تستعملها
--     purge-scheduled-accounts. حساب لم يؤكّد بريده بعد 7 أيام من تسجيله، ولم
--     يدخل قط، وليس في admin_users، وليس له أي هوية غير email (لا Google).
--     p_limit محصور بين 0 و20.
--
-- الملف قابل للتشغيل أكثر من مرة.
-- =====================================================================

BEGIN;

-- ── (1) admin_list_users ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE FUNCTION public.admin_list_users()
 RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, email_confirmed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرّح' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at
  FROM auth.users u
  WHERE EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = u.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;

-- ── (2) list_unconfirmed_purge_candidates ────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_unconfirmed_purge_candidates(p_limit integer)
 RETURNS TABLE(id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT u.id, u.created_at
  FROM auth.users u
  WHERE u.email_confirmed_at IS NULL
    AND u.created_at < now() - interval '7 days'
    AND u.email IS NOT NULL
    AND u.last_sign_in_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM auth.identities i
                     WHERE i.user_id = u.id AND i.provider <> 'email')
  ORDER BY u.created_at
  LIMIT least(greatest(coalesce(p_limit, 0), 0), 20);
$function$;

REVOKE ALL ON FUNCTION public.list_unconfirmed_purge_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_unconfirmed_purge_candidates(integer) TO service_role;

-- ── التحقق قبل COMMIT ────────────────────────────────────────────────────
-- يجب: admin_list_users لـ authenticated وservice_role لا لـ anon،
-- وlist_unconfirmed_purge_candidates لـ service_role وحده.
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_exec
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('admin_list_users', 'list_unconfirmed_purge_candidates');

COMMIT;

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- =====================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.list_unconfirmed_purge_candidates(integer);
-- DROP FUNCTION IF EXISTS public.admin_list_users();
-- CREATE FUNCTION public.admin_list_users()
--  RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone)
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرّح' USING ERRCODE = '42501'; END IF;
--
--   RETURN QUERY
--   SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at
--   FROM auth.users u
--   WHERE EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = u.id);
-- END;
-- $function$;
-- REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
-- COMMIT;
