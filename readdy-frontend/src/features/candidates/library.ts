import type { BusinessReviewTask } from '@/features/businessReviews/types';
import type { CandidateListItem, CandidateStage, ParseStatus, PipelineState } from './types';

export type PipelineStateFilter = '' | Exclude<PipelineState, 'in_pipeline'>;
export type CandidateLibraryScope = 'all' | 'in_pipeline' | 'talent_pool' | 'favorite';

export const candidateStageOptions: CandidateStage[] = [
  'pending',
  'ai_screen',
  'business_review',
  'interview',
  'offer',
  'onboarded',
  'rejected',
  'transferred',
];

export const activeCandidateStageOptions: CandidateStage[] = [
  'pending',
  'ai_screen',
  'business_review',
  'interview',
  'offer',
];

export const candidateScopeTabs: ReadonlyArray<{ key: CandidateLibraryScope; label: string }> = [
  { key: 'all', label: '全部候选人' },
  { key: 'in_pipeline', label: '招聘流程中' },
  { key: 'talent_pool', label: '公司人才库' },
  { key: 'favorite', label: '我的收藏' },
];

export function isCandidateStage(value: string): value is CandidateStage {
  return candidateStageOptions.some((stage) => stage === value);
}

export function isParseStatus(value: string): value is ParseStatus {
  return value === 'pending' || value === 'processing' || value === 'ok' || value === 'failed' || value === 'original_confirmed';
}

export function candidateResumeReady(candidate: CandidateListItem) {
  return candidate.parse_status === 'ok' || candidate.parse_status === 'original_confirmed';
}

export function isPipelineStateFilter(value: string): value is Exclude<PipelineStateFilter, ''> {
  return value === 'never_entered' || value === 'rejected' || value === 'onboarded' || value === 'transferred';
}

export function positiveSearchId(value: string | null) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function positiveSearchPage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function initialCandidateScope(value: string | null): CandidateLibraryScope {
  if (value === 'in_pipeline' || value === 'talent_pool' || value === 'favorite') return value;
  return 'all';
}

export function setCandidateSearchParam(
  params: URLSearchParams,
  key: string,
  value: string,
  defaultValue = '',
) {
  if (!value || value === defaultValue) params.delete(key);
  else params.set(key, value);
}

export function candidateFromReviewTask(task: BusinessReviewTask): CandidateListItem {
  const parseStatus = isParseStatus(task.candidate.parse_status)
    ? task.candidate.parse_status
    : 'pending';
  return {
    id: task.candidate_id,
    name_masked: task.candidate.name_masked,
    owner_hr_id: task.demand.owner_hr_id,
    current_demand_id: task.demand_id,
    latest_demand_id: task.demand_id,
    is_favorite: false,
    identical_resume_count: 0,
    same_name_count: 0,
    is_local_demo_record: false,
    created_at: task.created_at,
    parse_status: parseStatus,
    tag_count: 0,
    current_stage: task.candidate.current_stage || 'business_review',
    pipeline_state: 'in_pipeline',
    has_rejected_history: false,
  };
}

export interface InterviewerApiItem {
  id: number;
  name: string;
  email: string;
  role: string;
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
}

export function isBusinessReviewer(
  item: InterviewerApiItem,
): item is InterviewerApiItem & { role: 'interviewer' | 'manager' } {
  return item.role === 'interviewer' || item.role === 'manager';
}

export function belongsToSourceFile(resultFile: string, sourceFile: string) {
  return resultFile === sourceFile || resultFile.startsWith(`${sourceFile} →`);
}

export interface CandidateNavigationState {
  fromJobs?: boolean;
  fromDashboard?: boolean;
  jobTitle?: string;
  demandId?: number;
  targetStage?: string;
  openUpload?: boolean;
}

export function isCandidateNavigationState(value: unknown): value is CandidateNavigationState {
  if (typeof value !== 'object' || value === null) return false;
  if ('fromJobs' in value && typeof value.fromJobs !== 'boolean') return false;
  if ('fromDashboard' in value && typeof value.fromDashboard !== 'boolean') return false;
  if ('jobTitle' in value && typeof value.jobTitle !== 'string') return false;
  if (
    'demandId' in value
    && value.demandId !== undefined
    && (!Number.isInteger(value.demandId) || Number(value.demandId) <= 0)
  ) return false;
  if ('targetStage' in value && typeof value.targetStage !== 'string') return false;
  if ('openUpload' in value && typeof value.openUpload !== 'boolean') return false;
  return true;
}

export function candidateStageFromNavigation(value: string | undefined): '' | CandidateStage {
  if (!value || value === 'all') return '';
  if (value === 'feedback') return 'business_review';
  return isCandidateStage(value) ? value : '';
}
