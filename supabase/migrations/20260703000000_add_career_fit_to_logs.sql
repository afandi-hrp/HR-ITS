ALTER TABLE candidates ADD COLUMN IF NOT EXISTS career_fit_recommendation text;
ALTER TABLE candidate_logs ADD COLUMN IF NOT EXISTS career_fit_recommendation text;
