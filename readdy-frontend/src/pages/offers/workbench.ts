import type { OfferOaStatus, OfferRecord, OfferStatus, OfferWorkbenchRecord } from '@/features/offers/types';

export type OfferWorkbenchTab =
  | 'pending_registration'
  | 'follow_up'
  | 'completed';

export type OfferRiskLevel = 'high' | 'medium' | 'low';
export type OfferRisk = { level: OfferRiskLevel; label: string; rank: number };
export type OfferOrder = 'urgent' | 'updated' | 'onboard';

export interface OfferWorkbenchInput {
  items: OfferWorkbenchRecord[];
  tab: OfferWorkbenchTab;
  search: string;
  demand: string;
  owner: string;
  risk: '' | OfferRiskLevel;
  order: OfferOrder;
  recentDays?: number;
  now?: Date;
}

export const OFFER_WORKBENCH_TABS: Array<{ key: OfferWorkbenchTab; label: string }> = [
  { key: 'pending_registration', label: '待登记' },
  { key: 'follow_up', label: '跟进中' },
  { key: 'completed', label: '已完成' },
];

export function clearOfferCandidateSelection(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.delete('candidate');
  return next;
}

const historyStatuses = new Set<OfferStatus>(['declined', 'withdrawn', 'expired', 'onboarded']);

const statusLabels: Record<OfferStatus, string> = {
  draft: '草稿',
  pending: '待确认',
  approved: '待发放',
  rejected: '已退回修改',
  sent: '待回复',
  accepted: '待入职',
  declined: '已拒绝',
  withdrawn: '已撤回',
  expired: '已过期',
  onboarded: '已入职',
};

const primaryActions: Record<OfferStatus, string> = {
  draft: '继续编辑',
  pending: '确认 Offer',
  approved: '登记发放',
  rejected: '修改后重提',
  sent: '登记候选人回复',
  accepted: '确认入职',
  declined: '查看记录',
  withdrawn: '查看记录',
  expired: '查看记录',
  onboarded: '查看记录',
};

function parsedTime(value: string | null | undefined) {
  if (!value) return null;
  const explicitZone = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
  const parsed = new Date(explicitZone ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calendarDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function elapsedDays(value: string | null | undefined, now: Date) {
  const parsed = parsedTime(value);
  if (!parsed) return 0;
  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 86_400_000));
}

function daysUntil(value: string | null | undefined, now: Date) {
  const parsed = calendarDate(value);
  if (!parsed) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((parsed.getTime() - today.getTime()) / 86_400_000);
}

function updateTime(offer: OfferRecord) {
  return parsedTime(offer.updated_at || offer.created_at)?.getTime() ?? 0;
}

export function offerStatusLabel(status: OfferStatus) {
  return statusLabels[status];
}

export function offerPrimaryAction(status: OfferStatus) {
  return primaryActions[status];
}

export function offerWaitingLabel(offer: OfferRecord, now = new Date()) {
  const startedAt = offer.status === 'pending'
    ? offer.submitted_at
    : offer.status === 'approved'
      ? offer.approved_at
      : offer.status === 'sent'
        ? offer.sent_at
        : offer.status === 'accepted'
          ? offer.responded_at
          : offer.updated_at || offer.created_at;
  const days = elapsedDays(startedAt, now);
  return days === 0 ? '今天进入' : `已等待 ${days} 天`;
}

