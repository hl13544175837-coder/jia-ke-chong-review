import type { OriginalResumeInfo } from '@/features/businessReviews/types';

export type Satisfaction = 'satisfied' | 'pending' | 'unsatisfied';

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
