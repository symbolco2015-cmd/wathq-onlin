-- =====================================================================
-- حذف الحساب بمهلة 10 أيام
-- (1) العمود portfolios.deletion_scheduled_at: موعد الحذف النهائي، أو NULL.
-- (2) portfolios_deletion_guard: لا يكتب anon/authenticated هذا العمود بطلب
--     مباشر (ولا الأدمن). تكتبه الدوال أدناه (current_user = صاحبها) و
--     service_role فقط. trigger لا صلاحيات أعمدة: upsert في saveState يحتاج
--     UPDATE على كل عمود يرسله، وتقييدها عموداً عموداً قد يكسر حفظاً قائماً.
-- (3) restore_my_account(): المعلم يلغي جدولة حذفه، auth.uid() فقط، وقبل
--     الموعد فقط. ما حلّ موعده للحذف النهائي وحده، فلا تتسابق الاستعادة معه.
-- (4)+(5) admin_schedule_deletion / admin_cancel_deletion: للأدمن (is_admin)،
--     وترفضان أي حساب في admin_users.
-- (6) الصفحة العامة وتقرير الحصاد يختفيان لحظة حلول الموعد، ولو تأخر الحذف
--     النهائي أياماً. ثماني دوال: get_shared_portfolio و get_shared_evidence و
--     get_shared_monthly_progress و get_shared_section_summaries و
--     get_shared_custom_indicators و get_shared_results_analysis و
--     get_shared_teaching_strategies و get_harvest_report.
--     المصدر: backend/supabase/live-shared-functions-20261018.sql (pg_get_functiondef
--     من القاعدة الحية 2026-10-18). كل دالة منسوخة منه حرفياً، والفرق الوحيد:
--       (deletion_scheduled_at IS NULL OR deletion_scheduled_at > now())
--     مع شرط share_enabled، وفي get_harvest_report مع join على portfolios
--     (صاحب التقرير r.portfolio_id).
-- (7) مهمة pg_cron اليومية (تعليق: تُنفَّذ بعد نشر الدالة وإنشاء السر).
--
-- admin_audit_log: details فيها نوع الفعل وموعد الحذف فقط. لا اسم ولا بريد،
-- فلا يبقى أثر شخصي بعد الحذف النهائي (target_portfolio_id بلا مفتاح أجنبي).
--
-- الملف قابل للتشغيل أكثر من مرة.
-- =====================================================================

BEGIN;

-- ── (1) العمود ───────────────────────────────────────────────────────────
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS portfolios_deletion_due_idx
  ON public.portfolios (deletion_scheduled_at)
  WHERE deletion_scheduled_at IS NOT NULL;

-- ── (2) حماية العمود ─────────────────────────────────────────────────────
-- SECURITY INVOKER عمداً: current_user هنا هو المستدعي الفعلي.
CREATE OR REPLACE FUNCTION public.portfolios_deletion_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND NEW.deletion_scheduled_at IS NOT NULL THEN
      RAISE EXCEPTION 'deletion_scheduled_at_protected' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.deletion_scheduled_at IS DISTINCT FROM OLD.deletion_scheduled_at THEN
      RAISE EXCEPTION 'deletion_scheduled_at_protected' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- دالة مشغّل فقط: لا تُستدعى مباشرة
REVOKE EXECUTE ON FUNCTION public.portfolios_deletion_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS portfolios_deletion_guard ON public.portfolios;
CREATE TRIGGER portfolios_deletion_guard
  BEFORE INSERT OR UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.portfolios_deletion_guard();

-- ── (3) استعادة المعلم حسابه ─────────────────────────────────────────────
-- ok=false مع reason: unauthenticated | not_found | expired
-- ok=true: استُعيد، أو لم يكن مجدولاً أصلاً (reason = not_scheduled)
CREATE OR REPLACE FUNCTION public.restore_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_at  timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT deletion_scheduled_at INTO v_at FROM public.portfolios WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_at IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'not_scheduled');
  END IF;
  IF v_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  UPDATE public.portfolios SET deletion_scheduled_at = NULL WHERE id = v_uid;

  INSERT INTO public.admin_audit_log (admin_id, action, target_portfolio_id, details)
  VALUES (NULL, 'portfolio.deletion_restore', v_uid,
          jsonb_build_object('type', 'restore', 'scheduled_at', v_at));

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_my_account() TO authenticated;

