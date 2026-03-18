-- Migration to add detailed assessment scores to candidates and candidate_logs tables

ALTER TABLE public.candidates
ADD COLUMN technical_score INTEGER DEFAULT 0,
ADD COLUMN communication_score INTEGER DEFAULT 0,
ADD COLUMN problem_solving_score INTEGER DEFAULT 0,
ADD COLUMN teamwork_score INTEGER DEFAULT 0,
ADD COLUMN leadership_score INTEGER DEFAULT 0,
ADD COLUMN adaptability_score INTEGER DEFAULT 0;

ALTER TABLE public.candidate_logs
ADD COLUMN technical_score INTEGER DEFAULT 0,
ADD COLUMN communication_score INTEGER DEFAULT 0,
ADD COLUMN problem_solving_score INTEGER DEFAULT 0,
ADD COLUMN teamwork_score INTEGER DEFAULT 0,
ADD COLUMN leadership_score INTEGER DEFAULT 0,
ADD COLUMN adaptability_score INTEGER DEFAULT 0;
