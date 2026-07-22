// Shared presentational widgets for the Readdy analytics/director graft.
// All data comes from the real BI/Offer APIs (api.biOverview / api.biDemand /
// api.listOffers); these components only render what they are given.

import { useEffect, useState, type ReactNode } from 'react';
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
  DrawerShell,
  EmptyState,
  Spinner,
} from '../../components/ui';
import type {
  BiDemandOperationalMetrics,
  BiDemandOutstandingFeedbackItem,
  BiDemandStageAge,
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
  onActivate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: 'default' | 'warning' | 'danger';
  onActivate?: () => void;
}) {
  const accent =
    tone === 'danger'
      ? 'border-[#ffc7c7] bg-[#fff1f0]'
      : tone === 'warning'
        ? 'border-[#ffe2a8] bg-[#fff7e6]'
        : 'border-[#e8e7e1] bg-white';
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#777b78]">{label}</span>
        <Icon className="h-4 w-4 text-[#929793]" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[#292b2a]">{value}</p>
      {detail && <p className="mt-1 text-xs text-[#858a86]">{detail}</p>}
    </>
  );

  if (onActivate) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className={`w-full rounded-xl border p-4 text-left transition-shadow hover:shadow-apple-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${accent}`}
        aria-label={`${label}，查看明细`}
      >
        {content}
      </button>
    );
  }

  return <div className={`rounded-xl border p-4 ${accent}`}>{content}</div>;
}

