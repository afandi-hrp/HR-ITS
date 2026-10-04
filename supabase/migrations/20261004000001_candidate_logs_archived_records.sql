-- Keep a candidate's related records when they are archived.
--
-- Archiving (server.ts /api/candidates/move-to-log) deletes the row from
-- `candidates`, and psikotes_schedules / interview_schedules /
-- candidate_evaluations / internal_notes all reference candidates(id)
-- ON DELETE CASCADE — so archiving silently destroyed every schedule,
-- interview/reference-check evaluation and internal note (confirmed live
-- 2026-10-04).
--
-- The FKs are intentionally left as-is: PostgREST embeds such as
-- candidates.select('*, psikotes_schedules(...)') depend on them. Instead,
-- move-to-log now snapshots those rows into this column before deleting,
-- and restore-from-log re-inserts them. The app reads archived profiles /
-- Live Tracking from here.
--
-- Shape: { psikotes_schedules: [...], interview_schedules: [...],
--          candidate_evaluations: [...], internal_notes: [...] }
--
-- Records already deleted by earlier archives cannot be recovered from the
-- app (only from a database backup).

ALTER TABLE public.candidate_logs
  ADD COLUMN IF NOT EXISTS archived_records jsonb;
