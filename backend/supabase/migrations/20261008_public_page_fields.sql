-- ════════════════════════════════════════════════════════════════════════
-- المرحلة 5 — الخطوة 5.2: حقول الصفحة العامة
--
-- ما يفعله هذا الملف:
--   (1) أعمدة جديدة:
--       evidence.hidden_from_gallery          — إخفاء شاهد من معرض «لمحات»
--       portfolios.pinned_top_evidence_id     — «أبرز إنجاز» يثبّته المعلم
--       portfolios.ai_top_achievement_approved — موافقة المعلم على اقتراح الذكاء الاصطناعي
--   (2)+(3) مشغّل BEFORE INSERT OR UPDATE على portfolios:
--       - يصفّر ai_top_achievement_approved إذا تغيّر ai_top_achievement_evidence_id.
--       - يرفض pinned_top_evidence_id / ai_top_achievement_evidence_id إذا لم يكن
--         الشاهد من الملف نفسه. الفحص يعمل فقط إذا تغيّر العمود فعلاً وكانت قيمته
--         الجديدة غير NULL. لذلك يمر تحديث mark_portfolio_summary_stale عند حذف
--         الشاهد المثبّت، لأن العمود لم يتغير فيه. ويمر SET NULL، لأن القيمة الجديدة NULL.
--   (4) trg_mark_summary_stale يُقسَم إلى مشغّلين، والدالة نفسها بلا تغيير. تغيير
--       hidden_from_gallery وحده (ومعه updated_at) لا يجعل الملخص قديماً. أي
--       UPDATE آخر يُطلقه كما كان، حتى التحديث الذي لا يغيّر شيئاً.
--   (5) get_shared_portfolio: يُحذف ai_top_achievement_evidence_id، ويُضاف
--       top_achievement_evidence_id وtop_achievement_source، ويُحسبان في الخادم.
--   (6) get_shared_evidence: لا تُرجع إلا ما تقرؤه الصفحة العامة، مع hidden_from_gallery.
--   (7) admin_reset_portfolio_data: تصفّر الحقلين الجديدين قبل حذف الشواهد.
--   (8) الصلاحيات.
--
-- لا يتغير نوع الإرجاع لأي دالة (jsonb)، فيكفي CREATE OR REPLACE.
-- التحقق قبل COMMIT. الاختبار اليدوي والتراجع في آخر الملف (تعليق).
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) الأعمدة ──────────────────────────────────────────────────────────
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS hidden_from_gallery boolean NOT NULL DEFAULT false;

ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS pinned_top_evidence_id uuid
    REFERENCES public.evidence(id) ON DELETE SET NULL;

ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS ai_top_achievement_approved boolean NOT NULL DEFAULT false;

