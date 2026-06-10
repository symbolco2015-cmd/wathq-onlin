-- ═══════════════════════════════════════════════════════════════════════
-- Storage — إعداد bucket الأدلة مع تقييد الحجم والنوع + سياسات RLS
-- شغّل هذا الملف في: Supabase ➜ SQL Editor ➜ New query
-- ═══════════════════════════════════════════════════════════════════════

-- (1) إنشاء bucket أو تحديث قيوده إن كان موجوداً
--     public = true: روابط الملفات ستكون قابلة للوصول دون توثيق (لازم للعرض العام)
--     file_size_limit: 10 ميغابايت بالبايت
--     allowed_mime_types: يرفض كل ما ليس في القائمة على مستوى الخادم
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence',
  'evidence',
  true,
  10485760,
  ARRAY[
    -- PDF
    'application/pdf',
    -- صور
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    -- فيديو
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
    -- مستندات Word
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    -- Excel
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    -- PowerPoint
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    -- نص عادي
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- (2) تفعيل RLS على storage.objects (مفعّل افتراضياً لكن نؤكد)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;


-- ─── تنظيف سياسات قديمة إن وُجدت ───────────────────────────────────────
DROP POLICY IF EXISTS "evidence_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "evidence_auth_insert"   ON storage.objects;
DROP POLICY IF EXISTS "evidence_owner_delete"  ON storage.objects;
DROP POLICY IF EXISTS "evidence_owner_update"  ON storage.objects;


-- (3) القراءة: علنية — لازمة لعرض الأدلة في الملف العام والمشاركة
CREATE POLICY "evidence_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'evidence');


-- (4) الرفع: مستخدمون موثّقون فقط، إلى مجلدهم الخاص (UUID/ كبادئة مسار)
--     يمنع رفع ملفات داخل مجلد مستخدم آخر
CREATE POLICY "evidence_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'evidence'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- (5) الحذف: المالك فقط
CREATE POLICY "evidence_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- (6) التعديل: المالك فقط (upsert: false في الكود لكن للحماية الكاملة)
CREATE POLICY "evidence_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- (7) التحقّق
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY cmd;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'evidence';
