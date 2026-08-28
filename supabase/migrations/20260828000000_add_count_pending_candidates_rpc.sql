-- Used by the Recruitment Funnel page's "Pending" stat card, which
-- previously meant "not yet hired and not yet rejected" (i.e. included
-- candidates already in psikotes/interview). Redefined per request to mean
-- "no progress at all yet" — hasn't passed screening, and has no
-- psikotes/interview schedule of any kind. That check (NOT EXISTS against
-- the schedule tables) can't be expressed through the Supabase JS client's
-- filter API, so it needs a small SQL function instead.
CREATE OR REPLACE FUNCTION public.count_pending_candidates(
  p_position TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (
      SELECT COUNT(*) FROM public.candidates c
      WHERE (p_position IS NULL OR c.position = p_position)
        AND (p_start_date IS NULL OR c.created_at >= p_start_date)
        AND (p_end_date IS NULL OR c.created_at <= p_end_date)
        AND (c.status_screening IS NULL OR c.status_screening NOT IN ('accepted', 'hired', 'rejected'))
        AND NOT EXISTS (SELECT 1 FROM public.psikotes_schedules ps WHERE ps.candidate_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM public.interview_schedules ic WHERE ic.candidate_id = c.id)
    )
    +
    (
      SELECT COUNT(*) FROM public.candidate_logs l
      WHERE (p_position IS NULL OR l.position = p_position)
        AND (p_start_date IS NULL OR l.created_at >= p_start_date)
        AND (p_end_date IS NULL OR l.created_at <= p_end_date)
        AND (l.status_screening IS NULL OR l.status_screening NOT IN ('accepted', 'hired', 'rejected'))
        AND (l.psikotes_status IS NULL OR l.psikotes_status = '')
        AND (l.interview_status IS NULL OR l.interview_status = '')
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.count_pending_candidates(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
