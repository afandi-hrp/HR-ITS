ALTER TABLE candidates 
ADD COLUMN IF NOT EXISTS trial_1_date date,
ADD COLUMN IF NOT EXISTS trial_2_date date,
ADD COLUMN IF NOT EXISTS trial_3_date date,
ADD COLUMN IF NOT EXISTS trial_result text,
ADD COLUMN IF NOT EXISTS background_check_date date,
ADD COLUMN IF NOT EXISTS background_check_result text,
ADD COLUMN IF NOT EXISTS director_approval_date timestamptz,
ADD COLUMN IF NOT EXISTS finance_approval_date timestamptz,
ADD COLUMN IF NOT EXISTS join_date date,
ADD COLUMN IF NOT EXISTS finance_reject_reason text;

ALTER TABLE candidate_logs 
ADD COLUMN IF NOT EXISTS trial_1_date date,
ADD COLUMN IF NOT EXISTS trial_2_date date,
ADD COLUMN IF NOT EXISTS trial_3_date date,
ADD COLUMN IF NOT EXISTS trial_result text,
ADD COLUMN IF NOT EXISTS background_check_date date,
ADD COLUMN IF NOT EXISTS background_check_result text,
ADD COLUMN IF NOT EXISTS director_approval_date timestamptz,
ADD COLUMN IF NOT EXISTS finance_approval_date timestamptz,
ADD COLUMN IF NOT EXISTS join_date date,
ADD COLUMN IF NOT EXISTS finance_reject_reason text;
