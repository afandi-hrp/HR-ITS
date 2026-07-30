-- Third-round hardening (2026-07-31), triggered by re-examining what else
-- could leak data or allow injection after the storage-upload incident.
--
-- Finding 1 (CRITICAL): Supabase Auth's public /auth/v1/settings endpoint
-- confirms disable_signup = false, i.e. public email/password signup is
-- still enabled server-side. Combined with the pre-existing DB trigger that
-- auto-creates a `profiles` row defaulting to role = 'HR_ADMIN' for every
-- new auth.users row (proven during the earlier 37-user bulk import), this
-- means anyone could call supabase.auth.signUp() directly from a browser
-- console with the public anon key and land a fully privileged HR_ADMIN
-- account with zero legitimate onboarding. The existing
-- trg_prevent_self_role_department_change trigger (20260729000000) only
-- guards UPDATEs, not the initial INSERT, so it does not cover this path.
--
-- This migration adds a second, independent line of defense at the DB
-- layer: even if public signup is left enabled (by this app's design, or
-- by accident later), a new profile row can never be created with
-- role = 'HR_ADMIN' unless the request is made with the service_role key
-- (i.e. via our own backend's admin.createUser()/user-management flow).
-- Disabling signup at the Supabase Auth (GoTrue) config level is a
-- separate, infra-side action still required outside this migration.
CREATE OR REPLACE FUNCTION public.prevent_privileged_self_signup()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NEW.role = 'HR_ADMIN' THEN
    NEW.role := 'USER_MANAGER';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_privileged_self_signup ON public.profiles;
CREATE TRIGGER trg_prevent_privileged_self_signup
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privileged_self_signup();

-- Finding 2: external_data had a fully open, unauthenticated INSERT policy
-- (`WITH CHECK (true)`, no auth required) from 20260401000001. Confirmed
-- with the user that n8n writes to this table using the service_role key,
-- which bypasses RLS entirely and therefore never needed this policy in
-- the first place. Dropping it removes an unrestricted public write/spam
-- vector with no impact on the legitimate n8n flow.
DROP POLICY IF EXISTS "Allow public inserts" ON public.external_data;
