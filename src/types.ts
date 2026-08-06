export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: 'HR_ADMIN' | 'USER_MANAGER' | 'DIRECTOR' | 'FINANCE_DIRECTOR' | string;
  department?: string | null;
  job_title?: string | null;
  phone?: string | null;
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
  director_status?: 'pending' | 'accepted' | 'rejected' | 'hold';
  finance_status?: 'pending' | 'accepted' | 'rejected';
  director_approval_date?: string | null;
  finance_approval_date?: string | null;
  join_date?: string | null;
  finance_reject_reason?: string | null;
  trial_1_date?: string | null;
  trial_2_date?: string | null;
  trial_3_date?: string | null;
  trial_result?: string | null;
  background_check_date?: string | null;
  background_check_result?: string | null;
  confirmation_status: 'unconfirmed' | 'confirmed';
  confirmation_token: string | null;
  psikotes_schedules?: { id: string, is_confirmed: boolean, schedule_date: string, location_type?: string, location_detail?: string | null, additional_notes?: string | null, candidate_id?: string, created_at?: string, updated_at?: string }[];
  interview_schedules?: { id: string, is_confirmed: boolean, schedule_date: string, end_time?: string | null, location_type?: string, location_detail?: string | null, additional_notes?: string | null, candidate_id?: string, created_at?: string, updated_at?: string }[];
  candidate_evaluations?: { evaluation_type: 'HR' | 'USER' | 'REFERENCE_CHECK' }[];
  psikotes_status?: string;
  interview_status?: string;
  notes?: string;
  archived_at?: string;
  is_blacklisted?: boolean;
  blacklist_reason?: string;
  linked_external_id?: string | null;
  ai_biodata_summary?: any | null;
  ai_psikotes_summary?: any | null;
  ai_interview_questions?: any | null;
  ai_cv_analysis?: string | null;
  career_fit_recommendation?: string | null;
  psikotes_result_url?: string | null;
  source_info?: string | null;
  external_data?: { raw_data: any } | null;
  candidate_assignees?: { user_id: string, profiles?: Profile }[];
  assigned_history?: { id: string, name: string }[];
  created_at?: string;
  updated_at?: string;
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
  career_job_sources?: string[] | null;
  n8n_webhook_url_interview?: string | null;
  updated_at: string;
}

export interface Schedule {
  id: string;
  candidate_id: string;
  schedule_date: string;
  end_time?: string | null;
  location_type: 'online' | 'offline';
  location_detail: string | null;
  additional_notes: string | null;
  is_confirmed: boolean;
  created_at: string;
  updated_at: string;
  candidate?: Candidate;
}

export interface ScoringFormSchema {
  scale: { score: number; label: string }[];
  categories: {
    name: string;
    criteria: { name: string; description: string }[];
  }[];
  summary_fields?: {
    name: string;
    type: "textarea" | "radio" | "checkbox_group" | "scoring";
    placeholder?: string;
    options?: string[];
    max_score?: number;
  }[];
}

export interface ReferenceCheckFormSchema {
  title_template: string;
  intro: string;
  two_column: {
    headers: [string, string, string];
    rows: { key: string; label: string }[];
  };
  single_column: {
    section_title: string;
    header: string;
    rows: { key: string; label: string }[];
  };
  additional_comments_label: string;
  footer: { checked_date_label: string };
}

export interface ReferenceCheckData {
  applicant: Record<string, string>;
  reference: Record<string, string>;
  referee_comments: Record<string, string>;
  additional_comments: string;
  checked_date: string;
}

export interface EvaluationTemplate {
  id: string;
  name: string;
  type: 'HR' | 'USER' | 'REFERENCE_CHECK';
  target_role?: 'ALL' | 'HR_ADMIN' | 'USER_MANAGER' | 'DIRECTOR' | 'FINANCE_DIRECTOR' | string;
  target_department?: string;
  form_schema: ScoringFormSchema | ReferenceCheckFormSchema;
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
  evaluation_type: 'HR' | 'USER' | 'REFERENCE_CHECK';
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
