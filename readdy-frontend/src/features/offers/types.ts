export const OFFER_STATUSES = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'sent',
  'accepted',
  'declined',
  'withdrawn',
  'expired',
  'onboarded',
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];

export type OfferAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'send'
  | 'accept'
  | 'decline'
  | 'withdraw'
  | 'expire'
  | 'onboard'
  | 'resend'
  | 'follow_up';

export interface OfferHistoryItem {
  id: number;
  action: string;
  from_status: OfferStatus;
  to_status: OfferStatus;
  actor_id: number | null;
  actor_name: string | null;
  comment: string;
  detail: Record<string, unknown>;
  created_at: string | null;
}

export interface OfferRecord {
  id: number;
  candidate_id: number;
  demand_id: number;
  job_id: number;
  candidate_name: string;
  position: string;
  department: string;
  request_no: string;
  salary_range: string;
  onboard_date: string | null;
  source_channel: string;
  recruitment_days: number | null;
  approval_status: OfferStatus;
  status: OfferStatus;
  note: string;
  approver_id: number | null;
  approver_name: string | null;
  created_by: number | null;
  created_by_name: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  responded_at: string | null;
  withdrawn_at: string | null;
  expires_at: string | null;
  onboarded_at: string | null;
  rejection_reason: string;
  version: number;
  created_at: string | null;
  updated_at: string | null;
  history: OfferHistoryItem[];
}

export type OfferOaStatus = 'not_started' | 'pending' | 'approved' | 'rejected' | 'completed';

export interface OfferWorkbenchRecord extends Omit<OfferRecord, 'id'> {
  id: number | null;
  oa_instance_no: string;
  oa_status: OfferOaStatus;
  oa_note: string;
  oa_updated_at: string | null;
  completed_interview_rounds: number;
}

export interface OfferOaRegistrationInput {
  oa_instance_no: string;
  oa_status: Exclude<OfferOaStatus, 'not_started'>;
  note: string;
}

export interface OfferListResponse {
  items: OfferRecord[];
  total: number;
  unmapped_total: number;
}

export interface OfferWorkbenchResponse {
  items: OfferWorkbenchRecord[];
  total: number;
  unmapped_total: number;
}

export interface OfferDraftInput {
  salary_range: string;
  onboard_date: string | null;
  note: string;
  salary_breakdown?: Array<Record<string, unknown>>;
}

export interface OfferActionInput {
  action: OfferAction;
  comment?: string;
  expires_at?: string;
  onboard_date?: string;
  channel?: string;
}
