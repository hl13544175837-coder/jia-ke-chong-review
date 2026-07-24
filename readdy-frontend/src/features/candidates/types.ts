import type { OriginalResumeInfo } from '@/features/businessReviews/types';

export type ParseStatus = 'pending' | 'processing' | 'ok' | 'failed';

export interface CandidateListItem {
  id: number;
  name_masked: string;
  email_masked?: string;
  phone_masked?: string;
  owner_hr_id: number | null;
  current_demand_id?: number | null;
  created_at: string;
  parse_status: ParseStatus;
  parse_error?: string | null;
  tag_count: number;
  current_stage?: string | null;
  education_summary?: string;
}

export interface CandidateListResponse {
  candidates: CandidateListItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface CandidateListQuery {
  search?: string;
  demand_id?: number;
  stage?: string;
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
}

export interface ResumeUploadResponse {
  batch_id: number;
  total: number;
  deduplicated?: boolean;
  results: Array<{
    file: string;
    status: string;
    reason?: string;
    candidate_id?: number;
    name_masked?: string;
  }>;
}

export interface ResumeUploadSource {
  target_demand_id: number;
  source_channel?: string;
  source_note?: string;
}
