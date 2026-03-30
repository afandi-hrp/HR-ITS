-- Create n8n_jobs table
CREATE TABLE IF NOT EXISTS public.n8n_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, success, error
  message TEXT,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.n8n_jobs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own jobs" ON public.n8n_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs" ON public.n8n_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs" ON public.n8n_jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- Enable Realtime for n8n_jobs and candidates tables
alter publication supabase_realtime add table n8n_jobs;
alter publication supabase_realtime add table candidates;
