export type DemandPriority = 'A' | 'B' | 'C';
export type DemandStatus = 'pending' | 'active' | 'paused' | 'filled' | 'cancelled' | 'closed';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface RecruitmentDemandMetrics {
  recommended_count: number;
  business_review_count: number;
  interview_count: number;
  offer_count: number;
  onboarded_count: number;
  accepted_offer_count: number;
  locked_headcount: number;
  remaining_headcount: number;
  over_headcount: number;
  transferred_count: number;
  current_stage_counts: Record<string, number>;
}

export interface RecruitmentDemand {
  id: number;
  job_id: number;
  job_title: string;
  job_city: string;
  job_department: string;
  job_code: string;
  owner_hr_id: number;
  owner_hr_name: string;
  request_no: string;
  requester_name: string;
  requester_department: string;
  hiring_manager_name: string;
  requested_at: string | null;
  accepted_at: string | null;
  target_date: string | null;
  priority: DemandPriority;
  headcount: number;
  status: DemandStatus;
  approval_status: ApprovalStatus;
  submitted_at: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_reason: string;
  created_by: number | null;
  default_interviewer_id?: number | null;
  close_reason: string;
  note: string;
  metrics: RecruitmentDemandMetrics;
  risk_flags: string[];
  completion_suggested: boolean;
  jd_text?: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface DemandListResponse {
  items: RecruitmentDemand[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface DemandOwnerOption {
  id: number;
  name: string;
  email: string;
}

export interface RecruitmentDemandInput {
  job_id?: number;
  job_title?: string;
  jd_text?: string;
  owner_hr_id: number;
  default_interviewer_id?: number | null;
  city: string;
  requester_department: string;
  hiring_manager_name: string;
  requested_at: string;
  target_date: string;
  priority: DemandPriority;
  headcount: number;
  status?: 'active' | 'pending';
  note?: string;
}

export type BusinessDemandInput = RecruitmentDemandInput & {
  focus_points?: string[];
};

export interface DemandUpdateInput {
  request_no?: string;
  jd_text?: string;
  requester_department: string;
  city: string;
  hiring_manager_name: string;
  requested_at: string;
  target_date: string;
  headcount: number;
  note?: string;
}

export interface RequisitionRow {
  id: string;
  name: string;
  title: string;
  department: string;
  city: string;
  owner: string;
  ownerId: string;
  headcount: number;
  filled: number;
  acceptedOffers: number;
  remainingHeadcount: number;
  overHeadcount: number;
  deadline: string | null;
  startDate: string | null;
  status: string;
  statusCode: DemandStatus;
  stageAll: number;
  stageFeedback: number;
  stageInterview: number;
  stageOffer: number;
  statusNote: string;
  priority: string;
  createdAt: string;
  source: RecruitmentDemand;
}
