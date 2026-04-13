ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ai_interview_questions JSONB;
ALTER TABLE candidate_logs ADD COLUMN IF NOT EXISTS ai_interview_questions JSONB;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS n8n_webhook_url_interview TEXT;
