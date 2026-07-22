// Analytics page grafted from the Readdy analytics design onto real data.
// Team view comes from api.biOverview(); the demand selector drills into
// api.biDemand(). Progress / bottleneck / responsibility collaboration only —
// the Readdy mock's personal-performance and bonus-style sections are dropped.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  ClipboardList,
  FileCheck2,
  Inbox,
  MessageSquareWarning,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Button,
  DrawerShell,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui';
import {
  AlertList,
  DemandDrilldown,
  KpiCard,
  OverviewFunnelBars,
  PurposeBanner,
} from './director/widgets';
import { safeNum } from './director/utils';

interface AnalyticsKpiDetail {
  label: string;
  value: number;
  description: string;
  to: string;
  actionLabel: string;
}

export function AnalyticsPage() {
  const { role } = useAuth();
  const canView = role === 'manager' || role === 'admin';
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(null);
  const [analyticsKpiDetail, setAnalyticsKpiDetail] = useState<AnalyticsKpiDetail | null>(null);

  const {
    data: overview,
    loading,
    error,
    reload,
  } = useAsync(() => (canView ? api.biOverview() : Promise.resolve(null)), [canView]);

  const demands = useMemo(() => overview?.demands ?? [], [overview]);
  const activeDemandId = selectedDemandId ?? demands[0]?.demand_id ?? null;
  const totalOutstandingFeedback = useMemo(
    () => demands.reduce((sum, item) => sum + safeNum(item.outstanding_feedback), 0),
    [demands],
  );

  if (!canView) {
    return (
      <div data-ui="readdy-analytics" className="mx-auto max-w-[1440px] space-y-5">
        <PageHeader title="数据分析" description="组织级招聘进度、瓶颈与责任协同" />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="暂无查看权限"
            description="数据分析面向招聘经理和管理员。如果你需要查看团队进度，请联系管理员开通权限。"
          />
        </Card>
      </div>
    );
  }

  return (
    <div data-ui="readdy-analytics" className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="数据分析"
        description="组织级招聘进度、瓶颈与责任协同总览，数据来自真实流程事实"
      />

      <PurposeBanner />

      {loading && (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-[#777b78]">
          <Spinner />
          正在加载团队招聘数据…
        </div>
      )}

      {!loading && error && (
        <ErrorState
          message={`团队招聘数据加载失败：${error.message}（这是接口失败，不是业务数据为 0）`}
          onRetry={reload}
        />
      )}

      {!loading && !error && overview && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              icon={Briefcase}
              label="进行中需求"
              value={demands.filter((item) => item.status === 'active').length}
              detail={`共 ${demands.length} 个需求`}
              onActivate={() => setAnalyticsKpiDetail({
                label: '进行中需求',
                value: demands.filter((item) => item.status === 'active').length,
                description: '状态为招聘中的真实 Demand。可以在本页选择具体需求继续查看 HC、阶段和责任人。',
                to: '/director/progress',
                actionLabel: '查看需求清单',
              })}
            />
            <KpiCard
              icon={Users}
              label="当前流程人数"
              value={safeNum(overview.funnel.pipeline_total)}
              detail="全部进行中需求的候选人"
              onActivate={() => setAnalyticsKpiDetail({
                label: '当前流程人数',
                value: safeNum(overview.funnel.pipeline_total),
                description: '当前组织内所有进行中需求的在流程候选人数，不包含已淘汰和已转出的记录。',
                to: '/kanban',
                actionLabel: '查看招聘看板',
              })}
            />
            <KpiCard
              icon={Inbox}
              label="业务待反馈"
              value={safeNum(overview.funnel.business_review)}
              detail="卡在业务侧待反馈阶段"
              tone={safeNum(overview.funnel.business_review) > 0 ? 'warning' : 'default'}
              onActivate={() => setAnalyticsKpiDetail({
                label: '业务待反馈',
                value: safeNum(overview.funnel.business_review),
                description: '已推荐给用人部门、当前停留在业务复筛阶段的候选人数。',
                to: '/kanban',
                actionLabel: '打开看板并选择需求',
              })}
            />
            <KpiCard
              icon={MessageSquareWarning}
              label="待补面试反馈"
              value={totalOutstandingFeedback}
              detail="超时未提交的面试反馈"
              tone={totalOutstandingFeedback > 0 ? 'warning' : 'default'}
              onActivate={() => setAnalyticsKpiDetail({
                label: '待补面试反馈',
                value: totalOutstandingFeedback,
                description: '已发生面试但对应反馈仍未提交的真实任务数。',
                to: '/interviews?status=pending_feedback',
                actionLabel: '查看待补反馈',
              })}
            />
            <KpiCard
              icon={FileCheck2}
              label="Offer 阶段"
              value={safeNum(overview.funnel.offer)}
              detail="已进入 Offer 的候选人"
              onActivate={() => setAnalyticsKpiDetail({
                label: 'Offer 阶段',
                value: safeNum(overview.funnel.offer),
                description: '当前主流程阶段为 Offer 的候选人数，审批和回复状态以 Offer 页面为准。',
                to: '/offers',
                actionLabel: '查看 Offer',
              })}
            />
            <KpiCard
              icon={ClipboardList}
              label="已入职"
              value={safeNum(overview.funnel.onboarded)}
              detail="当前阶段为已入职"
              onActivate={() => setAnalyticsKpiDetail({
                label: '已入职',
                value: safeNum(overview.funnel.onboarded),
                description: '当前流程阶段已经确认入职的候选人数。',
                to: '/dashboard/hired',
                actionLabel: '查看已入职',
              })}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>团队流程漏斗</CardTitle>
                <p className="mt-1 text-xs text-[#858a86]">
                  各阶段当前人数，只看进度和卡点
                </p>
              </CardHeader>
              <CardBody>
                {safeNum(overview.funnel.funnel_total) === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="团队还没有流程事实"
                    description="候选人进入任一需求的流程后，团队漏斗会在这里出现。"
                  />
                ) : (
                  <OverviewFunnelBars funnel={overview.funnel} />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>卡点与协同提醒</CardTitle>
                <p className="mt-1 text-xs text-[#858a86]">
                  自动标出需要管理者协调的事项
                </p>
              </CardHeader>
              <CardBody>
                <AlertList alerts={overview.alerts} limit={6} />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>单需求下钻</CardTitle>
                  <p className="mt-1 text-xs text-[#858a86]">
                    选择一个招聘需求，查看它的阶段、反馈和 HC 进展
                  </p>
                </div>
                {demands.length > 0 && (
                  <label
                    className="flex min-w-[280px] flex-col gap-1 text-xs font-medium text-[#777b78]"
                    htmlFor="analytics-demand-select"
                  >
                    选择招聘需求
                    <Select
                      id="analytics-demand-select"
                      value={activeDemandId ?? ''}
                      onChange={(event) => setSelectedDemandId(Number(event.target.value))}
                      aria-label="选择招聘需求"
                    >
                      {demands.map((demand) => (
                        <option key={demand.demand_id} value={demand.demand_id}>
                          {demand.title}
                          {demand.department ? ` · ${demand.department}` : ''}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
            </CardHeader>
            <CardBody>
              {demands.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="暂无招聘需求"
                  description="创建招聘需求并把候选人推进流程后，这里可以下钻查看单需求进展。"
                />
              ) : activeDemandId !== null ? (
                <DemandDrilldown demandId={activeDemandId} />
              ) : null}
            </CardBody>
          </Card>

          <DrawerShell
            open={Boolean(analyticsKpiDetail)}
            onClose={() => setAnalyticsKpiDetail(null)}
            title={analyticsKpiDetail?.label ?? '指标明细'}
            eyebrow="数据分析"
            description="组织级真实流程指标"
            size="md"
            testId="analytics-kpi-drawer"
            footer={analyticsKpiDetail ? (
              <div className="flex w-full justify-end gap-3">
                <Button variant="secondary" onClick={() => setAnalyticsKpiDetail(null)}>关闭</Button>
                <Link
                  to={analyticsKpiDetail.to}
                  onClick={() => setAnalyticsKpiDetail(null)}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--enterprise-brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--enterprise-brand-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  {analyticsKpiDetail.actionLabel}
                </Link>
              </div>
            ) : undefined}
          >
            {analyticsKpiDetail && (
              <div className="space-y-5">
                <section className="rounded-lg border border-hairline bg-surface-soft px-5 py-5">
                  <p className="text-sm text-muted">{analyticsKpiDetail.label}</p>
                  <p className="mt-2 text-4xl font-semibold tabular-nums text-ink">{analyticsKpiDetail.value}</p>
                </section>
                <section>
                  <h3 className="text-sm font-semibold text-ink">指标说明</h3>
                  <p className="mt-2 text-sm leading-6 text-body">{analyticsKpiDetail.description}</p>
                </section>
                {demands.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold text-ink">选择需求在本页继续下钻</h3>
                    <div className="mt-3 space-y-2">
                      {demands.slice(0, 6).map((demand) => (
                        <button
                          key={demand.demand_id}
                          type="button"
                          onClick={() => {
                            setSelectedDemandId(demand.demand_id);
                            setAnalyticsKpiDetail(null);
                          }}
                          className="flex w-full items-center justify-between rounded-md border border-hairline bg-canvas px-3 py-2 text-left text-sm text-ink hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <span className="truncate">{demand.title}</span>
                          <span className="ml-3 shrink-0 text-xs text-muted">查看进展</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </DrawerShell>
        </>
      )}
    </div>
  );
}

export default AnalyticsPage;
