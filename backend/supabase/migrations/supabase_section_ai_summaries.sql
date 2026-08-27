-- ============================================================
-- migration: section_ai_summaries
-- التاريخ: 27 أغسطس 2026
-- الغرض: ملخص ذكاء اصطناعي واحد لكل معلم على مستوى بند "إعداد خطة
--         التعلم" (section_id=6) كاملاً — بديل نهائي لتصميم "زر لكل
--         مؤشر" (جدول indicator_ai_summaries، Edge Function
--         generate-indicator-summary). ذلك الجدول والدالة يبقيان كما
--         هما دون حذف أو تعديل، فقط لم يعودا مستخدَمين لهذه الميزة.
--
-- مراجعة أمنية:
--   - RLS بنفس نمط indicator_ai_summaries تماماً — المالك يدير خاصته
--     فقط، سياسة واحدة FOR ALL
--   - القراءة العامة لصفحة المشاركة عبر RPC مخصصة منفصلة
--     (get_shared_lesson_plan_summary، ملف SQL آخر) بنفس نمط
--     get_shared_evidence/get_shared_results_analysis — لا سياسة
--     قراءة عامة على الجدول نفسه
--   - لا DROP على أي جدول أو عمود موجود
-- ============================================================

CREATE TABLE IF NOT EXISTS section_ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  section_id smallint NOT NULL REFERENCES sections(id),
  ai_sentence text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, section_id)
);

ALTER TABLE section_ai_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "المعلم يدير ملخصات أقسامه فقط"
  ON section_ai_summaries FOR ALL
  USING (portfolio_id = auth.uid())
  WITH CHECK (portfolio_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════
-- تحقّق بعد التنفيذ
-- ════════════════════════════════════════════════════════════════════════
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'section_ai_summaries';

SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'section_ai_summaries';
