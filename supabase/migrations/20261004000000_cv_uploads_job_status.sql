-- Upload CV history: link each upload to its n8n job (for the
-- Diproses / Selesai / Gagal status badge) and keep the job source.
--
-- cv_uploads itself was created directly in Studio (no tracked migration);
-- these are additive, idempotent columns. server.ts falls back to inserting
-- without them if this hasn't been run yet, so ordering vs. deploy is safe.

ALTER TABLE public.cv_uploads
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.n8n_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_info text;

CREATE INDEX IF NOT EXISTS cv_uploads_job_id_idx ON public.cv_uploads (job_id);
