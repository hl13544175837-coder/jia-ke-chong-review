// Director cockpit grafted from the Readdy director/cockpit design.
// High-level read-only summary backed by api.biOverview() plus the pending
// Offer count from api.listOffers(). No personal-performance content.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  FileCheck2,
  Lightbulb,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  DrawerShell,
  PageHeader,
  Spinner,
} from '../../components/ui';
import { AlertList, KpiCard, OverviewFunnelBars, PurposeBanner } from './widgets';
import { safeNum } from './utils';

interface CockpitKpiDetail {
  label: string;
  value: string | number;
  description: string;
  to: string;
  actionLabel: string;
}

const QUICK_LINKS = [
  {
    to: '/director/progress',
    icon: BarChart3,
    title: '招聘进展',
    description: '需求清单与单需求下钻',
  },
  {
    to: '/director/insights',
    icon: Lightbulb,
    title: '洞察与风险',
    description: '停滞、待反馈与缺口',
  },
  {
    to: '/director/approvals',
    icon: ShieldCheck,
    title: 'Offer 审批',
    description: '处理待审批的 Offer',
  },
  {
    to: '/analytics',
    icon: Users,
    title: '数据分析',
    description: '团队漏斗与责任协同',
  },
] as const;

export function DirectorCockpitPage() {
  const { role } = useAuth();
  const canView = role === 'manager' || role === 'admin';
  const [cockpitKpiDetail, setCockpitKpiDetail] = useState<CockpitKpiDetail | null>(null);

  const overviewAsync = useAsync(
    () => (canView ? api.biOverview() : Promise.resolve(null)),
    [canView],
  );
  const pendingOffersAsync = useAsync(
    () => (canView ? api.listOffers({ status: 'pending' }) : Promise.resolve(null)),
    [canView],
  );

  const overview = overviewAsync.data;
  const demands = useMemo(() => overview?.demands ?? [], [overview]);
  const activeDemands = useMemo(
    () => demands.filter((item) => item.status === 'active').length,
    [demands],
  );
  const stagnationAlerts = useMemo(
    () => (overview?.alerts ?? []).filter((alert) => alert.priority === 'high').length,
    [overview],
  );

  if (!canView) {
    return (
      <div data-ui="readdy-director-cockpit" className="mx-auto max-w-[1440px] space-y-5">
        <PageHeader title="总监驾驶舱" description="全局招聘高层摘要" />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="暂无查看权限"
            description="总监驾驶舱面向招聘经理和管理员。如需查看，请联系管理员开通权限。"
          />
        </Card>
      </div>
    );
  }

  return (
    <div data-ui="readdy-director-cockpit" className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="总监驾驶舱"
        description="全局招聘高层摘要 · 只读视图 · 数据来自真实流程事实"
      />

      <PurposeBanner />

      {overviewAsync.loading && (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-[#777b78]">
          <Spinner />
          正在加载驾驶舱数据…
        </div>
      )}

      {!overviewAsync.loading && overviewAsync.error && (
        <ErrorState
          message={`驾驶舱数据加载失败：${overviewAsync.error.message}（这是接口失败，不是业务数据为 0）`}
          onRetry={overviewAsync.reload}
        />
      )}

      {!overviewAsync.loading && !overviewAsync.error && overview && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              icon={Briefcase}
              label="招聘需求总数"
              value={demands.length}
              detail={`进行中 ${activeDemands} 个`}
              onActivate={() => setCockpitKpiDetail({
                label: '招聘需求总数',
                value: demands.length,
                description: '当前组织内可查看的招聘需求总数，包含进行中和已结束需求。',
                to: '/director/progress',
                actionLabel: '查看需求清单',
              })}
            />
            <KpiCard
              icon={Users}
              label="活跃需求"
              value={activeDemands}
              detail="状态为招聘中的需求"
              onActivate={() => setCockpitKpiDetail({
                label: '活跃需求',
                value: activeDemands,
                description: '当前状态为招聘中的 Demand，需要持续跟进 HC、候选人进展和卡点。',
                to: '/director/progress',
                actionLabel: '查看招聘进展',
              })}
            />
            <KpiCard
              icon={FileCheck2}
              label="Offer 待审批"
              value={
                pendingOffersAsync.loading
                  ? '…'
                  : pendingOffersAsync.error
                    ? '加载失败'
                    : safeNum(pendingOffersAsync.data?.total)
              }
              detail={
                pendingOffersAsync.error
                  ? '接口失败，可在审批页重试'
                  : '等待管理者审批的 Offer'
              }
              tone={
                !pendingOffersAsync.error && safeNum(pendingOffersAsync.data?.total) > 0
                  ? 'warning'
                  : 'default'
              }
              onActivate={pendingOffersAsync.loading || pendingOffersAsync.error ? undefined : () => setCockpitKpiDetail({
                label: 'Offer 待审批',
                value: safeNum(pendingOffersAsync.data?.total),
                description: '已由招聘专员提交、等待招聘经理或管理员审批的真实 Offer。',
                to: '/director/approvals',
                actionLabel: '处理 Offer 审批',
              })}
            />
            <KpiCard
              icon={ShieldAlert}
              label="停滞预警"
              value={stagnationAlerts}
              detail="高优先级卡点数量"
              tone={stagnationAlerts > 0 ? 'danger' : 'default'}
              onActivate={() => setCockpitKpiDetail({
                label: '停滞预警',
                value: stagnationAlerts,
                description: '由真实流程卡点生成的高优先级提醒，用于定位需要协调的需求和责任人。',
                to: '/director/insights',
                actionLabel: '查看洞察与风险',
              })}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>团队流程漏斗</CardTitle>
                  <Badge tone="neutral">
                    当前流程 {safeNum(overview.funnel.pipeline_total)} 人
                  </Badge>
                </div>
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
                <CardTitle>需要协调的事项</CardTitle>
                <p className="mt-1 text-xs text-[#858a86]">
                  只提示当前该谁接住，不做个人评价
                </p>
              </CardHeader>
              <CardBody>
                <AlertList alerts={overview.alerts} limit={5} />
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {QUICK_LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group rounded-xl border border-[#e8e7e1] bg-white p-4 transition-colors hover:border-[var(--enterprise-brand)]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--enterprise-brand-soft)] text-[var(--enterprise-brand)]">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#292b2a]">{item.title}</p>
                    <p className="truncate text-xs text-[#858a86]">{item.description}</p>
                  </div>
                  <ArrowRight
                    className="ml-auto h-4 w-4 shrink-0 text-[#c3c7c0] transition group-hover:translate-x-0.5 group-hover:text-[var(--enterprise-brand)]"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            ))}
          </div>

          <DrawerShell
            open={Boolean(cockpitKpiDetail)}
            onClose={() => setCockpitKpiDetail(null)}
            title={cockpitKpiDetail?.label ?? '指标明细'}
            eyebrow="总监驾驶舱"
            description="组织级真实流程摘要"
            size="md"
            testId="director-cockpit-kpi-drawer"
            footer={cockpitKpiDetail ? (
              <div className="flex w-full justify-end gap-3">
                <Button variant="secondary" onClick={() => setCockpitKpiDetail(null)}>关闭</Button>
                <Link
                  to={cockpitKpiDetail.to}
                  onClick={() => setCockpitKpiDetail(null)}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--enterprise-brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--enterprise-brand-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  {cockpitKpiDetail.actionLabel}
                </Link>
              </div>
            ) : undefined}
          >
            {cockpitKpiDetail && (
              <div className="space-y-5">
                <section className="rounded-lg border border-hairline bg-surface-soft px-5 py-5">
                  <p className="text-sm text-muted">{cockpitKpiDetail.label}</p>
                  <p className="mt-2 text-4xl font-semibold tabular-nums text-ink">{cockpitKpiDetail.value}</p>
                </section>
                <section>
                  <h3 className="text-sm font-semibold text-ink">管理含义</h3>
                  <p className="mt-2 text-sm leading-6 text-body">{cockpitKpiDetail.description}</p>
                </section>
              </div>
            )}
          </DrawerShell>
        </>
      )}
    </div>
  );
}

export default DirectorCockpitPage;
