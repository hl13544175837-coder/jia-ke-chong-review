// Director insights page grafted from the Readdy director/insights design.
// Talent-reserve and risk reading organized from api.biOverview() facts:
// stagnation alerts, outstanding feedback, and HC gaps. This is intentionally
// a different view than the BI board — it groups signals by risk theme
// instead of walking a single demand.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Inbox,
  Lightbulb,
  ShieldAlert,
  TrendingDown,
  UserX,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '../../components/ui';
import type { BiOverviewDemandSummary } from '../../types';
import { AlertList, KpiCard, PurposeBanner } from './widgets';
import { demandStatusLabel, demandStatusTone, formatDate, safeNum } from './utils';

interface GapDemand {
  demand: BiOverviewDemandSummary;
  remaining: number;
  pipeline: number;
}

function InsightSection({
  icon: Icon,
  title,
  description,
  count,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  count: number;
  tone: 'danger' | 'warning' | 'success';
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#edf5f1] text-[#3d7b6b]">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>{title}</CardTitle>
              <p className="mt-1 text-xs text-[#858a86]">{description}</p>
            </div>
          </div>
          <Badge tone={tone}>{count > 0 ? `${count} 项` : '暂无'}</Badge>
        </div>
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function DirectorInsightsPage() {
  const { role } = useAuth();
  const canView = role === 'manager' || role === 'admin';

  const {
    data: overview,
    loading,
    error,
    reload,
  } = useAsync(() => (canView ? api.biOverview() : Promise.resolve(null)), [canView]);

  const alerts = useMemo(() => overview?.alerts ?? [], [overview]);
  const demands = useMemo(() => overview?.demands ?? [], [overview]);

  const stagnationAlerts = useMemo(
    () => alerts.filter((alert) => alert.kind === 'stale_pipeline'),
    [alerts],
  );
  const feedbackAlerts = useMemo(
    () => alerts.filter(
      (alert) => alert.kind === 'pending_interview_feedback'
        || alert.kind === 'business_feedback_pending'
        || alert.kind === 'business_feedback_overdue',
    ),
    [alerts],
  );
  const emptyPipelineAlerts = useMemo(
    () => alerts.filter(
      (alert) => alert.kind === 'no_active_candidates'
        || alert.kind === 'hr_no_recommendation'
        || alert.kind === 'demand_overdue',
    ),
    [alerts],
  );

  // HC gap: active demands whose remaining headcount exceeds the current
  // pipeline — a talent-reserve shortage signal, not a performance score.
  const hcGaps = useMemo<GapDemand[]>(
    () => demands
      .filter((demand) => demand.status === 'active')
      .map((demand) => ({
        demand,
        remaining: safeNum(demand.hc.remaining),
        pipeline: safeNum(demand.funnel.pipeline_total),
      }))
      .filter((item) => item.remaining > 0 && item.pipeline < item.remaining)
      .sort((a, b) => (b.remaining - b.pipeline) - (a.remaining - a.pipeline)),
    [demands],
  );

  if (!canView) {
    return (
      <div data-ui="readdy-director-insights" className="mx-auto max-w-[1440px] space-y-5">
        <PageHeader title="洞察与风险" description="停滞、待反馈与人才缺口阅读视图" />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="暂无查看权限"
            description="洞察与风险面向招聘经理和管理员。如需查看，请联系管理员开通权限。"
          />
        </Card>
      </div>
    );
  }

  return (
    <div data-ui="readdy-director-insights" className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="洞察与风险"
        description="把停滞、待反馈和 HC 缺口信号按风险主题组织，便于管理层优先介入"
        actions={(
          <Link
            to="/director/cockpit"
            className="inline-flex items-center gap-1 text-sm text-[#777b78] transition-colors hover:text-[#292b2a]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回驾驶舱
          </Link>
        )}
      />

      <PurposeBanner />

      {loading && (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-[#777b78]">
          <Spinner />
          正在加载洞察数据…
        </div>
      )}

      {!loading && error && (
        <ErrorState
          message={`洞察数据加载失败：${error.message}（这是接口失败，不是业务数据为 0）`}
          onRetry={reload}
        />
      )}

      {!loading && !error && overview && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              icon={TrendingDown}
              label="流程停滞"
              value={stagnationAlerts.length}
              detail="候选人停留在某阶段过久"
              tone={stagnationAlerts.length > 0 ? 'danger' : 'default'}
            />
            <KpiCard
              icon={Inbox}
              label="反馈积压"
              value={feedbackAlerts.length}
              detail="面试/业务反馈待补"
              tone={feedbackAlerts.length > 0 ? 'warning' : 'default'}
            />
            <KpiCard
              icon={UserX}
              label="断流与逾期"
              value={emptyPipelineAlerts.length}
              detail="无在流程候选人或需求逾期"
              tone={emptyPipelineAlerts.length > 0 ? 'warning' : 'default'}
            />
            <KpiCard
              icon={Lightbulb}
              label="HC 缺口需求"
              value={hcGaps.length}
              detail="在流程人数不足以覆盖剩余 HC"
              tone={hcGaps.length > 0 ? 'danger' : 'default'}
            />
          </div>

          <InsightSection
            icon={TrendingDown}
            title="停滞风险"
            description="在当前阶段停留过久的候选人，建议先协调当前责任人"
            count={stagnationAlerts.length}
            tone={stagnationAlerts.length > 0 ? 'danger' : 'success'}
          >
            <AlertList
              alerts={stagnationAlerts}
              limit={6}
              emptyText="当前没有停滞过久的候选人。"
            />
          </InsightSection>

          <InsightSection
            icon={Inbox}
            title="反馈积压"
            description="超时未补的面试反馈与业务侧待反馈，只用于找到该谁补"
            count={feedbackAlerts.length}
            tone={feedbackAlerts.length > 0 ? 'warning' : 'success'}
          >
            <AlertList
              alerts={feedbackAlerts}
              limit={6}
              emptyText="当前没有积压的反馈。"
            />
          </InsightSection>

          <InsightSection
            icon={UserX}
            title="断流与逾期"
            description="没有活跃候选人、尚未推荐或已经逾期的需求"
            count={emptyPipelineAlerts.length}
            tone={emptyPipelineAlerts.length > 0 ? 'warning' : 'success'}
          >
            <AlertList
              alerts={emptyPipelineAlerts}
              limit={6}
              emptyText="当前没有断流或逾期的需求。"
            />
          </InsightSection>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#edf5f1] text-[#3d7b6b]">
                    <Lightbulb className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <CardTitle>HC 缺口与人才储备</CardTitle>
                    <p className="mt-1 text-xs text-[#858a86]">
                      剩余 HC 大于当前流程人数的活跃需求，提示人才储备不足
                    </p>
                  </div>
                </div>
                <Badge tone={hcGaps.length > 0 ? 'danger' : 'success'}>
                  {hcGaps.length > 0 ? `${hcGaps.length} 个需求` : '储备健康'}
                </Badge>
              </div>
            </CardHeader>
            <CardBody>
              {hcGaps.length === 0 ? (
                <p className="text-sm text-[#777b78]">
                  各活跃需求的在流程人数均可覆盖剩余 HC，暂无储备缺口。
                </p>
              ) : (
                <div className="space-y-3">
                  {hcGaps.map(({ demand, remaining, pipeline }) => (
                    <div
                      key={demand.demand_id}
                      className="rounded-xl border border-[#ffe2a8] bg-[#fff7e6] p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#292b2a]">{demand.title}</p>
                        <Badge tone={demandStatusTone(demand.status)}>
                          {demandStatusLabel(demand.status)}
                        </Badge>
                        <Badge tone="danger">缺口 {remaining - pipeline} 人</Badge>
                      </div>
                      <p className="mt-1 text-xs text-[#777b78]">
                        {[demand.department, demand.city].filter(Boolean).join(' · ') || '部门与城市未记录'}
                        {' · '}剩余 HC {remaining} · 流程中 {pipeline}
                        {' · '}目标 {formatDate(demand.target_date)}
                        {demand.owner_name ? ` · 负责人 ${demand.owner_name}` : ''}
                      </p>
                      <Link
                        to="/director/progress"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#2f6c5c] hover:underline"
                      >
                        查看该需求进展
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

export default DirectorInsightsPage;
