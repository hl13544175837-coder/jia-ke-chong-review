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

export function buildDashboardSummary(facts: DashboardFacts, role?: string | null) {
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
  const scheduledInterviews = facts.interviews.filter((item) => item.assignment_status === 'scheduled');
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
    myOfferActions,
    waitingOfferActions,
    myTaskCount: pendingApprovals.length + completionDemands.length + myOfferActions.length,
    waitingOthersCount: pendingReviews.length + waitingFeedback.length + waitingOfferActions.length,
  };
}
