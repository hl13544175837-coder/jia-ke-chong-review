import { candidateBusinessAction } from '@/features/businessReviews/actions';
import type { BusinessReviewTask } from '@/features/businessReviews/types';
import type {
  CandidateListItem,
  CandidateListResponse,
  CandidateMatchResult,
  CandidatePipelineAddResult,
  CandidateStage,
  ParseStatus,
} from '@/features/candidates/types';

export type OperationFilter = 'all' | 'actionable' | 'pushable';
export type SortOption = 'created_desc' | 'created_asc' | 'name_asc';

export const PER_PAGE = 20;
export const emptyCandidateResponse: CandidateListResponse = {
  candidates: [],
  total: 0,
  page: 1,
  per_page: PER_PAGE,
  pages: 1,
};

export const stageOptions: Array<{ value: '' | CandidateStage; label: string }> = [
  { value: '', label: '全部流程阶段' },
  { value: 'pending', label: '待初筛' },
  { value: 'ai_screen', label: 'AI 初筛' },
  { value: 'business_review', label: '业务筛选' },
  { value: 'interview', label: '面试中' },
  { value: 'offer', label: 'Offer' },
  { value: 'onboarded', label: '已入职' },
  { value: 'rejected', label: '已淘汰' },
  { value: 'transferred', label: '已转入其他需求' },
];

export const parseStatusOptions: Array<{ value: '' | ParseStatus; label: string }> = [
  { value: '', label: '全部解析状态' },
  { value: 'pending', label: '待解析' },
  { value: 'processing', label: '解析中' },
  { value: 'ok', label: '已解析' },
  { value: 'failed', label: '待确认' },
  { value: 'original_confirmed', label: '原件已确认' },
];

export function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function candidateStatus(
  candidate: CandidateListItem,
  demandId: number,
  match?: CandidateMatchResult,
  tasks: BusinessReviewTask[] = [],
) {
  if (['pending', 'processing', 'failed'].includes(candidate.parse_status)) {
    return {
      label: candidate.parse_status === 'failed' ? '简历待确认' : '简历解析中',
      selectable: false,
      action: 'blocked' as const,
      task: null,
      tone: 'text-amber-700 bg-amber-50',
    };
  }
  if (candidate.current_demand_id === demandId) {
    const demandTasks = tasks.filter((task) => (
      task.candidate_id === candidate.id && task.demand_id === demandId
    ));
    const pendingTask = demandTasks.find((task) => task.status === 'pending') ?? null;
    const action = candidateBusinessAction({
      currentDemandId: demandId,
      currentStage: match?.latest_stage || candidate.current_stage,
      pendingTask,
      latestTask: demandTasks[0] ?? null,
    });
    if (action.kind === 'waiting') {
      return {
        label: action.label,
        selectable: true,
        action: 'reassign' as const,
        task: pendingTask,
        tone: 'text-amber-700 bg-amber-50',
      };
    }
    if (action.kind === 'push' || action.kind === 'needs_info') {
      return {
        label: action.label,
        selectable: true,
        action: 'push' as const,
        task: null,
        tone: 'text-primary-700 bg-primary-50',
      };
    }
    return {
      label: action.label,
      selectable: false,
      action: 'blocked' as const,
      task: null,
      tone: 'text-foreground-600 bg-background-100',
    };
  }
  if (candidate.current_demand_id) {
    return {
      label: candidate.current_demand?.job_title
        ? `当前岗位：${candidate.current_demand.job_title}`
        : '其他需求流程中',
      selectable: true,
      action: 'transfer' as const,
      tone: 'text-amber-700 bg-amber-50',
    };
  }
  if (match?.latest_stage === 'rejected') {
    return {
      label: '当前需求曾淘汰',
      selectable: true,
      action: 'add' as const,
      tone: 'text-red-700 bg-red-50',
    };
  }
  if (match?.latest_stage) {
    return {
      label: '已有当前需求记录',
      selectable: false,
      action: 'blocked' as const,
      tone: 'text-foreground-600 bg-background-100',
    };
  }
  return {
    label: '可加入',
    selectable: true,
    action: 'add' as const,
    tone: 'text-emerald-700 bg-emerald-50',
  };
}

export function resultSummary(result: CandidatePipelineAddResult) {
  const successful = result.added + result.reactivated;
  if (successful === 0 && result.failures.length > 0) {
    return result.failures.map((item) => item.error).join('；');
  }
  const parts = [`成功加入 ${successful} 位`];
  if (result.skipped_existing) parts.push(`${result.skipped_existing} 位已存在`);
  if (result.skipped_conflict) parts.push(`${result.skipped_conflict} 位存在流程冲突`);
  return parts.join('，');
}
