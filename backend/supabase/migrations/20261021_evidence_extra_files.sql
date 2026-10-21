-- الشاهد متعدد الملفات: «غلاف + ملفات إضافية» (حتى 5 ملفات في الشاهد)
--
-- file_url وevidence_type يبقيان كما هما ويمثّلان الملف الأول (الغلاف).
-- extra_files يحمل ما بعده (0..4)، كل عنصر: { url, type: 'image'|'file', name?, size? }.
-- كل رابط في extra_files داخل مجلد صاحب الشاهد في حاوية evidence، فلا يظهر
-- للزائر رابط خارجي أو ملف معلم آخر. file_url القائم لا يتغير في هذه الخطوة.
--
-- منع التكرار والفهارس لا تتغير. لا GRANT: الصلاحيات على مستوى الجدول (تحقق حي 2026-10-21).
-- get_shared_evidence من نصها الحي (pg_get_functiondef، 2026-10-21)، والفرق الوحيد سطر ev.extra_files.
--
-- ترتيب النشر: هذا الملف أولاً، ثم الواجهة.

BEGIN;

-- (1) دالة التحقق من شكل extra_files وروابطها
CREATE OR REPLACE FUNCTION public.evidence_extra_files_valid(f jsonb, owner_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN jsonb_typeof(f) IS DISTINCT FROM 'array' THEN false
    WHEN jsonb_array_length(f) > 4 THEN false
    WHEN owner_id IS NULL THEN jsonb_array_length(f) = 0
    ELSE NOT EXISTS (
      SELECT 1
        FROM jsonb_array_elements(f) x
       WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
          OR jsonb_typeof(x->'url') IS DISTINCT FROM 'string'
          OR left(x->>'url', length('https://imjhkxjdmqvarffbeixu.supabase.co/storage/v1/object/public/evidence/' || owner_id::text || '/'))
             IS DISTINCT FROM 'https://imjhkxjdmqvarffbeixu.supabase.co/storage/v1/object/public/evidence/' || owner_id::text || '/'
          OR COALESCE(x->>'type', '') NOT IN ('image', 'file')
          OR (x ? 'name' AND jsonb_typeof(x->'name') IS DISTINCT FROM 'string')
          OR (x ? 'size' AND jsonb_typeof(x->'size') IS DISTINCT FROM 'number'))
  END;
$$;

-- (2) العمود — الصفوف الحالية تأخذ []
ALTER TABLE public.evidence
  ADD COLUMN extra_files jsonb NOT NULL DEFAULT '[]'::jsonb;

-- (3) القيود
ALTER TABLE public.evidence
  ADD CONSTRAINT evidence_extra_files_shape
  CHECK (public.evidence_extra_files_valid(extra_files, portfolio_id));

-- الإضافية فقط مع غلاف صورة أو ملف، لا مع رابط ولا ملاحظة ولا فيديو ولا صوت
ALTER TABLE public.evidence
  ADD CONSTRAINT evidence_extra_files_need_cover
  CHECK (extra_files = '[]'::jsonb OR (file_url IS NOT NULL AND evidence_type IN ('image', 'file')));

-- (4) get_shared_evidence — النص الحي، والفرق الوحيد سطر ev.extra_files
CREATE OR REPLACE FUNCTION public.get_shared_evidence(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_shared boolean;
  result    jsonb;
BEGIN
  SELECT share_enabled INTO is_shared
  FROM public.portfolios
  WHERE id = target_id AND (deletion_scheduled_at IS NULL OR deletion_scheduled_at > now());

  IF is_shared IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::jsonb)
    INTO result
  FROM (
    SELECT
      ev.id, ev.section_id, ev.indicator_id, ev.strategy_id,
      ev.title, ev.description,
      ev.evidence_type, ev.file_url, ev.link_url,
      ev.extra_files,
      ev.created_at,
      ev.hidden_from_gallery
    FROM public.evidence ev
    WHERE ev.portfolio_id = target_id
      AND ev.section_id IS NOT NULL
  ) e;

  RETURN result;
END;
$function$;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════
-- تحقق — على حساب الاختبار فقط، داخل معاملة تُلغى. استبدل <test-id> بمعرّف
-- حساب الاختبار، و<ev-id> بمعرّف أحد شواهده من نوع image. كل سطر «يُرفض»
-- يُنفَّذ وحده بعد SAVEPOINT، لأن الخطأ يُفسد بقية المعاملة.
-- ════════════════════════════════════════════════════════════════════════
/*
BEGIN;

-- الشكل الصحيح يُقبل (4 عناصر)
UPDATE public.evidence SET extra_files = jsonb_build_array(
  jsonb_build_object('url', 'https://imjhkxjdmqvarffbeixu.supabase.co/storage/v1/object/public/evidence/<test-id>/a.jpg', 'type', 'image', 'name', 'a.jpg', 'size', 1000),
  jsonb_build_object('url', 'https://imjhkxjdmqvarffbeixu.supabase.co/storage/v1/object/public/evidence/<test-id>/b.pdf', 'type', 'file'),
  jsonb_build_object('url', 'https://imjhkxjdmqvarffbeixu.supabase.co/storage/v1/object/public/evidence/<test-id>/link/c.docx', 'type', 'file'),
  jsonb_build_object('url', 'https://imjhkxjdmqvarffbeixu.supabase.co/storage/v1/object/public/evidence/<test-id>/d.png', 'type', 'image'))
WHERE id = '<ev-id>';                                                         -- UPDATE 1

SAVEPOINT s;
-- 5 عناصر ← يُرفض (evidence_extra_files_shape)
UPDATE public.evidence SET extra_files = extra_files || extra_files->0 WHERE id = '<ev-id>';
ROLLBACK TO SAVEPOINT s;

-- رابط خارجي ← يُرفض
UPDATE public.evidence SET extra_files = '[{"url":"https://example.com/x.jpg","type":"image"}]' WHERE id = '<ev-id>';
ROLLBACK TO SAVEPOINT s;

-- رابط في مجلد معلم آخر ← يُرفض
UPDATE public.evidence SET extra_files = '[{"url":"https://imjhkxjdmqvarffbeixu.supabase.co/storage/v1/object/public/evidence/00000000-0000-0000-0000-000000000000/x.jpg","type":"image"}]' WHERE id = '<ev-id>';
ROLLBACK TO SAVEPOINT s;

-- حاوية أخرى (evidence-video) ← يُرفض
UPDATE public.evidence SET extra_files = '[{"url":"https://imjhkxjdmqvarffbeixu.supabase.co/storage/v1/object/public/evidence-video/<test-id>/x.mp4","type":"file"}]' WHERE id = '<ev-id>';
ROLLBACK TO SAVEPOINT s;

-- type خارج image/file ← يُرفض
UPDATE public.evidence SET extra_files = '[{"url":"https://imjhkxjdmqvarffbeixu.supabase.co/storage/v1/object/public/evidence/<test-id>/x.mp4","type":"video"}]' WHERE id = '<ev-id>';
ROLLBACK TO SAVEPOINT s;

-- عنصر بلا url ← يُرفض
UPDATE public.evidence SET extra_files = '[{"type":"image"}]' WHERE id = '<ev-id>';
ROLLBACK TO SAVEPOINT s;

-- إضافية مع نوع link ← يُرفض (evidence_extra_files_need_cover)
UPDATE public.evidence SET evidence_type = 'link' WHERE id = '<ev-id>';
ROLLBACK TO SAVEPOINT s;

-- الصفحة العامة ترجع الحقل (إن كانت مشاركة حساب الاختبار مفعّلة)
SELECT public.get_shared_evidence('<test-id>') -> 0 ? 'extra_files';         -- true

ROLLBACK;
*/


-- ════════════════════════════════════════════════════════════════════════
-- التراجع — لا يُنفَّذ إلا عند الحاجة.
-- قبله: الملفات الإضافية ستصير يتيمة في Storage (حتى حذف الحساب)، فاعرضها لحذفها:
--   SELECT id, jsonb_array_elements(extra_files)->>'url' FROM public.evidence WHERE extra_files <> '[]';
-- get_shared_evidence تُستعاد أولاً، قبل حذف العمود، وإلا تفشل عند الاستدعاء.
-- ════════════════════════════════════════════════════════════════════════
/*
BEGIN;

CREATE OR REPLACE FUNCTION public.get_shared_evidence(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_shared boolean;
  result    jsonb;
BEGIN
  SELECT share_enabled INTO is_shared
  FROM public.portfolios
  WHERE id = target_id AND (deletion_scheduled_at IS NULL OR deletion_scheduled_at > now());

  IF is_shared IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::jsonb)
    INTO result
  FROM (
    SELECT
      ev.id, ev.section_id, ev.indicator_id, ev.strategy_id,
      ev.title, ev.description,
      ev.evidence_type, ev.file_url, ev.link_url,
      ev.created_at,
      ev.hidden_from_gallery
    FROM public.evidence ev
    WHERE ev.portfolio_id = target_id
      AND ev.section_id IS NOT NULL
  ) e;

  RETURN result;
END;
$function$;

ALTER TABLE public.evidence DROP CONSTRAINT IF EXISTS evidence_extra_files_need_cover;
ALTER TABLE public.evidence DROP CONSTRAINT IF EXISTS evidence_extra_files_shape;
ALTER TABLE public.evidence DROP COLUMN IF EXISTS extra_files;
DROP FUNCTION IF EXISTS public.evidence_extra_files_valid(jsonb, uuid);

COMMIT;
*/
