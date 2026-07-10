import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  ClipboardList,
  Clock3,
  MessageSquareWarning,
  UserRound,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui';
import type {
  BiDemandOperationalMetrics,
  BiFunnel,
  DemandStatus,
  RecruitmentDemand,
} from '../types';

const PURPOSE_LABEL = '仅用于进度、卡点和当前责任协同，不用于绩效考核';

const DEMAND_STATUS_LABELS: Record<DemandStatus, string> = {
  pending: '待启动',
  active: '招聘中',
  paused: '已暂停',
  filled: '已完成',
  cancelled: '已取消',
  closed: '已关闭',
};

const FUNNEL_STAGES = [
  { key: 'pending', label: '待筛选', tone: 'neutral' },
  { key: 'ai_screen', label: 'AI 初筛', tone: 'brand' },
  { key: 'business_review', label: '业务待反馈', tone: 'warning' },
  { key: 'interview', label: '面试中', tone: 'accent' },
  { key: 'offer', label: 'Offer', tone: 'purple' },
  { key: 'onboarded', label: '已入职', tone: 'success' },
  { key: 'rejected', label: '已淘汰', tone: 'danger' },
  { key: 'transferred', label: '已转出', tone: 'teal' },
] as const;

type FunnelStageKey = (typeof FUNNEL_STAGES)[number]['key'];
type BadgeTone = (typeof FUNNEL_STAGES)[number]['tone'];

function safeNum(value: number | undefined): number {
  return Number.isFinite(value) ? (value ?? 0) : 0;
}

