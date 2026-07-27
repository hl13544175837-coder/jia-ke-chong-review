import type { BusinessReviewTask } from '@/features/businessReviews/types';
import type { RecruitmentDemand } from '@/features/demands/types';
import type { InterviewManagementRow } from '@/features/interviews/types';
import type { OfferRecord, OfferStatus } from '@/features/offers/types';

export interface DashboardFacts {
  demands: RecruitmentDemand[];
  interviews: InterviewManagementRow[];
  offers: OfferRecord[];
  reviews: BusinessReviewTask[];
}

const recruiterOfferActions = new Set<OfferStatus>(['draft', 'approved', 'accepted']);
const recruiterWaitingOffers = new Set<OfferStatus>(['pending', 'sent']);
const managerOfferActions = new Set<OfferStatus>(['pending']);
const managerWaitingOffers = new Set<OfferStatus>(['draft', 'approved', 'sent', 'accepted']);
const demandRiskLabels: Record<string, string> = {
  overdue: '已超过期望完成日期',
  business_feedback_pending: '有候选人等待业务反馈',
  low_interview_conversion: '推荐较多但尚未进入面试',
  open_too_long: '需求开放时间较长',
  hr_no_recommendation: '需求接收后尚未推荐候选人',
  no_active_candidates: '当前没有仍在推进的候选人',
};

export type DemandRiskLevel = 'high' | 'medium' | 'low';

export interface DashboardDemandRisk {
  level: DemandRiskLevel;
  label: string;
  rank: number;
}

function interviewDate(value: string | null | undefined) {
  if (!value) return null;
  const hasExplicitZone = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
  const parsed = new Date(hasExplicitZone ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localDateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function targetDaysLeft(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const target = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

export function dashboardDemandRisk(demand: RecruitmentDemand, now = new Date()): DashboardDemandRisk {
  const overHeadcount = demand.metrics.over_headcount ?? 0;
  if (overHeadcount > 0) return { level: 'high', label: `超出 HC ${overHeadcount} 人`, rank: 50 };
  if ((demand.risk_flags?.length ?? 0) > 0) {
    return {
      level: 'high',
      label: demandRiskLabels[demand.risk_flags[0]] ?? '存在待核实的招聘卡点',
      rank: 45,
    };
  }

  const daysLeft = targetDaysLeft(demand.target_date, now);
  const remaining = demand.metrics.remaining_headcount ?? 0;
  if (remaining > 0 && daysLeft !== null && daysLeft < 0) {
    return { level: 'high', label: `已逾期 ${Math.abs(daysLeft)} 天`, rank: 44 };
  }
  if (remaining > 0 && daysLeft !== null && daysLeft <= 7) {
    return { level: 'high', label: `距截止 ${Math.max(0, daysLeft)} 天`, rank: 40 };
  }
  if (demand.completion_suggested) return { level: 'medium', label: 'HC 已达成，待确认', rank: 30 };
  if (remaining > 0 && daysLeft !== null && daysLeft <= 30) {
    return { level: 'medium', label: `距截止 ${daysLeft} 天`, rank: 20 };
  }
  return { level: 'low', label: '进展正常', rank: 10 };
}

function dashboardDemandNextAction(demand: RecruitmentDemand) {
  if ((demand.metrics.over_headcount ?? 0) > 0 || demand.completion_suggested) return '核对需求';
  if ((demand.metrics.business_review_count ?? 0) > 0) return '跟进反馈';
  if ((demand.metrics.interview_count ?? 0) > 0) return '管理面试';
  if ((demand.metrics.offer_count ?? 0) > 0) return '推进 Offer';
  if ((demand.metrics.remaining_headcount ?? 0) > 0) return '筛选候选人';
  return '查看详情';
}

export function buildDashboardSummary(
  facts: DashboardFacts,
  role?: string | null,
  now = new Date(),
) {
  const activeDemands = facts.demands.filter((item) => item.status === 'active');
  const gap = activeDemands.reduce(
    (total, item) => total + item.metrics.remaining_headcount,
    0,
  );
  const pendingApprovals = facts.demands.filter((item) => item.approval_status === 'pending');
  const completionDemands = activeDemands.filter((item) => (
    item.completion_suggested || item.metrics.over_headcount > 0
  ));
  const pendingReviews = facts.reviews.filter((item) => item.status === 'pending');
  const waitingFeedback = facts.interviews.filter((item) => (
    item.assignment_status === 'awaiting_feedback' && !item.feedback_submitted
  ));
  const scheduledInterviews = facts.interviews
    .filter((item) => item.assignment_status === 'scheduled')
    .sort((left, right) => (
      (interviewDate(left.scheduled_at)?.getTime() ?? Number.MAX_SAFE_INTEGER)
      - (interviewDate(right.scheduled_at)?.getTime() ?? Number.MAX_SAFE_INTEGER)
    ));
  const todayKey = localDateKey(now);
  const todayInterviews = scheduledInterviews.filter((item) => {
    const date = interviewDate(item.scheduled_at);
    return date ? localDateKey(date) === todayKey : false;
  });
  const overdueFeedback = waitingFeedback.filter((item) => {
    const date = interviewDate(item.scheduled_at);
    return date ? date.getTime() < now.getTime() : false;
  });
  const stageSummary = activeDemands.reduce((total, demand) => {
    const currentStages = demand.metrics.current_stage_counts ?? {};
    total.screening += (currentStages.pending ?? 0) + (currentStages.ai_screen ?? 0);
    total.businessReview += demand.metrics.business_review_count ?? 0;
    total.interview += demand.metrics.interview_count ?? 0;
    total.offer += demand.metrics.offer_count ?? 0;
    total.onboarding += demand.metrics.accepted_offer_count ?? 0;
    return total;
  }, { screening: 0, businessReview: 0, interview: 0, offer: 0, onboarding: 0 });
  const demandProgress = activeDemands
    .map((demand) => ({
      demand,
      risk: dashboardDemandRisk(demand, now),
      nextAction: dashboardDemandNextAction(demand),
    }))
    .sort((left, right) => right.risk.rank - left.risk.rank);
  const managerView = role === 'manager' || role === 'admin';
  const ownStatuses = managerView ? managerOfferActions : recruiterOfferActions;
  const waitingStatuses = managerView ? managerWaitingOffers : recruiterWaitingOffers;
  const myOfferActions = facts.offers.filter((item) => ownStatuses.has(item.status));
  const waitingOfferActions = facts.offers.filter((item) => waitingStatuses.has(item.status));

  return {
    activeDemands,
    gap,
    pendingApprovals,
    completionDemands,
    pendingReviews,
    waitingFeedback,
    scheduledInterviews,
    todayInterviews,
    overdueFeedback,
    stageSummary,
    demandProgress,
    myOfferActions,
    waitingOfferActions,
    myTaskCount: pendingApprovals.length + completionDemands.length + myOfferActions.length,
    waitingOthersCount: pendingReviews.length + waitingFeedback.length + waitingOfferActions.length,
  };
}
