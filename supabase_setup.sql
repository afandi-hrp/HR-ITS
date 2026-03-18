-- SQL Script for Supabase Setup

-- 1. Profiles Table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile." ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile." ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger for new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Candidates Table
CREATE TABLE public.candidates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE DEFAULT CURRENT_DATE,
  position TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  education TEXT,
  work_experience TEXT,
  skills TEXT,
  strengths TEXT,
  weaknesses TEXT,
  risk_factors TEXT,
  potential_factors TEXT,
  assessment_score NUMERIC,
  assessment_reason TEXT,
  resume_url TEXT,
  status_screening TEXT DEFAULT 'pending', -- pending, invited, rejected
  confirmation_status TEXT DEFAULT 'unconfirmed', -- unconfirmed, confirmed
  confirmation_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage candidates" ON public.candidates
  FOR ALL USING (auth.role() = 'authenticated');

-- 3. Candidate Logs Table (Archive)
CREATE TABLE public.candidate_logs (
  id UUID PRIMARY KEY,
  date DATE,
  position TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  education TEXT,
  work_experience TEXT,
  skills TEXT,
  strengths TEXT,
  weaknesses TEXT,
  risk_factors TEXT,
  potential_factors TEXT,
  assessment_score NUMERIC,
  assessment_reason TEXT,
  resume_url TEXT,
  status_screening TEXT,
  confirmation_status TEXT,
  confirmation_token TEXT,
  psikotes_status TEXT,
  interview_status TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.candidate_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage logs" ON public.candidate_logs
  FOR ALL USING (auth.role() = 'authenticated');

-- 4. Email Templates Table
CREATE TABLE public.email_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage templates" ON public.email_templates
  FOR ALL USING (auth.role() = 'authenticated');

-- 5. Psikotes Schedules Table
CREATE TABLE public.psikotes_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
  schedule_date TIMESTAMP WITH TIME ZONE NOT NULL,
  location_type TEXT CHECK (location_type IN ('online', 'offline')) NOT NULL,
  location_detail TEXT,
  additional_notes TEXT,
  is_confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.psikotes_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage psikotes schedules" ON public.psikotes_schedules
  FOR ALL USING (auth.role() = 'authenticated');

-- 6. Interview Schedules Table
CREATE TABLE public.interview_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
  schedule_date TIMESTAMP WITH TIME ZONE NOT NULL,
  location_type TEXT CHECK (location_type IN ('online', 'offline')) NOT NULL,
  location_detail TEXT,
  additional_notes TEXT,
  is_confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.interview_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage interview schedules" ON public.interview_schedules
  FOR ALL USING (auth.role() = 'authenticated');
