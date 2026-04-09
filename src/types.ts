export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: 'HR_ADMIN' | 'USER_MANAGER' | string;
  department?: string | null;
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
  linked_external_id?: string | null;
  ai_biodata_summary?: any | null;
  ai_psikotes_summary?: any | null;
  psikotes_result_url?: string | null;
  source_info?: string | null;
  external_data?: { raw_data: any } | null;
  assigned_to?: string | null;
  assignee?: Profile | null;
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
  job_sources?: string[] | null;
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

export interface EvaluationTemplate {
  id: string;
  name: string;
  type: 'HR' | 'USER';
  form_schema: {
    scale: { score: number; label: string }[];
    categories: {
      name: string;
      criteria: { name: string; description: string }[];
    }[];
  };
  created_at: string;
  updated_at: string;
}

export interface InternalNote {
  id: string;
  candidate_id: string;
  author_id: string;
  note_text: string;
  created_at: string;
  author?: Profile;
}

export interface CandidateEvaluation {
  id: string;
  candidate_id: string;
  template_id: string | null;
  evaluation_type: 'HR' | 'USER';
  interviewer_name: string;
  evaluator_id: string | null;
  evaluation_data: Record<string, any>;
  total_score: number;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  template?: EvaluationTemplate;
  evaluator?: Profile;
}
