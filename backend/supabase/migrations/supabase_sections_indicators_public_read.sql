-- ═══════════════════════════════════════════════════════════
-- وثّق — سياسة قراءة عامة على sections و section_indicators
-- قم بتشغيل هذه الأوامر يدوياً في Supabase SQL Editor
--
-- السبب: كلا الجدولين RLS مُفعَّل عليهما (ENABLE ROW LEVEL SECURITY) لكن بلا
-- أي policy مسجّلة — في Postgres هذا يعني رفض كل SELECT افتراضياً لأي دور غير
-- service_role/postgres، بصرف النظر عن GRANTs الموجودة على الجدولين. تحقّقنا
-- عبر:
--   SELECT * FROM pg_policies WHERE tablename IN ('sections','section_indicators');
--   → صف فارغ لكلا الجدولين
--   SELECT relrowsecurity FROM pg_class WHERE relname IN ('sections','section_indicators');
--   → true لكلا الجدولين
--
-- الأثر: أي استعلام SELECT من عميل مطوَّق بتوكن مستخدم (anon/authenticated)
-- على هذين الجدولين يرجع دائماً مصفوفة فارغة بصمت (بلا خطأ صلاحيات) — هذا هو
-- سبب كون صندوق "المؤشر الفرعي" في EvidenceForm.tsx لا يظهر أصلاً حالياً
-- (نفس الاستعلام، نفس السبب)، وهو ما كان سيمنع أيضاً ميزة اقتراح المؤشر
-- الجديدة في suggest-from-image من العمل لو أُضيفت بدون هذا الإصلاح.
--
-- البيانات في الجدولين مرجعية عامة (أسماء أقسام ومؤشرات تقييم المعلمين) وليست
-- بيانات خاصة بمستخدم — قراءة عامة آمنة، بنفس نمط "public read" المعتمد أصلاً
-- لجدول announcements في هذا المشروع.
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Allow public read access to sections" ON public.sections;
CREATE POLICY "Allow public read access to sections"
  ON public.sections
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow public read access to section_indicators" ON public.section_indicators;
CREATE POLICY "Allow public read access to section_indicators"
  ON public.section_indicators
  FOR SELECT
  USING (true);
