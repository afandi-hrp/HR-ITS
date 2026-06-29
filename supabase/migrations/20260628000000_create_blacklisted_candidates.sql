CREATE TABLE IF NOT EXISTS public.blacklisted_candidates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  phone TEXT,
  identity_number TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.blacklisted_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated to read blacklisted_candidates" ON public.blacklisted_candidates;
CREATE POLICY "Allow authenticated to read blacklisted_candidates" ON public.blacklisted_candidates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated to insert blacklisted_candidates" ON public.blacklisted_candidates;
CREATE POLICY "Allow authenticated to insert blacklisted_candidates" ON public.blacklisted_candidates FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated to update blacklisted_candidates" ON public.blacklisted_candidates;
CREATE POLICY "Allow authenticated to update blacklisted_candidates" ON public.blacklisted_candidates FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated to delete blacklisted_candidates" ON public.blacklisted_candidates;
CREATE POLICY "Allow authenticated to delete blacklisted_candidates" ON public.blacklisted_candidates FOR DELETE TO authenticated USING (true);
