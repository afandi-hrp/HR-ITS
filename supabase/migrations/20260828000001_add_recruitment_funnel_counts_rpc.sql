-- Used by the Recruitment Funnel page's stage bars. Previously each stage's
-- count was computed independently ("Lolos Screening" = status_screening IN
-- ('accepted','hired'); "Tahap Psikotes" = has a psikotes_schedules row) —
-- but a candidate can be scheduled for psikotes without status_screening
-- ever being set to 'accepted' first, so "Tahap Psikotes" could come out
-- *larger* than "Lolos Screening", breaking the funnel's narrowing shape
-- (reported: 66 Lolos Screening vs 154 Tahap Psikotes). This function makes
-- every stage a proper superset of the stage after it by construction —
-- "reached psikotes or beyond" OR-ing in has_interview/hired so it can only
-- ever shrink going right — guaranteeing a real funnel shape regardless of
-- how the underlying screening/scheduling data was entered.
CREATE OR REPLACE FUNCTION public.get_recruitment_funnel_counts(
  p_position TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total_applied INTEGER,
  passed_screening INTEGER,
  reached_psikotes INTEGER,
  reached_interview INTEGER,
  hired INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH combined AS (
    SELECT
      c.id,
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
      l.status_screening,
      (l.psikotes_status IS NOT NULL AND l.psikotes_status <> '') AS has_psikotes,
      (l.interview_status IS NOT NULL AND l.interview_status <> '') AS has_interview
    FROM public.candidate_logs l
    WHERE (p_position IS NULL OR l.position = p_position)
      AND (p_start_date IS NULL OR l.created_at >= p_start_date)
      AND (p_end_date IS NULL OR l.created_at <= p_end_date)
  )
  SELECT
    COUNT(*)::INTEGER AS total_applied,
    COUNT(*) FILTER (
      WHERE status_screening IN ('accepted', 'hired') OR has_psikotes OR has_interview
    )::INTEGER AS passed_screening,
    COUNT(*) FILTER (
      WHERE has_psikotes OR has_interview OR status_screening = 'hired'
    )::INTEGER AS reached_psikotes,
    COUNT(*) FILTER (
      WHERE has_interview OR status_screening = 'hired'
    )::INTEGER AS reached_interview,
    COUNT(*) FILTER (WHERE status_screening = 'hired')::INTEGER AS hired
  FROM combined;
$$;

GRANT EXECUTE ON FUNCTION public.get_recruitment_funnel_counts(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
