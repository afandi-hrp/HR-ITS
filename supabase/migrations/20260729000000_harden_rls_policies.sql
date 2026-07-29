-- Harden RLS policies that were found to be overly permissive during a
-- security audit (2026-07-29). Root cause: several tables had a catch-all
-- "any authenticated user" policy (SELECT/INSERT/UPDATE/DELETE) sitting
-- alongside newer, more targeted role/assignment-scoped policies. Since
-- Postgres RLS policies are permissive (OR'd together), the catch-all
-- policies made every narrower policy decorative — any logged-in user
-- could read/update any candidate, assign/unassign reviewers, or even
-- promote their own profile to HR_ADMIN directly via the client SDK,
-- bypassing every role restriction built into the React app.

-- ============================================================
-- 1. candidates: remove the "any authenticated user" catch-all.
-- ============================================================
-- Before removing it, add a proper assignment-scoped policy for
-- USER_MANAGER (mirroring the existing Director/Finance Director ones),
-- because the User Manager's only other grant relied on a stale
-- `assigned_to` column that the app no longer populates (confirmed via
-- data check: only 1/133 candidates had assigned_to set, vs 8 real rows
-- in candidate_assignees). Without this, User Manager accounts would
-- lose all candidate access the moment the catch-all is dropped.
CREATE POLICY "User Manager Select Assigned Via Candidate Assignees"
    ON public.candidates
    FOR SELECT
    TO authenticated
    USING (
        id IN (SELECT candidate_id FROM public.candidate_assignees WHERE user_id = auth.uid())
    );

CREATE POLICY "User Manager Update Assigned Via Candidate Assignees"
    ON public.candidates
    FOR UPDATE
    TO authenticated
    USING (
        id IN (SELECT candidate_id FROM public.candidate_assignees WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Authenticated users can manage candidates" ON public.candidates;

-- ============================================================
-- 2. candidate_logs: remove the same style of catch-all.
-- ============================================================
-- Remaining policies (HR Admin Full Access Logs, User Manager Select
-- Assigned Logs) already match how the app routes archive/logs pages
-- (HR Admin only in the current UI).
DROP POLICY IF EXISTS "Authenticated users can manage logs" ON public.candidate_logs;

-- ============================================================
-- 3. profiles: block self-service role/department escalation.
-- ============================================================
-- RLS's "USING (uid() = id)" only controls which ROW a user may update,
-- not which COLUMNS. Nothing stopped a user from updating their own
-- `role` to HR_ADMIN. A trigger is used (rather than WITH CHECK) because
-- comparing NEW vs OLD column values requires row-level trigger logic.
-- auth.role() = 'authenticated' identifies normal end-user requests;
-- the server-side /api/users/update-role endpoint uses the service_role
-- key (auth.role() = 'service_role') and is unaffected by this trigger.
CREATE OR REPLACE FUNCTION public.prevent_self_role_department_change()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.department IS DISTINCT FROM OLD.department THEN
      RAISE EXCEPTION 'Changing role or department requires HR Admin privileges.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_self_role_department_change ON public.profiles;
CREATE TRIGGER trg_prevent_self_role_department_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_department_change();

-- ============================================================
-- 4. candidate_assignees: restrict assign/unassign to HR Admin.
-- ============================================================
-- Matches the app-level restriction already in place in CandidateProfile.tsx
-- (only HR_ADMIN sees the Assign/Unassign UI) — now enforced at the DB
-- level too. SELECT stays open since every role needs to see who is
-- assigned to a candidate.
DROP POLICY IF EXISTS "Allow authenticated insert to candidate_assignees" ON public.candidate_assignees;
DROP POLICY IF EXISTS "Allow authenticated delete to candidate_assignees" ON public.candidate_assignees;

CREATE POLICY "HR Admin can insert candidate_assignees"
    ON public.candidate_assignees
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
    );

CREATE POLICY "HR Admin can delete candidate_assignees"
    ON public.candidate_assignees
    FOR DELETE
    TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
    );
