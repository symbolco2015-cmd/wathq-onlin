-- شغّل هذا في Supabase ➜ SQL Editor (قراءة فقط، بدون أي تعديل)

-- (1) كل سياسات storage.objects — لرؤية أي سياسة عامة/غير مقيّدة بـ bucket_id
--     قد تنطبق على evidence رغم عدم ذكرها بالاسم فيها (كما حدث مع admin_users)
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY cmd, policyname;

-- (2) السياسات المرتبطة فعلياً ببكت evidence فقط (استعلامك مصححاً بالأقواس)
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (qual::text LIKE '%evidence%' OR with_check::text LIKE '%evidence%')
ORDER BY cmd, policyname;

-- (3) إعدادات bucket نفسه على مستوى الخادم
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'evidence';
