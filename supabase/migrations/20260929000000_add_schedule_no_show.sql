-- "Tidak Hadir" (no-show) for psikotes / interview schedules.
--
-- is_confirmed keeps meaning "attended / done". A schedule the candidate
-- didn't show up for gets is_no_show = true (is_confirmed stays false), plus
-- an optional reason. The row is kept (not deleted) so the no-show stays in
-- the candidate's history even after a reschedule creates a new row.
--
-- Existing RLS ("HR Admin can update …_schedules") already covers these
-- columns; the recruitment-funnel RPCs count "reached the psikotes/interview
-- stage" by row existence, which is still correct for no-shows (they were
-- invited), so they're left unchanged.

ALTER TABLE public.psikotes_schedules
  ADD COLUMN IF NOT EXISTS is_no_show boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_reason text;

ALTER TABLE public.interview_schedules
  ADD COLUMN IF NOT EXISTS is_no_show boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_reason text;

-- A schedule can't be both attended and a no-show.
ALTER TABLE public.psikotes_schedules
  DROP CONSTRAINT IF EXISTS psikotes_schedules_attended_xor_no_show;
ALTER TABLE public.psikotes_schedules
  ADD CONSTRAINT psikotes_schedules_attended_xor_no_show
  CHECK (NOT (is_confirmed AND is_no_show));

ALTER TABLE public.interview_schedules
  DROP CONSTRAINT IF EXISTS interview_schedules_attended_xor_no_show;
ALTER TABLE public.interview_schedules
  ADD CONSTRAINT interview_schedules_attended_xor_no_show
  CHECK (NOT (is_confirmed AND is_no_show));
