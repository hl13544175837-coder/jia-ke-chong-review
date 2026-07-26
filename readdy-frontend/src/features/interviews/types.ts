import type { OriginalResumeInfo } from '@/features/businessReviews/types';

export type Satisfaction = 'satisfied' | 'pending' | 'unsatisfied';

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
  note: string;
  created_at: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

export interface InterviewFeedbackInput {
  assignment_id: number;
  satisfaction: Satisfaction;
  note: string;
}

export interface InterviewFeedbackUpdateInput {
  satisfaction: Satisfaction;
  note: string;
}

export interface InterviewFeedbackMutationResult {
  id: number;
  satisfaction: Satisfaction | null;
  note: string;
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: string | null;
  status?: string;
  deduplicated?: boolean;
  round_completed?: boolean;
  next_action?: string;
}