// Horizontal funnel bars. A demand-scoped rendering opens same-page facts and
// keeps the exact Kanban context as a secondary drawer action; organization-wide stays read-only.
export function OverviewFunnelBars({
  funnel,
  demandId,
}: {
  funnel: BiOperationalFunnel | BiFunnel;
  demandId?: number;
}) {
  const [selectedFunnelStage, setSelectedFunnelStage] = useState<{
    key: string;
    label: string;
    value: number;
  } | null>(null);

  useEffect(() => {
    setSelectedFunnelStage(null);
  }, [demandId]);

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
          'bg-[var(--enterprise-brand)]',
          'bg-[var(--enterprise-brand-dark)]',
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
          <button
            type="button"
            data-ui="demand-funnel-stage-trigger"
            key={stage.key}
            onClick={() => setSelectedFunnelStage({ key: stage.key, label: stage.label, value })}
            className="flex w-full items-center gap-3 rounded-lg text-left transition-colors hover:bg-[#fafbf8] focus:outline-none focus:ring-2 focus:ring-[var(--enterprise-brand-soft)]"
          >
            {content}
          </button>
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

      <DrawerShell
        open={Boolean(selectedFunnelStage && demandId)}
        onClose={() => setSelectedFunnelStage(null)}
        title={selectedFunnelStage?.label ?? '需求阶段'}
        eyebrow="Demand 阶段事实"
        description="当前页展示 BI 接口返回的阶段人数"
        size="md"
        testId="demand-funnel-stage-drawer"
        footer={selectedFunnelStage && demandId ? (
          <div className="flex w-full items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setSelectedFunnelStage(null)}>关闭</Button>
            <Link
              to={`/kanban?demand=${demandId}&stage=${selectedFunnelStage.key}`}
              onClick={() => setSelectedFunnelStage(null)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--enterprise-brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--enterprise-brand-dark)]"
            >
              进入完整工作台
            </Link>
          </div>
        ) : undefined}
      >
        {selectedFunnelStage && demandId && (
          <div className="space-y-5">
            <section className="rounded-lg border border-[#e8e7e1] bg-[#fafbf8] px-5 py-5">
              <p className="text-sm text-[#777b78]">{selectedFunnelStage.label}</p>
              <p className="mt-2 text-4xl font-semibold tabular-nums text-[#292b2a]">
                {selectedFunnelStage.value} 人
              </p>
            </section>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-[#777b78]">Demand</dt><dd className="mt-1 font-medium text-[#292b2a]">#{demandId}</dd></div>
              <div><dt className="text-[#777b78]">当前流程总数</dt><dd className="mt-1 font-medium text-[#292b2a]">{safeNum(funnel.pipeline_total)} 人</dd></div>
              <div><dt className="text-[#777b78]">已淘汰</dt><dd className="mt-1 font-medium text-[#292b2a]">{safeNum(funnel.rejected)} 人</dd></div>
              <div><dt className="text-[#777b78]">已转出</dt><dd className="mt-1 font-medium text-[#292b2a]">{safeNum(funnel.transferred)} 人</dd></div>
            </dl>
          </div>
        )}
      </DrawerShell>
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
  const [selectedAlert, setSelectedAlert] = useState<BiManagerAlert | null>(null);

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 px-1 py-2 text-sm text-[#777b78]">
        <Clock3 className="h-4 w-4 text-[#52a611]" aria-hidden="true" />
        {emptyText}
      </div>
    );
  }
  return (
    <div>
      <div className="divide-y divide-[#efefeb]">
        {alerts.slice(0, limit).map((alert) => (
          <button
            type="button"
            data-ui="director-alert-trigger"
            key={`${alert.kind}-${alert.demand_id}-${alert.candidate_id}-${alert.stage}-${alert.assignment_id ?? ''}`}
            onClick={() => setSelectedAlert(alert)}
            className="flex w-full items-start gap-3 py-3 text-left transition-colors hover:bg-[#fafbf8]"
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
          </button>
        ))}
      </div>

      <DrawerShell
        open={Boolean(selectedAlert)}
        onClose={() => setSelectedAlert(null)}
        title={selectedAlert?.title ?? '提醒详情'}
        eyebrow="责任协同提醒"
        description="当前页展示 BI 接口已返回的提醒事实"
        size="md"
        testId="director-alert-drawer"
        footer={selectedAlert ? (
          <div className="flex w-full items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setSelectedAlert(null)}>关闭</Button>
            <Link
              to={selectedAlert.action_path || '/director/progress'}
              onClick={() => setSelectedAlert(null)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--enterprise-brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--enterprise-brand-dark)]"
            >
              进入完整工作台
            </Link>
          </div>
        ) : undefined}
      >
        {selectedAlert && (
          <div className="space-y-5">
            <section className="rounded-lg border border-[#e8e7e1] bg-[#fafbf8] px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone={alertTone(selectedAlert.priority)}>{alertKindLabel(selectedAlert.kind)}</Badge>
                {selectedAlert.stage_label && <Badge tone="neutral">{selectedAlert.stage_label}</Badge>}
              </div>
              <p className="mt-3 text-sm leading-6 text-[#454946]">{selectedAlert.detail}</p>
            </section>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-[#777b78]">Demand</dt><dd className="mt-1 font-medium text-[#292b2a]">#{selectedAlert.demand_id}</dd></div>
              {selectedAlert.candidate_name && <div><dt className="text-[#777b78]">候选人</dt><dd className="mt-1 font-medium text-[#292b2a]">{selectedAlert.candidate_name}</dd></div>}
              <div><dt className="text-[#777b78]">当前负责人</dt><dd className="mt-1 font-medium text-[#292b2a]">{selectedAlert.owner_name || '未指定'}</dd></div>
              {selectedAlert.interviewer_name && <div><dt className="text-[#777b78]">应补反馈面试官</dt><dd className="mt-1 font-medium text-[#292b2a]">{selectedAlert.interviewer_name}</dd></div>}
              <div><dt className="text-[#777b78]">停留时间</dt><dd className="mt-1 font-medium text-[#292b2a]">{selectedAlert.age_days} 天</dd></div>
            </dl>
          </div>
        )}
      </DrawerShell>
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
  const [selectedDemandFact, setSelectedDemandFact] = useState<
    | { kind: 'stage_age'; item: BiDemandStageAge }
    | { kind: 'feedback'; item: BiDemandOutstandingFeedbackItem }
    | {
        kind: 'kpi';
        label: string;
        value: string | number;
        description: string;
        to: string;
        facts: Array<{ label: string; value: string | number }>;
      }
    | null
  >(null);
  const { data: metrics, loading, error, reload } = useAsync(
    () => api.biDemand(demandId),
    [demandId],
  );

  useEffect(() => {
    setSelectedDemandFact(null);
  }, [demandId]);

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
        <button
          type="button"
          data-ui="demand-summary-kpi-trigger"
          onClick={() => setSelectedDemandFact({
            kind: 'kpi',
            label: '当前流程',
            value: safeNum(metrics.funnel.pipeline_total),
            description: '这个 Demand 当前仍在流程中的候选人数。',
            to: `/kanban?demand=${demandId}`,
            facts: [
              { label: '当前流程', value: safeNum(metrics.funnel.pipeline_total) },
              { label: '已淘汰', value: safeNum(metrics.funnel.rejected) },
              { label: '已转出', value: safeNum(metrics.funnel.transferred) },
            ],
          })}
          className="rounded-xl border border-[#e8e7e1] bg-white p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--enterprise-brand)] focus-visible:ring-offset-2"
        >
          <p className="text-xs text-[#777b78]">当前流程</p>
          <p className="mt-1 text-2xl font-bold text-[#292b2a]">{safeNum(metrics.funnel.pipeline_total)}</p>
        </button>
        <button
          type="button"
          data-ui="demand-summary-kpi-trigger"
          onClick={() => setSelectedDemandFact({
            kind: 'kpi',
            label: 'HC 进度',
            value: `${metrics.hc.onboarded_count} / ${metrics.hc.headcount}`,
            description: '这个 Demand 的目标 HC、已入职人数与剩余缺口。',
            to: `/demands/${demandId}`,
            facts: [
              { label: '目标 HC', value: metrics.hc.headcount },
              { label: '已入职', value: metrics.hc.onboarded_count },
              { label: '剩余', value: metrics.hc.remaining },
              { label: '完成度', value: `${safeNum(metrics.hc.completion_rate).toFixed(1)}%` },
            ],
          })}
          className="rounded-xl border border-[#e8e7e1] bg-white p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--enterprise-brand)] focus-visible:ring-offset-2"
        >
          <p className="text-xs text-[#777b78]">HC 进度</p>
          <p className="mt-1 text-2xl font-bold text-[#292b2a]">
            {metrics.hc.onboarded_count} / {metrics.hc.headcount}
          </p>
          <p className="mt-1 text-xs text-[#858a86]">
            完成度 {safeNum(metrics.hc.completion_rate).toFixed(1)}% · 剩余 {metrics.hc.remaining} 人
          </p>
        </button>
        <button
          type="button"
          data-ui="demand-summary-kpi-trigger"
          onClick={() => setSelectedDemandFact({
            kind: 'kpi',
            label: 'Offer 记录',
            value: metrics.offers.total,
            description: '这个 Demand 已产生的 Offer 记录总数及接口返回的状态分布。',
            to: '/offers',
            facts: [
              { label: 'Offer 总数', value: metrics.offers.total },
              ...Object.entries(metrics.offers.by_status).map(([status, count]) => ({
                label: status,
                value: count,
              })),
            ],
          })}
          className="rounded-xl border border-[#e8e7e1] bg-white p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--enterprise-brand)] focus-visible:ring-offset-2"
        >
          <p className="text-xs text-[#777b78]">Offer 记录</p>
          <p className="mt-1 text-2xl font-bold text-[#292b2a]">{metrics.offers.total}</p>
        </button>
        <button
          type="button"
          data-ui="demand-summary-kpi-trigger"
          onClick={() => setSelectedDemandFact({
            kind: 'kpi',
            label: '当前协同责任',
            value: responsibility.owner_name || '未指定负责人',
            description: responsibility.note || responsibility.label,
            to: `/demands/${demandId}`,
            facts: [
              { label: '负责人', value: responsibility.owner_name || '未指定负责人' },
              { label: '活动候选人', value: responsibility.active_candidates },
              { label: '待补反馈', value: responsibility.outstanding_feedback },
            ],
          })}
          className="rounded-xl border border-[#e8e7e1] bg-white p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--enterprise-brand)] focus-visible:ring-offset-2"
        >
          <p className="text-xs text-[#777b78]">当前协同责任</p>
          <p className="mt-1 truncate text-lg font-semibold text-[#292b2a]">
            {responsibility.owner_name || '未指定负责人'}
          </p>
          <p className="mt-1 text-xs text-[#858a86]">
            活动候选人 {responsibility.active_candidates} · 待补反馈 {responsibility.outstanding_feedback}
          </p>
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>需求阶段分布</CardTitle>
          <p className="mt-1 text-xs text-[#858a86]">点击阶段先在当前页查看人数，完整看板入口保留在抽屉底部</p>
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
                  <button
                    type="button"
                    data-ui="demand-stage-age-trigger"
                    key={`${item.candidate_id}-${item.stage}`}
                    onClick={() => setSelectedDemandFact({ kind: 'stage_age', item })}
                    className="flex w-full items-center justify-between gap-4 rounded-lg py-2.5 text-left transition-colors hover:bg-[#fafbf8] focus:outline-none focus:ring-2 focus:ring-[var(--enterprise-brand-soft)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#292b2a]">{item.candidate_name}</p>
                      <p className="mt-0.5 text-xs text-[#858a86]">
                        {item.stage_label} · 最后处理 {item.last_actor_name || '未记录'}
                      </p>
                    </div>
                    <Badge tone={item.age_days >= 7 ? 'warning' : 'neutral'}>{item.age_days} 天</Badge>
                  </button>
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
                  <button
                    type="button"
                    data-ui="demand-feedback-trigger"
                    key={item.assignment_id}
                    onClick={() => setSelectedDemandFact({ kind: 'feedback', item })}
                    className="flex w-full items-center justify-between gap-4 rounded-lg py-2.5 text-left transition-colors hover:bg-[#fafbf8] focus:outline-none focus:ring-2 focus:ring-[var(--enterprise-brand-soft)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#292b2a]">{item.candidate_name}</p>
                      <p className="mt-0.5 text-xs text-[#858a86]">
                        {item.round || `第 ${item.round_sequence} 轮`} · 应补反馈：{item.interviewer_name || '未记录面试官'}
                      </p>
                    </div>
                    <Badge tone="warning">超时 {item.overdue_days} 天</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <DrawerShell
        open={Boolean(selectedDemandFact)}
        onClose={() => setSelectedDemandFact(null)}
        title={selectedDemandFact?.kind === 'kpi'
          ? selectedDemandFact.label
          : selectedDemandFact?.item.candidate_name ?? '候选人流程事实'}
        eyebrow={selectedDemandFact?.kind === 'kpi'
          ? 'Demand 指标事实'
          : selectedDemandFact?.kind === 'feedback'
            ? '待补面试反馈'
            : '阶段停留详情'}
        description={`Demand #${demandId} · 当前页展示 BI 接口已返回的数据`}
        size="md"
        testId="demand-fact-drawer"
        footer={selectedDemandFact ? (
          <div className="flex w-full items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setSelectedDemandFact(null)}>关闭</Button>
            <Link
              to={selectedDemandFact.kind === 'kpi'
                ? selectedDemandFact.to
                : selectedDemandFact.kind === 'stage_age'
                  ? `/kanban?demand=${demandId}&stage=${selectedDemandFact.item.stage}&candidate=${selectedDemandFact.item.candidate_id}`
                  : `/interviews?demand=${demandId}&candidate=${selectedDemandFact.item.candidate_id}&focus=pending`}
              onClick={() => setSelectedDemandFact(null)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--enterprise-brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--enterprise-brand-dark)]"
            >
              进入完整工作台
            </Link>
          </div>
        ) : undefined}
      >
        {selectedDemandFact?.kind === 'kpi' && (
          <div className="space-y-5">
            <section className="rounded-lg border border-[#e8e7e1] bg-[#fafbf8] px-5 py-5">
              <p className="text-sm text-[#777b78]">{selectedDemandFact.label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[#292b2a]">{selectedDemandFact.value}</p>
              <p className="mt-3 text-sm leading-6 text-[#454946]">{selectedDemandFact.description}</p>
            </section>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              {selectedDemandFact.facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-[#777b78]">{fact.label}</dt>
                  <dd className="mt-1 font-medium text-[#292b2a]">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {selectedDemandFact?.kind === 'stage_age' && (
          <div className="space-y-5">
            <section className="rounded-lg border border-[#e8e7e1] bg-[#fafbf8] px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={selectedDemandFact.item.age_days >= 7 ? 'warning' : 'neutral'}>
                  停留 {selectedDemandFact.item.age_days} 天
                </Badge>
                <Badge tone="info">{selectedDemandFact.item.stage_label}</Badge>
              </div>
            </section>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-[#777b78]">候选人</dt><dd className="mt-1 font-medium text-[#292b2a]">{selectedDemandFact.item.candidate_name}</dd></div>
              <div><dt className="text-[#777b78]">当前阶段</dt><dd className="mt-1 font-medium text-[#292b2a]">{selectedDemandFact.item.stage_label}</dd></div>
              <div><dt className="text-[#777b78]">最后处理人</dt><dd className="mt-1 font-medium text-[#292b2a]">{selectedDemandFact.item.last_actor_name || '未记录'}</dd></div>
              <div><dt className="text-[#777b78]">最后处理时间</dt><dd className="mt-1 font-medium text-[#292b2a]">{formatDate(selectedDemandFact.item.updated_at)}</dd></div>
            </dl>
          </div>
        )}
        {selectedDemandFact?.kind === 'feedback' && (
          <div className="space-y-5">
            <section className="rounded-lg border border-[#ffe2a8] bg-[#fff7e6] px-5 py-4">
              <Badge tone="warning">超时 {selectedDemandFact.item.overdue_days} 天</Badge>
              <p className="mt-3 text-sm text-[#454946]">
                {selectedDemandFact.item.round || `第 ${selectedDemandFact.item.round_sequence} 轮`}面试反馈待补充
              </p>
            </section>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-[#777b78]">候选人</dt><dd className="mt-1 font-medium text-[#292b2a]">{selectedDemandFact.item.candidate_name}</dd></div>
              <div><dt className="text-[#777b78]">应补反馈面试官</dt><dd className="mt-1 font-medium text-[#292b2a]">{selectedDemandFact.item.interviewer_name || '未记录'}</dd></div>
              <div><dt className="text-[#777b78]">面试安排时间</dt><dd className="mt-1 font-medium text-[#292b2a]">{formatDate(selectedDemandFact.item.scheduled_at)}</dd></div>
              <div><dt className="text-[#777b78]">面试任务</dt><dd className="mt-1 font-medium text-[#292b2a]">#{selectedDemandFact.item.assignment_id}</dd></div>
            </dl>
          </div>
        )}
      </DrawerShell>
    </div>
  );
}
