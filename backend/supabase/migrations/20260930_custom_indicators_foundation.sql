-- =====================================================================
-- المرحلة 3 — الخطوة 3.3: أساس المؤشرات المخصصة
-- (1) section_indicators: عمودا portfolio_id (NULL = رسمي) وcreated_at، وفهرس.
-- (2) قيد طول الاسم، وفهرس فريد يمنع تكرار الاسم للمعلم نفسه في القسم نفسه.
-- (3) trigger: حد 5 مخصصة لكل معلم في كل قسم، ومنع مطابقة اسم رسمي،
--     وزن 99، وتقليم الاسم، ومنع تغيير المالك أو القسم.
-- (3ب) trigger على evidence: لا يُربط شاهد بمؤشر مخصص لمعلم آخر.
-- (4) السياسات: القراءة للرسمي ولمخصص المعلم، والكتابة لمخصصه فقط.
-- (5) الصلاحيات: anon قراءة فقط، وauthenticated يكتب أعمدة محددة.
-- (6) دالتا الجاهزية تستبعدان المخصص (portfolio_id IS NULL).
-- (7) get_shared_custom_indicators(): للصفحة العامة (لا تستعملها الواجهة بعد).
-- (8) admin_reset_portfolio_data(): تحذف المخصص، ولا تلمس indicator_ai_summaries.
-- (9) حذف جدول indicator_ai_summaries الفارغ.
-- الملف قابل للتشغيل أكثر من مرة. التراجع والتحقق في آخره (تعليق).
-- =====================================================================

BEGIN;

-- (0) فحوص مسبقة توقف التنفيذ
DO $$
DECLARE v_bad bigint; v_n bigint;
BEGIN
  SELECT count(*) INTO v_bad FROM public.section_indicators
   WHERE char_length(btrim(name_ar)) NOT BETWEEN 3 AND 80;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'توقف التنفيذ: % مؤشر اسمه خارج 3–80 حرفاً', v_bad;
  END IF;

  IF to_regclass('public.indicator_ai_summaries') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.indicator_ai_summaries' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'توقف التنفيذ: indicator_ai_summaries فيه % صف', v_n;
    END IF;
  END IF;
END $$;

-- (1) الأعمدة والفهرس
ALTER TABLE public.section_indicators
  ADD COLUMN IF NOT EXISTS portfolio_id uuid NULL REFERENCES public.portfolios(id) ON DELETE CASCADE;
ALTER TABLE public.section_indicators
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS section_indicators_custom_idx
  ON public.section_indicators (portfolio_id, section_id) WHERE portfolio_id IS NOT NULL;

-- (2) قيود الاسم
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'section_indicators_name_ar_len_check'
                    AND conrelid = 'public.section_indicators'::regclass) THEN
    ALTER TABLE public.section_indicators
      ADD CONSTRAINT section_indicators_name_ar_len_check
      CHECK (char_length(btrim(name_ar)) BETWEEN 3 AND 80);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS section_indicators_custom_name_uniq
  ON public.section_indicators (portfolio_id, section_id, lower(btrim(name_ar)))
  WHERE portfolio_id IS NOT NULL;

