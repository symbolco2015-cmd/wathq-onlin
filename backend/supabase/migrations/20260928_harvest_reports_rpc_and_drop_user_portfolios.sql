-- =====================================================================
-- المرحلة 1 — الخطوة 1.4
-- (1) إغلاق القراءة العامة الشاملة لجدول harvest_reports:
--     سياسة "قراءة عامة بمعرفة id" شرطها true، فتسمح لأي شخص (حتى anon)
--     بقراءة كل التقارير دون معرفة أي معرّف. تُستبدل بسياسة تقصر القراءة
--     المباشرة على المالك والأدمن، والعرض العام لرابط ?report= يمر عبر
--     الدالة get_harvest_report(report_id) التي تُرجع تقريراً واحداً بمعرّفه.
--     لا شرط share_enabled: التقرير لقطة ثابتة يرسل المعلم رابطها بنفسه.
-- (2) حذف الجدول المهجور user_portfolios (فارغ، بلا أي استخدام في الكود،
--     وفيه سياسة قراءة عامة شرطها true). يتوقف الملف إن وُجد فيه أي صف.
-- الملف قابل للتشغيل أكثر من مرة.
-- =====================================================================

BEGIN;

-- (1) دالة العرض العام: تقرير واحد بالمعرّف، أو NULL إن لم يوجد
CREATE OR REPLACE FUNCTION public.get_harvest_report(report_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select to_jsonb(r)
  from public.harvest_reports r
  where r.id = get_harvest_report.report_id;
$function$;

REVOKE ALL ON FUNCTION public.get_harvest_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_harvest_report(uuid) TO anon, authenticated;

-- (2) سياسة القراءة: المالك والأدمن فقط (سياسة INSERT الحالية لا تُلمس)
DROP POLICY IF EXISTS "قراءة عامة بمعرفة id" ON public.harvest_reports;
DROP POLICY IF EXISTS "المالك والأدمن يقرؤون التقارير" ON public.harvest_reports;
CREATE POLICY "المالك والأدمن يقرؤون التقارير"
  ON public.harvest_reports
  FOR SELECT
  USING (portfolio_id = (select auth.uid()) OR public.is_admin());

-- (3) حذف user_portfolios بعد التأكد أنه فارغ
DO $$
DECLARE
  v_rows bigint;
BEGIN
  IF to_regclass('public.user_portfolios') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.user_portfolios' INTO v_rows;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'user_portfolios ليس فارغاً (% صف) — أُلغي الحذف', v_rows;
    END IF;
  END IF;
END
$$;

DROP TABLE IF EXISTS public.user_portfolios;

COMMIT;

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- =====================================================================
-- BEGIN;
--
-- DROP POLICY IF EXISTS "المالك والأدمن يقرؤون التقارير" ON public.harvest_reports;
-- CREATE POLICY "قراءة عامة بمعرفة id"
--   ON public.harvest_reports FOR SELECT USING (true);
--
-- DROP FUNCTION IF EXISTS public.get_harvest_report(uuid);
--
-- CREATE TABLE public.user_portfolios (
--   id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
--   app_state jsonb NOT NULL DEFAULT '{}',
--   updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
-- );
-- ALTER TABLE public.user_portfolios ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable read access for all users"
--   ON public.user_portfolios FOR SELECT USING (true);
-- CREATE POLICY "Users can view their own portfolio."
--   ON public.user_portfolios FOR SELECT USING (auth.uid() = id);
-- CREATE POLICY "Users can insert their own portfolio."
--   ON public.user_portfolios FOR INSERT WITH CHECK (auth.uid() = id);
-- CREATE POLICY "Users can update their own portfolio."
--   ON public.user_portfolios FOR UPDATE USING (auth.uid() = id);
--
-- COMMIT;
