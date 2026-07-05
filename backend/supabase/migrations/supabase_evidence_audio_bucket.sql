-- ═══════════════════════════════════════════════════════════════════════
-- Storage — bucket مستقل للتسجيلات الصوتية (evidence-audio)
-- ───────────────────────────────────────────────────────────────────────
-- قرار: عدم تعديل bucket evidence الأصلي — نفس نمط evidence-video
-- (supabase_evidence_video_bucket.sql): bucket منفصل بحد حجم صغير يناسب
-- تسجيلات صوتية قصيرة (حتى 30 ثانية عبر useVoiceRecording في الفرونت إند).
-- نفس نمط السياسات الموجود فعلياً على evidence مُطابَق هنا حرفياً: قراءة
-- علنية + رفع/حذف/تعديل مقيّد بمجلد auth.uid().
--
-- شغّل هذا يدوياً في Supabase ➜ SQL Editor بعد المراجعة.
-- ═══════════════════════════════════════════════════════════════════════

-- (1) إنشاء bucket الصوت
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence-audio',
  'evidence-audio',
  true,                 -- نفس evidence: لازم للعرض في الملف العام/المشاركة
  5242880,              -- 5 MB بالبايت — كافٍ جداً لتسجيل صوتي حتى 30 ثانية
  ARRAY['audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/mpeg']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- (2) تفعيل RLS على storage.objects (مفعّل افتراضياً، نؤكد فقط)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;


-- ─── تنظيف سياسات قديمة إن وُجدت (لإعادة التشغيل بأمان) ─────────────────
DROP POLICY IF EXISTS "evidence_audio_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "evidence_audio_auth_insert"  ON storage.objects;
DROP POLICY IF EXISTS "evidence_audio_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "evidence_audio_owner_update" ON storage.objects;


-- (3) القراءة: علنية — لازمة لعرض التسجيل في الملف العام والمشاركة
CREATE POLICY "evidence_audio_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'evidence-audio');


-- (4) الرفع: مستخدمون موثّقون فقط، إلى مجلدهم الخاص (UUID كبادئة مسار)
CREATE POLICY "evidence_audio_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'evidence-audio'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- (5) الحذف: المالك فقط
CREATE POLICY "evidence_audio_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'evidence-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- (6) التعديل: المالك فقط (upsert: false في الكود لكن للحماية الكاملة)
CREATE POLICY "evidence_audio_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'evidence-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ════════════════════════════════════════════════════════════════════════
-- تحقّق بعد التنفيذ
-- ════════════════════════════════════════════════════════════════════════
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'evidence_audio_%'
ORDER BY cmd;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'evidence-audio';
