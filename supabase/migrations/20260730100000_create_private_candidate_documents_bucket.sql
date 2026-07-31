-- Private Storage bucket for newly-uploaded sensitive candidate documents
-- (photo, KTP, ijazah, transcript, payslip, signature, psikotes result).
-- Forward-only migration: existing documents stay on the old public
-- `candidate-documents` bucket untouched. CV/resume is out of scope — it's
-- generated and written by an external n8n workflow, not this app.
--
-- No public INSERT/SELECT policy is needed: uploads go through server.ts
-- (POST /api/n8n/upload-document) using the service_role key, which
-- bypasses RLS entirely, and reads go through a new authenticated
-- server.ts endpoint (GET /api/documents/signed-url) that also uses
-- service_role to mint short-lived signed URLs. Only the two client-side
-- flows HR performs directly from the browser (psikotes upload + delete)
-- need explicit policies here.
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-documents-private', 'candidate-documents-private', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "HR Admin can upload psikotes results (private)"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'candidate-documents-private'
  AND name LIKE 'psikotes/%'
  AND (metadata->>'size')::integer <= 10485760
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
);

CREATE POLICY "HR Admin can delete candidate-documents-private"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'candidate-documents-private'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
);