-- ── (4) جدولة الحذف من لوحة الإدارة ──────────────────────────────────────
-- ملف مجدول أصلاً يُرجع موعده كما هو: الضغط مرتين لا يمدّد المهلة.
CREATE OR REPLACE FUNCTION public.admin_schedule_deletion(p_portfolio_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_at timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'غير مصرّح' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_portfolio_id) THEN
    RAISE EXCEPTION 'target_is_admin' USING ERRCODE = '42501';
  END IF;

  SELECT deletion_scheduled_at INTO v_at FROM public.portfolios WHERE id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portfolio_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_at IS NOT NULL THEN
    RETURN v_at;
  END IF;

  v_at := now() + interval '10 days';
  UPDATE public.portfolios SET deletion_scheduled_at = v_at WHERE id = p_portfolio_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_portfolio_id, details)
  VALUES (auth.uid(), 'portfolio.deletion_schedule', p_portfolio_id,
          jsonb_build_object('type', 'schedule', 'scheduled_at', v_at));

  RETURN v_at;
END;
$function$;

-- ── (5) إلغاء الجدولة من لوحة الإدارة ────────────────────────────────────
-- false: لم يكن مجدولاً
CREATE OR REPLACE FUNCTION public.admin_cancel_deletion(p_portfolio_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_at timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'غير مصرّح' USING ERRCODE = '42501';
  END IF;

  SELECT deletion_scheduled_at INTO v_at FROM public.portfolios WHERE id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portfolio_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_at IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.portfolios SET deletion_scheduled_at = NULL WHERE id = p_portfolio_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_portfolio_id, details)
  VALUES (auth.uid(), 'portfolio.deletion_cancel', p_portfolio_id,
          jsonb_build_object('type', 'cancel', 'scheduled_at', v_at));

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_schedule_deletion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cancel_deletion(uuid)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_schedule_deletion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_deletion(uuid)   TO authenticated;

-- ── (6) الصفحة العامة: لا شيء بعد حلول موعد الحذف ───────────────────────
-- المصدر: backend/supabase/live-shared-functions-20261018.sql (pg_get_functiondef من
-- القاعدة الحية 2026-10-18). كل دالة منسوخة منه حرفياً، والفرق الوحيد شرط
-- deletion_scheduled_at. التوقيع ونوع الإرجاع كما هما، فيكفي CREATE OR REPLACE
-- وتبقى الصلاحيات.

