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

-- Drop assigned_to from candidates (Optional, but recommended after verifying data)
-- ALTER TABLE public.candidates DROP COLUMN assigned_to;
