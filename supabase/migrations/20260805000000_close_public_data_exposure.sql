-- Seventh-round hardening (2026-08-05). Triggered by the user noticing
-- data was still visible without logging in. Confirmed live via a
-- read-only anon-key request (no service_role used) that `profiles` was
-- returning real employee names/roles/departments to a fully
-- unauthenticated caller. Re-reviewed the full migration history for the
-- same class of gap and found two more that no prior hardening pass
-- (20260729/20260731) had touched.

-- ============================================================
-- 1. profiles: the very first policy this project ever had
--    ("Public profiles are viewable by everyone.", from the original
--    supabase_setup.sql) was never scoped to `authenticated` — it applies
--    to the `public` Postgres role, which includes `anon`. Confirmed live:
--    an anonymous REST call returned full_name/role/department for every
--    employee. No public-facing page in the app (PublicCareer,
--    ApplicationForm, Login) reads `profiles` at all, so anon never
--    legitimately needed this.
-- ============================================================
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;

CREATE POLICY "Authenticated can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 2. otp_requests: anon has held SELECT and UPDATE (using(true)) on this
--    table since the very first otp_requests migration. Both are dead
--    code — server.ts's /api/request-otp and /api/verify-otp always use
--    the service_role key for every otp_requests read/write, and no
--    client-side code queries this table directly. Left in place, any
--    unauthenticated caller could read live OTP codes + phone numbers, or
--    overwrite another requester's row (including the post-verification
--    upload token stored back into otp_code).
-- ============================================================
DROP POLICY IF EXISTS "Allow anonymous insert OTP requests" ON public.otp_requests;
DROP POLICY IF EXISTS "Allow anonymous select OTP requests" ON public.otp_requests;
DROP POLICY IF EXISTS "Allow anonymous update OTP requests" ON public.otp_requests;

-- ============================================================
-- 3. storage: the `candidate-documents` bucket (photo/KTP/ijazah/
--    transcript/payslip/signature/legacy resume/psikotes-result files)
--    has been `public = true` with an un-revoked "Public Access" SELECT
--    policy since it was created — explicitly deferred in
--    20260730100000's comment ("existing documents stay on the old public
--    candidate-documents bucket untouched"). Anyone who ever obtains a
--    file's path/URL (a forwarded email, browser history, a leaked
--    export) can fetch it directly from Storage forever, no auth at all.
--
--    Verified this is safe to close without breaking the app: every
--    current document-viewing path (CandidateProfile.tsx, ApplicationForm
--    readOnly view) already calls resolveDocumentUrl() in
--    documentStorage.ts, which — for every case except a truly external
--    URL (Google Drive, job boards) — mints a fresh signed URL via the
--    authenticated GET /api/documents/signed-url endpoint (service_role,
--    bypasses RLS) rather than using the stored URL directly. The app
--    never actually relied on this bucket being public; only a direct,
--    out-of-band request to the raw storage URL did. This mirrors exactly
--    how candidate-documents-private already works (no public/authenticated
--    SELECT policy at all — reads only ever happen via minted signed URLs).
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id = 'candidate-documents';

DROP POLICY IF EXISTS "Public Access" ON storage.objects;