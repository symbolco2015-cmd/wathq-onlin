-- ═══════════════════════════════════════════════════════════
-- وثّق — تسجيل ميزة "التوثيق الصوتي" (Beta) ضمن نظام صلاحيات
-- الميزات التجريبية الموجود أصلاً (migrations/supabase_feature_flags_setup.sql)
--
-- لا حاجة لأي دالة أو جدول جديد: is_feature_enabled() و
-- check_and_log_ai_usage() عامتان أصلاً وتعملان مع أي p_feature نصي —
-- هذا الملف يضيف فقط صف المفتاح الجديد 'voice_documentation' بحالة
-- معطّلة افتراضياً، تماماً كما جرى مع 'image_suggestion'.
--
-- شغّل هذا يدوياً في Supabase ➜ SQL Editor بعد المراجعة.
-- ═══════════════════════════════════════════════════════════

INSERT INTO public.feature_flags (feature, enabled)
VALUES ('voice_documentation', false)
ON CONFLICT (feature) DO NOTHING;