-- ── (2)+(3) حماية «أبرز إنجاز» ──────────────────────────────────────────
-- SECURITY DEFINER: فحص الملكية لا يتأثر بسياسات RLS على evidence حسب المستدعي.
CREATE OR REPLACE FUNCTION public.portfolios_top_achievement_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_pinned uuid;  -- يبقى NULL عند INSERT
  v_old_ai     uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_pinned := OLD.pinned_top_evidence_id;
    v_old_ai     := OLD.ai_top_achievement_evidence_id;

    -- اقتراح جديد يحتاج موافقة جديدة
    IF NEW.ai_top_achievement_evidence_id IS DISTINCT FROM OLD.ai_top_achievement_evidence_id THEN
      NEW.ai_top_achievement_approved := false;
    END IF;
  END IF;

  -- الفحص فقط عند تغيّر فعلي إلى قيمة غير NULL. تحديث mark_portfolio_summary_stale
  -- عند حذف الشاهد المثبّت لا يغيّر العمود، فلا يُفحص.
  IF NEW.pinned_top_evidence_id IS NOT NULL
     AND NEW.pinned_top_evidence_id IS DISTINCT FROM v_old_pinned
     AND NOT EXISTS (
       SELECT 1 FROM public.evidence e
        WHERE e.id = NEW.pinned_top_evidence_id
          AND e.portfolio_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'top_achievement_evidence_not_owned: pinned_top_evidence_id'
      USING DETAIL = 'الشاهد غير موجود أو ليس من هذا الملف';
  END IF;

  IF NEW.ai_top_achievement_evidence_id IS NOT NULL
     AND NEW.ai_top_achievement_evidence_id IS DISTINCT FROM v_old_ai
     AND NOT EXISTS (
       SELECT 1 FROM public.evidence e
        WHERE e.id = NEW.ai_top_achievement_evidence_id
          AND e.portfolio_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'top_achievement_evidence_not_owned: ai_top_achievement_evidence_id'
      USING DETAIL = 'الشاهد غير موجود أو ليس من هذا الملف';
  END IF;

  RETURN NEW;
END;
$function$;

-- دالة مشغّل فقط: لا تُستدعى مباشرة
REVOKE EXECUTE ON FUNCTION public.portfolios_top_achievement_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS portfolios_top_achievement_guard ON public.portfolios;
CREATE TRIGGER portfolios_top_achievement_guard
  BEFORE INSERT OR UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.portfolios_top_achievement_guard();

-- ── (4) trg_mark_summary_stale ──────────────────────────────────────────
-- WHEN الذي يشير إلى OLD لا يُسمح به في مشغّل يشمل INSERT، فيُقسَم المشغّل إلى اثنين.
-- الحالة الوحيدة المستثناة: تغيّر hidden_from_gallery، ولم يتغير معه غيره سوى
-- updated_at (يغيّره evidence_updated_at في كل UPDATE).
DROP TRIGGER IF EXISTS trg_mark_summary_stale ON public.evidence;

CREATE TRIGGER trg_mark_summary_stale
  AFTER INSERT OR DELETE ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.mark_portfolio_summary_stale();

CREATE TRIGGER trg_mark_summary_stale_upd
  AFTER UPDATE ON public.evidence
  FOR EACH ROW
  WHEN (
    OLD.hidden_from_gallery IS NOT DISTINCT FROM NEW.hidden_from_gallery
    OR (to_jsonb(OLD) - 'hidden_from_gallery' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(NEW) - 'hidden_from_gallery' - 'updated_at')
  )
  EXECUTE FUNCTION public.mark_portfolio_summary_stale();

-- ── (5) get_shared_portfolio ─────────────────────────────────────────────
-- «أبرز إنجاز» يُحسب هنا بالأولوية: تثبيت المعلم، ثم اقتراح الذكاء الاصطناعي
-- الموافَق عليه، وكلاهما بشرط شاهد موجود من الملف نفسه وله قسم. لا يصل معرّف
-- اقتراح غير موافَق عليه إلى المتصفح. لا شرط على hidden_from_gallery: الإخفاء
-- خاص بالمعرض، والشاهد يبقى ظاهراً في بنده (قرار صاحب المشروع).
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
where p.id = target_id and p.share_enabled = true;
$function$;

-- ── (6) get_shared_evidence ──────────────────────────────────────────────
-- لا تُرجع إلا ما تقرؤه الصفحة العامة (Public.tsx وtoEvRow)، مع hidden_from_gallery.
-- محذوف: portfolio_id وcontext_grade وcontext_subject وacademic_term وimpact وself_reflection.
CREATE OR REPLACE FUNCTION public.get_shared_evidence(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
$$;

-- ── (7) admin_reset_portfolio_data ───────────────────────────────────────
-- نص 3.3ب حرفياً، والفرق الوحيد سطران في الـ UPDATE الأول.
CREATE OR REPLACE FUNCTION public.admin_reset_portfolio_data(p_portfolio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  -- قفل صف الملف: يمنع تنفيذين متزامنين، ويتحقق من وجوده
  PERFORM 1 FROM public.portfolios WHERE id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portfolio_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- قبل أي حذف: trg_mark_summary_stale يحدّث صف الملف عند حذف كل شاهد، فيُعاد فحص
  -- مفتاحي ai_top_achievement_evidence_id وpinned_top_evidence_id على شاهد محذوف،
  -- ويفشل قبل أن يصل ON DELETE SET NULL.
  UPDATE public.portfolios
     SET ai_summary = NULL,
         ai_top_achievement_evidence_id = NULL,
         ai_summary_generated_at = NULL,
         pinned_top_evidence_id = NULL,
         ai_top_achievement_approved = false
   WHERE id = p_portfolio_id;

  -- الجداول التي قد تشير إلى evidence أولاً، ثم evidence، ثم المؤشرات المخصصة والاستراتيجيات
  DELETE FROM public.harvest_reports        WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('harvest_reports', v_n);

  DELETE FROM public.results_analysis       WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('results_analysis', v_n);

  DELETE FROM public.section_ai_summaries   WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('section_ai_summaries', v_n);

  DELETE FROM public.lesson_plan_templates  WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('lesson_plan_templates', v_n);

  DELETE FROM public.bulk_import_queue      WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bulk_import_queue', v_n);

  DELETE FROM public.monthly_progress       WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('monthly_progress', v_n);

  DELETE FROM public.evidence               WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('evidence', v_n);

  DELETE FROM public.section_indicators     WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('custom_indicators', v_n);

  DELETE FROM public.teaching_strategies    WHERE created_by = p_portfolio_id AND is_global = false;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('teaching_strategies', v_n);

  -- لا حذف من ai_usage_log ولا من portfolio_feature_overrides (قرار صاحب المشروع)
  RETURN v_counts;
END;
$function$;

-- ── (8) الصلاحيات ────────────────────────────────────────────────────────
-- كما هي حية حرفياً: الدالتان العامتان لـ anon وauthenticated وservice_role،
-- وadmin_reset_portfolio_data لـ service_role فقط (وpostgres المالك في الحالتين).
REVOKE ALL ON FUNCTION public.get_shared_portfolio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_portfolio(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_shared_evidence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_evidence(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_reset_portfolio_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_portfolio_data(uuid) TO service_role;

-- ── التحقق (قبل COMMIT) ─────────────────────────────────────────────────
-- أي شرط لا يتحقق يرفع خطأً، فتُلغى المعاملة كلها. لا يقرأ محتوى أي بيانات حقيقية.
DO $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'evidence'
       AND column_name = 'hidden_from_gallery' AND data_type = 'boolean'
       AND is_nullable = 'NO' AND column_default = 'false'
  ) THEN
    RAISE EXCEPTION 'تحقق: evidence.hidden_from_gallery غير صحيح';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'portfolios'
       AND column_name = 'pinned_top_evidence_id' AND data_type = 'uuid'
       AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'تحقق: portfolios.pinned_top_evidence_id غير صحيح';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
     WHERE con.conrelid = 'public.portfolios'::regclass
       AND con.contype = 'f'
       AND con.confrelid = 'public.evidence'::regclass
       AND con.confdeltype = 'n'  -- ON DELETE SET NULL
       AND con.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                WHERE attrelid = 'public.portfolios'::regclass
                                  AND attname = 'pinned_top_evidence_id')]
  ) THEN
    RAISE EXCEPTION 'تحقق: مفتاح pinned_top_evidence_id ليس ON DELETE SET NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'portfolios'
       AND column_name = 'ai_top_achievement_approved' AND data_type = 'boolean'
       AND is_nullable = 'NO' AND column_default = 'false'
  ) THEN
    RAISE EXCEPTION 'تحقق: portfolios.ai_top_achievement_approved غير صحيح';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.portfolios'::regclass
                    AND tgname = 'portfolios_top_achievement_guard') THEN
    RAISE EXCEPTION 'تحقق: المشغّل portfolios_top_achievement_guard غير موجود';
  END IF;

  -- trg_mark_summary_stale بلا UPDATE (البت 16 = TRIGGER_TYPE_UPDATE)
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.evidence'::regclass
                    AND tgname = 'trg_mark_summary_stale'
                    AND (tgtype & 16) = 0) THEN
    RAISE EXCEPTION 'تحقق: trg_mark_summary_stale غير موجود أو ما زال يشمل UPDATE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.evidence'::regclass
                    AND tgname = 'trg_mark_summary_stale_upd'
                    AND (tgtype & 16) <> 0) THEN
    RAISE EXCEPTION 'تحقق: المشغّل trg_mark_summary_stale_upd غير موجود';
  END IF;

  -- ملف غير موجود
  IF public.get_shared_portfolio(gen_random_uuid()) IS NOT NULL
     OR public.get_shared_evidence(gen_random_uuid()) IS NOT NULL THEN
    RAISE EXCEPTION 'تحقق: الدالتان العامتان لا تعيدان NULL لملف غير موجود';
  END IF;

  -- ملف مشاركته مطفأة، إن وُجد: فحص NULL فقط، بلا قراءة أي محتوى
  SELECT id INTO v_id FROM public.portfolios WHERE share_enabled IS NOT TRUE LIMIT 1;
  IF FOUND AND (public.get_shared_portfolio(v_id) IS NOT NULL
                OR public.get_shared_evidence(v_id) IS NOT NULL) THEN
    RAISE EXCEPTION 'تحقق: الدالتان العامتان لا تعيدان NULL لملف مشاركته مطفأة';
  END IF;

  RAISE NOTICE 'تحقق 5.2: كل الفحوص نجحت';
