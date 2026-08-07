-- Fixes a production-breaking bug found via a candidate-reported submission
-- error on /form-pelamar: "operator does not exist: json ? unknown".
--
-- notify_hr_admin_new_application() (20260731000007) uses the `?` (key
-- exists) operator on NEW.raw_data — but that operator is only defined for
-- `jsonb`, not `json`, and external_data.raw_data is typed `json`. Since
-- this is an AFTER INSERT trigger and the error is unhandled, every
-- application-form submission's INSERT into external_data was being rolled
-- back entirely, not just the notification step — candidates' submitted
-- data (including signatures/payslips) was never actually saved.
--
-- Fix: cast to jsonb only for the `?` check; the `->>'...'` lookups further
-- down already work fine on both json and jsonb, left unchanged.
CREATE OR REPLACE FUNCTION public.notify_hr_admin_new_application()
RETURNS TRIGGER AS $function$
DECLARE
  candidate_name TEXT;
  position_name TEXT;
BEGIN
  IF NOT (NEW.raw_data::jsonb ? 'submitted_at') THEN
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
$function$ LANGUAGE plpgsql SECURITY DEFINER;
