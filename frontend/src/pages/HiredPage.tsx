// 已入职视图（Readdy dashboard/hired 的真实化版本）。
// 数据真源：Offer 生命周期中 status='onboarded' 的记录（/api/offers）。
// 不使用 mock，不使用浏览器存储；接口失败显示错误和重试，不伪装成空数据。

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck2, Clock3, UserCheck, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '../components/ui';
import { DrawerShell } from '../components/ui/DrawerShell';
import type { OfferRecord } from '../types';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function daysBetween(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function isSameMonth(value: string, ref: Date): boolean {
  const date = new Date(value);
  return (
    !Number.isNaN(date.getTime())
    && date.getFullYear() === ref.getFullYear()
    && date.getMonth() === ref.getMonth()
  );
}

function SummaryCard({
  icon: Icon,
  value,
  label,
  onActivate,
}: {
  icon: typeof Users;
  value: string | number;
  label: string;
  onActivate?: () => void;
}) {
  const content = (
    <CardBody className="p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--enterprise-brand-soft)] text-[var(--enterprise-brand-dark)]">
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </div>
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </CardBody>
  );

  return (
    <Card variant="elevated">
      {onActivate ? (
        <button
          type="button"
          onClick={onActivate}
          className="block w-full rounded-[inherit] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label={`查看${label}详情`}
        >
          {content}
        </button>
      ) : content}
    </Card>
  );
}

type HiredKpiKey = 'total' | 'thisMonth' | 'cycle';

export function HiredPage() {
  const [selected, setSelected] = useState<OfferRecord | null>(null);
  const [selectedHiredKpi, setSelectedHiredKpi] = useState<HiredKpiKey | null>(null);
  const offersAsync = useAsync(
    () => api.listOffers({ status: 'onboarded' }),
    [],
  );

  const hired = useMemo(
    () => (offersAsync.data?.items ?? []).filter((offer) => offer.status === 'onboarded'),
    [offersAsync.data],
  );

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = hired.filter(
      (offer) => offer.onboarded_at && isSameMonth(offer.onboarded_at, now),
    );
    const offerToOnboardDays = hired
      .map((offer) => daysBetween(offer.created_at, offer.onboarded_at))
      .filter((days): days is number => days !== null);
    const avgOfferToOnboardDays = offerToOnboardDays.length > 0
      ? Math.round(
          offerToOnboardDays.reduce((sum, days) => sum + days, 0)
          / offerToOnboardDays.length,
        )
      : null;
    return {
      total: hired.length,
      thisMonth: thisMonth.length,
      avgOfferToOnboardDays,
    };
  }, [hired]);

  const hiredKpiDetail = useMemo(() => {
    if (!selectedHiredKpi) return null;

    if (selectedHiredKpi === 'thisMonth') {
      const now = new Date();
      const records = hired.filter(
        (offer) => offer.onboarded_at && isSameMonth(offer.onboarded_at, now),
      );
      return {
        title: '本月入职人数',
        value: `${stats.thisMonth} 人`,
        description: '按 Offer 记录的确认入职时间统计本自然月入职人数。',
        records,
      };
    }

    if (selectedHiredKpi === 'cycle') {
      const records = hired.filter(
        (offer) => daysBetween(offer.created_at, offer.onboarded_at) !== null,
      );
      return {
        title: '平均 Offer 至入职周期',
        value: stats.avgOfferToOnboardDays !== null ? `${stats.avgOfferToOnboardDays} 天` : '—',
        description: `从 Offer 记录创建到确认入职，基于 ${records.length} 条时间完整的真实记录计算。`,
        records,
      };
    }

    return {
      title: '累计入职人数',
      value: `${stats.total} 人`,
      description: '当前 Offer 生命周期中状态为已入职的全部真实记录。',
      records: hired,
    };
  }, [hired, selectedHiredKpi, stats]);

  if (offersAsync.loading && !offersAsync.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (offersAsync.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="已入职"
          description="确认入职的 Offer 记录，数据来自真实 Offer 生命周期"
        />
        <ErrorState
          message={`入职记录加载失败：${offersAsync.error.message}`}
          onRetry={offersAsync.reload}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-ui="readdy-hired">
      <PageHeader
        title="已入职"
        description={`共 ${stats.total} 人完成入职${stats.avgOfferToOnboardDays !== null ? `，平均 Offer 至入职周期 ${stats.avgOfferToOnboardDays} 天` : ''}`}
        actions={(
          <Button type="button" size="sm" variant="secondary" onClick={offersAsync.reload}>
            刷新
          </Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={UserCheck}
          value={stats.total}
          label="累计入职人数"
          onActivate={() => setSelectedHiredKpi('total')}
        />
        <SummaryCard
          icon={CalendarCheck2}
          value={stats.thisMonth}
          label="本月入职人数"
          onActivate={() => setSelectedHiredKpi('thisMonth')}
        />
        <SummaryCard
          icon={Clock3}
          value={stats.avgOfferToOnboardDays !== null ? `${stats.avgOfferToOnboardDays} 天` : '—'}
          label="平均 Offer 至入职周期（Offer 记录创建到确认入职）"
          onActivate={() => setSelectedHiredKpi('cycle')}
        />
      </div>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>入职记录</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {hired.length === 0 ? (
            <EmptyState
              icon={Users}
              title="暂无已入职记录"
              description={(
                <>
                  候选人确认入职后会出现在这里。可先到
                  <Link to="/offers" className="mx-1 font-semibold text-[var(--enterprise-brand-dark)] hover:underline">
                    Offer 管理
                  </Link>
                  对待入职的 Offer 执行「确认入职」。
                </>
              )}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-hairline text-left">
                    <th className="px-5 py-3 text-xs font-medium text-muted">姓名</th>
                    <th className="px-5 py-3 text-xs font-medium text-muted">职位</th>
                    <th className="px-5 py-3 text-xs font-medium text-muted">部门</th>
                    <th className="px-5 py-3 text-xs font-medium text-muted">需求编号</th>
                    <th className="px-5 py-3 text-xs font-medium text-muted">入职日期</th>
                    <th className="px-5 py-3 text-xs font-medium text-muted">Offer 至入职（天）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {hired.map((offer: OfferRecord) => {
                    const offerToOnboard = daysBetween(offer.created_at, offer.onboarded_at);
                    return (
                      <tr
                        key={offer.id}
                        className="cursor-pointer transition-colors hover:bg-surface-soft/60"
                        tabIndex={0}
                        onClick={() => setSelected(offer)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelected(offer);
                          }
                        }}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--enterprise-brand-soft)]">
                              <span className="text-xs font-semibold text-[var(--enterprise-brand-dark)]">
                                {offer.candidate_name.charAt(0)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelected(offer);
                              }}
                              className="text-sm font-medium text-ink hover:text-[var(--enterprise-brand-dark)] hover:underline"
                            >
                              {offer.candidate_name}
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-muted">{offer.position || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-muted">{offer.department || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-muted">{offer.request_no || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-ink">
                          {formatDate(offer.onboarded_at ?? offer.onboard_date)}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-ink">{offerToOnboard !== null ? offerToOnboard : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <DrawerShell
        open={Boolean(selectedHiredKpi)}
        onClose={() => setSelectedHiredKpi(null)}
        title={hiredKpiDetail?.title ?? '入职数据'}
        eyebrow="入职数据"
        description={hiredKpiDetail?.description}
        size="md"
        testId="hired-kpi-drawer"
        footer={(
          <Link
            to="/offers"
            className="inline-flex text-sm font-semibold text-[var(--enterprise-brand-dark)] hover:underline"
          >
            进入完整工作台
          </Link>
        )}
      >
        {hiredKpiDetail && (
          <div className="space-y-5">
            <section className="rounded-xl border border-hairline p-4">
              <p className="text-3xl font-bold text-ink">{hiredKpiDetail.value}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{hiredKpiDetail.description}</p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-ink">对应入职记录</h3>
              {hiredKpiDetail.records.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-muted">
                  暂无符合当前统计口径的入职记录
                </p>
              ) : (
                <div className="mt-3 divide-y divide-hairline rounded-xl border border-hairline">
                  {hiredKpiDetail.records.map((offer) => {
                    const offerToOnboard = daysBetween(offer.created_at, offer.onboarded_at);
                    return (
                      <article key={offer.id ?? `${offer.candidate_id}-${offer.demand_id}`} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{offer.candidate_name}</p>
                            <p className="mt-1 truncate text-xs text-muted">
                              {offer.position || '—'} · {offer.request_no || '—'}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-medium text-[var(--enterprise-brand-dark)]">
                            {formatDate(offer.onboarded_at ?? offer.onboard_date)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-muted">
                          Offer 至入职：{offerToOnboard !== null ? `${offerToOnboard} 天` : '—'}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </DrawerShell>

      <DrawerShell
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="入职详情"
        eyebrow="已入职"
        description={selected ? `${selected.candidate_name} · ${selected.request_no}` : undefined}
        size="md"
        testId="hired-detail-drawer"
      >
        {selected && (
          <div className="space-y-6 p-6">
            <section className="rounded-xl border border-hairline p-4">
              <h3 className="text-sm font-semibold text-ink">候选人与岗位</h3>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted">候选人</dt><dd className="mt-1 font-medium text-ink">{selected.candidate_name}</dd></div>
                <div><dt className="text-xs text-muted">职位</dt><dd className="mt-1 font-medium text-ink">{selected.position || '—'}</dd></div>
                <div><dt className="text-xs text-muted">部门</dt><dd className="mt-1 font-medium text-ink">{selected.department || '—'}</dd></div>
                <div><dt className="text-xs text-muted">招聘需求</dt><dd className="mt-1 font-medium text-ink">{selected.request_no || '—'}</dd></div>
              </dl>
            </section>

            <section className="rounded-xl border border-hairline p-4">
              <h3 className="text-sm font-semibold text-ink">入职信息</h3>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted">入职日期</dt><dd className="mt-1 font-medium text-ink">{formatDate(selected.onboarded_at ?? selected.onboard_date)}</dd></div>
                <div><dt className="text-xs text-muted">Offer 至入职</dt><dd className="mt-1 font-medium text-ink">{daysBetween(selected.created_at, selected.onboarded_at) ?? '—'} 天</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-muted">薪酬方案</dt><dd className="mt-1 font-medium text-ink">{selected.salary_range || '—'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-muted">备注</dt><dd className="mt-1 whitespace-pre-wrap text-ink">{selected.note || '暂无备注'}</dd></div>
              </dl>
            </section>

            <Link
              to={`/candidates/${selected.candidate_id}`}
              className="inline-flex text-sm font-semibold text-[var(--enterprise-brand-dark)] hover:underline"
            >
              查看完整候选人档案
            </Link>
          </div>
        )}
      </DrawerShell>
    </div>
  );
}