export function offerRisk(offer: OfferRecord, now = new Date()): OfferRisk {
  if (offer.status === 'expired') return { level: 'high', label: '已过期', rank: 120 };
  if (offer.status === 'sent') {
    const expiresIn = daysUntil(offer.expires_at, now);
    const waiting = elapsedDays(offer.sent_at || offer.updated_at, now);
    if (expiresIn !== null && expiresIn <= 0) return { level: 'high', label: '今天到期', rank: 115 };
    if (expiresIn !== null && expiresIn <= 2) return { level: 'high', label: `${expiresIn} 天后到期`, rank: 110 };
    if (waiting >= 3) return { level: 'high', label: `已 ${waiting} 天未回复`, rank: 100 + Math.min(waiting, 9) };
    return { level: 'low', label: '等待候选人回复', rank: 35 };
  }
  if (offer.status === 'pending') {
    const waiting = elapsedDays(offer.submitted_at || offer.updated_at, now);
    if (waiting >= 1) return { level: 'high', label: `待确认 ${waiting} 天`, rank: 90 + Math.min(waiting, 9) };
    return { level: 'medium', label: '今天待确认', rank: 65 };
  }
  if (offer.status === 'accepted') {
    const onboardIn = daysUntil(offer.onboard_date, now);
    if (onboardIn !== null && onboardIn < 0) return { level: 'high', label: `已逾期 ${Math.abs(onboardIn)} 天入职`, rank: 105 };
    if (onboardIn !== null && onboardIn <= 3) return { level: 'medium', label: `${onboardIn} 天后入职`, rank: 75 };
    return { level: 'low', label: '等待入职', rank: 30 };
  }
  if (offer.status === 'approved') return { level: 'medium', label: '待登记发放', rank: 60 };
  if (offer.status === 'rejected') return { level: 'high', label: '经理已退回', rank: 95 };
  if (offer.status === 'draft') return { level: 'low', label: '草稿待完善', rank: 40 };
  return { level: 'low', label: offerStatusLabel(offer.status), rank: 0 };
}

export function isTodayOfferTask(offer: OfferRecord, now = new Date()) {
  if (offer.status === 'draft' || offer.status === 'rejected' || offer.status === 'pending' || offer.status === 'approved') return true;
  if (offer.status === 'sent') return offerRisk(offer, now).level !== 'low';
  if (offer.status === 'accepted') {
    const onboardIn = daysUntil(offer.onboard_date, now);
    return onboardIn !== null && onboardIn <= 3;
  }
  return false;
}

export function buildOfferTabCounts(items: OfferWorkbenchRecord[]) {
  return {
    pending_registration: items.filter((item) => item.oa_status === 'not_started').length,
    follow_up: items.filter((item) => item.oa_status === 'pending' || item.oa_status === 'rejected').length,
    completed: items.filter((item) => item.oa_status === 'approved' || item.oa_status === 'completed').length,
  };
}

function matchesTab(offer: OfferWorkbenchRecord, tab: OfferWorkbenchTab) {
  if (tab === 'pending_registration') return offer.oa_status === 'not_started';
  if (tab === 'follow_up') return offer.oa_status === 'pending' || offer.oa_status === 'rejected';
  return offer.oa_status === 'approved' || offer.oa_status === 'completed';
}

export const offerOaStatusLabels: Record<OfferOaStatus, string> = {
  not_started: '待登记',
  pending: 'OA 审批中',
  approved: 'OA 已通过',
  rejected: 'OA 已退回',
  completed: '已完成',
};

export function filterAndSortOffers({
  items,
  tab,
  search,
  demand,
  owner,
  risk,
  order,
  recentDays = 7,
  now = new Date(),
}: OfferWorkbenchInput) {
  const searchTerm = search.trim().toLocaleLowerCase('zh-CN');
  const demandTerm = demand.trim().toLocaleLowerCase('zh-CN');
  const ownerTerm = owner.trim().toLocaleLowerCase('zh-CN');

  return items
    .filter((offer) => matchesTab(offer, tab))
    .filter((offer) => {
      const updated = parsedTime(offer.oa_updated_at || offer.updated_at || offer.created_at);
      if (!updated) return true;
      return updated.getTime() >= now.getTime() - recentDays * 86_400_000;
    })
    .filter((offer) => !searchTerm || [offer.candidate_name, offer.position, offer.request_no]
      .some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(searchTerm)))
    .filter((offer) => !demandTerm || [offer.position, offer.request_no, offer.department]
      .some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(demandTerm)))
    .filter((offer) => !ownerTerm || String(offer.created_by_name || '')
      .toLocaleLowerCase('zh-CN').includes(ownerTerm))
    .filter((offer) => !risk || offerRisk(offer, now).level === risk)
    .sort((left, right) => {
      if (order === 'updated') return updateTime(right) - updateTime(left);
      if (order === 'onboard') {
        const leftDate = calendarDate(left.onboard_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDate = calendarDate(right.onboard_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftDate - rightDate || updateTime(right) - updateTime(left);
      }
      return offerRisk(right, now).rank - offerRisk(left, now).rank
        || updateTime(right) - updateTime(left);
    });
}
