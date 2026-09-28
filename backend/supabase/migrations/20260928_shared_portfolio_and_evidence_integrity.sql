-- ════════════════════════════════════════════════════════════════════════
-- المرحلة 1 — الخطوة 1.3: تنظيف بيانات المشاركة وحماية ربط الشاهد بمؤشره
--
-- ما يفعله هذا الملف:
--   (1) فحص مسبق: يوقف التنفيذ إن وُجد شاهد بلا قسم، أو شاهد قسمه لا
--       يطابق قسم مؤشره في section_indicators.
--   (2) evidence.section_id يصبح إلزامياً (NOT NULL).
--   (3) قيد فريد على section_indicators (id, section_id) — شرط للمفتاح المركّب.
--   (4) مفتاح أجنبي مركّب evidence (indicator_id, section_id) →
--       section_indicators (id, section_id): يستحيل بعده ربط شاهد بمؤشر من
--       قسم آخر. المفتاح الحالي evidence_indicator_id_fkey يبقى كما هو.
--   (5) get_shared_portfolio: حذف ev/strats/csubs، وprofile يُبنى من قائمة
--       حقول صريحة تقرؤها الصفحة العامة فقط (لا يظهر أي حقل مستقبلي تلقائياً).
--   (6) handle_new_user: state الجديد فيه readAnnouncements وprofile فقط،
--       وprofile.email يبدأ فارغاً (لا نسخ لبريد الدخول). الحسابات الموجودة
--       لا تُلمس.
--
-- آمن للتشغيل مرتين: القيود تُنشأ فقط إن لم تكن موجودة، وSET NOT NULL
-- وCREATE OR REPLACE لا يفشلان عند التكرار.
-- قسم التراجع (تعليق) في آخر الملف.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) فحص مسبق ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_null_section  bigint;
  v_mismatch      bigint;
BEGIN
  SELECT count(*) INTO v_null_section
  FROM public.evidence
  WHERE section_id IS NULL;

  IF v_null_section > 0 THEN
    RAISE EXCEPTION 'توقف التنفيذ: يوجد % شاهد بلا section_id. أصلحها قبل تشغيل هذا الملف.', v_null_section;
  END IF;

  SELECT count(*) INTO v_mismatch
  FROM public.evidence e
  JOIN public.section_indicators si ON si.id = e.indicator_id
  WHERE e.section_id <> si.section_id;

  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'توقف التنفيذ: يوجد % شاهد قسمه لا يطابق قسم مؤشره في section_indicators.', v_mismatch;
  END IF;
END
$$;

-- ── (2) section_id إلزامي ────────────────────────────────────────────────
ALTER TABLE public.evidence ALTER COLUMN section_id SET NOT NULL;

-- ── (3) + (4) القيد الفريد والمفتاح المركّب ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'section_indicators_id_section_id_key'
      AND conrelid = 'public.section_indicators'::regclass
  ) THEN
    ALTER TABLE public.section_indicators
      ADD CONSTRAINT section_indicators_id_section_id_key UNIQUE (id, section_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evidence_indicator_section_fkey'
      AND conrelid = 'public.evidence'::regclass
  ) THEN
    ALTER TABLE public.evidence
      ADD CONSTRAINT evidence_indicator_section_fkey
      FOREIGN KEY (indicator_id, section_id)
      REFERENCES public.section_indicators (id, section_id);
  END IF;
END
$$;

-- ── (5) get_shared_portfolio ─────────────────────────────────────────────
-- نفس التوقيع والنوع والإعدادات. CREATE OR REPLACE يحتفظ بصلاحيات EXECUTE
-- الحالية (anon, authenticated). jsonb_strip_nulls يُسقط الحقل الغائب من
-- profile بدل إرجاعه null — نفس سلوك الدالة القديمة مع الحقول الناقصة.
CREATE OR REPLACE FUNCTION public.get_shared_portfolio(target_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
select jsonb_build_object(
  'profile', jsonb_strip_nulls(jsonb_build_object(
    'name',              state->'profile'->'name',
    'role',              state->'profile'->'role',
    'school',            state->'profile'->'school',
    'phone',             state->'profile'->'phone',
    'email',             state->'profile'->'email',
    'twitter',           state->'profile'->'twitter',
    'linkedin',          state->'profile'->'linkedin',
    'youtube',           state->'profile'->'youtube',
    'avatar',            state->'profile'->'avatar',
    'yearsOfExperience', state->'profile'->'yearsOfExperience'
  )),
  'ai_summary', ai_summary,
  'ai_top_achievement_evidence_id', ai_top_achievement_evidence_id,
  'completion', (select row_to_json(c) from public.get_portfolio_completion(target_id) c)
)
from public.portfolios
where id = target_id and share_enabled = true;
$function$;

-- ── (6) handle_new_user ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.portfolios (id, state, created_at, updated_at)
  VALUES (
    NEW.id,
    jsonb_build_object(
      'readAnnouncements', '[]'::jsonb,
      'profile', jsonb_build_object(
        'name',  COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1), 'مستخدم جديد'),
        'role',  'غير محدد',
        'school','غير محدد',
        'phone', '',
        'email', '',
        'twitter','', 'linkedin','', 'youtube','', 'avatar','',
        'yearsOfExperience', 0
      )
    ),
    COALESCE(NEW.created_at, NOW()),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- قسم التراجع — لا يُنفَّذ. انسخه إلى SQL Editor عند الحاجة فقط.
-- ════════════════════════════════════════════════════════════════════════
/*
BEGIN;

ALTER TABLE public.evidence DROP CONSTRAINT IF EXISTS evidence_indicator_section_fkey;
ALTER TABLE public.section_indicators DROP CONSTRAINT IF EXISTS section_indicators_id_section_id_key;
ALTER TABLE public.evidence ALTER COLUMN section_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.get_shared_portfolio(target_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
select jsonb_build_object(
  'ev', state->'ev',
  'strats', state->'strats',
  'csubs', state->'csubs',
  'profile', state->'profile',
  'ai_summary', ai_summary,
  'ai_top_achievement_evidence_id', ai_top_achievement_evidence_id,
  'completion', (select row_to_json(c) from public.get_portfolio_completion(target_id) c)
)
from public.portfolios
where id = target_id and share_enabled = true;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.portfolios (id, state, created_at, updated_at)
  VALUES (
    NEW.id,
    jsonb_build_object(
      'ev',     '{}'::jsonb,
      'strats', '[]'::jsonb,
      'csubs',  '{}'::jsonb,
      'notes',  '{}'::jsonb,
      'readAnnouncements', '[]'::jsonb,
      'profile', jsonb_build_object(
        'name',  COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1), 'مستخدم جديد'),
        'role',  'غير محدد',
        'school','غير محدد',
        'phone', '',
        'email', COALESCE(NEW.email, ''),
        'twitter','', 'linkedin','', 'youtube','', 'avatar','',
        'yearsOfExperience', 0
      )
    ),
    COALESCE(NEW.created_at, NOW()),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

COMMIT;
*/