function parseDemandId(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatDate(value: string | null): string {
  if (!value) return '未设置';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

function demandLabel(demand: RecruitmentDemand): string {
  const context = [demand.requester_department, demand.job_city].filter(Boolean).join(' · ');
  return `${demand.request_no || `D${demand.id}`} · ${demand.job_title}${context ? ` · ${context}` : ''}`;
}

function statusTone(status: string): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'active') return 'success';
  if (status === 'pending' || status === 'paused') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

function SummaryCard({ title, value, detail, children }: {
  title: string;
  value: ReactNode;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <Card variant="elevated">
      <CardBody>
        <p className="text-xs font-medium text-muted">{title}</p>
        <p className="mt-2 text-2xl font-display text-ink">{value}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
        {children}
      </CardBody>
    </Card>
  );
}

function hasOperationalFacts(metrics: BiDemandOperationalMetrics): boolean {
  return (
    safeNum(metrics.funnel.funnel_total) > 0
    || metrics.stage_age.length > 0
    || metrics.outstanding_feedback.count > 0
    || metrics.offers.total > 0
  );
}

function stageCount(funnel: BiFunnel, stage: FunnelStageKey): number {
  return safeNum(funnel[stage]);
}

function DemandMetrics({ demandId }: { demandId: number }) {
  const { data: metrics, loading, error, reload } = useAsync(
    () => api.biDemand(demandId),
    [demandId],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" aria-label="正在加载需求进度">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="这个需求的进度暂时无法加载"
          description={error.message}
          action={<Button variant="secondary" onClick={reload}>重试</Button>}
        />
      </Card>
    );
  }

  if (!metrics) return null;

  if (!hasOperationalFacts(metrics)) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="这个需求还没有候选人流程事实"
          description="先把候选人加入该需求的流程，阶段、面试、Offer 和 HC 进度才会在这里出现。"
          action={(
            <Link
              to={`/pipeline?demand=${demandId}`}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--enterprise-brand)] px-5 text-sm font-semibold text-on-primary hover:bg-[var(--enterprise-brand-dark)]"
            >
              去候选人流程 <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        />
      </Card>
    );
  }

  const purposeLabel = metrics.purpose_label || PURPOSE_LABEL;
  const responsibility = metrics.current_responsibility;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-hairline bg-surface-card px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-display text-ink">{metrics.demand.title}</h2>
            <Badge tone={statusTone(metrics.demand.status)}>
              {DEMAND_STATUS_LABELS[metrics.demand.status as DemandStatus] ?? metrics.demand.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {[metrics.demand.department, metrics.demand.city].filter(Boolean).join(' · ') || '部门与城市未记录'}
            {' · '}目标日期 {formatDate(metrics.demand.target_date)}
          </p>
        </div>
        <Badge tone="info">{purposeLabel}</Badge>
      </div>

      <Card variant="elevated">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>流程阶段</CardTitle>
              <p className="mt-1 text-xs text-muted">每个数字都可进入该需求的候选人明细</p>
            </div>
            <Badge tone="neutral">当前流程人数 {safeNum(metrics.funnel.pipeline_total)}</Badge>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {FUNNEL_STAGES.map((stage) => (
              <Link
                key={stage.key}
                to={`/pipeline?demand=${demandId}&stage=${stage.key}`}
                className="group rounded-lg border border-hairline bg-surface-soft px-3 py-3 transition hover:border-[var(--enterprise-brand)] hover:bg-surface-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">{stage.label}</span>
                  <Badge tone={stage.tone as BadgeTone}>{stageCount(metrics.funnel, stage.key)}</Badge>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--enterprise-brand-dark)]">
                  查看明细 <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">“已转出”单独记录，不计入“已淘汰”。</p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          title="HC 进度"
          value={`${metrics.hc.onboarded_count} / ${metrics.hc.headcount}`}
          detail={`完成度 ${safeNum(metrics.hc.completion_rate).toFixed(1)}% · 剩余 ${metrics.hc.remaining} 人`}
        >
          {metrics.hc.completion_suggested && (
            <Badge tone="success" className="mt-3">已达 HC，建议由 HR 确认完成</Badge>
          )}
        </SummaryCard>
        <SummaryCard
          title="Offer"
          value={metrics.offers.total}
          detail="Offer 事实只归当前招聘需求"
        >
          <Link
            to={`/pipeline?demand=${demandId}&stage=offer`}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--enterprise-brand-dark)] hover:underline"
          >
            查看 Offer 候选人 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </SummaryCard>
        <SummaryCard
          title="当前协同责任"
          value={responsibility.owner_name || '未指定负责人'}
          detail={`活动候选人 ${responsibility.active_candidates} 人 · 待补反馈 ${responsibility.outstanding_feedback} 条`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card variant="elevated">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>阶段停留</CardTitle>
                <p className="mt-1 text-xs text-muted">先看停留最久的候选人，协调当前责任人</p>
              </div>
              <Clock3 className="h-5 w-5 text-muted" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardBody>
            {metrics.stage_age.length === 0 ? (
              <p className="text-sm text-muted">暂无阶段停留记录</p>
            ) : (
              <div className="divide-y divide-hairline-soft">
                {metrics.stage_age.slice(0, 8).map((item) => (
                  <Link
                    key={`${item.candidate_id}-${item.stage}`}
                    to={`/pipeline?demand=${demandId}&stage=${item.stage}&candidate=${item.candidate_id}`}
                    className="flex items-center justify-between gap-4 py-3 hover:text-[var(--enterprise-brand-dark)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{item.candidate_name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {item.stage_label} · 最后处理 {item.last_actor_name || '未记录'}
                      </p>
                    </div>
                    <Badge tone={item.age_days >= 7 ? 'warning' : 'neutral'}>{item.age_days} 天</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card variant="elevated">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>面试反馈跟进</CardTitle>
                <p className="mt-1 text-xs text-muted">只用来找待办和当前责任，不排名面试官</p>
              </div>
              <Badge tone={metrics.outstanding_feedback.count > 0 ? 'warning' : 'success'}>
                待补反馈 {metrics.outstanding_feedback.count}
              </Badge>
            </div>
          </CardHeader>
          <CardBody>
            {metrics.outstanding_feedback.items.length === 0 ? (
              <p className="text-sm text-muted">当前没有待补的面试反馈。</p>
            ) : (
              <div className="divide-y divide-hairline-soft">
                {metrics.outstanding_feedback.items.slice(0, 8).map((item) => (
                  <Link
                    key={item.assignment_id}
                    to={`/interviews?demand=${demandId}`}
                    className="flex items-center justify-between gap-4 py-3 hover:text-[var(--enterprise-brand-dark)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{item.candidate_name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {item.round || `第 ${item.round_sequence} 轮`} · {item.interviewer_name || '未记录面试官'}
                        {item.is_primary ? ' · 主面试官' : ' · 辅助面试官'}
                      </p>
                    </div>
                    <Badge tone="warning">超时 {item.overdue_days} 天</Badge>
                  </Link>
                ))}
              </div>
            )}
            <Link
              to={`/interviews?demand=${demandId}`}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--enterprise-brand-dark)] hover:underline"
            >
              打开该需求的面试待办 <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-soft px-4 py-3">
          <Users className="h-5 w-5 text-muted" aria-hidden="true" />
          <div><p className="text-xs text-muted">当前流程</p><p className="text-sm font-medium text-ink">{safeNum(metrics.funnel.pipeline_total)} 人</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-soft px-4 py-3">
          <Briefcase className="h-5 w-5 text-muted" aria-hidden="true" />
          <div><p className="text-xs text-muted">Offer 记录</p><p className="text-sm font-medium text-ink">{metrics.offers.total} 条</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-soft px-4 py-3">
          <UserRound className="h-5 w-5 text-muted" aria-hidden="true" />
          <div><p className="text-xs text-muted">当前负责人</p><p className="text-sm font-medium text-ink">{responsibility.owner_name || '未指定'}</p></div>
        </div>
      </div>
    </div>
  );
}

export function BiPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = parseDemandId(searchParams.get('demand'));
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(null);
  const {
    data: demandList,
    loading: demandsLoading,
    error: demandsError,
    reload: reloadDemands,
  } = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100, sort: 'created_at_desc' }),
    [],
  );

  const demands = demandList?.items ?? [];

  useEffect(() => {
    if (!demandList) return;
    if (demandList.items.length === 0) {
      if (selectedDemandId !== null) setSelectedDemandId(null);
      return;
    }

    const selectedIsVisible = selectedDemandId !== null
      && demandList.items.some((item) => item.id === selectedDemandId);
    const requestedIsVisible = requestedDemandId !== null
      && demandList.items.some((item) => item.id === requestedDemandId);
    const nextId = selectedIsVisible
      ? selectedDemandId
      : requestedIsVisible
        ? requestedDemandId
        : demandList.items[0].id;

    if (selectedDemandId !== nextId) setSelectedDemandId(nextId);
    if (requestedDemandId !== nextId) {
      setSearchParams({ demand: String(nextId) }, { replace: true });
    }
  }, [demandList, requestedDemandId, selectedDemandId, setSearchParams]);

  const selectDemand = (demandId: number) => {
    setSelectedDemandId(demandId);
    setSearchParams({ demand: String(demandId) }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="进度看板"
        description="按具体招聘需求看进度、卡点和当前责任"
        actions={demands.length > 0 ? (
          <label className="flex min-w-[280px] flex-col gap-1 text-xs font-medium text-muted" htmlFor="bi-demand-select">
            选择招聘需求
            <Select
              id="bi-demand-select"
              value={selectedDemandId ?? ''}
              onChange={(event) => selectDemand(Number(event.target.value))}
              aria-label="选择招聘需求"
            >
              {demands.map((demand) => (
                <option key={demand.id} value={demand.id}>{demandLabel(demand)}</option>
              ))}
            </Select>
          </label>
        ) : undefined}
      />

      <div className="flex items-start gap-2 rounded-md border border-[#b8ddff] bg-[#edf6ff] px-4 py-3 text-sm text-[#1e6fd9]">
        <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{PURPOSE_LABEL}。当前负责人回答“现在该谁接住”，不改写历史操作人。</p>
      </div>

      {demandsLoading && (
        <div className="flex items-center justify-center py-24" aria-label="正在加载招聘需求">
          <Spinner size="lg" />
        </div>
      )}

      {demandsError && (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="招聘需求暂时无法加载"
            description={demandsError.message}
            action={<Button variant="secondary" onClick={reloadDemands}>重试</Button>}
          />
        </Card>
      )}

      {!demandsLoading && !demandsError && demandList && demands.length === 0 && (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="暂无招聘需求"
            description="进度看板只展示真实招聘需求下的流程事实，不会用空 KPI 代替业务数据。"
            action={(
              <Link
                to="/demands"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--enterprise-brand)] px-5 text-sm font-semibold text-on-primary hover:bg-[var(--enterprise-brand-dark)]"
              >
                去创建招聘需求 <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          />
        </Card>
      )}

      {!demandsLoading && !demandsError && selectedDemandId !== null && (
        <DemandMetrics demandId={selectedDemandId} />
      )}
    </div>
  );
}
