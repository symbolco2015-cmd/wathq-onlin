-- ═══════════════════════════════════════════════════════════════════════
-- Storage — bucket مستقل للفيديو (evidence-video)
-- ───────────────────────────────────────────────────────────────────────
-- قرار: عدم تعديل bucket evidence الأصلي (يبقى 10MB لـ PDF/Office/صور كما
-- هو دون أي أثر جانبي) — الفيديو يُرفع إلى bucket منفصل بحده الخاص (50MB).
-- نفس نمط السياسات الموجود فعلياً على evidence (supabase_storage_policies.sql)
-- مُطابَق هنا حرفياً: قراءة علنية + رفع/حذف/تعديل مقيّد بمجلد auth.uid().
--
-- شغّل هذا يدوياً في Supabase ➜ SQL Editor بعد المراجعة.
-- ═══════════════════════════════════════════════════════════════════════

-- (1) إنشاء bucket الفيديو
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence-video',
  'evidence-video',
  true,                 -- نفس evidence: لازم للعرض في الملف العام/المشاركة
  52428800,             -- 50 MB بالبايت (50 * 1024 * 1024)
  ARRAY['video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- (2) تفعيل RLS على storage.objects (مفعّل افتراضياً، نؤكد فقط)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;


-- ─── تنظيف سياسات قديمة إن وُجدت (لإعادة التشغيل بأمان) ─────────────────
DROP POLICY IF EXISTS "evidence_video_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "evidence_video_auth_insert"  ON storage.objects;
DROP POLICY IF EXISTS "evidence_video_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "evidence_video_owner_update" ON storage.objects;


-- (3) القراءة: علنية — لازمة لعرض الفيديو في الملف العام والمشاركة
CREATE POLICY "evidence_video_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'evidence-video');


-- (4) الرفع: مستخدمون موثّقون فقط، إلى مجلدهم الخاص (UUID كبادئة مسار)
CREATE POLICY "evidence_video_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'evidence-video'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- (5) الحذف: المالك فقط
CREATE POLICY "evidence_video_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'evidence-video'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- (6) التعديل: المالك فقط (upsert: false في الكود لكن للحماية الكاملة)
CREATE POLICY "evidence_video_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'evidence-video'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ════════════════════════════════════════════════════════════════════════
-- تحقّق بعد التنفيذ
-- ════════════════════════════════════════════════════════════════════════
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'evidence_video_%'
ORDER BY cmd;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'evidence-video';
