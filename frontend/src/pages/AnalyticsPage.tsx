// Analytics page grafted from the Readdy analytics design onto real data.
// Team view comes from api.biOverview(); the demand selector drills into
// api.biDemand(). Progress / bottleneck / responsibility collaboration only —
// the Readdy mock's personal-performance and bonus-style sections are dropped.

import { useMemo, useState } from 'react';
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

export function AnalyticsPage() {
  const { role } = useAuth();
  const canView = role === 'manager' || role === 'admin';
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(null);

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
            />
            <KpiCard
              icon={Users}
              label="当前流程人数"
              value={safeNum(overview.funnel.pipeline_total)}
              detail="全部进行中需求的候选人"
            />
            <KpiCard
              icon={Inbox}
              label="业务待反馈"
              value={safeNum(overview.funnel.business_review)}
              detail="卡在业务侧待反馈阶段"
              tone={safeNum(overview.funnel.business_review) > 0 ? 'warning' : 'default'}
            />
            <KpiCard
              icon={MessageSquareWarning}
              label="待补面试反馈"
              value={totalOutstandingFeedback}
              detail="超时未提交的面试反馈"
              tone={totalOutstandingFeedback > 0 ? 'warning' : 'default'}
            />
            <KpiCard
              icon={FileCheck2}
              label="Offer 阶段"
              value={safeNum(overview.funnel.offer)}
              detail="已进入 Offer 的候选人"
            />
            <KpiCard
              icon={ClipboardList}
              label="已入职"
              value={safeNum(overview.funnel.onboarded)}
              detail="当前阶段为已入职"
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
        </>
      )}
    </div>
  );
}

export default AnalyticsPage;
