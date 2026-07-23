import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge, Button, Pagination } from '../../../components/ui';
import type {
  CandidateOwnerOption,
  DemandListQuery,
  DemandListResponse,
  DemandStatus,
  PipelineStage,
  RecruitmentDemand,
} from '../../../types';
import type { DemandDrawerContext } from './DemandWorkspaceDrawer';

const STATUS_LABELS: Record<DemandStatus, string> = {
  pending: '待确认',
  active: '招聘中',
  paused: '暂停',
  filled: '已完成',
  cancelled: '已取消',
  closed: '提前关闭',
};

const STAGE_OPTIONS: { value: NonNullable<DemandListQuery['pipeline_stage']>; label: string }[] = [
  { value: 'any', label: '全部候选人' },
  { value: 'business_review', label: '待业务反馈' },
  { value: 'interview', label: '面试' },
  { value: 'offer', label: 'Offer' },
  { value: 'onboarded', label: '已入职' },
];

type ColumnFilter = 'identity' | 'location' | 'owner' | 'delivery' | 'stage' | 'status';

function statusTone(status: DemandStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'pending' || status === 'paused') return 'warning';
  if (status === 'cancelled' || status === 'closed') return 'danger';
  return 'neutral';
}

function ColumnFilterHeader({
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
    <th className="min-w-40 px-4 py-3 align-top font-medium">
      <button
        type="button"
        data-ui={dataUi}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded text-left text-xs text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        onClick={onToggle}
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div className="mt-2 min-w-48 space-y-2">{children}</div>}
    </th>
  );
}

