import type { OfferRecord, OfferStatus } from '@/features/offers/types';

interface Props {
  offers: OfferRecord[];
  onOpen: (offer: OfferRecord) => void;
  onEdit: (offer: OfferRecord) => void;
}

const STATUS_META: Record<OfferStatus, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-background-200 text-foreground-600' },
  pending: { label: '待审批', className: 'bg-amber-50 text-amber-700' },
  approved: { label: '待发放', className: 'bg-blue-50 text-blue-700' },
  sent: { label: '等待回复', className: 'bg-cyan-50 text-cyan-700' },
  accepted: { label: '待入职', className: 'bg-emerald-50 text-emerald-700' },
  declined: { label: '已拒绝', className: 'bg-red-50 text-red-700' },
  withdrawn: { label: '已撤回', className: 'bg-background-200 text-foreground-500' },
  expired: { label: '已过期', className: 'bg-amber-50 text-amber-700' },
  onboarded: { label: '已入职', className: 'bg-emerald-50 text-emerald-700' },
};

function formatTime(value: string | null) {
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

export default function OfferTable({ offers, onOpen, onEdit }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[16%]" />
          <col className="w-[21%]" />
          <col className="w-[13%]" />
          <col className="w-[16%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead className="bg-background-50 text-xs text-foreground-500">
          <tr>
            <th className="px-5 py-3 font-medium">候选人 / 岗位</th>
            <th className="px-5 py-3 font-medium">招聘需求</th>
            <th className="px-5 py-3 font-medium">薪酬 / 入职</th>
            <th className="px-5 py-3 font-medium">状态</th>
            <th className="px-5 py-3 font-medium">最近更新</th>
            <th className="px-5 py-3 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-background-200">
          {offers.map((offer) => {
            const status = STATUS_META[offer.status];
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
                  <p className="mt-1 truncate text-xs text-foreground-500">{offer.position || '未填岗位'} · {offer.department || '未填部门'}</p>
                </td>
                <td className="px-5 py-4">
                  <p className="truncate text-foreground-700">{offer.request_no || '—'}</p>
                </td>
                <td className="px-5 py-4">
                  <p className="truncate font-medium text-foreground-800">{offer.salary_range || '待填写'}</p>
                  <p className="mt-1 text-xs text-foreground-500">{offer.onboard_date ? `预计 ${offer.onboard_date}` : '入职日期待定'}</p>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                </td>
                <td className="px-5 py-4 text-xs text-foreground-500">{formatTime(offer.updated_at || offer.created_at)}</td>
                <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                  <div className="flex justify-end gap-2">
                    {offer.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => onEdit(offer)}
                        title="编辑草稿"
                        className="h-8 w-8 rounded-lg border border-background-300 text-foreground-600 hover:bg-background-100"
                      >
                        <i className="ri-edit-line" aria-hidden="true"></i>
                        <span className="sr-only">编辑草稿</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpen(offer)}
                      className="h-8 rounded-lg border border-background-300 px-3 text-xs font-medium text-foreground-700 hover:bg-background-100"
                    >
                      {['draft', 'pending', 'approved', 'sent', 'accepted'].includes(offer.status) ? '查看 / 处理' : '查看结果'}
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
