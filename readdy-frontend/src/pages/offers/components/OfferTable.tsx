import type { OfferOaStatus, OfferWorkbenchRecord } from '@/features/offers/types';
import ActionButton from '@/components/ui/ActionButton';
import RowActionMenu, { type RowActionItem } from '@/components/ui/RowActionMenu';
import SemanticStatusBadge from '@/components/ui/SemanticStatusBadge';
import { candidateDisplayName } from '@/features/candidates/candidateDisplayName';
import { offerOaStatusLabels } from '../workbench';

interface Props {
  offers: OfferWorkbenchRecord[];
  onOpenCandidate: (offer: OfferWorkbenchRecord) => void;
  onOpenDemand: (offer: OfferWorkbenchRecord) => void;
  onOpenPipeline: (offer: OfferWorkbenchRecord) => void;
  onOpenInterviews: (offer: OfferWorkbenchRecord) => void;
  onRegister: (offer: OfferWorkbenchRecord) => void;
}

const oaStatusTones: Record<OfferOaStatus, 'neutral' | 'pending' | 'info' | 'success' | 'danger'> = {
  not_started: 'neutral',
  pending: 'info',
  approved: 'success',
  rejected: 'danger',
  completed: 'success',
};

function displayTime(value: string | null) {
  if (!value) return '尚未登记';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function OfferTable({ offers, onOpenCandidate, onOpenDemand, onOpenPipeline, onOpenInterviews, onRegister }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[14%]" />
          <col className="w-[17%]" />
          <col className="w-[18%]" />
          <col className="w-[14%]" />
          <col className="w-[13%]" />
        </colgroup>
        <thead className="bg-background-50 text-xs text-foreground-500">
          <tr>
            <th className="px-5 py-3 font-medium">候选人 / 岗位</th>
            <th className="px-5 py-3 font-medium">已完成面试</th>
            <th className="px-5 py-3 font-medium">OA 状态</th>
            <th className="px-5 py-3 font-medium">OA 编号</th>
            <th className="px-5 py-3 font-medium">最近更新</th>
            <th className="px-5 py-3 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-background-200">
          {offers.map((offer) => {
            const candidateName = candidateDisplayName(offer);
            const menuItems: RowActionItem[] = [
              { key: 'candidate', label: '查看候选人简历', icon: <i className="ri-file-user-line" />, onSelect: () => onOpenCandidate(offer) },
              { key: 'demand', label: '查看招聘需求', icon: <i className="ri-briefcase-line" />, onSelect: () => onOpenDemand(offer) },
              { key: 'pipeline', label: '查看招聘流程', icon: <i className="ri-route-line" />, onSelect: () => onOpenPipeline(offer) },
              { key: 'interviews', label: '查看已完成面试', icon: <i className="ri-calendar-check-line" />, onSelect: () => onOpenInterviews(offer) },
            ];
            return <tr key={`${offer.candidate_id}-${offer.demand_id}`} className="bg-white hover:bg-background-50">
              <td className="px-5 py-4">
                <button type="button" onClick={() => onOpenCandidate(offer)} className="max-w-full truncate text-left font-semibold text-foreground-900 hover:text-primary-700 hover:underline">{candidateName}</button>
                <p className="mt-1 truncate text-xs text-foreground-500">{offer.position || '岗位未填写'} · {offer.request_no || '需求编号未填写'}</p>
              </td>
              <td className="px-5 py-4 text-foreground-700">{offer.completed_interview_rounds} 轮</td>
              <td className="px-5 py-4">
                <SemanticStatusBadge tone={oaStatusTones[offer.oa_status]}>{offerOaStatusLabels[offer.oa_status]}</SemanticStatusBadge>
                {offer.oa_note && <p className="mt-1.5 truncate text-xs text-foreground-500">{offer.oa_note}</p>}
              </td>
              <td className="px-5 py-4 text-foreground-700">{offer.oa_instance_no || '待登记'}</td>
              <td className="px-5 py-4 text-xs text-foreground-600">{displayTime(offer.oa_updated_at || offer.updated_at)}</td>
              <td className="px-5 py-4">
                <div className="flex items-center justify-end gap-1">
                  <ActionButton size="sm" tone={offer.oa_status === 'not_started' ? 'primary' : 'secondary'} onClick={() => onRegister(offer)}>
                    {offer.oa_status === 'not_started' ? '登记 OA 结果' : '更新 OA 结果'}
                  </ActionButton>
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
