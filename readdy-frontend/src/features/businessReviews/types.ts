export type BusinessReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_info';

export interface OriginalResumeInfo {
  available: boolean;
  filename: string | null;
  mime_type: string | null;
  preview_url: string;
  download_url: string;
}

export interface BusinessReviewCandidate {
  id: number;
  name_masked: string;
  resume_json: Record<string, unknown>;
  parse_status: string;
  original_resume: OriginalResumeInfo;
}

export interface BusinessReviewDemand {
  id: number;
  request_no: string;
  job_id: number;
  job_title: string;
  department: string;
  city: string;
  jd_text: string;
  focus_points: string[];
  owner_hr_id: number | null;
}

export interface BusinessReviewTask {
  id: number;
  org_id: number;
  demand_id: number;
  candidate_id: number;
  reviewer_id: number;
  reviewer_name: string | null;
  status: BusinessReviewStatus;
  hr_note: string;
  business_note: string;
  due_at: string | null;
  decided_by: number | null;
  decided_at: string | null;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  candidate: BusinessReviewCandidate;
  demand: BusinessReviewDemand;
}

export interface BusinessReviewListResponse {
  items: BusinessReviewTask[];
  total: number;
}

export interface CreateBusinessReviewInput {
  demand_id: number;
  candidate_id: number;
  reviewer_id: number;
  hr_note?: string;
  due_at?: string | null;
}

export interface BusinessReviewDecisionInput {
  decision: Exclude<BusinessReviewStatus, 'pending'>;
  note: string;
}
