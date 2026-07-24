export type PipelineStage =
  | 'pending'
  | 'ai_screen'
  | 'business_review'
  | 'interview'
  | 'offer'
  | 'onboarded'
  | 'rejected'
  | 'transferred';

export interface PipelineBoardCandidate {
  candidate_id: number;
  name_masked: string;
  stage: PipelineStage;
  updated_at: string | null;
  updated_by_name: string | null;
  note?: string | null;
}

export interface PipelineBoard {
  demand_id: number;
  job_id: number;
  job_title: string;
  stage_order: PipelineStage[];
  candidates: PipelineBoardCandidate[];
}

export interface PipelineHistoryStep {
  stage: PipelineStage;
  ts: string | null;
  updated_by_name: string | null;
  note?: string | null;
}

export interface PipelineHistory {
  job_id: number;
  candidate_id: number;
  timeline: PipelineHistoryStep[];
}

export interface MoveCandidateInput {
  candidate_id: number;
  stage: PipelineStage;
  note: string;
  disposition?: {
    reason: string;
    enter_talent_pool: boolean;
    note?: string;
  };
}