-- (3) حارس المؤشر المخصص. يعمل على كل صف (لا WHEN) حتى يمنع أيضاً تحويل
-- مخصص إلى رسمي (portfolio_id → NULL). INVOKER كافٍ هنا: المعلم يرى عبر RLS
-- الرسمي ومؤشراته، وهما كل ما يحتاج العدّ والمطابقة.
CREATE OR REPLACE FUNCTION public.section_indicators_custom_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE v_count integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.portfolio_id IS DISTINCT FROM OLD.portfolio_id
       OR (OLD.portfolio_id IS NOT NULL AND NEW.section_id IS DISTINCT FROM OLD.section_id) THEN
      RAISE EXCEPTION 'custom_indicator_immutable' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- المؤشر الرسمي لا يُلمس
  IF NEW.portfolio_id IS NULL THEN RETURN NEW; END IF;

  NEW.name_ar := btrim(NEW.name_ar);

  IF TG_OP = 'INSERT' THEN
    -- قفل على المعلم والقسم: طلبان متزامنان لا يتجاوزان الحد
    PERFORM pg_advisory_xact_lock(hashtext(NEW.portfolio_id::text), NEW.section_id::int);
    SELECT count(*) INTO v_count FROM public.section_indicators
     WHERE portfolio_id = NEW.portfolio_id AND section_id = NEW.section_id;
    IF v_count >= 5 THEN
      RAISE EXCEPTION 'custom_indicator_limit' USING ERRCODE = 'P0001';
    END IF;
    -- weight نوعه numeric(4,2) وأقصاه 99.99. الرسمي كله 1.00، فـ99 تضع المخصص بعده دائماً
    NEW.weight := 99;
  ELSE
    NEW.weight := OLD.weight;
  END IF;

  IF EXISTS (SELECT 1 FROM public.section_indicators
              WHERE portfolio_id IS NULL
                AND section_id = NEW.section_id
                AND lower(btrim(name_ar)) = lower(NEW.name_ar)) THEN
    RAISE EXCEPTION 'custom_indicator_duplicate_official' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS section_indicators_custom_guard ON public.section_indicators;
CREATE TRIGGER section_indicators_custom_guard
  BEFORE INSERT OR UPDATE ON public.section_indicators
  FOR EACH ROW EXECUTE FUNCTION public.section_indicators_custom_guard();

-- (3ب) لا يُربط شاهد بمؤشر مخصص لمعلم آخر. فحص المفتاح الأجنبي لا يمر عبر
-- RLS، فبدون هذا يستطيع من يعرف uuid مؤشر غيره أن يربط شاهده به. DEFINER
-- إلزامي: بـ INVOKER تُخفي RLS مؤشر الغير فيرجع EXISTS بـ false ويمر الربط.
CREATE OR REPLACE FUNCTION public.evidence_indicator_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.section_indicators si
              WHERE si.id = NEW.indicator_id
                AND si.portfolio_id IS NOT NULL
                AND si.portfolio_id <> NEW.portfolio_id) THEN
    RAISE EXCEPTION 'indicator_not_owned' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.evidence_indicator_owner_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS evidence_indicator_owner_guard ON public.evidence;
CREATE TRIGGER evidence_indicator_owner_guard
  BEFORE INSERT OR UPDATE OF indicator_id, portfolio_id ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.evidence_indicator_owner_guard();

-- (4) السياسات
DROP POLICY IF EXISTS "Allow public read access to section_indicators" ON public.section_indicators;
DROP POLICY IF EXISTS "section_indicators_select"       ON public.section_indicators;
DROP POLICY IF EXISTS "section_indicators_owner_insert" ON public.section_indicators;
DROP POLICY IF EXISTS "section_indicators_owner_update" ON public.section_indicators;
DROP POLICY IF EXISTS "section_indicators_owner_delete" ON public.section_indicators;

CREATE POLICY "section_indicators_select" ON public.section_indicators
  FOR SELECT TO anon, authenticated
  USING (portfolio_id IS NULL OR portfolio_id = (select auth.uid()));

CREATE POLICY "section_indicators_owner_insert" ON public.section_indicators
  FOR INSERT TO authenticated
  WITH CHECK (portfolio_id = (select auth.uid()));

CREATE POLICY "section_indicators_owner_update" ON public.section_indicators
  FOR UPDATE TO authenticated
  USING (portfolio_id = (select auth.uid()))
  WITH CHECK (portfolio_id = (select auth.uid()));

-- قيد الشواهد (بلا ON DELETE) يمنع حذف مؤشر عليه شواهد، وهذا مقصود
CREATE POLICY "section_indicators_owner_delete" ON public.section_indicators
  FOR DELETE TO authenticated
  USING (portfolio_id = (select auth.uid()));

-- (5) الصلاحيات. سحب صلاحية الجدول يسحب صلاحيات أعمدتها معها، فالمنح بعده
-- يجعل الملف قابلاً للتكرار.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.section_indicators FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.section_indicators FROM authenticated;
GRANT SELECT ON public.section_indicators TO anon, authenticated;
GRANT DELETE ON public.section_indicators TO authenticated;
GRANT INSERT (section_id, name_ar, portfolio_id) ON public.section_indicators TO authenticated;
GRANT UPDATE (name_ar) ON public.section_indicators TO authenticated;

