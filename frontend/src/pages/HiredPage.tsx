// 已入职视图（Readdy dashboard/hired 的真实化版本）。
// 数据真源：Offer 生命周期中 status='onboarded' 的记录（/api/offers）。
// 不使用 mock，不使用浏览器存储；接口失败显示错误和重试，不伪装成空数据。

import { useMemo } from 'react';
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
}: {
  icon: typeof Users;
  value: string | number;
  label: string;
}) {
  return (
    <Card variant="elevated">
      <CardBody className="p-5">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#e9f5f0] text-[#1d6b42]">
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </div>
        <p className="text-2xl font-bold text-ink">{value}</p>
        <p className="mt-0.5 text-xs text-muted">{label}</p>
      </CardBody>
    </Card>
  );
}

export function HiredPage() {
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
    const cycles = hired
      .map((offer) => daysBetween(offer.created_at, offer.onboarded_at))
      .filter((days): days is number => days !== null);
    const avgCycle = cycles.length > 0
      ? Math.round(cycles.reduce((sum, days) => sum + days, 0) / cycles.length)
      : null;
    return {
      total: hired.length,
      thisMonth: thisMonth.length,
      avgCycle,
    };
  }, [hired]);

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
        description={`共 ${stats.total} 人完成入职${stats.avgCycle !== null ? `，平均招聘周期 ${stats.avgCycle} 天` : ''}`}
        actions={(
          <Button type="button" size="sm" variant="secondary" onClick={offersAsync.reload}>
            刷新
          </Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard icon={UserCheck} value={stats.total} label="累计入职人数" />
        <SummaryCard icon={CalendarCheck2} value={stats.thisMonth} label="本月入职人数" />
        <SummaryCard
          icon={Clock3}
          value={stats.avgCycle !== null ? `${stats.avgCycle} 天` : '—'}
          label="平均招聘周期（创建 Offer 到入职）"
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
                  <Link to="/offers" className="mx-1 font-semibold text-[#1d6b42] hover:underline">
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
                    <th className="px-5 py-3 text-xs font-medium text-muted">招聘周期（天）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {hired.map((offer: OfferRecord) => {
                    const cycle = daysBetween(offer.created_at, offer.onboarded_at);
                    return (
                      <tr key={offer.id} className="transition-colors hover:bg-surface-soft/60">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e9f5f0]">
                              <span className="text-xs font-semibold text-[#1d6b42]">
                                {offer.candidate_name.charAt(0)}
                              </span>
                            </div>
                            <Link
                              to={`/candidates/${offer.candidate_id}`}
                              className="text-sm font-medium text-ink hover:text-[#1d6b42] hover:underline"
                            >
                              {offer.candidate_name}
                            </Link>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-muted">{offer.position || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-muted">{offer.department || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-muted">{offer.request_no || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-ink">
                          {formatDate(offer.onboarded_at ?? offer.onboard_date)}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-ink">{cycle !== null ? cycle : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