-- (6) get_shared_portfolio — النص الحي، والفرق الوحيد شرط deletion_scheduled_at
CREATE OR REPLACE FUNCTION public.get_shared_portfolio(target_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select jsonb_build_object(
  'profile', jsonb_strip_nulls(jsonb_build_object(
    'name',              p.state->'profile'->'name',
    'role',              p.state->'profile'->'role',
    'school',            p.state->'profile'->'school',
    'phone',             p.state->'profile'->'phone',
    'email',             p.state->'profile'->'email',
    'twitter',           p.state->'profile'->'twitter',
    'linkedin',          p.state->'profile'->'linkedin',
    'youtube',           p.state->'profile'->'youtube',
    'avatar',            p.state->'profile'->'avatar',
    'yearsOfExperience', p.state->'profile'->'yearsOfExperience'
  )),
  'ai_summary', p.ai_summary,
  'top_achievement_evidence_id', t.evidence_id,
  'top_achievement_source', t.source,
  'completion', (select row_to_json(c) from public.get_portfolio_completion(target_id) c)
)
from public.portfolios p
left join lateral (
  select cand.evidence_id, cand.source
  from (
    select e.id as evidence_id, 'teacher'::text as source, 1 as prio
      from public.evidence e
     where e.id = p.pinned_top_evidence_id
       and e.portfolio_id = p.id
       and e.section_id is not null
    union all
    select e.id, 'ai'::text, 2
      from public.evidence e
     where p.ai_top_achievement_approved
       and e.id = p.ai_top_achievement_evidence_id
       and e.portfolio_id = p.id
       and e.section_id is not null
  ) cand
  order by cand.prio
  limit 1
) t on true
where p.id = target_id and p.share_enabled = true and (p.deletion_scheduled_at is null or p.deletion_scheduled_at > now());
$function$
;

-- (6) get_shared_evidence — النص الحي، والفرق الوحيد شرط deletion_scheduled_at
CREATE OR REPLACE FUNCTION public.get_shared_evidence(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_shared boolean;
  result    jsonb;
BEGIN
  SELECT share_enabled INTO is_shared
  FROM public.portfolios
  WHERE id = target_id AND (deletion_scheduled_at IS NULL OR deletion_scheduled_at > now());

  IF is_shared IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::jsonb)
    INTO result
  FROM (
    SELECT
      ev.id, ev.section_id, ev.indicator_id, ev.strategy_id,
      ev.title, ev.description,
      ev.evidence_type, ev.file_url, ev.link_url,
      ev.created_at,
      ev.hidden_from_gallery
    FROM public.evidence ev
    WHERE ev.portfolio_id = target_id
      AND ev.section_id IS NOT NULL
  ) e;

  RETURN result;
END;
$function$
;

-- (6) get_shared_monthly_progress — النص الحي، والفرق الوحيد شرط deletion_scheduled_at
CREATE OR REPLACE FUNCTION public.get_shared_monthly_progress(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_shared     boolean;
  y_start_month integer;
  months        jsonb;
BEGIN
  SELECT share_enabled, COALESCE((state->>'yearStartMonth')::integer, 9)
    INTO is_shared, y_start_month
  FROM public.portfolios
  WHERE id = target_id AND (deletion_scheduled_at IS NULL OR deletion_scheduled_at > now());

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
$function$
;

-- (6) get_shared_section_summaries — النص الحي، والفرق الوحيد شرط deletion_scheduled_at
CREATE OR REPLACE FUNCTION public.get_shared_section_summaries(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE is_shared boolean; result jsonb;
BEGIN
  SELECT share_enabled INTO is_shared FROM public.portfolios WHERE id = target_id AND (deletion_scheduled_at IS NULL OR deletion_scheduled_at > now());
  IF is_shared IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_object_agg(s.section_id::text, s.ai_sentence), '{}'::jsonb)
    INTO result
    FROM public.section_ai_summaries s
    JOIN public.sections sec ON sec.id = s.section_id AND sec.section_type = 'core'
   WHERE s.portfolio_id = target_id
     AND s.hidden = false
     AND EXISTS (SELECT 1 FROM public.evidence e
                  WHERE e.portfolio_id = target_id AND e.section_id = s.section_id);
  RETURN result;
END;
$function$
;

-- (6) get_shared_custom_indicators — النص الحي، والفرق الوحيد شرط deletion_scheduled_at
CREATE OR REPLACE FUNCTION public.get_shared_custom_indicators(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE is_shared boolean; result jsonb;
BEGIN
  SELECT share_enabled INTO is_shared FROM public.portfolios WHERE id = target_id AND (deletion_scheduled_at IS NULL OR deletion_scheduled_at > now());
  IF is_shared IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', si.id, 'section_id', si.section_id, 'name_ar', si.name_ar)
                            ORDER BY si.section_id, si.created_at, si.id), '[]'::jsonb)
    INTO result
    FROM public.section_indicators si
   WHERE si.portfolio_id = target_id
     AND EXISTS (SELECT 1 FROM public.evidence e
                  WHERE e.indicator_id = si.id AND e.portfolio_id = target_id);
  RETURN result;
END;
$function$
;

-- (6) get_shared_results_analysis — النص الحي، والفرق الوحيد شرط deletion_scheduled_at
CREATE OR REPLACE FUNCTION public.get_shared_results_analysis(target_id uuid)
 RETURNS TABLE(id uuid, subject text, stage text, class_section smallint, created_at timestamp with time zone, total_students integer, average numeric, min_score numeric, max_score numeric, grade_level smallint, test_type text, test_seq smallint, full_mark numeric, absent_count integer, average_pct numeric, min_pct numeric, max_pct numeric, pass_count integer, band_counts jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ra.id, ra.subject, ra.stage, ra.class_section, ra.created_at,
    st.n AS total_students,
    COALESCE(round(st.avg_raw, 2), 0) AS average,
    COALESCE(st.min_raw, 0) AS min_score,
    COALESCE(st.max_raw, 0) AS max_score,
    ra.grade_level, ra.test_type, ra.test_seq,
    fm.v AS full_mark,
    COALESCE((ra.summary->>'absentCount')::int, 0) AS absent_count,
    COALESCE(round(st.avg_raw / fm.v * 100, 1), 0) AS average_pct,
    COALESCE(round(st.min_raw / fm.v * 100, 1), 0) AS min_pct,
    COALESCE(round(st.max_raw / fm.v * 100, 1), 0) AS max_pct,
    st.pass_n AS pass_count,
    bc.counts AS band_counts
  FROM results_analysis ra
  CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(ra.full_mark, 0), 100) AS v) fm
  -- نسب الحاضرين: الشروط نفسها التي في الإصدار السابق
  CROSS JOIN LATERAL (
    SELECT array_agg(x.sc) AS scores
      FROM (SELECT (s->>'score')::numeric AS sc
              FROM jsonb_array_elements(COALESCE(ra.summary->'students', '[]'::jsonb)) s
             WHERE jsonb_typeof(s->'score') = 'number'
               AND COALESCE((s->>'absent')::boolean, false) = false) x
  ) sa
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS n, avg(u.sc) AS avg_raw, min(u.sc) AS min_raw, max(u.sc) AS max_raw,
           count(*) FILTER (WHERE u.sc / fm.v * 100 >= 60)::int AS pass_n
      FROM unnest(COALESCE(sa.scores, '{}'::numeric[])) AS u(sc)
  ) st
  -- الفئة كما في matchBand (logic.ts): أعلى فئة حدها الأدنى ≤ النسبة، وإلا الأدنى.
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', gb.label, 'count', COALESCE(c.n, 0))
                              ORDER BY gb.display_order), '[]'::jsonb) AS counts
      FROM grade_bands gb
      LEFT JOIN (
        SELECT b.id, count(*)::int AS n
          FROM unnest(COALESCE(sa.scores, '{}'::numeric[])) AS u(sc)
          CROSS JOIN LATERAL (
            SELECT g.id FROM grade_bands g
             ORDER BY (g.min_score <= u.sc / fm.v * 100) DESC,
                      CASE WHEN g.min_score <= u.sc / fm.v * 100 THEN g.min_score END DESC NULLS LAST,
                      g.min_score ASC
             LIMIT 1) b
         GROUP BY b.id
      ) c ON c.id = gb.id
  ) bc
  WHERE ra.portfolio_id = target_id
    AND ra.hidden_public = false
    AND EXISTS (SELECT 1 FROM portfolios p WHERE p.id = target_id AND p.share_enabled IS TRUE AND (p.deletion_scheduled_at IS NULL OR p.deletion_scheduled_at > now()))
  ORDER BY ra.created_at ASC;
