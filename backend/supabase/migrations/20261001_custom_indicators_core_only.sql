-- =====================================================================
-- المرحلة 3 — الخطوة 3.4ب: المؤشر المخصص في الأقسام العادية فقط
-- الحارس section_indicators_custom_guard يرفض إضافة مؤشر مخصص في قسم ليس
-- core (4 الاستراتيجيات، 5 و10 النتائج) بالخطأ custom_indicator_section_not_allowed.
-- لا حاجة للشرط عند التعديل: الحارس يمنع تغيير قسم المخصص أصلاً.
-- التعريف منسوخ حرفياً من 20260930_custom_indicators_foundation.sql (الوزن 99)،
-- والإضافة الوحيدة الشرط الجديد داخل فرع INSERT قبل القفل.
-- التحقق والتراجع في آخر الملف (تعليق).
-- =====================================================================

BEGIN;

-- (0) فحص مسبق يوقف التنفيذ
DO $$
DECLARE v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.section_indicators si
    LEFT JOIN public.sections s ON s.id = si.section_id
   WHERE si.portfolio_id IS NOT NULL
     AND s.section_type IS DISTINCT FROM 'core';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'توقف التنفيذ: % مؤشر مخصص في قسم ليس core', v_bad;
  END IF;
END $$;

-- (1) الحارس مع الشرط الجديد
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
    -- المؤشر المخصص للأقسام العادية (core) فقط، لا الاستراتيجيات ولا النتائج
    IF NOT EXISTS (SELECT 1 FROM public.sections
                    WHERE id = NEW.section_id AND section_type = 'core') THEN
      RAISE EXCEPTION 'custom_indicator_section_not_allowed' USING ERRCODE = 'P0001';
    END IF;
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

COMMIT;

-- =====================================================================
-- التحقق (تعليق — يُشغَّل يدوياً بعد التنفيذ)
-- =====================================================================
-- SELECT pg_get_functiondef('public.section_indicators_custom_guard'::regproc);
-- -- يظهر فيه custom_indicator_section_not_allowed و NEW.weight := 99
--
-- اختبار على حساب الاختبار فقط، وكله داخل ROLLBACK فلا يبقى منه شيء.
-- السطر الذي يُتوقع فيه خطأ يُشغَّل بعد SAVEPOINT ثم ROLLBACK TO SAVEPOINT،
-- حتى لا تُلغى المعاملة كلها.
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<test-id>","role":"authenticated"}', true);
--
-- SAVEPOINT s1;  -- القسم 4 (strategy): custom_indicator_section_not_allowed
-- INSERT INTO public.section_indicators (section_id, name_ar, portfolio_id) VALUES (4, 'مؤشر اختبار', '<test-id>');
-- ROLLBACK TO SAVEPOINT s1;
--
-- SAVEPOINT s2;  -- القسم 5 (results): custom_indicator_section_not_allowed
-- INSERT INTO public.section_indicators (section_id, name_ar, portfolio_id) VALUES (5, 'مؤشر اختبار', '<test-id>');
-- ROLLBACK TO SAVEPOINT s2;
--
-- SAVEPOINT s3;  -- القسم 10 (results): custom_indicator_section_not_allowed
-- INSERT INTO public.section_indicators (section_id, name_ar, portfolio_id) VALUES (10, 'مؤشر اختبار', '<test-id>');
-- ROLLBACK TO SAVEPOINT s3;
--
-- -- القسم 1 (core): ينجح، والوزن 99
-- INSERT INTO public.section_indicators (section_id, name_ar, portfolio_id)
-- VALUES (1, 'مؤشر اختبار', '<test-id>') RETURNING section_id, name_ar, weight;
--
-- ROLLBACK;

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً): التعريف السابق بلا الشرط الجديد
-- =====================================================================
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.section_indicators_custom_guard()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SECURITY INVOKER
-- SET search_path = public
-- AS $function$
-- DECLARE v_count integer;
-- BEGIN
--   IF TG_OP = 'UPDATE' THEN
--     IF NEW.portfolio_id IS DISTINCT FROM OLD.portfolio_id
--        OR (OLD.portfolio_id IS NOT NULL AND NEW.section_id IS DISTINCT FROM OLD.section_id) THEN
--       RAISE EXCEPTION 'custom_indicator_immutable' USING ERRCODE = 'P0001';
--     END IF;
--   END IF;
--
--   -- المؤشر الرسمي لا يُلمس
--   IF NEW.portfolio_id IS NULL THEN RETURN NEW; END IF;
--
--   NEW.name_ar := btrim(NEW.name_ar);
--
--   IF TG_OP = 'INSERT' THEN
--     -- قفل على المعلم والقسم: طلبان متزامنان لا يتجاوزان الحد
--     PERFORM pg_advisory_xact_lock(hashtext(NEW.portfolio_id::text), NEW.section_id::int);
--     SELECT count(*) INTO v_count FROM public.section_indicators
--      WHERE portfolio_id = NEW.portfolio_id AND section_id = NEW.section_id;
--     IF v_count >= 5 THEN
--       RAISE EXCEPTION 'custom_indicator_limit' USING ERRCODE = 'P0001';
--     END IF;
--     -- weight نوعه numeric(4,2) وأقصاه 99.99. الرسمي كله 1.00، فـ99 تضع المخصص بعده دائماً
--     NEW.weight := 99;
--   ELSE
--     NEW.weight := OLD.weight;
--   END IF;
--
--   IF EXISTS (SELECT 1 FROM public.section_indicators
--               WHERE portfolio_id IS NULL
--                 AND section_id = NEW.section_id
--                 AND lower(btrim(name_ar)) = lower(NEW.name_ar)) THEN
--     RAISE EXCEPTION 'custom_indicator_duplicate_official' USING ERRCODE = 'P0001';
--   END IF;
--
--   RETURN NEW;
-- END;
-- $function$;
-- COMMIT;
