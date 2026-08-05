-- Eighth-round hardening (2026-08-05). Follow-up cleanup identified during
-- the same-day public-data-exposure audit — neither of these is publicly
-- (unauthenticated) exploitable, but both leave DB access wider than what
-- the app itself intends/relies on.

-- ============================================================
-- 1. internal_notes: SELECT was open to every authenticated user
--    regardless of role. CandidateProfile.tsx's fetchNotes() only ever
--    shows a note to viewers whose profile.role matches the note
--    author's role (note.author?.role === profile?.role) — but that
--    filtering happens client-side, after fetching every note. Any
--    authenticated user could bypass it with a direct query and read
--    notes meant for a different role group. This mirrors the DB
--    query's own join (author:profiles(*)) as the RLS check instead.
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated read access on internal_notes" ON public.internal_notes;

CREATE POLICY "Users can view same-role internal_notes" ON public.internal_notes
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
    = (SELECT role FROM public.profiles WHERE id = internal_notes.author_id)
  );

-- ============================================================
-- 2. candidate_logs: "User Manager Select Assigned Logs" is the same
--    dead-column pattern already cleaned up on `candidates` in
--    20260731000004 (references the retired `assigned_to` column, which
--    the app no longer populates — real assignment lives in
--    candidate_assignees). Not independently exploitable (uid() is NULL
--    for anonymous requests, so assigned_to = uid() never matches an anon
--    caller), and User Manager accounts can't even reach the Logs/Archive
--    pages in the current UI (App.tsx only routes /logs and /archive for
--    non-restricted roles) — so there's no working replacement needed,
--    same conclusion the original cleanup reached. Dropped for clarity.
-- ============================================================
DROP POLICY IF EXISTS "User Manager Select Assigned Logs" ON public.candidate_logs;