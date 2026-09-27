-- ============================================================
-- migration: evidence.subject/frequency + indicator_ai_summaries
-- التاريخ: 21 أغسطس 2026
-- الغرض: هيكل مادة/تكرار لأدلة "إعداد خطة التعلم" + ملخص ذكاء اصطناعي
--         مخزَّن على مستوى المؤشر الفرعي (لا كل دليل على حدة)
--
-- مراجعة أمنية:
--   - عمودا evidence الجديدان: بلا RLS إضافية (الجدول محمي أصلاً)
--   - الإحصاءات (الأعداد لكل مادة/تكرار) تُحسب حية من evidence مباشرة
--     بالفرونت إند — لا تُخزَّن، فلا خطر "رقم قديم" كما حصل سابقاً
--   - indicator_ai_summaries: RLS بنفس نمط results_analysis — المالك
--     يدير خاصته فقط، القراءة العامة عبر RPC مخصصة تُبنى لاحقاً (تحديث
--     منفصل بنفس نمط get_shared_results_analysis)
--   - لا DROP على أي جدول أو عمود موجود
-- ============================================================

-- 1) المادة والتكرار على evidence
-- تصحيح بعد تحقق فعلي: context_subject عمود موجود أصلاً منذ إنشاء الجدول
-- لكنه ميت بالكامل (صفر كتابة من أي مسار كود، كل الصفوف الـ62 الحالية
-- NULL) — تحقَّق منه بالبحث الشامل بالمستودع + استعلام مباشر على
-- الإنتاج، لا افتراضاً. نعيد استخدامه لمادة خطة التعلم بدل إضافة عمود
-- subject جديد مكرَّر بنفس الدلالة. لا حاجة لأي ALTER عليه، هو جاهز
-- بالفعل بنوع text.

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS frequency text
    CHECK (frequency IN ('weekly', 'semester') OR frequency IS NULL);

-- 2) ملخص الذكاء الاصطناعي المخزَّن، على مستوى المؤشر الفرعي
-- indicator_id يرجع لـsection_indicators بنفس نمط evidence.indicator_id
-- تماماً (تصحيح بعد اكتشاف أن المؤشرات جدول حقيقي بمفاتيح UUID، لا نص
-- ثابت — استخدام نص حر هنا كان سيكسر المرجعية لو تغيّر اسم مؤشر لاحقاً،
-- بالضبط نفس فئة الخطأ الذي وُوجه سابقاً اليوم مع حقول أخرى غير متزامنة)
CREATE TABLE IF NOT EXISTS indicator_ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  section_id smallint NOT NULL REFERENCES sections(id),
  indicator_id uuid NOT NULL REFERENCES section_indicators(id) ON DELETE CASCADE,
  ai_sentence text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, section_id, indicator_id)
);

ALTER TABLE indicator_ai_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "المعلم يدير ملخصاته فقط"
  ON indicator_ai_summaries FOR ALL
  USING (portfolio_id = auth.uid())
  WITH CHECK (portfolio_id = auth.uid());

-- ملاحظة: لا سياسة قراءة عامة هنا بعد — RPC مخصصة لعرض هذا الملخص
-- بصفحة المشاركة (بنفس نمط get_shared_results_analysis) تحتاج تصميماً
-- منفصلاً بعد إقرار شكل الفرونت إند، لتفادي تكرار خطأ "SQL بلا واجهة
-- تستخدمه" الذي حصل سابقاً بمشروعات مشابهة.
