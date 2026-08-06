import type { StatusPresentation } from './recruitmentPresentation';

/**
 * 候选人招聘流程阶段统一展示映射。
 * 全站（候选人库、招聘需求、面试管理、看板）阶段名称与颜色以此为唯一真源，
 * 任何页面不得再各自定义阶段名或颜色。
 */
export const candidateStagePresentation: Record<string, StatusPresentation> = {
  pending: { label: 'HR 初筛', tone: 'pending' },
  ai_screen: { label: 'AI 筛选', tone: 'info' },
  business_review: { label: '业务筛选', tone: 'pending' },
  interview: { label: '面试中', tone: 'info' },
  offer: { label: 'Offer', tone: 'info' },
  onboarded: { label: '已入职', tone: 'success' },
  rejected: { label: '已淘汰', tone: 'danger' },
  transferred: { label: '已转需求', tone: 'neutral' },
};

export function candidateStageLabel(stage?: string | null): string {
  if (!stage) return '未知阶段';
  return candidateStagePresentation[stage]?.label ?? stage;
}