END
$$;

SELECT
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evidence'
      AND column_name = 'hidden_from_gallery')                     AS hidden_from_gallery_default,  -- false
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'portfolios'
      AND column_name = 'pinned_top_evidence_id')                  AS pinned_top_evidence_id_type,  -- uuid
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'portfolios'
      AND column_name = 'ai_top_achievement_approved')             AS ai_top_approved_default,      -- false
  (SELECT string_agg(tgname, ', ' ORDER BY tgname) FROM pg_trigger
    WHERE tgname IN ('portfolios_top_achievement_guard',
                     'trg_mark_summary_stale',
                     'trg_mark_summary_stale_upd'))               AS triggers,                     -- الثلاثة
  public.get_shared_portfolio(gen_random_uuid()) IS NULL          AS shared_portfolio_null,        -- true
  public.get_shared_evidence(gen_random_uuid())  IS NULL          AS shared_evidence_null;         -- true

COMMIT;

-- =====================================================================
-- اختبار يدوي: على حساب الاختبار فقط، وكله داخل ROLLBACK فلا يبقى منه شيء.
-- يحتاج حساب الاختبار 3 شواهد على الأقل. شغّله كـ postgres من SQL Editor.
-- السطر الذي يُتوقع فيه خطأ يُشغَّل بعد SAVEPOINT ثم ROLLBACK TO SAVEPOINT.
-- =====================================================================
-- BEGIN;
--
-- -- 1) تثبيت شاهد للحساب ينجح
-- UPDATE public.portfolios
--    SET pinned_top_evidence_id = (SELECT id FROM public.evidence
--                                   WHERE portfolio_id = '<test-id>' ORDER BY created_at LIMIT 1)
--  WHERE id = '<test-id>'
-- RETURNING pinned_top_evidence_id;                                   -- معرّف الشاهد
--
-- -- 2) شاهد لملف آخر يُرفض
-- SAVEPOINT s1;
-- UPDATE public.portfolios
--    SET pinned_top_evidence_id = (SELECT id FROM public.evidence
--                                   WHERE portfolio_id <> '<test-id>' LIMIT 1)
--  WHERE id = '<test-id>';             -- خطأ: top_achievement_evidence_not_owned: pinned_top_evidence_id
-- ROLLBACK TO SAVEPOINT s1;
--
-- -- 3) حذف الشاهد المثبّت ينجح، والتثبيت يصبح NULL، والملخص قديم
-- UPDATE public.portfolios SET ai_summary_stale = false WHERE id = '<test-id>';
-- DELETE FROM public.evidence
--  WHERE id = (SELECT pinned_top_evidence_id FROM public.portfolios WHERE id = '<test-id>');  -- DELETE 1
-- SELECT pinned_top_evidence_id, ai_summary_stale
--   FROM public.portfolios WHERE id = '<test-id>';                     -- NULL | true
--
-- -- 4) اقتراح جديد يصفّر الموافقة، وإعادة القيمة نفسها لا تصفّرها
-- UPDATE public.portfolios
--    SET ai_top_achievement_evidence_id = (SELECT id FROM public.evidence
--                                           WHERE portfolio_id = '<test-id>' ORDER BY created_at LIMIT 1)
--  WHERE id = '<test-id>';
-- UPDATE public.portfolios SET ai_top_achievement_approved = true WHERE id = '<test-id>';
-- UPDATE public.portfolios
--    SET ai_top_achievement_evidence_id = ai_top_achievement_evidence_id
--  WHERE id = '<test-id>'
-- RETURNING ai_top_achievement_approved;                              -- true
-- UPDATE public.portfolios
--    SET ai_top_achievement_evidence_id = (SELECT id FROM public.evidence
--                                           WHERE portfolio_id = '<test-id>' ORDER BY created_at DESC LIMIT 1)
--  WHERE id = '<test-id>'
-- RETURNING ai_top_achievement_approved;                              -- false
--
-- -- 5) إخفاء شاهد من المعرض وحده لا يجعل الملخص قديماً
-- UPDATE public.portfolios SET ai_summary_stale = false WHERE id = '<test-id>';
-- UPDATE public.evidence SET hidden_from_gallery = true
--  WHERE id = (SELECT id FROM public.evidence WHERE portfolio_id = '<test-id>' ORDER BY created_at LIMIT 1);
-- SELECT ai_summary_stale FROM public.portfolios WHERE id = '<test-id>';   -- false
--
-- -- 6) أي تحديث آخر يُطلقه كما كان (حتى التحديث الذي لا يغيّر شيئاً)
-- UPDATE public.evidence SET title = title
--  WHERE id = (SELECT id FROM public.evidence WHERE portfolio_id = '<test-id>' ORDER BY created_at LIMIT 1);
-- SELECT ai_summary_stale FROM public.portfolios WHERE id = '<test-id>';   -- true
--
-- -- 7) الصفحة العامة (إن كانت مشاركة حساب الاختبار مفعّلة)
-- SELECT public.get_shared_portfolio('<test-id>') -> 'top_achievement_source';
-- SELECT public.get_shared_evidence('<test-id>') -> 0;   -- 11 حقلاً، منها hidden_from_gallery
--
-- ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════
-- قسم التراجع — لا يُنفَّذ. انسخه إلى SQL Editor عند الحاجة فقط.
-- نصوص get_shared_portfolio وget_shared_evidence وtrg_mark_summary_stale من
-- pg_get_functiondef وpg_get_triggerdef الحية (8 أكتوبر 2026)، وadmin_reset_portfolio_data
-- من 3.3ب. الصلاحيات كما كانت حية.
-- المشغّلات تُحذف قبل الأعمدة، لأن WHEN في trg_mark_summary_stale_upd يشير إلى hidden_from_gallery.
-- ════════════════════════════════════════════════════════════════════════
/*
BEGIN;

DROP TRIGGER IF EXISTS trg_mark_summary_stale_upd ON public.evidence;
DROP TRIGGER IF EXISTS trg_mark_summary_stale ON public.evidence;
CREATE TRIGGER trg_mark_summary_stale
  AFTER INSERT OR DELETE OR UPDATE ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.mark_portfolio_summary_stale();

DROP TRIGGER IF EXISTS portfolios_top_achievement_guard ON public.portfolios;
DROP FUNCTION IF EXISTS public.portfolios_top_achievement_guard();

CREATE OR REPLACE FUNCTION public.get_shared_portfolio(target_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
select jsonb_build_object(
  'profile', jsonb_strip_nulls(jsonb_build_object(
    'name',              state->'profile'->'name',
    'role',              state->'profile'->'role',
    'school',            state->'profile'->'school',
    'phone',             state->'profile'->'phone',
    'email',             state->'profile'->'email',
    'twitter',           state->'profile'->'twitter',
    'linkedin',          state->'profile'->'linkedin',
    'youtube',           state->'profile'->'youtube',
    'avatar',            state->'profile'->'avatar',
    'yearsOfExperience', state->'profile'->'yearsOfExperience'
  )),
  'ai_summary', ai_summary,
  'ai_top_achievement_evidence_id', ai_top_achievement_evidence_id,
  'completion', (select row_to_json(c) from public.get_portfolio_completion(target_id) c)
)
from public.portfolios
where id = target_id and share_enabled = true;
$function$;

CREATE OR REPLACE FUNCTION public.get_shared_evidence(target_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  is_shared boolean;
  result    jsonb;
BEGIN
  SELECT share_enabled INTO is_shared FROM public.portfolios WHERE id = target_id;
  IF is_shared IS NOT TRUE THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::jsonb)
    INTO result
  FROM (
    SELECT
      ev.id, ev.portfolio_id, ev.section_id, ev.indicator_id,
      ev.title, ev.description,
      NULL::text AS impact,
      ev.context_grade, ev.context_subject, ev.academic_term,
      ev.evidence_type, ev.file_url, ev.link_url,
      NULL::text AS self_reflection,
      ev.created_at,
      ev.strategy_id
    FROM public.evidence ev
    WHERE ev.portfolio_id = target_id
      AND ev.section_id IS NOT NULL  -- استبعاد الأدلة غير المصنّفة من العرض العام
  ) e;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_portfolio_data(p_portfolio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  PERFORM 1 FROM public.portfolios WHERE id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portfolio_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.portfolios
     SET ai_summary = NULL,
         ai_top_achievement_evidence_id = NULL,
         ai_summary_generated_at = NULL
   WHERE id = p_portfolio_id;

  DELETE FROM public.harvest_reports        WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('harvest_reports', v_n);
  DELETE FROM public.results_analysis       WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('results_analysis', v_n);
  DELETE FROM public.section_ai_summaries   WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('section_ai_summaries', v_n);
  DELETE FROM public.lesson_plan_templates  WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('lesson_plan_templates', v_n);
  DELETE FROM public.bulk_import_queue      WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bulk_import_queue', v_n);
  DELETE FROM public.monthly_progress       WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('monthly_progress', v_n);
  DELETE FROM public.evidence               WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('evidence', v_n);
  DELETE FROM public.section_indicators     WHERE portfolio_id = p_portfolio_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('custom_indicators', v_n);
  DELETE FROM public.teaching_strategies    WHERE created_by = p_portfolio_id AND is_global = false;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('teaching_strategies', v_n);

  RETURN v_counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_portfolio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_portfolio(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_shared_evidence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_evidence(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_reset_portfolio_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_portfolio_data(uuid) TO service_role;

ALTER TABLE public.portfolios DROP COLUMN IF EXISTS pinned_top_evidence_id;
ALTER TABLE public.portfolios DROP COLUMN IF EXISTS ai_top_achievement_approved;
ALTER TABLE public.evidence   DROP COLUMN IF EXISTS hidden_from_gallery;

COMMIT;
*/
