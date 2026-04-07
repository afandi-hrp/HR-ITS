ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ai_psikotes_summary TEXT;
ALTER TABLE candidate_logs ADD COLUMN IF NOT EXISTS ai_psikotes_summary TEXT;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ai_biodata_summary TEXT;
ALTER TABLE candidate_logs ADD COLUMN IF NOT EXISTS ai_biodata_summary TEXT;

