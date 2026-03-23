export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface Candidate {
  id: string;
  date: string;
  position: string;
  full_name: string;
  email: string;
  phone: string | null;
  education: string | null;
  work_experience: string | null;
  skills: string | null;
  strengths: string | null;
  weaknesses: string | null;
  risk_factors: string | null;
  potential_factors: string | null;
  assessment_score: number | null;
  assessment_reason: string | null;
  technical_score?: number;
  communication_score?: number;
  problem_solving_score?: number;
  teamwork_score?: number;
  leadership_score?: number;
  adaptability_score?: number;
  resume_url: string | null;
  status_screening: 'pending' | 'invited' | 'rejected' | 'accepted' | 'hired';
  confirmation_status: 'unconfirmed' | 'confirmed';
  confirmation_token: string | null;
  psikotes_schedules?: { id: string, is_confirmed: boolean, schedule_date: string }[];
  interview_schedules?: { id: string, is_confirmed: boolean, schedule_date: string }[];
  psikotes_status?: string;
  interview_status?: string;
  notes?: string;
  archived_at?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  created_at: string;
}

export interface SiteSettings {
  id: number;
  login_logo_url: string | null;
  career_logo_url: string | null;
  sidebar_logo_url: string | null;
  sidebar_text: string | null;
  login_animation_url: string | null;
  favicon_url: string | null;
  updated_at: string;
}

export interface Schedule {
  id: string;
  candidate_id: string;
  schedule_date: string;
  location_type: 'online' | 'offline';
  location_detail: string | null;
  additional_notes: string | null;
  is_confirmed: boolean;
  created_at: string;
  updated_at: string;
  candidate?: Candidate;
}