function StageMetric({ demand, stage, label, value, onOpen }: {
  demand: RecruitmentDemand;
  stage: PipelineStage | 'all';
  label: string;
  value: number;
  onOpen: (demand: RecruitmentDemand, context: DemandDrawerContext) => void;
}) {
  return (
    <button
      type="button"
      data-ui="demand-stage-detail-trigger"
      className="inline-flex min-w-14 flex-col rounded-md px-2 py-1 text-center hover:bg-surface-soft focus:outline-none focus:ring-2 focus:ring-ink"
      aria-label={`${label} ${value} 人，在右侧查看该需求阶段`}
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

interface DemandTableProps {
  response: DemandListResponse;
  query: DemandListQuery;
  owners: CandidateOwnerOption[];
  onPageChange: (page: number) => void;
  onApplyFilter: (next: Partial<DemandListQuery>) => void;
  onClearFilters: (fields: Array<keyof DemandListQuery>) => void;
  onOpenDemand: (demand: RecruitmentDemand, context: DemandDrawerContext) => void;
}

export function DemandTable({
  response,
  query,
  owners,
  onPageChange,
  onApplyFilter,
  onClearFilters,
  onOpenDemand,
}: DemandTableProps) {
  const [openFilter, setOpenFilter] = useState<ColumnFilter | null>(null);
  const [drafts, setDrafts] = useState({
    jobTitle: query.job_title ?? '',
    requestNo: query.request_no ?? '',
    department: query.department ?? '',
    city: query.city ?? '',
    targetDate: query.target_date ?? '',
  });

  useEffect(() => {
    setDrafts({
      jobTitle: query.job_title ?? '',
      requestNo: query.request_no ?? '',
      department: query.department ?? '',
      city: query.city ?? '',
      targetDate: query.target_date ?? '',
    });
  }, [query.job_title, query.request_no, query.department, query.city, query.target_date]);

  const toggleFilter = (column: ColumnFilter) => {
    setOpenFilter((current) => current === column ? null : column);
  };
  const fieldClassName = 'h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:border-ink focus:outline-none';

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-hairline text-left text-sm">
          <thead className="bg-surface-soft text-xs text-muted">
            <tr>
              <ColumnFilterHeader
                data-ui="demand-column-filter-identity"
                label="需求 / 职位"
                open={openFilter === 'identity'}
                onToggle={() => toggleFilter('identity')}
              >
                <input
                  aria-label="按职位精确筛选"
                  placeholder="完整职位名称"
                  value={drafts.jobTitle}
                  onChange={(event) => setDrafts((current) => ({ ...current, jobTitle: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      onApplyFilter({
                        job_title: drafts.jobTitle.trim() || undefined,
                        request_no: drafts.requestNo.trim() || undefined,
                      });
                    }
                  }}
                  className={fieldClassName}
                />
                <input
                  aria-label="按需求编号精确筛选"
                  placeholder="完整需求编号"
                  value={drafts.requestNo}
                  onChange={(event) => setDrafts((current) => ({ ...current, requestNo: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      onApplyFilter({
                        job_title: drafts.jobTitle.trim() || undefined,
                        request_no: drafts.requestNo.trim() || undefined,
                      });
                    }
                  }}
                  className={fieldClassName}
                />
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onApplyFilter({
                      job_title: drafts.jobTitle.trim() || undefined,
                      request_no: drafts.requestNo.trim() || undefined,
                    })}
                  >
                    应用
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDrafts((current) => ({ ...current, jobTitle: '', requestNo: '' }));
                      onClearFilters(['job_title', 'request_no']);
                    }}
                  >
                    清除
                  </Button>
                </div>
              </ColumnFilterHeader>
              <ColumnFilterHeader
                data-ui="demand-column-filter-location"
                label="部门与城市"
                open={openFilter === 'location'}
                onToggle={() => toggleFilter('location')}
              >
                <input
                  aria-label="按部门筛选"
                  placeholder="用人部门"
                  value={drafts.department}
                  onChange={(event) => setDrafts((current) => ({ ...current, department: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      onApplyFilter({ department: drafts.department.trim() || undefined, city: drafts.city.trim() || undefined });
                    }
                  }}
                  className={fieldClassName}
                />
                <input
                  aria-label="按城市筛选"
                  placeholder="招聘城市"
                  value={drafts.city}
                  onChange={(event) => setDrafts((current) => ({ ...current, city: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      onApplyFilter({ department: drafts.department.trim() || undefined, city: drafts.city.trim() || undefined });
                    }
                  }}
                  className={fieldClassName}
                />
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onApplyFilter({ department: drafts.department.trim() || undefined, city: drafts.city.trim() || undefined })}
                  >
                    应用
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDrafts((current) => ({ ...current, department: '', city: '' }));
                      onClearFilters(['department', 'city']);
                    }}
                  >
                    清除
                  </Button>
                </div>
              </ColumnFilterHeader>
              <ColumnFilterHeader
                data-ui="demand-column-filter-owner"
                label="负责人"
                open={openFilter === 'owner'}
                onToggle={() => toggleFilter('owner')}
              >
                <select
                  aria-label="按招聘负责人筛选"
                  value={query.owner_hr_id ?? ''}
                  onChange={(event) => onApplyFilter({ owner_hr_id: event.target.value ? Number(event.target.value) : undefined })}
                  className={fieldClassName}
                >
                  <option value="">全部负责人</option>
                  {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                </select>
                <Button type="button" size="sm" variant="ghost" onClick={() => onClearFilters(['owner_hr_id'])}>清除</Button>
              </ColumnFilterHeader>
              <ColumnFilterHeader
                data-ui="demand-column-filter-delivery"
                label="HC / 截止日期"
                open={openFilter === 'delivery'}
                onToggle={() => toggleFilter('delivery')}
              >
                <select
                  aria-label="按 HC 进度筛选"
                  value={query.hc_status ?? 'all'}
                  onChange={(event) => onApplyFilter({
                    hc_status: event.target.value === 'all'
                      ? undefined
                      : event.target.value as DemandListQuery['hc_status'],
                  })}
                  className={fieldClassName}
                >
                  <option value="all">全部 HC</option>
                  <option value="complete">HC 已达成</option>
                  <option value="incomplete">HC 未达成</option>
                </select>
                <input
                  type="date"
                  aria-label="按截止日期筛选"
                  value={drafts.targetDate}
                  onChange={(event) => setDrafts((current) => ({ ...current, targetDate: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onApplyFilter({ target_date: drafts.targetDate || undefined });
                  }}
                  className={fieldClassName}
                />
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="secondary" onClick={() => onApplyFilter({ target_date: drafts.targetDate || undefined })}>应用日期</Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDrafts((current) => ({ ...current, targetDate: '' }));
                      onClearFilters(['hc_status', 'target_date']);
                    }}
                  >
                    清除
                  </Button>
                </div>
              </ColumnFilterHeader>
              <ColumnFilterHeader
                data-ui="demand-column-filter-stage"
                label="阶段进度（可点击）"
                open={openFilter === 'stage'}
                onToggle={() => toggleFilter('stage')}
              >
                <select
                  aria-label="按候选人阶段筛选"
                  value={query.pipeline_stage ?? 'all'}
                  onChange={(event) => onApplyFilter({
                    pipeline_stage: event.target.value === 'all'
                      ? undefined
                      : event.target.value as DemandListQuery['pipeline_stage'],
                  })}
                  className={fieldClassName}
                >
                  <option value="all">不限阶段</option>
                  {STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <Button type="button" size="sm" variant="ghost" onClick={() => onClearFilters(['pipeline_stage'])}>清除</Button>
              </ColumnFilterHeader>
              <ColumnFilterHeader
                data-ui="demand-column-filter-status"
                label="状态"
                open={openFilter === 'status'}
                onToggle={() => toggleFilter('status')}
              >
                <select
                  aria-label="按需求状态筛选"
                  value={query.status ?? 'all'}
                  onChange={(event) => onApplyFilter({
                    status: event.target.value as DemandListQuery['status'],
                  })}
                  className={fieldClassName}
                >
                  <option value="all">全部状态</option>
                  {(Object.entries(STATUS_LABELS) as Array<[DemandStatus, string]>).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <Button type="button" size="sm" variant="ghost" onClick={() => onApplyFilter({ status: 'all' })}>清除</Button>
              </ColumnFilterHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {response.items.map((demand) => (
              <tr key={demand.id} className="align-top hover:bg-surface-soft/60">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    data-ui="demand-job-filter"
                    className="text-left font-medium text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    onClick={(event) => {
                      event.stopPropagation();
                      onApplyFilter({ job_title: demand.job_title });
                    }}
                  >
                    {demand.job_title}
                  </button>
                  <button
                    type="button"
                    data-ui="demand-request-filter"
                    disabled={!demand.request_no}
                    title={demand.request_no ? '按需求编号筛选' : '该需求未记录需求编号'}
                    className="mt-1 block rounded text-left text-xs text-muted hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!demand.request_no) return;
                      onApplyFilter({ request_no: demand.request_no });
                    }}
                  >
                    {demand.request_no || `需求 #${demand.id}`}
                  </button>
                  <button
                    type="button"
                    data-ui="demand-details-trigger"
                    className="mt-2 rounded-md border border-hairline px-2 py-1 text-xs font-medium text-ink hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDemand(demand, { kind: 'overview' });
                    }}
                  >
                    查看详情
                  </button>
                </td>
                <td className="px-4 py-3 text-body">
                  <button
                    type="button"
                    data-ui="demand-department-filter"
                    disabled={!demand.job_department}
                    title={demand.job_department ? '按部门筛选' : '该需求未记录部门'}
                    className="block rounded text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:no-underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onApplyFilter({ department: demand.job_department });
                    }}
                  >
                    {demand.job_department || '未记录部门'}
                  </button>
                  <button
                    type="button"
                    data-ui="demand-city-filter"
                    disabled={!demand.job_city}
                    title={demand.job_city ? '按城市筛选' : '该需求未记录城市'}
                    className="mt-1 block rounded text-left text-xs text-muted hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:no-underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onApplyFilter({ city: demand.job_city });
                    }}
                  >
                    {demand.job_city || '未记录城市'}
                  </button>
                </td>
                <td className="px-4 py-3 text-body">
                  <button
                    type="button"
                    data-ui="demand-owner-detail-trigger"
                    className="rounded-md text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label={`在右侧查看负责人详情：${demand.owner_hr_name || `专员 ${demand.owner_hr_id}`}`}
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
                    data-ui="demand-hc-detail-trigger"
                    className="block rounded-md text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label={`在右侧查看 HC 交付详情：${demand.metrics.onboarded_count} / ${demand.headcount}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDemand(demand, { kind: 'headcount' });
                    }}
                  >
                    {demand.metrics.onboarded_count} / {demand.headcount}
                  </button>
                  <button
                    type="button"
                    data-ui="demand-target-date-filter"
                    disabled={!demand.target_date}
                    title={demand.target_date ? '按截止日期筛选' : '该需求未记录截止日期'}
                    className="mt-1 block rounded text-left text-xs text-muted hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:no-underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!demand.target_date) return;
                      onApplyFilter({ target_date: demand.target_date });
                    }}
                  >
                    {demand.target_date || '未记录日期'}
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
                    data-ui="demand-status-detail-trigger"
                    className="rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label={`${STATUS_LABELS[demand.status]}，在右侧查看状态与风险`}
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
