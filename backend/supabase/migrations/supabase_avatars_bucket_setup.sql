-- ═══════════════════════════════════════════════════════════════════════
-- Storage — إعداد bucket الصور الشخصية (avatars) + سياسات RLS
-- مرجع: نفس نمط bucket 'evidence' في supabase_storage_policies.sql
-- شغّل هذا الملف يدوياً في: Supabase ➜ SQL Editor ➜ New query
-- ═══════════════════════════════════════════════════════════════════════

-- (1) إنشاء bucket أو تحديث قيوده إن كان موجوداً
--     public = true: لازم لعرض الصورة الشخصية في لوحة التحكم والملف العام دون توثيق
--     file_size_limit: 5 ميغابايت (الصورة تُصغَّر لأقصى 512px من الواجهة قبل الرفع أصلاً)
--     allowed_mime_types: صور فقط
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- (2) تفعيل RLS على storage.objects (مفعّل افتراضياً لكن نؤكد)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;


-- ─── تنظيف سياسات قديمة إن وُجدت ───────────────────────────────────────
DROP POLICY IF EXISTS "avatars_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_insert"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;


-- (3) القراءة: علنية — لازمة لعرض الصورة الشخصية في الملف العام والمشاركة
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');


-- (4) الرفع: مستخدمون موثّقون فقط، إلى مجلدهم الخاص (UUID كبادئة مسار)
--     يمنع رفع ملفات داخل مجلد مستخدم آخر — المسار المستخدم بالكود: {user.id}/avatar.jpg
CREATE POLICY "avatars_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- (5) التعديل: المالك فقط — لازمة فعلياً هنا (وليست حماية إضافية فقط) لأن رفع
--     الصورة الشخصية يستخدم upsert:true (استبدال {user.id}/avatar.jpg في نفس
--     المسار)، وSupabase يترجم استبدال ملف موجود إلى UPDATE على storage.objects
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- (6) الحذف: المالك فقط
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- (7) التحقّق
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'avatars_%'
ORDER BY cmd;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'avatars';
