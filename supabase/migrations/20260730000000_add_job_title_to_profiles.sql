-- Add job_title to profiles, needed for the bulk user import from
-- "List Pembuatan Account User ATS.xlsx" (column "Jabatan" had no home
-- in the schema previously).
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS job_title text;
