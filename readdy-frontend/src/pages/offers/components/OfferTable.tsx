import type { ProductRole } from '@/auth/productRoleModel';
import type { OfferRecord } from '@/features/offers/types';
import {
  offerPrimaryAction,
  offerRisk,
  offerStatusLabel,
  offerWaitingLabel,
} from '../workbench';

interface Props {
  offers: OfferRecord[];
  role: ProductRole | null;
  onOpen: (offer: OfferRecord) => void;
  onPrimaryAction: (offer: OfferRecord) => void;
}

function rowPrimaryAction(offer: OfferRecord, role: ProductRole | null) {
  const canApprove = role === 'manager' || role === 'admin' || role === 'hr_director';
  if (offer.status === 'pending' && !canApprove) return '查看确认进度';
  if ((offer.status === 'draft' || offer.status === 'rejected') && role !== 'recruiter' && role !== 'admin') {
    return offer.status === 'rejected' ? '查看退回记录' : '查看草稿';
  }
  return offerPrimaryAction(offer.status);
}

const statusClasses: Record<OfferRecord['status'], string> = {
  draft: 'bg-background-200 text-foreground-600',
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-700',
  sent: 'bg-cyan-50 text-cyan-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-red-50 text-red-700',
  withdrawn: 'bg-background-200 text-foreground-500',
  expired: 'bg-amber-50 text-amber-700',
  onboarded: 'bg-emerald-50 text-emerald-700',
};

const riskClasses = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-emerald-50 text-emerald-700',
};

function displayDate(offer: OfferRecord) {
  if (offer.status === 'sent') return offer.expires_at ? `有效期至 ${offer.expires_at.slice(0, 10)}` : '有效期未填写';
  if (offer.status === 'accepted' || offer.status === 'onboarded') return offer.onboard_date ? `预计入职 ${offer.onboard_date}` : '入职日期待定';
  return offer.onboard_date ? `预计入职 ${offer.onboard_date}` : '日期待确认';
}

export default function OfferTable({ offers, role, onOpen, onPrimaryAction }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[25%]" />
          <col className="w-[16%]" />
          <col className="w-[17%]" />
          <col className="w-[16%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
        </colgroup>
        <thead className="bg-background-50 text-xs text-foreground-500">
          <tr>
            <th className="px-5 py-3 font-medium">候选人 / 岗位</th>
            <th className="px-5 py-3 font-medium">当前节点</th>
            <th className="px-5 py-3 font-medium">薪酬方案</th>
            <th className="px-5 py-3 font-medium">关键日期</th>
            <th className="px-5 py-3 font-medium">风险</th>
            <th className="px-5 py-3 text-right font-medium">下一步</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-background-200">
          {offers.map((offer) => {
            const risk = offerRisk(offer);
            return (
              <tr
                key={offer.id}
                tabIndex={0}
                onClick={() => onOpen(offer)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen(offer);
                  }
                }}
                className="cursor-pointer bg-white outline-none hover:bg-background-50 focus-visible:bg-primary-50"
              >
                <td className="px-5 py-4">
                  <p className="truncate font-semibold text-foreground-900">{offer.candidate_name}</p>
                  <p className="mt-1 truncate text-xs text-foreground-500">{offer.position || '岗位未填写'} · {offer.request_no || '需求编号未填写'}</p>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${statusClasses[offer.status]}`}>{offerStatusLabel(offer.status)}</span>
                  <p className="mt-1.5 text-xs text-foreground-500">{offerWaitingLabel(offer)}</p>
                </td>
                <td className="px-5 py-4">
                  <p className="truncate font-medium text-foreground-800">{offer.salary_range || '待填写'}</p>
                  <p className="mt-1 truncate text-xs text-foreground-400">{offer.created_by_name || '负责人未显示'}</p>
                </td>
                <td className="px-5 py-4 text-xs text-foreground-600">{displayDate(offer)}</td>
                <td className="px-5 py-4"><span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${riskClasses[risk.level]}`}>{risk.label}</span></td>
                <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => onPrimaryAction(offer)} className={`h-8 rounded-lg px-3 text-xs font-medium ${['declined', 'withdrawn', 'expired', 'onboarded'].includes(offer.status) ? 'border border-background-300 bg-white text-foreground-700 hover:bg-background-100' : 'bg-primary-500 text-white hover:bg-primary-600'}`}>
                      {rowPrimaryAction(offer, role)}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
