import type { DemandStatus, RecruitmentDemand, RequisitionRow } from './types';

export const demandStatusLabels: Record<DemandStatus, string> = {
  pending: '需求待确认',
  active: '招聘中',
  paused: '已暂停',
  filled: '已完成',
  cancelled: '已取消',
  closed: '已关闭',
};

const priorityLabels = { A: '紧急', B: '高', C: '普通' } as const;

export function toRequisitionRow(demand: RecruitmentDemand): RequisitionRow {
  const statusNote = demand.metrics.over_headcount > 0
    ? `已超出 HC ${demand.metrics.over_headcount} 人，请核对历史记录`
    : demand.completion_suggested
      ? 'HC 已达成，待确认完成'
      : demand.metrics.accepted_offer_count > 0 && demand.metrics.remaining_headcount === 0
        ? '名额已锁定，等待入职'
        : '';
  return {
    id: String(demand.id),
    name: demand.job_title,
    title: demand.job_title,
    department: demand.job_department || demand.requester_department,
    city: demand.job_city,
    owner: demand.owner_hr_name || `招聘专员 #${demand.owner_hr_id}`,
    ownerId: String(demand.owner_hr_id),
    headcount: demand.headcount,
    filled: demand.metrics.onboarded_count,
    acceptedOffers: demand.metrics.accepted_offer_count,
    remainingHeadcount: demand.metrics.remaining_headcount,
    overHeadcount: demand.metrics.over_headcount,
    deadline: demand.target_date,
    startDate: demand.requested_at,
    status: demandStatusLabels[demand.status],
    statusCode: demand.status,
    stageAll: demand.metrics.recommended_count,
    stageFeedback: demand.metrics.business_review_count,
    stageInterview: demand.metrics.interview_count,
    stageOffer: demand.metrics.offer_count,
    statusNote,
    priority: priorityLabels[demand.priority] ?? '普通',
    createdAt: (demand.created_at || demand.requested_at || '').slice(0, 10),
    source: demand,
  };
}