$function$
;

-- (6) get_shared_teaching_strategies — النص الحي، والفرق الوحيد شرط deletion_scheduled_at
CREATE OR REPLACE FUNCTION public.get_shared_teaching_strategies(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_shared boolean;
  result    jsonb;
BEGIN
  SELECT share_enabled INTO is_shared
  FROM public.portfolios
  WHERE id = target_id AND (deletion_scheduled_at IS NULL OR deletion_scheduled_at > now());
  IF is_shared IS NOT TRUE THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
    INTO result
  FROM (
    SELECT ts.id, ts.name_ar
    FROM public.teaching_strategies ts
    WHERE ts.id IN (
      SELECT DISTINCT ev.strategy_id
      FROM public.evidence ev
      WHERE ev.portfolio_id = target_id
        AND ev.strategy_id IS NOT NULL
    )
  ) s;
  RETURN result;
END;
$function$
;

-- (6) get_harvest_report — النص الحي، والفرق الوحيد شرط deletion_scheduled_at
CREATE OR REPLACE FUNCTION public.get_harvest_report(report_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select to_jsonb(r)
  from public.harvest_reports r
  join public.portfolios p on p.id = r.portfolio_id
  where r.id = get_harvest_report.report_id and (p.deletion_scheduled_at is null or p.deletion_scheduled_at > now());
$function$
;

-- ── التحقق قبل COMMIT ────────────────────────────────────────────────────
-- يجب: العمود موجود، والمشغّل موجود، والدوال الثلاث الجديدة لـ authenticated
-- لا لـ anon.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'portfolios' AND column_name = 'deletion_scheduled_at';

SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.portfolios'::regclass AND tgname = 'portfolios_deletion_guard';

SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('restore_my_account', 'admin_schedule_deletion', 'admin_cancel_deletion');

COMMIT;

-- =====================================================================
-- (7) المهمة اليومية — بعد نشر purge-scheduled-accounts وإنشاء السر في vault
-- 00:30 UTC = 03:30 بتوقيت السعودية. انسخ عنوان الدالة من المهمة القائمة:
--   SELECT command FROM cron.job WHERE jobname = 'process-bulk-import-queue';
-- =====================================================================
-- SELECT cron.schedule(
--   'purge-scheduled-accounts',
--   '30 0 * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge-scheduled-accounts',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'X-Purge-Key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'purge_accounts_key')
--     ),
--     body    := '{}'::jsonb,
--     timeout_milliseconds := 150000
--   );
--   $$
-- );

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- انشر نسخة الواجهة السابقة قبل حذف العمود. والدوال الثماني في (6) تعود
-- بتشغيل backend/supabase/live-shared-functions-20261018.sql كما هو (نصوصها الحية).
-- =====================================================================
-- SELECT cron.unschedule('purge-scheduled-accounts');
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.admin_cancel_deletion(uuid);
-- DROP FUNCTION IF EXISTS public.admin_schedule_deletion(uuid);
-- DROP FUNCTION IF EXISTS public.restore_my_account();
-- DROP TRIGGER IF EXISTS portfolios_deletion_guard ON public.portfolios;
-- DROP FUNCTION IF EXISTS public.portfolios_deletion_guard();
-- (هنا: تشغيل live-shared-functions-20261018.sql، قبل حذف العمود الذي تشير إليه)
-- DROP INDEX IF EXISTS public.portfolios_deletion_due_idx;
-- ALTER TABLE public.portfolios DROP COLUMN IF EXISTS deletion_scheduled_at;
-- COMMIT;
