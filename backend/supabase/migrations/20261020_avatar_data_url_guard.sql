-- =====================================================================
-- منع حفظ الصورة الشخصية نصاً (data:) في portfolios.state.profile.avatar
-- =====================================================================
-- الصورة مكانها حاوية avatars ({uid}/avatar.jpg)، و profile.avatar يحمل
-- الرابط وحده. هذا المشغّل يرفض أي data: جديدة أو متغيرة، ويمرر القيمة
-- القديمة نفسها (الملفات التي لم ينقلها التطبيق بعد يستمر حفظها حتى تنتقل).
--
-- upsert (saveState) = INSERT … ON CONFLICT DO UPDATE، و BEFORE INSERT يعمل
-- أولاً على الصف المقترح حتى لو انتهى إلى تحديث. لذلك يقارن فرع INSERT بالصف
-- الموجود بنفس id، وإلا تعطّل حفظ الملفات التي ما زالت data:.
--
-- يُنفَّذ بعد نشر الواجهة والتأكد من نقل الصورتين.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.portfolios_avatar_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_new text := NEW.state #>> '{profile,avatar}';
  v_old text;
BEGIN
  IF v_new IS NULL OR v_new NOT LIKE 'data:%' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := OLD.state #>> '{profile,avatar}';
  ELSE
    SELECT p.state #>> '{profile,avatar}' INTO v_old
      FROM public.portfolios p WHERE p.id = NEW.id;
  END IF;

  IF v_new IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'avatar_data_url_not_allowed' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

-- دالة مشغّل فقط: لا تُستدعى مباشرة
REVOKE EXECUTE ON FUNCTION public.portfolios_avatar_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS portfolios_avatar_guard ON public.portfolios;
CREATE TRIGGER portfolios_avatar_guard
  BEFORE INSERT OR UPDATE OF state ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.portfolios_avatar_guard();

-- ── التحقق قبل COMMIT ────────────────────────────────────────────────────
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.portfolios'::regclass AND tgname = 'portfolios_avatar_guard';

-- الملفات التي ما زالت data: — المتوقع 0 بعد النقل. إن لم يكن 0 فالمشغّل لا
-- يكسر حفظها، ويبقى نقلها على التطبيق عند دخول صاحبها.
SELECT id, pg_column_size(state) AS bytes
  FROM public.portfolios
 WHERE state #>> '{profile,avatar}' LIKE 'data:%';

COMMIT;

-- ── تقارير الحصاد (قراءة فقط) ───────────────────────────────────────────
-- اللقطة تنسخ profile كاملاً، فالتقارير المولّدة قبل النقل قد تحمل الصورة نصاً:
-- SELECT id, portfolio_id, created_at, pg_column_size(snapshot) AS bytes
--   FROM public.harvest_reports
--  WHERE snapshot #>> '{state,profile,avatar}' LIKE 'data:%';

-- ── اختبار المشغّل (حساب الاختبار فقط، بلا أثر) ─────────────────────────
-- BEGIN;
-- UPDATE public.portfolios
--    SET state = jsonb_set(state, '{profile,avatar}', '"data:image/jpeg;base64,AA=="')
--  WHERE id = '<uid حساب الاختبار>';
-- -- المتوقع: ERROR: avatar_data_url_not_allowed
-- ROLLBACK;

-- ── التراجع ─────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP TRIGGER IF EXISTS portfolios_avatar_guard ON public.portfolios;
-- DROP FUNCTION IF EXISTS public.portfolios_avatar_guard();
-- COMMIT;
