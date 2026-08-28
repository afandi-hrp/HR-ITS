-- Companion to get_recruitment_funnel_counts(): the "click a stage to see
-- candidates" detail list on the Recruitment Funnel page was still using
-- the old independent-per-stage filters (e.g. "Tahap Psikotes" detail =
-- only candidates with a psikotes_schedules row) even after the stage
-- *counts* were made cumulative — so the number on the bar and the list
-- shown after clicking it could disagree. This returns candidate ids using
-- the exact same cumulative definition as the counts RPC, tagged by stage,
-- so the app can fetch the matching full rows and both numbers line up.
CREATE OR REPLACE FUNCTION public.get_recruitment_funnel_stage_candidates(
  p_position TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit_per_stage INTEGER DEFAULT 50
)
RETURNS TABLE (stage TEXT, candidate_id UUID, source_table TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH combined AS (
    SELECT
      c.id,
      'candidates'::text AS source_table,
      c.created_at,
      c.status_screening,
      EXISTS(SELECT 1 FROM public.psikotes_schedules ps WHERE ps.candidate_id = c.id) AS has_psikotes,
      EXISTS(SELECT 1 FROM public.interview_schedules ic WHERE ic.candidate_id = c.id) AS has_interview
    FROM public.candidates c
    WHERE (p_position IS NULL OR c.position = p_position)
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date IS NULL OR c.created_at <= p_end_date)
    UNION ALL
    SELECT
      l.id,
      'candidate_logs'::text,
      l.created_at,
      l.status_screening,
      (l.psikotes_status IS NOT NULL AND l.psikotes_status <> ''),
      (l.interview_status IS NOT NULL AND l.interview_status <> '')
    FROM public.candidate_logs l
    WHERE (p_position IS NULL OR l.position = p_position)
      AND (p_start_date IS NULL OR l.created_at >= p_start_date)
      AND (p_end_date IS NULL OR l.created_at <= p_end_date)
  )
  (SELECT 'total'::text, id, source_table FROM combined
    ORDER BY created_at DESC LIMIT p_limit_per_stage)
  UNION ALL
  (SELECT 'passed_screening'::text, id, source_table FROM combined
    WHERE status_screening IN ('accepted', 'hired') OR has_psikotes OR has_interview
    ORDER BY created_at DESC LIMIT p_limit_per_stage)
  UNION ALL
  (SELECT 'reached_psikotes'::text, id, source_table FROM combined
    WHERE has_psikotes OR has_interview OR status_screening = 'hired'
    ORDER BY created_at DESC LIMIT p_limit_per_stage)
  UNION ALL
  (SELECT 'reached_interview'::text, id, source_table FROM combined
    WHERE has_interview OR status_screening = 'hired'
    ORDER BY created_at DESC LIMIT p_limit_per_stage)
  UNION ALL
  (SELECT 'hired'::text, id, source_table FROM combined
    WHERE status_screening = 'hired'
    ORDER BY created_at DESC LIMIT p_limit_per_stage);
$$;

GRANT EXECUTE ON FUNCTION public.get_recruitment_funnel_stage_candidates(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;
