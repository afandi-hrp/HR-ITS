-- Follow-up to 20260731000000_harden_rls_storage_and_tables.sql.
--
-- The app-side fix (server.ts POST /api/n8n/upload-document,
-- ApplicationForm.tsx uploadFile()) now routes every public application-form
-- document upload through our own backend, which validates a live
-- registration token BEFORE writing to Storage using the service_role key
-- (which bypasses RLS entirely). That means the `public`/anon role no longer
-- needs — and must not have — any direct INSERT policy on candidate-documents
-- for the candidates/ path; the previous 3MB/mimetype-only policy still let
-- anyone upload valid-looking files without ever going through the
-- application flow, which is the gap this migration closes.
--
-- DROP both possible names defensively so this runs cleanly whether or not
-- the prior migration was applied first.
DROP POLICY IF EXISTS "Allow public uploads to candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Public uploads to candidate-documents (validated)" ON storage.objects;

-- HR's own psikotes-result upload (CandidateProfile.tsx, path
-- psikotes/<id>_<timestamp>.pdf) is a separate, already-authenticated-only
-- flow — give it its own scoped policy so it keeps working without needing
-- to go through the server proxy too.
CREATE POLICY "HR Admin can upload psikotes results"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'candidate-documents'
  AND name LIKE 'psikotes/%'
  AND (metadata->>'size')::integer <= 10485760
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
);
