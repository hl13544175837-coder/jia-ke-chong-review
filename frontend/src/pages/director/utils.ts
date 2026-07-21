// Shared constants and formatters for the Readdy analytics/director graft.
// Pure helpers only (no components) so React fast-refresh stays clean.

import type { BiOperationalFunnel, DemandStatus } from '../../types';

export const DIRECTOR_PURPOSE_LABEL =
  '仅用于进度、瓶颈和当前责任协同，不用于绩效考核';

export const DEMAND_STATUS_LABELS: Record<string, string> = {
  pending: '待启动',
  active: '招聘中',
  paused: '已暂停',
  filled: '已完成',
  cancelled: '已取消',
  closed: '已关闭',
};

export function demandStatusLabel(status: DemandStatus | string): string {
  return DEMAND_STATUS_LABELS[status] ?? status;
}

export function demandStatusTone(
  status: string,
): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'active') return 'success';
  if (status === 'pending' || status === 'paused') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

export const OVERVIEW_FUNNEL_STAGES = [
  { key: 'pending', label: '待筛选' },
  { key: 'ai_screen', label: 'AI 初筛' },
  { key: 'business_review', label: '业务待反馈' },
  { key: 'interview', label: '面试中' },
  { key: 'offer', label: 'Offer' },
  { key: 'onboarded', label: '已入职' },
] as const;

export type OverviewFunnelStageKey =
  (typeof OVERVIEW_FUNNEL_STAGES)[number]['key'];

export function funnelStageCount(
  funnel: BiOperationalFunnel,
  stage: OverviewFunnelStageKey,
): number {
  const value = funnel[stage];
  return Number.isFinite(value) ? value : 0;
}

export function safeNum(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '未设置';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function alertKindLabel(kind: string): string {
  if (kind === 'stale_pipeline') return '流程卡住';
  if (kind === 'pending_interview_feedback') return '反馈待补';
  if (kind === 'business_feedback_overdue') return '业务反馈超时';
  if (kind === 'business_feedback_pending') return '业务待反馈';
  if (kind === 'demand_overdue') return '需求逾期';
  if (kind === 'hr_no_recommendation') return '尚未推荐';
  if (kind === 'no_active_candidates') return '当前无在流程候选人';
  if (kind === 'hc_completion_suggested') return 'HC 已满足';
  return '待处理';
}

export function alertTone(priority: string): 'danger' | 'warning' | 'neutral' {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'neutral';
}
