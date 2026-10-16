-- تحليل النتائج — ب1: منع تكرار التحليل نفسه
--
-- تحليل واحد لكل (معلم، مادة، مرحلة، صف، شعبة، نوع الاختبار، رقمه). الواجهة
-- تفحص التكرار قبل الحفظ وتعرض «استبدال / تخطي»؛ هذا الفهرس حماية أخيرة من
-- نافذتين مفتوحتين أو ضغطتين متتاليتين. الاستبدال في الواجهة UPDATE على الصف
-- القديم (سياسة ALL للمالك موجودة)، فلا يصطدم بالفهرس.
--
-- الأعمدة القابلة لـ NULL (صفوف قديمة بلا صف أو نوع) لا تتصادم في الفهرس،
-- والكود الجديد يكتبها كلها. test_seq يُحفظ NULL للنهائي وأعمال السنة،
-- فيُوحَّد بـ coalesce. المادة بلا اعتبار لحالة الأحرف ولا المسافات الطرفية،
-- كما في findDuplicateAnalysis في frontend/src/components/ResultsAnalysis/logic.ts.

BEGIN;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.results_analysis
    GROUP BY portfolio_id, lower(trim(subject)), stage, grade_level, class_section, test_type, coalesce(test_seq, 0)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'تحليلات مكررة موجودة — احذف المكرر ثم أعد التنفيذ';
  END IF;
END $$;

CREATE UNIQUE INDEX results_analysis_unique_test
  ON public.results_analysis (portfolio_id, lower(trim(subject)), stage, grade_level,
                              class_section, test_type, coalesce(test_seq, 0));

COMMIT;

-- تحقق بعد التنفيذ
-- SELECT indexdef FROM pg_indexes WHERE indexname = 'results_analysis_unique_test';

-- =====================================================================
-- التراجع (تعليق فقط — لا يُنفَّذ تلقائياً)
-- =====================================================================
-- DROP INDEX IF EXISTS public.results_analysis_unique_test;
