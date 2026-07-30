-- Second-round RLS hardening (2026-07-31), triggered by a confirmed
-- incident: someone uploaded test.html / test2.html .. test7.html /
-- testttt222.png directly to the candidate-documents storage bucket on
-- 2026-07-07, bypassing the app entirely.
--
-- Root cause: storage.objects had TWO permissive INSERT policies for
-- candidate-documents active at once — an old unrestricted one and a
-- newer restricted one. Postgres RLS policies are OR'd together, so the
-- unrestricted one made the restricted one meaningless. A prior migration
-- tried to DROP the old one but used the wrong policy name, so the drop
-- silently no-op'd and the old policy stayed live.
--
-- While auditing, two more classes of gap were found and are fixed here
-- too: a table with genuinely public (unauthenticated) read access to PII
-- (external_data), and several tables/storage buckets with a blanket
-- "any authenticated user" policy instead of being scoped to HR_ADMIN.

-- ============================================================
-- 1. storage.objects (candidate-documents): remove the duplicate
--    unrestricted INSERT policy, and tighten the remaining one to also
--    require the upload path start with candidates/ (the only prefix the
--    public application form ever writes to).
-- ============================================================
DROP POLICY IF EXISTS "Allow public uploads to candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Kandidat Hanya boleh upload file aman 2mb" ON storage.objects;

CREATE POLICY "Public uploads to candidate-documents (validated)"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'candidate-documents'
  AND name LIKE 'candidates/%'
  AND (metadata->>'size')::integer <= 3145728
  AND (
    metadata->>'mimetype' = 'image/jpeg' OR
    metadata->>'mimetype' = 'image/png' OR
    metadata->>'mimetype' = 'application/pdf' OR
    metadata->>'mimetype' = 'application/msword' OR
    metadata->>'mimetype' = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
);

-- DELETE on candidate-documents was open to any authenticated user; scope
-- it to HR Admin (matches who can actually manage candidate documents in
-- the app).
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;

CREATE POLICY "HR Admin can delete candidate-documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'candidate-documents'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
);

-- ============================================================
-- 2. storage.objects (site-assets): writes were open to any authenticated
--    user; scope to HR Admin.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete assets" ON storage.objects;

CREATE POLICY "HR Admin can upload site-assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'site-assets'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
);

CREATE POLICY "HR Admin can update site-assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'site-assets'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
);

CREATE POLICY "HR Admin can delete site-assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'site-assets'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
);

-- ============================================================
-- 3. external_data: was readable by literally anyone, including
--    unauthenticated visitors — this table holds full application-form
--    submissions (name, email, phone, NIK/KTP, signature, salary
--    expectations). No public-facing page in the app reads this table
--    directly (confirmed only CandidateProfile/CandidateTracking/
--    ExternalData/Logs — all authenticated-only pages — read it), so the
--    public SELECT grant is dropped. INSERT is left untouched since it's
--    the path an external n8n workflow may still rely on.
-- ============================================================
DROP POLICY IF EXISTS "Allow public read access" ON public.external_data;

-- ============================================================
-- 4. blacklisted_candidates: writes were open to any authenticated user;
--    scope to HR Admin. SELECT stays open (the blacklist badge is shown
--    to every role that can see a candidate).
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated to insert blacklisted_candidates" ON public.blacklisted_candidates;
DROP POLICY IF EXISTS "Allow authenticated to update blacklisted_candidates" ON public.blacklisted_candidates;
DROP POLICY IF EXISTS "Allow authenticated to delete blacklisted_candidates" ON public.blacklisted_candidates;

CREATE POLICY "HR Admin can insert blacklisted_candidates"
ON public.blacklisted_candidates
FOR INSERT
TO authenticated
WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');

CREATE POLICY "HR Admin can update blacklisted_candidates"
ON public.blacklisted_candidates
FOR UPDATE
TO authenticated
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');

CREATE POLICY "HR Admin can delete blacklisted_candidates"
ON public.blacklisted_candidates
FOR DELETE
TO authenticated
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');

-- ============================================================
-- 5. interview_schedules / psikotes_schedules / email_templates: each had
--    a single blanket "any authenticated user can do anything" policy —
--    same pattern already fixed on `candidates` earlier. SELECT is kept
--    open (schedule status is shown read-only to Director/Finance/User
--    Manager too); writes are scoped to HR Admin, who is the only role
--    that actually schedules/confirms/manages these in the app today.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage interview schedules" ON public.interview_schedules;
CREATE POLICY "Authenticated can view interview_schedules" ON public.interview_schedules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR Admin can insert interview_schedules" ON public.interview_schedules
  FOR INSERT TO authenticated WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can update interview_schedules" ON public.interview_schedules
  FOR UPDATE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can delete interview_schedules" ON public.interview_schedules
  FOR DELETE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');

DROP POLICY IF EXISTS "Authenticated users can manage psikotes schedules" ON public.psikotes_schedules;
CREATE POLICY "Authenticated can view psikotes_schedules" ON public.psikotes_schedules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR Admin can insert psikotes_schedules" ON public.psikotes_schedules
  FOR INSERT TO authenticated WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can update psikotes_schedules" ON public.psikotes_schedules
  FOR UPDATE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can delete psikotes_schedules" ON public.psikotes_schedules
  FOR DELETE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');

DROP POLICY IF EXISTS "Authenticated users can manage templates" ON public.email_templates;
CREATE POLICY "Authenticated can view email_templates" ON public.email_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR Admin can insert email_templates" ON public.email_templates
  FOR INSERT TO authenticated WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can update email_templates" ON public.email_templates
  FOR UPDATE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can delete email_templates" ON public.email_templates
  FOR DELETE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');

-- ============================================================
-- 6. site_settings / registration_tokens / open_recruitment: writes were
--    open to any authenticated user; scope to HR Admin. Public SELECT on
--    site_settings and open_recruitment stays untouched (needed by the
--    login page and the public career page respectively).
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated insert to site_settings" ON public.site_settings;
DROP POLICY IF EXISTS "Allow authenticated update to site_settings" ON public.site_settings;
CREATE POLICY "HR Admin can insert site_settings" ON public.site_settings
  FOR INSERT TO authenticated WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can update site_settings" ON public.site_settings
  FOR UPDATE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');

DROP POLICY IF EXISTS "Allow authenticated full access on registration_tokens" ON public.registration_tokens;
CREATE POLICY "Authenticated can view registration_tokens" ON public.registration_tokens
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR Admin can insert registration_tokens" ON public.registration_tokens
  FOR INSERT TO authenticated WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can update registration_tokens" ON public.registration_tokens
  FOR UPDATE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can delete registration_tokens" ON public.registration_tokens
  FOR DELETE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.open_recruitment;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.open_recruitment;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.open_recruitment;
CREATE POLICY "HR Admin can insert open_recruitment" ON public.open_recruitment
  FOR INSERT TO authenticated WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can update open_recruitment" ON public.open_recruitment
  FOR UPDATE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
CREATE POLICY "HR Admin can delete open_recruitment" ON public.open_recruitment
  FOR DELETE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
