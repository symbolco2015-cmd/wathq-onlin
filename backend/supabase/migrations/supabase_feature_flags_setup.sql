-- ═══════════════════════════════════════════════════════════
-- وثّق — إعداد نظام صلاحيات الميزات التجريبية (Feature Flags)
-- قم بتشغيل هذه الأوامر في Supabase SQL Editor
-- يفترض هذا الملف أن public.is_admin() معرّفة مسبقاً
-- (راجع supabase_setup_complete.sql)
--
-- ⚠️ هذا الملف يوثّق مخططاً كان مطبَّقاً بالفعل في قاعدة بيانات المشروع مباشرة
-- (عبر SQL Editor) دون أن يُحفظ كملف migration من قبل — بما في ذلك دالة
-- is_feature_enabled() التي تعتمد عليها check_and_log_ai_usage أصلاً. كل
-- الأوامر أدناه IF NOT EXISTS/OR REPLACE فقط لضمان توافقها مع الحالة الحالية
-- دون كسرها؛ لا تُغيّر أسماء الأعمدة (`feature` وليس `feature_key`) لأنها
-- الأسماء الفعلية المستخدمة في القاعدة الحية وفي كل استعلامات الفرونت إند.
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. سويتش عام لكل ميزة تجريبية على مستوى المنصة بالكامل
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feature_flags (
  feature    TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- قراءة عامة (لا بيانات حساسة) — تحقق المستخدمين الفعلي من حالة الميزة يمر
-- عادة عبر is_feature_enabled() (SECURITY DEFINER) وليس عبر هذه القراءة مباشرة
DROP POLICY IF EXISTS "feature_flags_read_all" ON public.feature_flags;
CREATE POLICY "feature_flags_read_all" ON public.feature_flags
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "feature_flags_admin_write" ON public.feature_flags;
CREATE POLICY "feature_flags_admin_write" ON public.feature_flags
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.feature_flags (feature, enabled)
VALUES ('image_suggestion', false)
ON CONFLICT (feature) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. استثناءات فردية لكل معلم (portfolio) — تتجاوز السويتش العام
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_feature_overrides (
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  feature      TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (portfolio_id, feature)
);

ALTER TABLE public.portfolio_feature_overrides ENABLE ROW LEVEL SECURITY;

-- المعلم يرى استثناءه الخاص فقط؛ الأدمن يرى الكل (تُستخدم في تبويب "الميزات التجريبية")
DROP POLICY IF EXISTS "portfolio_feature_overrides_owner_read" ON public.portfolio_feature_overrides;
CREATE POLICY "portfolio_feature_overrides_owner_read" ON public.portfolio_feature_overrides
  FOR SELECT USING (portfolio_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "portfolio_feature_overrides_admin_write" ON public.portfolio_feature_overrides;
CREATE POLICY "portfolio_feature_overrides_admin_write" ON public.portfolio_feature_overrides
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- 3. دالة الفحص المستخدمة من الفرونت إند (EvidenceForm.tsx) ومن
--    check_and_log_ai_usage() — الاستثناء الفردي له الأولوية، وإلا يُتّبع
--    السويتش العام، وإلا false افتراضياً
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_feature TEXT)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM portfolio_feature_overrides
       WHERE portfolio_id = auth.uid() AND feature = p_feature),
    (SELECT enabled FROM feature_flags WHERE feature = p_feature),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_feature_enabled(TEXT) TO authenticated;
