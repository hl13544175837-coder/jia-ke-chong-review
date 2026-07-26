import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { OFFER_STATUSES, type OfferRecord, type OfferStatus } from '@/features/offers/types';

type OfferColumnFilter = 'identity' | 'demand' | 'compensation' | 'status' | 'updated';

interface Props {
  offers: OfferRecord[];
  identityFilter: string;
  demandFilter: string;
  compensationFilter: string;
  onboardDateFilter: string;
  statusFilter: '' | OfferStatus;
  updatedOrder: 'asc' | 'desc';
  onOpen: (offer: OfferRecord) => void;
  onEdit: (offer: OfferRecord) => void;
  onIdentityFilterChange: (value: string) => void;
  onDemandFilterChange: (value: string) => void;
  onCompensationFilterChange: (value: string) => void;
  onOnboardDateFilterChange: (value: string) => void;
  onStatusFilterChange: (value: '' | OfferStatus) => void;
  onUpdatedOrderChange: (value: 'asc' | 'desc') => void;
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

const filterControlClass = 'h-9 w-full rounded-lg border border-background-300 bg-white px-2.5 text-xs text-foreground-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100';

function isOfferStatus(value: string): value is OfferStatus {
  return OFFER_STATUSES.some((status) => status === value);
}

function OfferColumnFilterHeader({
  'data-ui': dataUi,
  label,
  open,
  onToggle,
  children,
}: {
  'data-ui': string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <th
      className="relative px-5 py-3 font-medium"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          onToggle();
        }
      }}
    >
      <button
        type="button"
        data-ui={dataUi}
        aria-expanded={open}
        aria-controls={`${dataUi}-panel`}
        onClick={onToggle}
        className="inline-flex items-center gap-1 rounded text-left hover:text-foreground-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${dataUi}-panel`}
          role="group"
          aria-label={`${label}筛选条件`}
          className="absolute left-5 top-full z-30 mt-1 w-60 space-y-2 rounded-lg border border-background-200 bg-white p-3 shadow-xl"
        >
          {children}
        </div>
      )}
    </th>
  );
}

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

export default function OfferTable({
  offers,
  identityFilter,
  demandFilter,
  compensationFilter,
  onboardDateFilter,
  statusFilter,
  updatedOrder,
  onOpen,
  onEdit,
  onIdentityFilterChange,
  onDemandFilterChange,
  onCompensationFilterChange,
  onOnboardDateFilterChange,
  onStatusFilterChange,
  onUpdatedOrderChange,
}: Props) {
  const [openColumnFilter, setOpenColumnFilter] = useState<OfferColumnFilter | null>(null);

  const toggleColumnFilter = (column: OfferColumnFilter) => {
    setOpenColumnFilter((current) => current === column ? null : column);
  };

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
            <OfferColumnFilterHeader
              data-ui="offer-column-filter-identity"
              label="候选人 / 岗位"
              open={openColumnFilter === 'identity'}
              onToggle={() => toggleColumnFilter('identity')}
            >
              <input
                value={identityFilter}
                onChange={(event) => onIdentityFilterChange(event.target.value)}
                placeholder="候选人或岗位"
                aria-label="按候选人或岗位筛选 Offer"
                className={filterControlClass}
              />
            </OfferColumnFilterHeader>
            <OfferColumnFilterHeader
              data-ui="offer-column-filter-demand"
              label="招聘需求"
              open={openColumnFilter === 'demand'}
              onToggle={() => toggleColumnFilter('demand')}
            >
              <input
                value={demandFilter}
                onChange={(event) => onDemandFilterChange(event.target.value)}
                placeholder="需求编号或部门"
                aria-label="按需求编号或部门筛选 Offer"
                className={filterControlClass}
              />
            </OfferColumnFilterHeader>
            <OfferColumnFilterHeader
              data-ui="offer-column-filter-compensation"
              label="薪酬 / 入职"
              open={openColumnFilter === 'compensation'}
              onToggle={() => toggleColumnFilter('compensation')}
            >
              <input
                value={compensationFilter}
                onChange={(event) => onCompensationFilterChange(event.target.value)}
                placeholder="薪酬关键词"
                aria-label="按薪酬方案筛选 Offer"
                className={filterControlClass}
              />
              <input
                type="date"
                value={onboardDateFilter}
                onChange={(event) => onOnboardDateFilterChange(event.target.value)}
                aria-label="按预计入职日期筛选 Offer"
                className={filterControlClass}
              />
            </OfferColumnFilterHeader>
            <OfferColumnFilterHeader
              data-ui="offer-column-filter-status"
              label="状态"
              open={openColumnFilter === 'status'}
              onToggle={() => toggleColumnFilter('status')}
            >
              <select
                value={statusFilter}
                onChange={(event) => {
                  const nextStatus = event.target.value;
                  if (nextStatus === '' || isOfferStatus(nextStatus)) onStatusFilterChange(nextStatus);
                }}
                aria-label="按 Offer 状态筛选"
                className={filterControlClass}
              >
                <option value="">全部状态</option>
                {OFFER_STATUSES.map((status) => <option key={status} value={status}>{STATUS_META[status].label}</option>)}
              </select>
            </OfferColumnFilterHeader>
            <OfferColumnFilterHeader
              data-ui="offer-column-filter-updated"
              label="最近更新"
              open={openColumnFilter === 'updated'}
              onToggle={() => toggleColumnFilter('updated')}
            >
              <select
                value={updatedOrder}
                onChange={(event) => {
                  const nextOrder = event.target.value;
                  if (nextOrder === 'asc' || nextOrder === 'desc') onUpdatedOrderChange(nextOrder);
                }}
                aria-label="按 Offer 更新时间排序"
                className={filterControlClass}
              >
                <option value="desc">最近更新优先</option>
                <option value="asc">最早更新优先</option>
              </select>
            </OfferColumnFilterHeader>
            <th className="px-5 py-3 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-background-200">
          {offers.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-5 py-14 text-center text-sm text-foreground-500">
                当前列筛选下没有符合条件的 Offer
              </td>
            </tr>
          ) : offers.map((offer) => {
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
