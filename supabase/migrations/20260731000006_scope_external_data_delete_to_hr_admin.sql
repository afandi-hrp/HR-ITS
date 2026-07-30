-- Sixth-round hardening (2026-07-31). Re-includes the DROP from
-- 20260731000005 (the live audit still showed "Allow service role full
-- access" present on external_data, meaning that migration wasn't actually
-- run yet) and adds the requested DELETE restriction.
--
-- "Allow authenticated deletes" let ANY authenticated user (any role, not
-- just HR_ADMIN) delete any row from external_data. Scoped to HR_ADMIN to
-- match every other write policy in this table's family.
DROP POLICY IF EXISTS "Allow service role full access" ON public.external_data;

DROP POLICY IF EXISTS "Allow authenticated deletes" ON public.external_data;
CREATE POLICY "HR Admin can delete external_data"
ON public.external_data
FOR DELETE
TO authenticated
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN');
