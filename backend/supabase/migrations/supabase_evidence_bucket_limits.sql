-- ═══════════════════════════════════════════════════════════════════════
-- إصلاح أمني: bucket evidence بلا حد حجم ولا قيود MIME على مستوى الخادم
-- ───────────────────────────────────────────────────────────────────────
-- تأكّدنا عبر استعلام مباشر على storage.buckets أن file_size_limit و
-- allowed_mime_types كانا NULL لهذا البكت — أي لا حاجز خادمي فعلي يمنع
-- رفع ملف ضخم أو من نوع غير متوقع، حتى لو كان فحص الواجهة (accept في
-- EvidenceForm.tsx) يقيّد الامتدادات ظاهرياً. accept في input[type=file]
-- ليس حاجزاً أمنياً — يمكن تجاوزه بسهولة من أي عميل HTTP مباشر.
--
-- الحد المختار (10MB) يطابق الرسالة الموجودة فعلاً في الكود:
-- "حجم الملف يتجاوز الحد المسموح (10 MB)" — EvidenceForm.tsx:142
--
-- أنواع MIME مأخوذة من قيم accept الفعلية في TYPE_CONFIG (EvidenceForm.tsx):
--   نوع 'file'  → accept='.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
--   نوع 'image' → accept='image/*'
-- (لا يوجد نوع فيديو فعّال حالياً في TYPE_CONFIG رغم إشارة النص التوضيحي
-- إلى MP4 — لم يُدرج video/* هنا لأنه غير مفعّل فعلياً في حقل accept).
--
-- شغّل هذا يدوياً في Supabase ➜ SQL Editor بعد المراجعة.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE storage.buckets
SET
  file_size_limit = 10485760,  -- 10 MB بالبايت (10 * 1024 * 1024)
  allowed_mime_types = ARRAY[
    -- مستندات (نوع 'file' في TYPE_CONFIG)
    'application/pdf',
    'application/msword',                                                      -- .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- .docx
    'application/vnd.ms-excel',                                                 -- .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        -- .xlsx
    'application/vnd.ms-powerpoint',                                            -- .ppt
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',-- .pptx
    -- صور (نوع 'image' في TYPE_CONFIG، accept='image/*')
    'image/*'
  ]
WHERE id = 'evidence';

-- ════════════════════════════════════════════════════════════════════════
-- تحقّق بعد التنفيذ
-- ════════════════════════════════════════════════════════════════════════
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'evidence';
