-- Notify every HR_ADMIN when a candidate submits the biodata form
-- (/form-pelamar, ApplicationForm.tsx). Submission goes through the RPC
-- submit_application_with_token, which isn't tracked in this repo (created
-- directly in Studio) — but every submission always ends up as a new row
-- in external_data.raw_data, so a trigger on that table works regardless
-- of the RPC's own internals.
--
-- Scoped to genuine form submissions via the `submitted_at` key, which
-- ApplicationForm.tsx always sets on its own payload (see rawData in
-- handleSubmit) — this excludes rows that arrive through other paths
-- (e.g. bulk imports from job boards) that don't set that key.
CREATE OR REPLACE FUNCTION public.notify_hr_admin_new_application()
RETURNS TRIGGER AS $$
DECLARE
  candidate_name TEXT;
  position_name TEXT;
BEGIN
  IF NOT (NEW.raw_data ? 'submitted_at') THEN
    RETURN NEW;
  END IF;

  candidate_name := NULLIF(NEW.raw_data->>'full_name', '');
  position_name := NULLIF(NEW.raw_data->>'position', '');

  INSERT INTO public.user_notifications (user_id, title, message, type)
  SELECT
    p.id,
    'Lamaran Baru Masuk',
    COALESCE(candidate_name, 'Kandidat baru') ||
      CASE
        WHEN position_name IS NOT NULL THEN ' melamar posisi ' || position_name || '.'
        ELSE ' telah mengisi formulir lamaran.'
      END,
    'info'
  FROM public.profiles p
  WHERE p.role = 'HR_ADMIN';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_external_data_new_application ON public.external_data;
CREATE TRIGGER on_external_data_new_application
  AFTER INSERT ON public.external_data
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hr_admin_new_application();
