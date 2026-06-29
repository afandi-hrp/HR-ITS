-- Create candidate_assignees table
CREATE TABLE IF NOT EXISTS public.candidate_assignees (
    candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (candidate_id, user_id)
);

-- Enable RLS
ALTER TABLE public.candidate_assignees ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated read access to candidate_assignees"
    ON public.candidate_assignees FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert to candidate_assignees"
    ON public.candidate_assignees FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated delete to candidate_assignees"
    ON public.candidate_assignees FOR DELETE TO authenticated USING (true);

-- Add assigned_history to candidate_logs
ALTER TABLE public.candidate_logs ADD COLUMN IF NOT EXISTS assigned_history JSONB DEFAULT '[]'::jsonb;

-- Migrate existing data from candidates.assigned_to to candidate_assignees
INSERT INTO public.candidate_assignees (candidate_id, user_id)
SELECT id, assigned_to
FROM public.candidates
WHERE assigned_to IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE public.blacklisted_candidates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  phone TEXT,
  identity_number TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- RLS policies for blacklisted_candidates
ALTER TABLE public.blacklisted_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated to read blacklisted_candidates" ON public.blacklisted_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated to insert blacklisted_candidates" ON public.blacklisted_candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated to update blacklisted_candidates" ON public.blacklisted_candidates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated to delete blacklisted_candidates" ON public.blacklisted_candidates FOR DELETE TO authenticated USING (true);

-- Update the "Allow public uploads" policy to increase the file size limit to 3MB (3145728 bytes)
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;

CREATE POLICY "Allow public uploads"
ON storage.objects FOR INSERT
WITH CHECK ( 
  bucket_id = 'candidate-documents' AND
  (metadata->>'size')::integer <= 3145728 AND
  (
    metadata->>'mimetype' = 'image/jpeg' OR 
    metadata->>'mimetype' = 'image/png' OR 
    metadata->>'mimetype' = 'application/pdf' OR 
    metadata->>'mimetype' = 'application/msword' OR 
    metadata->>'mimetype' = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
);