-- (6) دالتا الجاهزية: التعريف الحي حرفياً، والفرق الوحيد شرط portfolio_id
-- IS NULL في كل موضع يُقرأ فيه section_indicators. ضروري لأن get_shared_portfolio
-- (DEFINER) تستدعي get_portfolio_completion فتقرأ الجدول بلا RLS، وبدون الشرط
-- تدخل مؤشرات كل المعلمين المخصصة في مقام نسبة كل معلم.
-- CREATE OR REPLACE يحافظ على صلاحيات EXECUTE الحالية.
CREATE OR REPLACE FUNCTION public.get_portfolio_completion(p_portfolio_id uuid)
 RETURNS TABLE(overall_pct numeric, completed_sections integer, total_sections integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_total_indicators   integer;
  v_covered_indicators integer;
  v_completed_sections integer;
  v_total_sections     integer;
begin
  select count(*) into v_total_sections
  from sections where section_type = 'core';

  select count(*) into v_total_indicators
  from section_indicators si
  join sections s on s.id = si.section_id
  where s.section_type = 'core'
    and si.portfolio_id is null;

  select count(distinct e.indicator_id) into v_covered_indicators
  from evidence e
  join section_indicators si on si.id = e.indicator_id
  join sections s on s.id = si.section_id
  where e.portfolio_id = p_portfolio_id
    and s.section_type = 'core'
    and si.portfolio_id is null;

  select count(*) into v_completed_sections
  from (
    select si.section_id
    from section_indicators si
    join sections s on s.id = si.section_id
    where s.section_type = 'core'
      and si.portfolio_id is null
    group by si.section_id
    having count(*) = count(*) filter (
      where exists (
        select 1 from evidence e
        where e.portfolio_id = p_portfolio_id and e.indicator_id = si.id
      )
    )
  ) t;

  return query select
    case when v_total_indicators = 0 then 0
    else round((v_covered_indicators::numeric / v_total_indicators) * 100) end,
    v_completed_sections,
    v_total_sections;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_section_completion(p_portfolio_id uuid, p_section_id smallint)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_total   integer;
  v_covered integer;
begin
  select count(*) into v_total
  from section_indicators
  where section_id = p_section_id
    and portfolio_id is null;

  if v_total = 0 then return 0; end if;

  select count(distinct e.indicator_id) into v_covered
  from evidence e
  join section_indicators si on si.id = e.indicator_id
  where e.portfolio_id = p_portfolio_id
    and si.section_id = p_section_id
    and si.portfolio_id is null;

  return round((v_covered::numeric / v_total) * 100);
end;
$function$;

-- (7) المؤشرات المخصصة للصفحة العامة: فقط ما عليه شاهد لهذا المعلم. المؤشر
-- الفارغ مسودة خاصة لا يراها الزائر. الواجهة لا تستعمل الدالة في هذه الخطوة.
CREATE OR REPLACE FUNCTION public.get_shared_custom_indicators(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE is_shared boolean; result jsonb;
BEGIN
  SELECT share_enabled INTO is_shared FROM public.portfolios WHERE id = target_id;
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
$function$;

REVOKE ALL ON FUNCTION public.get_shared_custom_indicators(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_custom_indicators(uuid) TO anon, authenticated;

-- (8) إعادة التعيين: نسخة 20260929_admin_portfolio_actions.sql، بلا
-- indicator_ai_summaries، ومعها حذف المؤشرات المخصصة بعد الشواهد (قيد
-- الشواهد يمنع حذف مؤشر عليه شواهد).
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

  UPDATE public.portfolios
     SET ai_summary = NULL,
         ai_top_achievement_evidence_id = NULL,
         ai_summary_generated_at = NULL
   WHERE id = p_portfolio_id;

  -- لا حذف من ai_usage_log ولا من portfolio_feature_overrides (قرار صاحب المشروع)
  RETURN v_counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reset_portfolio_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_portfolio_data(uuid) TO service_role;

-- (9) الجدول الفارغ (بعد البند 8، فلا دالة تشير إليه)
DROP TABLE IF EXISTS public.indicator_ai_summaries;

COMMIT;

-- =====================================================================
-- التحقق
-- =====================================================================
-- قبل التنفيذ: شغّل هذين واحفظ الناتج لمعلم معروف، ثم شغّلهما بعده.
-- يجب أن يتطابق الناتج حرفياً.
-- SELECT * FROM public.get_portfolio_completion('<portfolio-id>');
-- SELECT public.get_section_completion('<portfolio-id>', 1::smallint);
--
-- بعد التنفيذ:
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
--  WHERE tablename = 'section_indicators' ORDER BY policyname;
--   → 4 سياسات: select (anon, authenticated) و owner_insert/update/delete (authenticated)
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name = 'section_indicators' AND grantee IN ('anon','authenticated') ORDER BY 1,2;
--   → anon: SELECT فقط. authenticated: DELETE وSELECT فقط
-- SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
--  WHERE table_name = 'section_indicators' AND grantee = 'authenticated'
--    AND privilege_type IN ('INSERT','UPDATE') ORDER BY 1,2,3;
--   → INSERT: name_ar, portfolio_id, section_id. UPDATE: name_ar
-- SELECT count(*) FILTER (WHERE portfolio_id IS NULL)     AS official,  -- 33
--        count(*) FILTER (WHERE portfolio_id IS NOT NULL) AS custom     -- 0
--   FROM public.section_indicators;
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
--  WHERE tgname IN ('section_indicators_custom_guard','evidence_indicator_owner_guard');  -- صفّان
-- SELECT to_regclass('public.indicator_ai_summaries');                  -- NULL
-- SELECT public.get_shared_custom_indicators('<id مشاركته مفعّلة>');     -- []
--
-- اختبار الحماية: على حساب الاختبار فقط، وكله داخل ROLLBACK فلا يبقى منه شيء.
-- شغّل الكتلة كاملة مرة واحدة. أي سطر يُتوقع فيه خطأ شغّله وحده بعد
-- SAVEPOINT، ثم ROLLBACK TO SAVEPOINT، حتى لا تُلغى المعاملة كلها.
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<test-id>","role":"authenticated"}', true);
--
-- -- 5 إضافات تنجح، والوزن 99 والاسم مقلَّم
-- INSERT INTO public.section_indicators (section_id, name_ar, portfolio_id)
-- SELECT 1, '  مؤشر اختبار ' || g, '<test-id>'::uuid FROM generate_series(1,5) g
-- RETURNING id, name_ar, weight;
--
-- SAVEPOINT s1;  -- السادسة: custom_indicator_limit
-- INSERT INTO public.section_indicators (section_id, name_ar, portfolio_id) VALUES (1, 'مؤشر اختبار 6', '<test-id>');
-- ROLLBACK TO SAVEPOINT s1;
--
-- SAVEPOINT s2;  -- اسم مؤشر رسمي في القسم نفسه: custom_indicator_duplicate_official
-- INSERT INTO public.section_indicators (section_id, name_ar, portfolio_id)
-- SELECT 2, name_ar, '<test-id>' FROM public.section_indicators WHERE section_id = 2 AND portfolio_id IS NULL LIMIT 1;
-- ROLLBACK TO SAVEPOINT s2;
--
-- SAVEPOINT s3;  -- لمعلم آخر: new row violates row-level security policy
-- INSERT INTO public.section_indicators (section_id, name_ar, portfolio_id) VALUES (2, 'مؤشر لغيري', gen_random_uuid());
-- ROLLBACK TO SAVEPOINT s3;
--
-- UPDATE public.section_indicators SET name_ar = 'تجربة' WHERE portfolio_id IS NULL;  -- UPDATE 0
-- DELETE FROM public.section_indicators WHERE portfolio_id IS NULL;                   -- DELETE 0
--
-- SAVEPOINT s4;  -- permission denied for table section_indicators
-- UPDATE public.section_indicators SET weight = 1 WHERE portfolio_id = '<test-id>';
-- ROLLBACK TO SAVEPOINT s4;
--
-- -- معلم وهمي آخر لا يرى مؤشر الاختبار ولا يربط شاهده به عبر RLS
-- SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
-- SELECT count(*) FROM public.section_indicators WHERE portfolio_id = '<test-id>';     -- 0
-- UPDATE public.evidence SET indicator_id =
--   (SELECT id FROM public.section_indicators WHERE portfolio_id = '<test-id>' LIMIT 1);  -- UPDATE 0
--
-- -- الاختبار الحقيقي للحارس: كـ postgres (بلا RLS)
-- RESET ROLE;
-- SAVEPOINT s5;  -- indicator_not_owned
-- INSERT INTO public.evidence (portfolio_id, section_id, indicator_id, title, evidence_type)
-- SELECT '<معرّف ملف آخر موجود>'::uuid, 1, si.id, 'اختبار', 'note'
--   FROM public.section_indicators si WHERE si.portfolio_id = '<test-id>' LIMIT 1;
-- ROLLBACK TO SAVEPOINT s5;
--
-- ROLLBACK;

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- تنبيه: DROP COLUMN portfolio_id لا يفشل حين توجد مؤشرات مخصصة. هو يُسقط
-- العمود بصمت، فتصير مؤشرات المعلمين رسمية يراها الجميع وتدخل في جاهزية
-- الجميع. لذلك يبدأ التراجع بفحص يوقفه. احذف المؤشرات المخصصة (وانقل
-- شواهدها أو احذفها) قبل التراجع.
-- =====================================================================
-- BEGIN;
--
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM public.section_indicators WHERE portfolio_id IS NOT NULL) THEN
--     RAISE EXCEPTION 'توقف التراجع: توجد مؤشرات مخصصة';
--   END IF;
-- END $$;
--
-- -- الجدول المحذوف كان فارغاً عند الحذف (البند 0 يتحقق من ذلك)، فيُعاد فارغاً
-- CREATE TABLE IF NOT EXISTS public.indicator_ai_summaries (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
--   section_id smallint NOT NULL REFERENCES public.sections(id),
--   indicator_id uuid NOT NULL REFERENCES public.section_indicators(id) ON DELETE CASCADE,
--   ai_sentence text NOT NULL,
--   generated_at timestamptz NOT NULL DEFAULT now(),
--   UNIQUE (portfolio_id, section_id, indicator_id)
-- );
-- ALTER TABLE public.indicator_ai_summaries ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "المعلم يدير ملخصاته فقط" ON public.indicator_ai_summaries FOR ALL
--   USING (portfolio_id = auth.uid()) WITH CHECK (portfolio_id = auth.uid());
--
-- CREATE OR REPLACE FUNCTION public.admin_reset_portfolio_data(p_portfolio_id uuid)
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_counts jsonb := '{}'::jsonb;
--   v_n integer;
-- BEGIN
--   PERFORM 1 FROM public.portfolios WHERE id = p_portfolio_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'portfolio_not_found' USING ERRCODE = 'P0002';
--   END IF;
--   DELETE FROM public.harvest_reports        WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('harvest_reports', v_n);
--   DELETE FROM public.results_analysis       WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('results_analysis', v_n);
--   DELETE FROM public.indicator_ai_summaries WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('indicator_ai_summaries', v_n);
--   DELETE FROM public.section_ai_summaries   WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('section_ai_summaries', v_n);
--   DELETE FROM public.lesson_plan_templates  WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('lesson_plan_templates', v_n);
--   DELETE FROM public.bulk_import_queue      WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bulk_import_queue', v_n);
--   DELETE FROM public.monthly_progress       WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('monthly_progress', v_n);
--   DELETE FROM public.evidence               WHERE portfolio_id = p_portfolio_id;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('evidence', v_n);
--   DELETE FROM public.teaching_strategies    WHERE created_by = p_portfolio_id AND is_global = false;
--   GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('teaching_strategies', v_n);
--   UPDATE public.portfolios
--      SET ai_summary = NULL,
--          ai_top_achievement_evidence_id = NULL,
--          ai_summary_generated_at = NULL
--    WHERE id = p_portfolio_id;
--   RETURN v_counts;
-- END;
-- $function$;
-- REVOKE ALL ON FUNCTION public.admin_reset_portfolio_data(uuid) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.admin_reset_portfolio_data(uuid) TO service_role;
--
-- CREATE OR REPLACE FUNCTION public.get_portfolio_completion(p_portfolio_id uuid)
--  RETURNS TABLE(overall_pct numeric, completed_sections integer, total_sections integer)
--  LANGUAGE plpgsql
--  SET search_path TO 'public'
-- AS $function$
-- declare
--   v_total_indicators   integer;
--   v_covered_indicators integer;
--   v_completed_sections integer;
--   v_total_sections     integer;
-- begin
--   select count(*) into v_total_sections
--   from sections where section_type = 'core';
--
--   select count(*) into v_total_indicators
--   from section_indicators si
--   join sections s on s.id = si.section_id
--   where s.section_type = 'core';
--
--   select count(distinct e.indicator_id) into v_covered_indicators
--   from evidence e
--   join section_indicators si on si.id = e.indicator_id
--   join sections s on s.id = si.section_id
--   where e.portfolio_id = p_portfolio_id
--     and s.section_type = 'core';
--
--   select count(*) into v_completed_sections
--   from (
--     select si.section_id
--     from section_indicators si
--     join sections s on s.id = si.section_id
--     where s.section_type = 'core'
--     group by si.section_id
--     having count(*) = count(*) filter (
--       where exists (
--         select 1 from evidence e
--         where e.portfolio_id = p_portfolio_id and e.indicator_id = si.id
--       )
--     )
--   ) t;
--
--   return query select
--     case when v_total_indicators = 0 then 0
--     else round((v_covered_indicators::numeric / v_total_indicators) * 100) end,
--     v_completed_sections,
--     v_total_sections;
-- end;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.get_section_completion(p_portfolio_id uuid, p_section_id smallint)
--  RETURNS numeric
--  LANGUAGE plpgsql
--  SET search_path TO 'public'
-- AS $function$
-- declare
--   v_total   integer;
--   v_covered integer;
-- begin
--   select count(*) into v_total
--   from section_indicators
--   where section_id = p_section_id;
--
--   if v_total = 0 then return 0; end if;
--
--   select count(distinct e.indicator_id) into v_covered
--   from evidence e
--   join section_indicators si on si.id = e.indicator_id
--   where e.portfolio_id = p_portfolio_id
--     and si.section_id = p_section_id;
--
--   return round((v_covered::numeric / v_total) * 100);
-- end;
-- $function$;
--
-- DROP FUNCTION IF EXISTS public.get_shared_custom_indicators(uuid);
--
-- DROP POLICY IF EXISTS "section_indicators_select"       ON public.section_indicators;
-- DROP POLICY IF EXISTS "section_indicators_owner_insert" ON public.section_indicators;
-- DROP POLICY IF EXISTS "section_indicators_owner_update" ON public.section_indicators;
-- DROP POLICY IF EXISTS "section_indicators_owner_delete" ON public.section_indicators;
-- CREATE POLICY "Allow public read access to section_indicators"
--   ON public.section_indicators FOR SELECT USING (true);
--
-- -- الحالة السابقة: كل الصلاحيات على مستوى الجدول
-- GRANT ALL ON public.section_indicators TO anon, authenticated;
--
-- DROP TRIGGER IF EXISTS evidence_indicator_owner_guard ON public.evidence;
-- DROP FUNCTION IF EXISTS public.evidence_indicator_owner_guard();
-- DROP TRIGGER IF EXISTS section_indicators_custom_guard ON public.section_indicators;
-- DROP FUNCTION IF EXISTS public.section_indicators_custom_guard();
-- DROP INDEX IF EXISTS public.section_indicators_custom_name_uniq;
-- DROP INDEX IF EXISTS public.section_indicators_custom_idx;
-- ALTER TABLE public.section_indicators DROP CONSTRAINT IF EXISTS section_indicators_name_ar_len_check;
-- ALTER TABLE public.section_indicators DROP COLUMN IF EXISTS created_at;
-- ALTER TABLE public.section_indicators DROP COLUMN IF EXISTS portfolio_id;
--
-- COMMIT;
