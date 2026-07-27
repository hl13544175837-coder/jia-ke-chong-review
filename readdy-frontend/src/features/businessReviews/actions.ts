import type { CandidateStage } from '@/features/candidates/types';
import type { BusinessReviewTask } from './types';

export type CandidateBusinessActionKind =
  | 'join_and_push'
  | 'push'
  | 'waiting'
  | 'schedule_interview'
  | 'needs_info'
  | 'rejected'
  | 'later_stage';

export interface CandidateBusinessActionInput {
  currentDemandId: number | null;
  currentStage: CandidateStage | null;
  pendingTask?: BusinessReviewTask | null;
  latestTask?: BusinessReviewTask | null;
}

export interface CandidateBusinessAction {
  kind: CandidateBusinessActionKind;
  label: string;
  secondaryLabel?: string;
}

const laterStageLabels: Partial<Record<CandidateStage, string>> = {
  interview: '查看/调整面试',
  offer: '查看 Offer',
  onboarded: '已入职，流程已完成',
  rejected: '已淘汰，流程已结束',
  transferred: '已转至其他招聘需求',
};

export function candidateBusinessAction(
  input: CandidateBusinessActionInput,
): CandidateBusinessAction {
  if (!input.currentDemandId) {
    return { kind: 'join_and_push', label: '加入当前需求并推送业务筛选' };
  }
  const laterStageLabel = input.currentStage ? laterStageLabels[input.currentStage] : null;
  if (laterStageLabel) return { kind: 'later_stage', label: laterStageLabel };
  if (input.pendingTask) {
    return {
      kind: 'waiting',
      label: `等待「${input.pendingTask.reviewer_name || '业务筛选人'}」反馈`,
      secondaryLabel: '改派筛选人',
    };
  }
  if (input.latestTask?.status === 'approved') {
    return { kind: 'schedule_interview', label: '安排正式面试' };
  }
  if (input.latestTask?.status === 'needs_info') {
    return { kind: 'needs_info', label: '补充并再次推送' };
  }
  if (input.latestTask?.status === 'rejected') {
    return { kind: 'rejected', label: '去流程处理' };
  }
  return { kind: 'push', label: '推送业务筛选' };
}
