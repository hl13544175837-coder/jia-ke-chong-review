import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Briefcase, Users } from 'lucide-react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/formatDate';
import { stageLabel } from '../../../lib/pipelineStages';
import { useAsync } from '../../../lib/useAsync';
import type { CandidateOwnerOption, DemandStatus, RecruitmentDemand, Role } from '../../../types';
import { Badge, Button, DrawerShell, ErrorState, Spinner } from '../../../components/ui';
import type { DemandActionMode } from './DemandActionDialog';

export type DemandDrawerContext =
  | { kind: 'overview' }
  | { kind: 'stage'; stage: string; label: string }
  | { kind: 'headcount' }
  | { kind: 'owner' }
  | { kind: 'status' };

const STATUS_LABELS: Record<DemandStatus, string> = {
  pending: '待确认',
  active: '招聘中',
  paused: '暂停',
  filled: '已完成',
  cancelled: '已取消',
  closed: '提前关闭',
};

const RISK_LABELS: Record<string, string> = {
  overdue: '已超过期望完成日期',
  business_feedback_pending: '有候选人等待业务反馈',
  low_interview_conversion: '推荐较多但尚未进入面试',
  open_too_long: '需求开放时间较长',
  hr_no_recommendation: '需求接收后尚未推荐候选人',
  no_active_candidates: '当前没有仍在推进的候选人',
};

function statusTone(status: DemandStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'pending' || status === 'paused') return 'warning';
  if (status === 'cancelled' || status === 'closed') return 'danger';
  return 'neutral';
}

function contextTitle(context: DemandDrawerContext) {
  if (context.kind === 'stage') return `${context.label}候选人`;
  if (context.kind === 'headcount') return 'HC 与交付';
  if (context.kind === 'owner') return '责任人';
  if (context.kind === 'status') return '状态与风险';
  return '需求概览';
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 text-sm font-medium text-ink">{children}</div>
    </div>
  );
}

function OverviewContext({ demand }: { demand: RecruitmentDemand }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold text-ink">需求事实</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Fact label="用人部门">{demand.job_department || '未记录'}</Fact>
          <Fact label="招聘城市">{demand.job_city || '未记录'}</Fact>
          <Fact label="优先级">{demand.priority} 级</Fact>
          <Fact label="期望完成">{demand.target_date || '未记录'}</Fact>
          <Fact label="提需求日期">{demand.requested_at || '未记录'}</Fact>
          <Fact label="当前状态">
            <Badge tone={statusTone(demand.status)}>{STATUS_LABELS[demand.status]}</Badge>
          </Fact>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-ink">当前进度</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ['全部', demand.metrics.recommended_count],
            ['待反馈', demand.metrics.business_review_count],
            ['面试', demand.metrics.interview_count],
            ['Offer', demand.metrics.offer_count],
            ['已入职', demand.metrics.onboarded_count],
            ['已转出', demand.metrics.transferred_count],
          ].map(([label, value]) => (
            <Fact key={String(label)} label={String(label)}>
              <span className="text-lg tabular-nums">{value}</span>
            </Fact>
          ))}
        </div>
      </section>

      {demand.note && (
        <section className="rounded-md bg-surface-soft px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">需求备注</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-body">{demand.note}</p>
        </section>
      )}
    </div>
  );
}

