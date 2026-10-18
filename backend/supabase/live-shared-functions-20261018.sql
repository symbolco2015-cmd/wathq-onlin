-- النصوص الحية من القاعدة (pg_get_functiondef) بتاريخ 2026-10-18
-- للمقارنة فقط — لا تُنفَّذ هذا الملف.

-- ===== get_harvest_report(uuid)
CREATE OR REPLACE FUNCTION public.get_harvest_report(report_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select to_jsonb(r)
  from public.harvest_reports r
  where r.id = get_harvest_report.report_id;
$function$
;

-- ===== get_shared_custom_indicators(uuid)
CREATE OR REPLACE FUNCTION public.get_shared_custom_indicators(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE is_shared boolean; result jsonb;
BEGIN
  SELECT share_enabled INTO is_shared FROM public.portfolios WHERE id = target_id;
  IF is_shared IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', si.id, 'section_id', si.section_id, 'name_ar', si.name_ar)
                            ORDER BY si.section_id, si.created_at, si.id), '[]'::jsonb)
    INTO result
    FROM public.section_indicators si
   WHERE si.portfolio_id = target_id
     AND EXISTS (SELECT 1 FROM public.evidence e
                  WHERE e.indicator_id = si.id AND e.portfolio_id = target_id);
  RETURN result;
END;
$function$
;

-- ===== get_shared_evidence(uuid)
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
  WHERE id = target_id;

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
$function$
;

-- ===== get_shared_monthly_progress(uuid)
CREATE OR REPLACE FUNCTION public.get_shared_monthly_progress(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_shared     boolean;
  y_start_month integer;
  months        jsonb;
BEGIN
  SELECT share_enabled, COALESCE((state->>'yearStartMonth')::integer, 9)
    INTO is_shared, y_start_month
  FROM public.portfolios
  WHERE id = target_id;

  IF is_shared IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- تجميع شهري على monthly_progress (يستخدم فهرس monthly_progress_portfolio_idx
  -- الموجود) — SUM(evidence_count) عبر كل الأقسام لكل (year, month)، بصرف النظر
  -- عن section_id، ليكون رقم evidenceCount مطابقاً تماماً لمصدر نظام النقاط
  -- المستخدم في لوحة التحكم (مجموع evidence_count الخام بلا أي ترجيح).
  SELECT jsonb_agg(jsonb_build_object(
           'year', t.year,
           'month', t.month,
           'evidenceCount', t.evidence_count
         ))
    INTO months
  FROM (
    SELECT year, month, SUM(evidence_count) AS evidence_count
    FROM public.monthly_progress
    WHERE portfolio_id = target_id
    GROUP BY year, month
    HAVING SUM(evidence_count) > 0
  ) t;

  RETURN jsonb_build_object(
    'yearStartMonth', y_start_month,
    'activeMonths', COALESCE(months, '[]'::jsonb)
  );
END;
$function$
;

-- ===== get_shared_portfolio(uuid)
CREATE OR REPLACE FUNCTION public.get_shared_portfolio(target_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select jsonb_build_object(
  'profile', jsonb_strip_nulls(jsonb_build_object(
    'name',              p.state->'profile'->'name',
    'role',              p.state->'profile'->'role',
    'school',            p.state->'profile'->'school',
    'phone',             p.state->'profile'->'phone',
    'email',             p.state->'profile'->'email',
    'twitter',           p.state->'profile'->'twitter',
    'linkedin',          p.state->'profile'->'linkedin',
    'youtube',           p.state->'profile'->'youtube',
    'avatar',            p.state->'profile'->'avatar',
    'yearsOfExperience', p.state->'profile'->'yearsOfExperience'
  )),
  'ai_summary', p.ai_summary,
  'top_achievement_evidence_id', t.evidence_id,
  'top_achievement_source', t.source,
  'completion', (select row_to_json(c) from public.get_portfolio_completion(target_id) c)
)
from public.portfolios p
left join lateral (
  select cand.evidence_id, cand.source
  from (
    select e.id as evidence_id, 'teacher'::text as source, 1 as prio
      from public.evidence e
     where e.id = p.pinned_top_evidence_id
       and e.portfolio_id = p.id
       and e.section_id is not null
    union all
    select e.id, 'ai'::text, 2
      from public.evidence e
     where p.ai_top_achievement_approved
       and e.id = p.ai_top_achievement_evidence_id
       and e.portfolio_id = p.id
       and e.section_id is not null
  ) cand
  order by cand.prio
  limit 1
) t on true
where p.id = target_id and p.share_enabled = true;
$function$
;

-- ===== get_shared_results_analysis(uuid)
CREATE OR REPLACE FUNCTION public.get_shared_results_analysis(target_id uuid)
 RETURNS TABLE(id uuid, subject text, stage text, class_section smallint, created_at timestamp with time zone, total_students integer, average numeric, min_score numeric, max_score numeric, grade_level smallint, test_type text, test_seq smallint, full_mark numeric, absent_count integer, average_pct numeric, min_pct numeric, max_pct numeric, pass_count integer, band_counts jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ra.id, ra.subject, ra.stage, ra.class_section, ra.created_at,
    st.n AS total_students,
    COALESCE(round(st.avg_raw, 2), 0) AS average,
    COALESCE(st.min_raw, 0) AS min_score,
    COALESCE(st.max_raw, 0) AS max_score,
    ra.grade_level, ra.test_type, ra.test_seq,
    fm.v AS full_mark,
    COALESCE((ra.summary->>'absentCount')::int, 0) AS absent_count,
    COALESCE(round(st.avg_raw / fm.v * 100, 1), 0) AS average_pct,
    COALESCE(round(st.min_raw / fm.v * 100, 1), 0) AS min_pct,
    COALESCE(round(st.max_raw / fm.v * 100, 1), 0) AS max_pct,
    st.pass_n AS pass_count,
    bc.counts AS band_counts
  FROM results_analysis ra
  CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(ra.full_mark, 0), 100) AS v) fm
  -- نسب الحاضرين: الشروط نفسها التي في الإصدار السابق
  CROSS JOIN LATERAL (
    SELECT array_agg(x.sc) AS scores
      FROM (SELECT (s->>'score')::numeric AS sc
              FROM jsonb_array_elements(COALESCE(ra.summary->'students', '[]'::jsonb)) s
             WHERE jsonb_typeof(s->'score') = 'number'
               AND COALESCE((s->>'absent')::boolean, false) = false) x
  ) sa
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS n, avg(u.sc) AS avg_raw, min(u.sc) AS min_raw, max(u.sc) AS max_raw,
           count(*) FILTER (WHERE u.sc / fm.v * 100 >= 60)::int AS pass_n
      FROM unnest(COALESCE(sa.scores, '{}'::numeric[])) AS u(sc)
  ) st
  -- الفئة كما في matchBand (logic.ts): أعلى فئة حدها الأدنى ≤ النسبة، وإلا الأدنى.
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label', gb.label, 'count', COALESCE(c.n, 0))
                              ORDER BY gb.display_order), '[]'::jsonb) AS counts
      FROM grade_bands gb
      LEFT JOIN (
        SELECT b.id, count(*)::int AS n
          FROM unnest(COALESCE(sa.scores, '{}'::numeric[])) AS u(sc)
          CROSS JOIN LATERAL (
            SELECT g.id FROM grade_bands g
             ORDER BY (g.min_score <= u.sc / fm.v * 100) DESC,
                      CASE WHEN g.min_score <= u.sc / fm.v * 100 THEN g.min_score END DESC NULLS LAST,
                      g.min_score ASC
             LIMIT 1) b
         GROUP BY b.id
      ) c ON c.id = gb.id
  ) bc
  WHERE ra.portfolio_id = target_id
    AND ra.hidden_public = false
    AND EXISTS (SELECT 1 FROM portfolios p WHERE p.id = target_id AND p.share_enabled IS TRUE)
  ORDER BY ra.created_at ASC;
