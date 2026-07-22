// Director progress page grafted from the Readdy director/progress design.
// Demand list comes from api.biOverview(); selecting a demand drills into
// api.biDemand() for the operational detail.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Briefcase, ShieldAlert, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import {
  Badge,
  Card,
  CardBody,
  DrawerShell,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '../../components/ui';
import type { BiOverviewDemandSummary } from '../../types';
import { DemandDrilldown, KpiCard, PurposeBanner } from './widgets';
import {
  demandStatusLabel,
  demandStatusTone,
  formatDate,
  safeNum,
} from './utils';

type ProgressKpi = 'demands' | 'pipeline' | 'onboarded' | 'alerts';

function DemandRow({
  demand,
  selected,
  onSelect,
}: {
  demand: BiOverviewDemandSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const hc = demand.hc;
  const hcPct = hc.headcount > 0
    ? Math.min((hc.onboarded_count / hc.headcount) * 100, 100)
    : 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-xl border p-4 text-left transition-all ${
        selected
          ? 'border-[var(--enterprise-brand)] ring-2 ring-[var(--enterprise-brand-soft)]'
          : 'border-[#e8e7e1] bg-white hover:border-[#c9cec6]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[#292b2a]">{demand.title}</p>
        <Badge tone={demandStatusTone(demand.status)}>
          {demandStatusLabel(demand.status)}
        </Badge>
        {safeNum(demand.outstanding_feedback) > 0 && (
          <Badge tone="warning">待补反馈 {demand.outstanding_feedback}</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-[#858a86]">
        {[demand.department, demand.city].filter(Boolean).join(' · ') || '部门与城市未记录'}
        {' · '}目标 {formatDate(demand.target_date)}
        {demand.owner_name ? ` · 负责人 ${demand.owner_name}` : ''}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f1f2ee]">
          <div
            className="h-full rounded-full bg-[var(--enterprise-brand)] transition-all duration-500"
            style={{ width: `${Math.max(hcPct, hc.onboarded_count > 0 ? 4 : 0)}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-[#5f6561]">
          HC {hc.onboarded_count}/{hc.headcount} · 流程中 {safeNum(demand.funnel.pipeline_total)}
        </span>
      </div>
    </button>
  );
}

export function DirectorProgressPage() {
  const { role } = useAuth();
  const canView = role === 'manager' || role === 'admin';
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(null);
  const [selectedProgressKpi, setSelectedProgressKpi] = useState<ProgressKpi | null>(null);

  const {
    data: overview,
    loading,
    error,
    reload,
  } = useAsync(() => (canView ? api.biOverview() : Promise.resolve(null)), [canView]);

  const demands = useMemo(() => overview?.demands ?? [], [overview]);
  const activeDemandId = demands.some((item) => item.demand_id === selectedDemandId)
    ? selectedDemandId
    : demands[0]?.demand_id ?? null;

  if (!canView) {
    return (
      <div data-ui="readdy-director-progress" className="mx-auto max-w-[1440px] space-y-5">
        <PageHeader title="招聘进展" description="需求清单与单需求进展下钻" />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="暂无查看权限"
            description="招聘进展面向招聘经理和管理员。如需查看，请联系管理员开通权限。"
          />
        </Card>
      </div>
    );
  }

  return (
    <div data-ui="readdy-director-progress" className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="招聘进展"
        description="按需求看进度、HC 完成度和卡点，点击需求可下钻"
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
          正在加载需求进展…
        </div>
      )}

      {!loading && error && (
        <ErrorState
          message={`需求进展加载失败：${error.message}（这是接口失败，不是业务数据为 0）`}
          onRetry={reload}
        />
      )}

      {!loading && !error && overview && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              icon={Briefcase}
              label="需求总数"
              value={demands.length}
              detail={`进行中 ${demands.filter((item) => item.status === 'active').length} 个`}
              onActivate={() => setSelectedProgressKpi('demands')}
            />
            <KpiCard
              icon={Users}
              label="当前流程人数"
              value={safeNum(overview.funnel.pipeline_total)}
              detail="全部需求的在流程候选人"
              onActivate={() => setSelectedProgressKpi('pipeline')}
            />
            <KpiCard
              icon={Users}
              label="已入职"
              value={safeNum(overview.funnel.onboarded)}
              detail="当前阶段为已入职"
              onActivate={() => setSelectedProgressKpi('onboarded')}
            />
            <KpiCard
              icon={ShieldAlert}
              label="卡点提醒"
              value={overview.alerts.length}
              detail="需要协调的事项数量"
              tone={overview.alerts.length > 0 ? 'warning' : 'default'}
              onActivate={() => setSelectedProgressKpi('alerts')}
            />
          </div>

          {demands.length === 0 ? (
            <Card>
              <EmptyState
                icon={Briefcase}
                title="暂无招聘需求"
                description="创建招聘需求并把候选人推进流程后，进展清单会在这里出现。"
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
              <div className="space-y-3 xl:col-span-2">
                <h2 className="text-sm font-semibold text-[#292b2a]">
                  需求清单（{demands.length}）
                </h2>
                {demands.map((demand) => (
                  <DemandRow
                    key={demand.demand_id}
                    demand={demand}
                    selected={demand.demand_id === activeDemandId}
                    onSelect={() => setSelectedDemandId(demand.demand_id)}
                  />
                ))}
              </div>
              <div className="xl:col-span-3">
                {activeDemandId !== null && (
                  <DemandDrilldown demandId={activeDemandId} />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !error && overview && demands.length > 0 && (
        <Card>
          <CardBody>
            <p className="text-xs leading-5 text-[#858a86]">
              口径说明：已转出单独记录、不计入已淘汰；HC 达成后只提示“建议确认完成”，不会自动关闭需求。
            </p>
          </CardBody>
        </Card>
      )}

      {overview && (
        <DrawerShell
          open={selectedProgressKpi !== null}
          onClose={() => setSelectedProgressKpi(null)}
          title={selectedProgressKpi === 'demands'
            ? '需求总数'
            : selectedProgressKpi === 'pipeline'
              ? '当前流程人数'
              : selectedProgressKpi === 'onboarded'
                ? '已入职'
                : '卡点提醒'}
          description="本抽屉只展示当前页真实接口已返回的汇总与需求事实"
          size="md"
          testId="director-progress-kpi-drawer"
          footer={(
            <Link
              to={selectedProgressKpi === 'demands'
                ? '/demands'
                : selectedProgressKpi === 'onboarded'
                  ? '/dashboard/hired'
                  : selectedProgressKpi === 'alerts'
                    ? '/director/insights'
                    : '/kanban'}
              className="inline-flex h-10 items-center justify-center rounded-md border border-hairline bg-canvas px-5 text-sm font-semibold text-ink transition-colors hover:bg-surface-soft"
            >
              进入完整工作台
            </Link>
          )}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-[#e8e7e1] bg-[#f6f7f3] p-4">
              <p className="text-xs text-[#777b78]">
                {selectedProgressKpi === 'demands'
                  ? '需求总数'
                  : selectedProgressKpi === 'pipeline'
                    ? '全部需求的在流程候选人'
                    : selectedProgressKpi === 'onboarded'
                      ? '当前阶段为已入职'
                      : '需要协调的事项数量'}
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-[#292b2a]">
                {selectedProgressKpi === 'demands'
                  ? demands.length
                  : selectedProgressKpi === 'pipeline'
                    ? safeNum(overview.funnel.pipeline_total)
                    : selectedProgressKpi === 'onboarded'
                      ? safeNum(overview.funnel.onboarded)
                      : overview.alerts.length}
              </p>
            </div>

            {selectedProgressKpi === 'alerts' ? (
              overview.alerts.length === 0 ? (
                <p className="text-sm text-[#777b78]">当前没有需要协调的卡点。</p>
              ) : (
                <div className="space-y-3">
                  {overview.alerts.slice(0, 8).map((alert, index) => (
                    <div key={`${alert.kind}-${alert.demand_id}-${alert.candidate_id ?? index}`} className="rounded-xl border border-[#e8e7e1] p-4">
                      <p className="text-sm font-semibold text-[#292b2a]">{alert.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#777b78]">{alert.detail}</p>
                    </div>
                  ))}
                </div>
              )
            ) : demands.length === 0 ? (
              <p className="text-sm text-[#777b78]">当前没有可展示的需求事实。</p>
            ) : (
              <div className="space-y-3">
                {demands.slice(0, 8).map((demand) => (
                  <div key={demand.demand_id} className="rounded-xl border border-[#e8e7e1] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#292b2a]">{demand.title}</p>
                      <Badge tone={demandStatusTone(demand.status)}>{demandStatusLabel(demand.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#777b78]">
                      {selectedProgressKpi === 'pipeline'
                        ? `流程中 ${safeNum(demand.funnel.pipeline_total)} 人`
                        : selectedProgressKpi === 'onboarded'
                          ? `已入职 ${safeNum(demand.funnel.onboarded)} 人`
                          : `HC ${demand.hc.onboarded_count}/${demand.hc.headcount} · 流程中 ${safeNum(demand.funnel.pipeline_total)}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DrawerShell>
      )}
    </div>
  );
}

export default DirectorProgressPage;
