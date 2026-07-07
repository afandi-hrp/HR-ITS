ALTER TABLE candidate_logs 
ADD COLUMN IF NOT EXISTS director_status text,
ADD COLUMN IF NOT EXISTS finance_status text;
