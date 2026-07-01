-- Add director and finance approval statuses to candidates
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS director_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS finance_status text DEFAULT 'pending';

-- Add policies to allow Director and Finance Director to access their assigned candidates
-- Note: If there is an overarching 'Authenticated users can manage candidates' policy, 
-- these act as explicit grants for these roles via candidate_assignees.
CREATE POLICY "Director Select Assigned"
    ON public.candidates
    FOR SELECT
    TO authenticated
    USING (
        id IN (SELECT candidate_id FROM public.candidate_assignees WHERE user_id = auth.uid())
    );

CREATE POLICY "Director Update Assigned"
    ON public.candidates
    FOR UPDATE
    TO authenticated
    USING (
        id IN (SELECT candidate_id FROM public.candidate_assignees WHERE user_id = auth.uid())
    );

CREATE POLICY "Finance Director Select Assigned"
    ON public.candidates
    FOR SELECT
    TO authenticated
    USING (
        id IN (SELECT candidate_id FROM public.candidate_assignees WHERE user_id = auth.uid())
    );

CREATE POLICY "Finance Director Update Assigned"
    ON public.candidates
    FOR UPDATE
    TO authenticated
    USING (
        id IN (SELECT candidate_id FROM public.candidate_assignees WHERE user_id = auth.uid())
    );
