-- ═══════════════════════════════════════════════════════════════════════
-- وثّق — إعداد جدول التقدم الشهري  (monthly_progress)
-- شغّل هذا الملف في: Supabase ➜ SQL Editor ➜ New query
-- ═══════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- جدول monthly_progress
-- يخزّن عدد الشواهد لكل (مستخدم × بند × شهر × سنة)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monthly_progress (
  id             BIGSERIAL   PRIMARY KEY,
  portfolio_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id     SMALLINT    NOT NULL,
  year           INTEGER     NOT NULL,
  month          INTEGER     NOT NULL CHECK (month BETWEEN 1 AND 12),
  evidence_count INTEGER     NOT NULL DEFAULT 0,
  CONSTRAINT monthly_progress_unique UNIQUE (portfolio_id, section_id, year, month)
);

-- تفعيل RLS
ALTER TABLE public.monthly_progress ENABLE ROW LEVEL SECURITY;

-- صاحب الملف يقرأ ويكتب سجلاته فقط
DROP POLICY IF EXISTS "monthly_progress_owner" ON public.monthly_progress;
CREATE POLICY "monthly_progress_owner" ON public.monthly_progress
  USING     (portfolio_id = auth.uid())
  WITH CHECK (portfolio_id = auth.uid());

-- فهرس للأداء
CREATE INDEX IF NOT EXISTS monthly_progress_portfolio_idx
  ON public.monthly_progress (portfolio_id, year, month);
