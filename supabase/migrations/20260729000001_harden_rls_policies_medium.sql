-- Follow-up to 20260729000000_harden_rls_policies.sql: closes the 2
-- medium-severity gaps identified in the same audit (2026-07-29).

-- ============================================================
-- 1. evaluation_templates: restrict write access to HR Admin.
-- ============================================================
-- SELECT stays open (true) — every role needs to read templates via
-- EvaluationModal/CandidateProfile joins. Only the EvaluationTemplates
-- page (routed to HR Admin only in App.tsx) writes to this table, so
-- INSERT/UPDATE/DELETE are now scoped to HR_ADMIN accordingly.
DROP POLICY IF EXISTS "Allow authenticated insert to evaluation_templates" ON public.evaluation_templates;
DROP POLICY IF EXISTS "Allow authenticated update to evaluation_templates" ON public.evaluation_templates;
DROP POLICY IF EXISTS "Allow authenticated delete to evaluation_templates" ON public.evaluation_templates;

CREATE POLICY "HR Admin can insert evaluation_templates"
    ON public.evaluation_templates
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
    );

CREATE POLICY "HR Admin can update evaluation_templates"
    ON public.evaluation_templates
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
    )
    WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
    );

CREATE POLICY "HR Admin can delete evaluation_templates"
    ON public.evaluation_templates
    FOR DELETE
    TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'HR_ADMIN'
    );

-- ============================================================
-- 2. candidate_evaluations: validate evaluator_id on INSERT.
-- ============================================================
-- Confirmed both insert call sites (EvaluationModal.tsx, ReferenceCheckModal.tsx)
-- always set evaluator_id to the current session's own user id, and neither
-- the app nor any backend job inserts with a null/other evaluator_id — so
-- this simply enforces what the app already does, closing the gap where a
-- direct API call could previously insert a row impersonating another
-- evaluator. UPDATE/DELETE were already correctly scoped and are untouched.
DROP POLICY IF EXISTS "Allow authenticated insert to candidate_evaluations" ON public.candidate_evaluations;

CREATE POLICY "Users can insert their own evaluations"
    ON public.candidate_evaluations
    FOR INSERT
    TO authenticated
    WITH CHECK (evaluator_id = auth.uid());
