ALTER TABLE candidate_logs ADD COLUMN IF NOT EXISTS ai_cv_analysis TEXT;
ALTER TABLE candidate_logs ADD COLUMN IF NOT EXISTS psikotes_result_url TEXT;