function ProgressContext({ demand, context }: {
  demand: RecruitmentDemand;
  context: Extract<DemandDrawerContext, { kind: 'stage' }>;
}) {
  const board = useAsync(() => api.getDemandPipelineBoard(demand.id), [demand.id]);
  const candidates = useMemo(() => {
    const items = board.data?.candidates ?? [];
    return context.stage === 'all'
      ? items
      : items.filter((candidate) => candidate.stage === context.stage);
  }, [board.data, context.stage]);

  if (board.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner size="sm" />正在加载真实候选人…
      </div>
    );
  }
  if (board.error) return <ErrorState message={board.error.message} onRetry={board.reload} />;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-hairline bg-surface-soft px-4 py-3">
        <p className="text-xs text-muted">{context.label}阶段</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{candidates.length}</p>
        <p className="mt-1 text-xs text-muted-soft">数据来自当前需求的真实流程看板。</p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline px-4 py-10 text-center">
          <Users className="mx-auto h-5 w-5 text-muted" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-ink">该范围暂无候选人</p>
          <p className="mt-1 text-xs text-muted">这是真实空态，不会用演示数据填充。</p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline-soft rounded-md border border-hairline">
          {candidates.map((candidate) => (
            <li key={candidate.candidate_id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-muted">
                <Users className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{candidate.name_masked}</p>
                <p className="mt-1 text-xs text-muted">
                  {candidate.updated_at ? `更新于 ${formatDate(candidate.updated_at)}` : '暂无更新时间'}
                  {candidate.updated_by_name ? ` · ${candidate.updated_by_name}` : ''}
                </p>
              </div>
              <Badge tone="neutral">{stageLabel(candidate.stage)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HeadcountContext({ demand }: { demand: RecruitmentDemand }) {
  const onboarded = demand.metrics.onboarded_count;
  const remaining = Math.max(demand.headcount - onboarded, 0);
  const progress = demand.headcount > 0 ? Math.min((onboarded / demand.headcount) * 100, 100) : 0;

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-hairline bg-surface-soft px-4 py-4">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs text-muted">已入职 / 目标 HC</p><p className="mt-1 text-2xl font-semibold text-ink">{onboarded} / {demand.headcount}</p></div>
          <p className="text-sm font-medium text-body">剩余 {remaining} 人</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-strong" aria-label={`HC 完成度 ${Math.round(progress)}%`}>
          <div className="h-full rounded-full bg-[var(--enterprise-brand)]" style={{ width: `${progress}%` }} />
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3">
        <Fact label="全部候选人">{demand.metrics.recommended_count}</Fact>
        <Fact label="Offer 中">{demand.metrics.offer_count}</Fact>
        <Fact label="期望完成">{demand.target_date || '未记录'}</Fact>
        <Fact label="HC 完成提示">{demand.completion_suggested ? '待确认完成' : '未达成'}</Fact>
      </div>
    </div>
  );
}

function ResponsibilityContext({ demand, focus }: { demand: RecruitmentDemand; focus: 'owner' | 'status' }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold text-ink">责任与状态</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label="招聘负责人">{demand.owner_hr_name || `专员 #${demand.owner_hr_id}`}</Fact>
          <Fact label="用人负责人">{demand.hiring_manager_name || '未记录'}</Fact>
          <Fact label="需求提出人">{demand.requester_name || '未记录'}</Fact>
          <Fact label="默认面试官">{demand.default_interviewer_name || '未设置'}</Fact>
          <Fact label="当前状态"><Badge tone={statusTone(demand.status)}>{STATUS_LABELS[demand.status]}</Badge></Fact>
          <Fact label="优先级">{demand.priority} 级</Fact>
        </div>
      </section>

      {focus === 'status' && (
        <section className="rounded-md border border-hairline px-4 py-4">
          <h3 className="text-sm font-semibold text-ink">当前风险</h3>
          {demand.risk_flags.length === 0 ? (
            <p className="mt-2 text-sm text-muted">当前没有系统识别出的卡点。</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-body">
              {demand.risk_flags.map((risk) => (
                <li key={risk} className="rounded-md bg-warning-50 px-3 py-2 text-warning-800">
                  {RISK_LABELS[risk] ?? '存在待核实的招聘卡点'}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {focus === 'owner' && (
        <p className="rounded-md bg-surface-soft px-4 py-3 text-sm text-body">
          可直接使用上方“转派负责人”。系统会继续按公司权限校验，不会在前端绕过权限。
        </p>
      )}
    </div>
  );
}

function DemandActions({
  demand,
  role,
  owners,
  ownersLoading,
  ownersError,
  actionNotice,
  onReloadOwners,
  onRequestAction,
}: {
  demand: RecruitmentDemand;
  role: Role | null;
  owners: CandidateOwnerOption[];
  ownersLoading: boolean;
  ownersError: string | null;
  actionNotice: string | null;
  onReloadOwners: () => void;
  onRequestAction: (mode: DemandActionMode) => void;
}) {
  const canReassignOwner = role === 'manager' || role === 'admin';
  const hasAlternativeOwner = owners.some((owner) => owner.id !== demand.owner_hr_id);
  const ownerDisabled = !canReassignOwner || ownersLoading || Boolean(ownersError) || !hasAlternativeOwner;
  const canRestore = ['paused', 'filled', 'cancelled', 'closed'].includes(demand.status);

  return (
    <section data-ui="demand-drawer-actions" className="mb-5 rounded-md border border-hairline px-4 py-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => onRequestAction('priority')}>调整优先级</Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={ownerDisabled}
          onClick={() => onRequestAction('owner')}
        >
          转派负责人
        </Button>
        {canRestore ? (
          <Button type="button" size="sm" onClick={() => onRequestAction('restore')}>恢复需求</Button>
        ) : (
          <Button type="button" size="sm" variant="danger" onClick={() => onRequestAction('close')}>暂停 / 关闭</Button>
        )}
      </div>

      {!canReassignOwner && (
        <p className="mt-3 text-xs text-muted">仅招聘经理或管理员可转派负责人；其他需求动作仍按公司权限校验。</p>
      )}
      {canReassignOwner && ownersLoading && (
        <p className="mt-3 text-xs text-muted">正在加载可转派负责人，加载完成前不会开放转派。</p>
      )}
      {canReassignOwner && ownersError && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-warning-50 px-3 py-2 text-xs text-warning-800">
          <span>负责人列表加载失败，暂时不能转派；其他需求动作仍可使用。</span>
          <Button type="button" size="sm" variant="secondary" onClick={onReloadOwners}>重新加载负责人</Button>
        </div>
      )}
      {canReassignOwner && !ownersLoading && !ownersError && !hasAlternativeOwner && (
        <p className="mt-3 text-xs text-muted">暂无其他可转派招聘负责人；请管理员先创建或启用其他招聘专员账号。</p>
      )}
      {actionNotice && (
        <p role="status" className="mt-3 rounded-md bg-success-50 px-3 py-2 text-sm text-success-800">{actionNotice}</p>
      )}
    </section>
  );
}

export function DemandWorkspaceDrawer({
  demand,
  context,
  role,
  owners,
  ownersLoading,
  ownersError,
  actionNotice,
  onReloadOwners,
  onRequestAction,
  onClose,
}: {
  demand: RecruitmentDemand | null;
  context: DemandDrawerContext;
  role: Role | null;
  owners: CandidateOwnerOption[];
  ownersLoading: boolean;
  ownersError: string | null;
  actionNotice: string | null;
  onReloadOwners: () => void;
  onRequestAction: (mode: DemandActionMode) => void;
  onClose: () => void;
}) {
  const [activeContext, setActiveContext] = useState<DemandDrawerContext>(context);

  useEffect(() => {
    setActiveContext(context);
  }, [context, demand?.id]);

  if (!demand) return null;
  const progressContext: Extract<DemandDrawerContext, { kind: 'stage' }> = activeContext.kind === 'stage'
    ? activeContext
    : { kind: 'stage', stage: 'all', label: '全部' };
  const kanbanHref = activeContext.kind === 'stage'
    ? activeContext.stage === 'all'
      ? `/kanban?demand=${demand.id}`
      : `/kanban?demand=${demand.id}&stage=${activeContext.stage}`
    : null;

  return (
    <DrawerShell
      open
      onClose={onClose}
      size="xl"
      testId="demand-workspace-drawer"
      eyebrow={demand.request_no || `需求 #${demand.id}`}
      title={demand.job_title}
      description={`${contextTitle(activeContext)} · ${demand.job_department || '部门未记录'} · ${demand.job_city || '城市未记录'}`}
      footer={(
        <>
          {kanbanHref && (
            <Link to={kanbanHref}>
              <Button type="button" variant="secondary" size="sm">进入完整候选人看板<ArrowUpRight className="h-3.5 w-3.5" /></Button>
            </Link>
          )}
          <Link to={`/jobs/${demand.job_id}/match?demand=${demand.id}`}>
            <Button type="button" variant="secondary" size="sm">匹配候选人<ArrowUpRight className="h-3.5 w-3.5" /></Button>
          </Link>
          <Link to={`/demands/${demand.id}`}>
            <Button type="button" variant="secondary" size="sm">打开完整需求工作台<ArrowUpRight className="h-3.5 w-3.5" /></Button>
          </Link>
        </>
      )}
    >
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="需求详情分类">
        <Button type="button" size="sm" variant={activeContext.kind === 'overview' ? 'primary' : 'secondary'} onClick={() => setActiveContext({ kind: 'overview' })}>概览</Button>
        <Button type="button" size="sm" variant={activeContext.kind === 'stage' || activeContext.kind === 'headcount' ? 'primary' : 'secondary'} onClick={() => setActiveContext(progressContext)}>候选人与进度</Button>
        <Button type="button" size="sm" variant={activeContext.kind === 'owner' || activeContext.kind === 'status' ? 'primary' : 'secondary'} onClick={() => setActiveContext({ kind: 'owner' })}>责任与状态</Button>
      </div>

      <div className="mb-5 flex items-center gap-2 rounded-md bg-surface-soft px-3 py-2 text-xs text-muted">
        <Briefcase className="h-4 w-4" aria-hidden="true" />
        当前仍在需求列表页，关闭抽屉后筛选和滚动位置会保留。
      </div>

      <DemandActions
        demand={demand}
        role={role}
        owners={owners}
        ownersLoading={ownersLoading}
        ownersError={ownersError}
        actionNotice={actionNotice}
        onReloadOwners={onReloadOwners}
        onRequestAction={onRequestAction}
      />

      {activeContext.kind === 'overview' && <OverviewContext demand={demand} />}
      {activeContext.kind === 'stage' && <ProgressContext demand={demand} context={activeContext} />}
      {activeContext.kind === 'headcount' && <HeadcountContext demand={demand} />}
      {(activeContext.kind === 'owner' || activeContext.kind === 'status') && (
        <ResponsibilityContext demand={demand} focus={activeContext.kind} />
      )}
    </DrawerShell>
  );
}
