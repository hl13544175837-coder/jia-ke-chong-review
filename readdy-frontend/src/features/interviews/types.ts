import type { OriginalResumeInfo } from '@/features/businessReviews/types';

export type Satisfaction = 'pass' | 'fail' | 'satisfied' | 'unsatisfied' | 'pending';
export type JobMatch = 'high' | 'medium' | 'low';
export type InterviewRecommendation = 'next_round' | 'offer' | 'hold' | 'reject';
export type InterviewRescheduleStatus = 'pending' | 'approved' | 'rejected' | 'waiting_reassignment' | 'resolved';

export interface InterviewRescheduleRequest {
  id: number;
  assignment_id: number;
  replacement_assignment_id: number | null;
  candidate_id: number;
  job_id: number;
  demand_id: number;
  round: string;
  round_sequence: number;
  source: 'interviewer_request' | 'recruiter_direct';
  status: InterviewRescheduleStatus;
  requested_by: number;
  requester_name: string | null;
  requested_at: string | null;
  reason: string;
  proposed_times: string[];
  original_interviewer_id: number;
  original_interviewer_name: string | null;
  original_scheduled_at: string | null;
  original_location: string;
  final_interviewer_id: number | null;
  final_interviewer_name: string | null;
  final_scheduled_at: string | null;
  final_location: string;
  processed_by: number | null;
  processor_name: string | null;
  processed_at: string | null;
  processor_note: string;
}

export interface InterviewRescheduleRequestInput {
  reason: string;
  proposed_times: string[];
}

export interface InterviewRescheduleProcessInput {
  action: 'approve' | 'reject' | 'cancel_and_wait';
  interviewer_id?: number;
  scheduled_at?: string;
  location?: string;
  note?: string;
  processor_note?: string;
}

export interface InterviewReplacementInput {
  interviewer_id: number;
  scheduled_at: string;
  location: string;
  note: string;
}

export interface StructuredInterviewFeedbackValues {
  satisfaction: Satisfaction;
  job_match: JobMatch;
  recommendation: InterviewRecommendation;
  strengths: string;
  concerns: string;
  note: string;
}

export interface InterviewManagementRow {
  candidate_id: number;
  name_masked: string;
  demand_id: number;
  job_id: number;
  job_title: string;
  job_city: string;
  job_department: string;
  pipeline_stage: string;
  round: string | null;
  round_sequence: number | null;
  assignment_id: number | null;
  is_primary: boolean | null;
  interviewer_id: number | null;
  interviewer_name: string | null;
  scheduled_at: string | null;
  location: string;
  note: string;
  assignment_status: string;
  feedback_id: number | null;
  feedback_submitted: boolean;
  feedback_score: number | null;
  feedback_passed: boolean | null;
  feedback_result: 'passed' | 'not_passed' | 'pending' | null;
  disposition_reason: string;
  enter_talent_pool: boolean | null;
  reschedule_request?: InterviewRescheduleRequest;
}

export interface InterviewerOption {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface InterviewAssignmentInput {
  candidate_id: number;
  demand_id: number;
  round: string;
  round_sequence: number;
  interviewer_id: number;
  scheduled_at: string | null;
  location: string;
  note: string;
  is_primary: boolean;
}

export interface InterviewAssignmentUpdateInput {
  interviewer_id: number;
  scheduled_at: string | null;
  location: string;
  note: string;
  change_reason: string;
}

export interface InterviewAssignment {
  id: number;
  candidate_id: number;
  name_masked: string | null;
  job_id: number;
  demand_id: number | null;
  job_title: string | null;
  job_city: string;
  job_department: string;
  pipeline_stage: string | null;
  round: string;
  round_sequence: number;
  is_primary: boolean;
  interviewer_id: number;
  interviewer_name: string | null;
  scheduled_at: string | null;
  location: string;
  note: string;
  status: string;
  feedback_submitted: boolean;
  is_overdue: boolean;
  created_by_name: string | null;
  created_at: string | null;
  jd_text?: string;
  focus_points?: string[];
  original_resume?: OriginalResumeInfo;
  pending_reschedule?: InterviewRescheduleRequest;
  reschedule_history?: InterviewRescheduleRequest[];
}

export interface InterviewFeedback {
  id: number;
  candidate_id: number;
  job_id: number;
  demand_id: number | null;
  assignment_id: number | null;
  round: string;
  interviewer_id: number;
  interviewer_name: string | null;
  satisfaction: Satisfaction | null;
  evaluation: Record<string, unknown>;
  strengths: string;
  concerns: string;
  note: string;
  created_at: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

export interface InterviewFeedbackInput extends StructuredInterviewFeedbackValues {
  assignment_id: number;
}

export type InterviewFeedbackUpdateInput = StructuredInterviewFeedbackValues;

export interface InterviewFeedbackMutationResult {
  id: number;
  satisfaction: Satisfaction | null;
  job_match: JobMatch | '';
  recommendation: InterviewRecommendation | '';
  strengths: string;
  concerns: string;
  note: string;
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: string | null;
  status?: string;
  deduplicated?: boolean;
  round_completed?: boolean;
  next_action?: string;
}
