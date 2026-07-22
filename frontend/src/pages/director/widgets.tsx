// Shared presentational widgets for the Readdy analytics/director graft.
// All data comes from the real BI/Offer APIs (api.biOverview / api.biDemand /
// api.listOffers); these components only render what they are given.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock3,
  MessageSquareWarning,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Spinner,
} from '../../components/ui';
import type {
  BiDemandOperationalMetrics,
  BiFunnel,
  BiManagerAlert,
  BiOperationalFunnel,
} from '../../types';
import {
  DIRECTOR_PURPOSE_LABEL,
  OVERVIEW_FUNNEL_STAGES,
  alertKindLabel,
  alertTone,
  demandStatusLabel,
  demandStatusTone,
  formatDate,
  funnelStageCount,
  safeNum,
} from './utils';

// Purpose banner: every grafted page states the BI reading boundary.
export function PurposeBanner() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-[#b8ddff] bg-[#edf6ff] px-4 py-3 text-sm text-[#1e6fd9]">
      <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{DIRECTOR_PURPOSE_LABEL}。所有数字来自真实流程事实，接口失败会明确标注，不会用假数据补齐。</p>
    </div>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const accent =
    tone === 'danger'
      ? 'border-[#ffc7c7] bg-[#fff1f0]'
      : tone === 'warning'
        ? 'border-[#ffe2a8] bg-[#fff7e6]'
        : 'border-[#e8e7e1] bg-white';
  return (
    <div className={`rounded-xl border p-4 ${accent}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#777b78]">{label}</span>
        <Icon className="h-4 w-4 text-[#929793]" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[#292b2a]">{value}</p>
      {detail && <p className="mt-1 text-xs text-[#858a86]">{detail}</p>}
    </div>
  );
}

// Horizontal funnel bars. A demand-scoped rendering links each stage to the
// exact Readdy Kanban context; the organization-wide rendering stays read-only.
export function OverviewFunnelBars({
  funnel,
  demandId,
}: {
  funnel: BiOperationalFunnel | BiFunnel;
  demandId?: number;
}) {
  const max = Math.max(
    1,
    ...OVERVIEW_FUNNEL_STAGES.map((stage) => funnelStageCount(funnel, stage.key)),
  );
  return (
    <div className="space-y-3">
      {OVERVIEW_FUNNEL_STAGES.map((stage, index) => {
        const value = funnelStageCount(funnel, stage.key);
        const pct = Math.max((value / max) * 100, value > 0 ? 6 : 0);
        const colors = [
          'bg-[#3d7b6b]',
          'bg-[#5a9484]',
          'bg-[#c47b55]',
          'bg-[#7b9cc4]',
          'bg-[#8a7bb8]',
          'bg-[#4f9e6e]',
        ];
        const content = (
          <>
            <span className="w-20 shrink-0 whitespace-nowrap text-xs text-[#5f6561]">
              {stage.label}
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded-full bg-[#f1f2ee]">
              <div
                className={`flex h-full items-center rounded-full pl-3 transition-all duration-700 ${colors[index]}`}
                style={{ width: `${pct}%` }}
              >
                {value > 0 && (
                  <span className="text-xs font-semibold text-white">{value}</span>
                )}
              </div>
            </div>
            <span className="w-12 text-right text-xs font-medium text-[#777b78]">
              {value} 人
            </span>
          </>
        );
        return demandId ? (
          <Link
            key={stage.key}
            to={`/kanban?demand=${demandId}&stage=${stage.key}`}
            className="flex items-center gap-3 rounded-lg transition-colors hover:bg-[#fafbf8] focus:outline-none focus:ring-2 focus:ring-[#b8d6cb]"
          >
            {content}
          </Link>
        ) : (
          <div key={stage.key} className="flex items-center gap-3">{content}</div>
        );
      })}
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-[#efefeb] pt-3 text-xs text-[#777b78]">
        <span>
          当前流程 <strong className="text-[#292b2a]">{safeNum(funnel.pipeline_total)}</strong> 人
        </span>
        <span>
          已淘汰 <strong className="text-[#292b2a]">{safeNum(funnel.rejected)}</strong> 人
        </span>
        <span>
          已转出 <strong className="text-[#292b2a]">{safeNum(funnel.transferred)}</strong> 人（单独记录，不计入淘汰）
        </span>
      </div>
    </div>
  );
}

export function AlertList({
  alerts,
  limit = 6,
  emptyText = '当前没有需要协调的卡点或待补反馈。',
}: {
  alerts: BiManagerAlert[];
  limit?: number;
  emptyText?: string;
}) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 px-1 py-2 text-sm text-[#777b78]">
        <Clock3 className="h-4 w-4 text-[#52a611]" aria-hidden="true" />
        {emptyText}
      </div>
    );
  }
  return (
    <div className="divide-y divide-[#efefeb]">
      {alerts.slice(0, limit).map((alert) => (
        <Link
          key={`${alert.kind}-${alert.demand_id}-${alert.candidate_id}-${alert.stage}-${alert.assignment_id ?? ''}`}
          to={alert.action_path || '/director/progress'}
          className="flex items-start gap-3 py-3 transition-colors hover:bg-[#fafbf8]"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fff7e6] text-[#b56a00]">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[#292b2a]">{alert.title}</span>
              <Badge tone={alertTone(alert.priority)}>{alertKindLabel(alert.kind)}</Badge>
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#777b78]">
              {alert.detail}
              {alert.owner_name ? ` · 当前负责人：${alert.owner_name}` : ''}
            </span>
          </span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#c3c7c0]" aria-hidden="true" />
        </Link>
      ))}
    </div>
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

// Single-demand drill-down panel backed by api.biDemand. Shared by the
// analytics page and the director progress page.
export function DemandDrilldown({ demandId }: { demandId: number }) {
  const { data: metrics, loading, error, reload } = useAsync(
    () => api.biDemand(demandId),
    [demandId],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" aria-label="正在加载需求进展">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="这个需求的进展暂时无法加载"
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
          icon={BarChart3}
          title="这个需求还没有流程事实"
          description="候选人进入该需求的流程后，阶段分布、面试反馈和 HC 进展会在这里出现。"
        />
      </Card>
    );
  }

  const responsibility = metrics.current_responsibility;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[#e8e7e1] bg-white px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-[#292b2a]">{metrics.demand.title}</h2>
            <Badge tone={demandStatusTone(metrics.demand.status)}>
              {demandStatusLabel(metrics.demand.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[#777b78]">
            {[metrics.demand.department, metrics.demand.city].filter(Boolean).join(' · ') || '部门与城市未记录'}
            {' · '}目标日期 {formatDate(metrics.demand.target_date)}
          </p>
        </div>
        <Badge tone="info">{metrics.purpose_label || DIRECTOR_PURPOSE_LABEL}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-[#e8e7e1] bg-white p-4">
          <p className="text-xs text-[#777b78]">当前流程</p>
          <p className="mt-1 text-2xl font-bold text-[#292b2a]">{safeNum(metrics.funnel.pipeline_total)}</p>
        </div>
        <div className="rounded-xl border border-[#e8e7e1] bg-white p-4">
          <p className="text-xs text-[#777b78]">HC 进度</p>
          <p className="mt-1 text-2xl font-bold text-[#292b2a]">
            {metrics.hc.onboarded_count} / {metrics.hc.headcount}
          </p>
          <p className="mt-1 text-xs text-[#858a86]">
            完成度 {safeNum(metrics.hc.completion_rate).toFixed(1)}% · 剩余 {metrics.hc.remaining} 人
          </p>
        </div>
        <div className="rounded-xl border border-[#e8e7e1] bg-white p-4">
          <p className="text-xs text-[#777b78]">Offer 记录</p>
          <p className="mt-1 text-2xl font-bold text-[#292b2a]">{metrics.offers.total}</p>
        </div>
        <div className="rounded-xl border border-[#e8e7e1] bg-white p-4">
          <p className="text-xs text-[#777b78]">当前协同责任</p>
          <p className="mt-1 truncate text-lg font-semibold text-[#292b2a]">
            {responsibility.owner_name || '未指定负责人'}
          </p>
          <p className="mt-1 text-xs text-[#858a86]">
            活动候选人 {responsibility.active_candidates} · 待补反馈 {responsibility.outstanding_feedback}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>需求阶段分布</CardTitle>
          <p className="mt-1 text-xs text-[#858a86]">点击阶段可进入该 Demand 的新看板继续下钻</p>
        </CardHeader>
        <CardBody>
          <OverviewFunnelBars funnel={metrics.funnel} demandId={demandId} />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>阶段停留最久的候选人</CardTitle>
            <p className="mt-1 text-xs text-[#858a86]">用于协调当前责任人，不作历史归因</p>
          </CardHeader>
          <CardBody>
            {metrics.stage_age.length === 0 ? (
              <p className="text-sm text-[#777b78]">暂无阶段停留记录。</p>
            ) : (
              <div className="divide-y divide-[#efefeb]">
                {metrics.stage_age.slice(0, 6).map((item) => (
                  <Link
                    key={`${item.candidate_id}-${item.stage}`}
                    to={`/kanban?demand=${demandId}&stage=${item.stage}&candidate=${item.candidate_id}`}
                    className="flex items-center justify-between gap-4 rounded-lg py-2.5 transition-colors hover:bg-[#fafbf8] focus:outline-none focus:ring-2 focus:ring-[#b8d6cb]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#292b2a]">{item.candidate_name}</p>
                      <p className="mt-0.5 text-xs text-[#858a86]">
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>待补面试反馈</CardTitle>
              <Badge tone={metrics.outstanding_feedback.count > 0 ? 'warning' : 'success'}>
                {metrics.outstanding_feedback.count} 条
              </Badge>
            </div>
          </CardHeader>
          <CardBody>
            {metrics.outstanding_feedback.items.length === 0 ? (
              <p className="text-sm text-[#777b78]">当前没有待补的面试反馈。</p>
            ) : (
              <div className="divide-y divide-[#efefeb]">
                {metrics.outstanding_feedback.items.slice(0, 6).map((item) => (
                  <Link
                    key={item.assignment_id}
                    to={`/interviews?demand=${demandId}&candidate=${item.candidate_id}&focus=pending`}
                    className="flex items-center justify-between gap-4 rounded-lg py-2.5 transition-colors hover:bg-[#fafbf8] focus:outline-none focus:ring-2 focus:ring-[#b8d6cb]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#292b2a]">{item.candidate_name}</p>
                      <p className="mt-0.5 text-xs text-[#858a86]">
                        {item.round || `第 ${item.round_sequence} 轮`} · 应补反馈：{item.interviewer_name || '未记录面试官'}
                      </p>
                    </div>
                    <Badge tone="warning">超时 {item.overdue_days} 天</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
