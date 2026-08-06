export type SemanticStatusTone = 'neutral' | 'pending' | 'info' | 'success' | 'danger';

export const statusToneClasses: Record<SemanticStatusTone, string> = {
  neutral: 'border-background-300 bg-background-100 text-foreground-600',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
};

export interface StatusPresentation {
  label: string;
  tone: SemanticStatusTone;
}

const fallback: StatusPresentation = { label: '状态未知', tone: 'neutral' };

export const demandStatusPresentation: Record<string, StatusPresentation> = {
  pending: { label: '需求待确认', tone: 'pending' },
  active: { label: '招聘中', tone: 'info' },
  paused: { label: '已暂停', tone: 'pending' },
  filled: { label: '已完成', tone: 'success' },
  cancelled: { label: '已取消', tone: 'neutral' },
  closed: { label: '已关闭', tone: 'neutral' },
  rejected: { label: '未通过', tone: 'danger' },
  approved: { label: '已通过', tone: 'success' },
};

export const businessReviewStatusPresentation: Record<string, StatusPresentation> = {
  pending: { label: '待筛选', tone: 'pending' },
  approved: { label: '已通过', tone: 'success' },
  rejected: { label: '不合适', tone: 'danger' },
  needs_info: { label: '需补充信息', tone: 'pending' },
};

export const interviewStatusPresentation: Record<string, StatusPresentation> = {
  unassigned: { label: '待安排', tone: 'pending' },
  scheduled: { label: '已安排', tone: 'info' },
  awaiting_feedback: { label: '待反馈', tone: 'pending' },
  feedback_submitted: { label: '评价已提交', tone: 'pending' },
  completed: { label: '已完成', tone: 'success' },
  cancelled: { label: '已取消', tone: 'neutral' },
};

export const offerStatusPresentation: Record<string, StatusPresentation> = {
  draft: { label: '草稿', tone: 'neutral' },
  pending: { label: '待确认', tone: 'pending' },
  approved: { label: '待发放', tone: 'info' },
  rejected: { label: '已退回修改', tone: 'danger' },
  sent: { label: '待回复', tone: 'info' },
  accepted: { label: '待入职', tone: 'success' },
  declined: { label: '已拒绝', tone: 'danger' },
  withdrawn: { label: '已撤回', tone: 'neutral' },
  expired: { label: '已过期', tone: 'danger' },
  onboarded: { label: '已入职', tone: 'success' },
};

export function statusPresentation(
  presentations: Record<string, StatusPresentation>,
  status: string,
  label?: string,
): StatusPresentation {
  const matched = presentations[status];
  if (matched) return label && label !== matched.label ? { ...matched, label } : matched;
  return { ...fallback, label: label || status || fallback.label };
}
