import type { OriginalResumeInfo } from '@/features/businessReviews/types';

export type ParseStatus = 'pending' | 'processing' | 'ok' | 'failed' | 'original_confirmed';
export type CandidateStage =
  | 'pending'
  | 'ai_screen'
  | 'business_review'
  | 'interview'
  | 'offer'
  | 'onboarded'
  | 'rejected'
  | 'transferred';

export interface CandidateTag {
  tag: string;
  score: number;
}

export interface CandidateSourceInfo {
  batch_id: number;
  channel: string;
  note: string;
  created_at: string | null;
}

export interface CandidateDemandSummary {
  id: number;
  request_no: string;
  job_title: string;
}

export interface CandidateListItem {
  id: number;
  name_masked: string;
  email_masked?: string;
  phone_masked?: string;
  owner_hr_id: number | null;
  current_demand_id?: number | null;
  latest_demand_id?: number | null;
  current_demand?: CandidateDemandSummary | null;
  latest_demand?: CandidateDemandSummary | null;
  is_favorite: boolean;
  identical_resume_count?: number;
  same_name_count?: number;
  is_local_demo_record?: boolean;
  created_at: string;
  parse_status: ParseStatus;
  parse_error?: string | null;
  tag_count: number;
  current_stage?: CandidateStage | null;
  education_summary?: string;
  top_tags?: CandidateTag[];
  max_score?: number;
  intent_city?: string;
  desired_position?: string;
  latest_experience?: {
    company: string;
    position: string;
    duration: string;
  } | null;
  source?: CandidateSourceInfo | null;
}

export type CandidateListApiItem = CandidateListItem & {
  identical_resume_count: number;
  same_name_count: number;
  is_local_demo_record: boolean;
};

export interface CandidateListResponse {
  candidates: CandidateListApiItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface CandidateListQuery {
  search?: string;
  demand_id?: number;
  stage?: CandidateStage;
  city?: string;
  education?: string;
  skill?: string;
  min_score?: number;
  source_channel?: string;
  parse_status?: ParseStatus;
  pipeline_status?: 'in_pipeline' | 'not_in_pipeline';
  favorite?: boolean;
  sort_by?: 'created_at' | 'name_masked';
  sort_order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface CandidateResumeDetail {
  id: number;
  name_masked: string;
  owner_hr_id: number | null;
  resume_json: Record<string, unknown>;
  tags: Array<{ tag: string; score: number }>;
  parse_status: ParseStatus;
  parse_error: string | null;
  original_resume: OriginalResumeInfo;
  created_at: string;
  resume_versions: ResumeVersion[];
}

export interface ResumeVersion {
  id: number;
  version_no: number;
  name_masked: string;
  parse_status: ParseStatus;
  reason: string;
  created_at: string;
  available: boolean;
  is_current: false;
  download_url: string | null;
}

export interface ResumeVersionResponse {
  candidate_id: number;
  versions: ResumeVersion[];
}

export interface CandidateJourneyFeedback {
  id: number;
  assignment_id: number | null;
  round: string;
  score: number | null;
  passed: boolean | null;
  strengths: string | null;
  concerns: string | null;
  note: string | null;
  interviewer_name: string | null;
  created_at: string | null;
}

export interface CandidateJourney {
  candidate_id: number;
  name_masked: string;
  demand_id: number;
  job_id: number;
  job_title: string | null;
  demand_approval: {
    status: string;
    submitted_by_name: string | null;
    submitted_at: string | null;
    reviewed_by_name: string | null;
    reviewed_at: string | null;
    reason: string;
    history: Array<{ action: string; actor_name: string | null; at: string | null; reason: string }>;
  };
  business_reviews: Array<{
    id: number;
    status: string;
    created_by_name: string | null;
    reviewer_name: string | null;
    decided_by_name: string | null;
    hr_note: string;
    business_note: string;
    due_at: string | null;
    created_at: string | null;
    decided_at: string | null;
  }>;
  timeline: Array<{ stage: string; ts: string | null; note: string | null; updated_by_name: string | null }>;
  interview_rounds: Array<{
    assignment_id: number;
    round: string;
    round_sequence: number;
    interviewer_name: string | null;
    scheduled_at: string | null;
    location: string;
    status: string;
    note: string;
    feedback: CandidateJourneyFeedback | null;
    feedback_locked: boolean;
  }>;
  offers: Array<{
    id: number;
    status: string;
    salary_range: string;
    onboard_date: string | null;
    submitted_at: string | null;
    approved_at: string | null;
    sent_at: string | null;
    responded_at: string | null;
    onboarded_at: string | null;
    rejection_reason: string;
  }>;
}

export interface ResumeUploadResponse {
  batch_id: number;
  total: number;
  deduplicated?: boolean;
  results: Array<{
    file: string;
    status: 'ok' | 'processing' | 'duplicate' | 'needs_confirmation' | 'error' | 'skipped';
    reason?: string;
    parse_error?: string;
    candidate_id?: number;
    name_masked?: string;
    existing_candidate_id?: number;
    existing_candidate_name?: string;
    match_basis?: string;
  }>;
}

export interface CandidateProfileUpdate {
  profile: {
    name: string;
    phone: string;
    email: string;
    target_position: string;
    intent_city: string;
    work_years: string;
    education?: Array<{ degree: string }>;
  };
  skills?: Array<{ tag: string; score: number }>;
}

export interface ResumeUploadSource {
  target_demand_id?: number;
  source_channel?: string;
  source_note?: string;
}

export interface CandidateFavoriteResult {
  candidate_ids: number[];
  favorite: boolean;
  changed: number;
}

export interface CandidatePipelineAddResult {
  demand_id: number;
  job_id: number;
  added: number;
  reactivated: number;
  skipped_existing: number;
  skipped_missing: number;
  skipped_conflict: number;
  failures: Array<{
    candidate_id: number;
    code: string;
    error: string;
  }>;
}

export interface CandidateDemandTransferResult {
  candidate_id: number;
  from_demand_id: number;
  to_demand_id: number;
  stage: CandidateStage;
}

export interface CandidateMatchResult {
  candidate_id: number;
  name_masked: string;
  score: number;
  matched_tags: string[];
  missing_tags: string[];
  latest_stage: CandidateStage | null;
}

export interface CandidateMatchPreview {
  demand_id: number;
  job_id: number;
  match_configured: boolean;
  required_skills: string[];
  results: CandidateMatchResult[];
}

export interface DuplicateCandidateItem {
  id: number;
  name_masked: string;
  email_masked: string;
  phone_masked: string;
  education_summary: string;
  created_at: string;
  has_business_history: boolean;
}

export interface DuplicateCandidateGroup {
  key: string;
  match_basis: string[];
  can_merge: boolean;
  candidates: DuplicateCandidateItem[];
}

export interface CandidateDuplicateResponse {
  groups: DuplicateCandidateGroup[];
  total_groups: number;
}

export interface CandidateMergeResult {
  primary_candidate_id: number;
  primary_candidate_name: string;
  merged_candidate_ids: number[];
  merged_count: number;
  reason: string;
}
