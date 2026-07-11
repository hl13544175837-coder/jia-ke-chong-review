import { Link } from 'react-router-dom';
import { Badge, Pagination } from '../../../components/ui';
import type { DemandListResponse, DemandStatus, RecruitmentDemand } from '../../../types';

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

function StageMetric({ demand, stage, label, value }: {
  demand: RecruitmentDemand;
  stage: string;
  label: string;
  value: number;
}) {
  return (
    <Link
      to={`/pipeline?demand=${demand.id}&stage=${stage}`}
      className="inline-flex min-w-14 flex-col rounded-md px-2 py-1 text-center hover:bg-surface-soft focus:outline-none focus:ring-2 focus:ring-ink"
      aria-label={`${label} ${value} 人，查看候选人`}
    >
      <span className="text-sm font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </Link>
  );
}

export function DemandTable({ response, onPageChange }: {
  response: DemandListResponse;
  onPageChange: (page: number) => void;
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
              <tr key={demand.id} className="align-top hover:bg-surface-soft/60">
                <td className="px-4 py-3">
                  <Link to={`/demands/${demand.id}`} className="font-medium text-ink hover:underline">
                    {demand.job_title}
                  </Link>
                  <p className="mt-1 text-xs text-muted">{demand.request_no || `需求 #${demand.id}`}</p>
                </td>
                <td className="px-4 py-3 text-body">
                  <p>{demand.job_department || '未记录部门'}</p>
                  <p className="mt-1 text-xs text-muted">{demand.job_city || '未记录城市'}</p>
                </td>
                <td className="px-4 py-3 text-body">{demand.owner_hr_name || `专员 #${demand.owner_hr_id}`}</td>
                <td className="px-4 py-3 text-body">
                  <p>{demand.metrics.onboarded_count} / {demand.headcount}</p>
                  <p className="mt-1 text-xs text-muted">{demand.target_date || '未记录日期'}</p>
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    <StageMetric demand={demand} stage="all" label="全部" value={demand.metrics.recommended_count} />
                    <StageMetric demand={demand} stage="business_review" label="待反馈" value={demand.metrics.business_review_count} />
                    <StageMetric demand={demand} stage="interview" label="面试" value={demand.metrics.interview_count} />
                    <StageMetric demand={demand} stage="offer" label="Offer" value={demand.metrics.offer_count} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(demand.status)}>{STATUS_LABELS[demand.status]}</Badge>
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