$function$
;

-- ===== get_shared_section_summaries(uuid)
CREATE OR REPLACE FUNCTION public.get_shared_section_summaries(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE is_shared boolean; result jsonb;
BEGIN
  SELECT share_enabled INTO is_shared FROM public.portfolios WHERE id = target_id;
  IF is_shared IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_object_agg(s.section_id::text, s.ai_sentence), '{}'::jsonb)
    INTO result
    FROM public.section_ai_summaries s
    JOIN public.sections sec ON sec.id = s.section_id AND sec.section_type = 'core'
   WHERE s.portfolio_id = target_id
     AND s.hidden = false
     AND EXISTS (SELECT 1 FROM public.evidence e
                  WHERE e.portfolio_id = target_id AND e.section_id = s.section_id);
  RETURN result;
END;
$function$
;

-- ===== get_shared_teaching_strategies(uuid)
CREATE OR REPLACE FUNCTION public.get_shared_teaching_strategies(target_id uuid)
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
  WHERE id = target_id;
  IF is_shared IS NOT TRUE THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
    INTO result
  FROM (
    SELECT ts.id, ts.name_ar
    FROM public.teaching_strategies ts
    WHERE ts.id IN (
      SELECT DISTINCT ev.strategy_id
      FROM public.evidence ev
      WHERE ev.portfolio_id = target_id
        AND ev.strategy_id IS NOT NULL
    )
  ) s;
  RETURN result;
END;
$function$
;
