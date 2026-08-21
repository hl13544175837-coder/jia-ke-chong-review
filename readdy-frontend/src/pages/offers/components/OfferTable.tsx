import type { OfferWorkbenchRecord } from '@/features/offers/types';
import ActionButton from '@/components/ui/ActionButton';
import RowActionMenu, { type RowActionItem } from '@/components/ui/RowActionMenu';
import SemanticStatusBadge from '@/components/ui/SemanticStatusBadge';
import { candidateDisplayName } from '@/features/candidates/candidateDisplayName';
import { offerStatusLabel } from '../workbench';

interface Props {
  offers: OfferWorkbenchRecord[];
  onOpenCandidate: (offer: OfferWorkbenchRecord) => void;
  onOpenDemand: (offer: OfferWorkbenchRecord) => void;
  onOpenPipeline: (offer: OfferWorkbenchRecord) => void;
  onOpenInterviews: (offer: OfferWorkbenchRecord) => void;
  onRegister: (offer: OfferWorkbenchRecord) => void;
  onOpenDetail: (offer: OfferWorkbenchRecord) => void;
}

const statusTones: Record<string, 'neutral' | 'pending' | 'info' | 'success' | 'danger'> = {
  draft: 'neutral',
  pending: 'pending',
  approved: 'info',
  rejected: 'danger',
  sent: 'info',
  accepted: 'success',
  declined: 'danger',
  withdrawn: 'neutral',
  expired: 'pending',
  onboarded: 'success',
};

function displayTime(value: string | null, fallback = '—') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function keyTimeline(offer: OfferWorkbenchRecord): string {
  if (offer.status === 'onboarded') {
    const onboardAt = offer.onboarded_at || offer.onboard_date;
    return onboardAt ? `入职 ${displayTime(onboardAt)}` : '已入职';
  }
  if (offer.status === 'accepted') {
    const resp = offer.responded_at || offer.onboard_date;
    return resp ? `接受 ${displayTime(resp)}` : '待确认入职';
  }
  if (offer.status === 'sent') return offer.sent_at ? `发放 ${displayTime(offer.sent_at)}` : '待记录发放';
  if (offer.status === 'approved') return '待记录发放';
  if (offer.status === 'pending') return '待确认';
  if (offer.status === 'rejected') return '已退回';
  return `更新 ${displayTime(offer.updated_at || offer.created_at)}`;
}

export default function OfferTable({ offers, onOpenCandidate, onOpenDemand, onOpenPipeline, onOpenInterviews, onRegister, onOpenDetail }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[26%]" />
          <col className="w-[13%]" />
          <col className="w-[18%]" />
          <col className="w-[14%]" />
          <col className="w-[16%]" />
          <col className="w-[13%]" />
        </colgroup>
        <thead className="bg-background-50 text-xs text-foreground-500">
          <tr>
            <th className="px-5 py-3 font-medium">候选人 / 岗位</th>
            <th className="px-5 py-3 font-medium">业务状态</th>
            <th className="px-5 py-3 font-medium">关键时间</th>
            <th className="px-5 py-3 font-medium">负责人</th>
            <th className="px-5 py-3 font-medium">招聘需求</th>
            <th className="px-5 py-3 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-background-200">
          {offers.map((offer) => {
            const candidateName = candidateDisplayName(offer);
            const menuItems: RowActionItem[] = [
              { key: 'detail', label: '查看 Offer 详情 / 处理', icon: <i className="ri-file-list-3-line" />, onSelect: () => onOpenDetail(offer) },
              { key: 'candidate', label: '查看候选人简历', icon: <i className="ri-file-user-line" />, onSelect: () => onOpenCandidate(offer) },
              { key: 'demand', label: '查看招聘需求', icon: <i className="ri-briefcase-line" />, onSelect: () => onOpenDemand(offer) },
              { key: 'pipeline', label: '查看招聘流程', icon: <i className="ri-route-line" />, onSelect: () => onOpenPipeline(offer) },
              { key: 'interviews', label: '查看已完成面试', icon: <i className="ri-calendar-check-line" />, onSelect: () => onOpenInterviews(offer) },
            ];
            return <tr key={`${offer.candidate_id}-${offer.demand_id}`} className="bg-white hover:bg-background-50">
              <td className="px-5 py-4">
                <button type="button" onClick={() => onOpenCandidate(offer)} className="max-w-full truncate text-left font-semibold text-foreground-900 hover:text-primary-700 hover:underline">{candidateName}</button>
                <p className="mt-1 truncate text-xs text-foreground-500">{offer.position || '岗位未填写'}</p>
              </td>
              <td className="px-5 py-4">
                <SemanticStatusBadge tone={statusTones[offer.status] || 'neutral'}>{offerStatusLabel(offer.status)}</SemanticStatusBadge>
                {offer.oa_status === 'not_started' && offer.status === 'draft' && <p className="mt-1.5 text-xs text-foreground-400">OA 未登记</p>}
              </td>
              <td className="px-5 py-4 text-xs text-foreground-600">{keyTimeline(offer)}</td>
              <td className="px-5 py-4 text-xs text-foreground-600">{offer.created_by_name || '—'}</td>
              <td className="px-5 py-4 text-xs text-foreground-600">{offer.request_no || '—'}</td>
              <td className="px-5 py-4">
                <div className="flex items-center justify-end gap-1">
                  <ActionButton size="sm" tone="primary" onClick={() => onOpenDetail(offer)}>处理</ActionButton>
                  <RowActionMenu ariaLabel={`打开${candidateName}的 Offer 操作`} items={menuItems} />
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
