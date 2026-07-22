import { Badge, Pagination } from '../../../components/ui';
import type { DemandListResponse, DemandStatus, RecruitmentDemand } from '../../../types';
import type { DemandDrawerContext } from './DemandWorkspaceDrawer';

const STATUS_LABELS: Record<DemandStatus, string> = {
  pending: '待确认',
  active: '招聘中',
  paused: '暂停',
  filled: '已完成',
  cancelled: '已取消',
  closed: '提前关闭',
};

function statusTone(status: DemandStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'pending' || status === 'paused') return 'warning';
  if (status === 'cancelled' || status === 'closed') return 'danger';
  return 'neutral';
}

function StageMetric({ demand, stage, label, value, onOpen }: {
  demand: RecruitmentDemand;
  stage: string;
  label: string;
  value: number;
  onOpen: (demand: RecruitmentDemand, context: DemandDrawerContext) => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-w-14 flex-col rounded-md px-2 py-1 text-center hover:bg-surface-soft focus:outline-none focus:ring-2 focus:ring-ink"
      aria-label={`${label} ${value} 人，查看候选人`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(demand, { kind: 'stage', stage, label });
      }}
    >
      <span className="text-sm font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </button>
  );
}

export function DemandTable({ response, onPageChange, onOpenDemand }: {
  response: DemandListResponse;
  onPageChange: (page: number) => void;
  onOpenDemand: (demand: RecruitmentDemand, context: DemandDrawerContext) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-hairline text-left text-sm">
          <thead className="bg-surface-soft text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">需求 / 职位</th>
              <th className="px-4 py-3 font-medium">部门与城市</th>
              <th className="px-4 py-3 font-medium">负责人</th>
              <th className="px-4 py-3 font-medium">HC / 截止日期</th>
              <th className="px-4 py-3 font-medium">阶段进度（可点击）</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {response.items.map((demand) => (
              <tr
                key={demand.id}
                tabIndex={0}
                aria-label={`打开${demand.job_title}需求详情`}
                onClick={() => onOpenDemand(demand, { kind: 'overview' })}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpenDemand(demand, { kind: 'overview' });
                  }
                }}
                className="cursor-pointer align-top hover:bg-surface-soft/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-left font-medium text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDemand(demand, { kind: 'overview' });
                    }}
                  >
                    {demand.job_title}
                  </button>
                  <p className="mt-1 text-xs text-muted">{demand.request_no || `需求 #${demand.id}`}</p>
                </td>
                <td className="px-4 py-3 text-body">
                  <p>{demand.job_department || '未记录部门'}</p>
                  <p className="mt-1 text-xs text-muted">{demand.job_city || '未记录城市'}</p>
                </td>
                <td className="px-4 py-3 text-body">
                  <button
                    type="button"
                    className="rounded-md text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDemand(demand, { kind: 'owner' });
                    }}
                  >
                    {demand.owner_hr_name || `专员 #${demand.owner_hr_id}`}
                  </button>
                </td>
                <td className="px-4 py-3 text-body">
                  <button
                    type="button"
                    className="rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDemand(demand, { kind: 'headcount' });
                    }}
                  >
                    <p>{demand.metrics.onboarded_count} / {demand.headcount}</p>
                    <p className="mt-1 text-xs text-muted">{demand.target_date || '未记录日期'}</p>
                  </button>
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    <StageMetric demand={demand} stage="all" label="全部" value={demand.metrics.recommended_count} onOpen={onOpenDemand} />
                    <StageMetric demand={demand} stage="business_review" label="待反馈" value={demand.metrics.business_review_count} onOpen={onOpenDemand} />
                    <StageMetric demand={demand} stage="interview" label="面试" value={demand.metrics.interview_count} onOpen={onOpenDemand} />
                    <StageMetric demand={demand} stage="offer" label="Offer" value={demand.metrics.offer_count} onOpen={onOpenDemand} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDemand(demand, { kind: 'status' });
                    }}
                  >
                    <Badge tone={statusTone(demand.status)}>{STATUS_LABELS[demand.status]}</Badge>
                  </button>
                  {demand.completion_suggested && (
                    <p className="mt-2 text-xs text-success-700">HC 已达成，待确认完成</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-hairline px-4 py-3">
        <Pagination
          page={response.page}
          totalPages={response.pages}
          onChange={onPageChange}
          summary={`共 ${response.total} 个招聘需求`}
        />
      </div>
    </div>
  );
}
