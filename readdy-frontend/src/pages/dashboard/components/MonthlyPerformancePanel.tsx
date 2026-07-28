import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useCompanyAuth } from '@/auth/companyAuth';
import { demandsApi } from '@/features/demands/api';
import type { DemandOwnerOption } from '@/features/demands/types';
import { analyticsApi } from '@/features/analytics/api';
import type { MonthlyPerformance, MonthlyPerformanceDemand } from '@/features/analytics/types';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function recentMonths() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const value = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  });
}

const funnelColumns: Array<{ key: keyof MonthlyPerformanceDemand['funnel']; label: string }> = [
  { key: 'resumes', label: '简历库' },
  { key: 'screened', label: '初筛' },
  { key: 'business_review', label: '业务筛选' },
  { key: 'interview', label: '面试' },
  { key: 'offer', label: 'Offer' },
  { key: 'hired', label: '入职' },
];

function SummaryMetric({ label, value, suffix = '' }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-background-50 px-3 py-2.5">
      <p className="truncate text-xs text-foreground-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground-900">{value}{suffix}</p>
    </div>
  );
}

function DemandDetail({ demand }: { demand: MonthlyPerformanceDemand }) {
  return (
    <div className="border-t border-background-100 bg-background-50/60 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {funnelColumns.map((column) => (
          <div key={column.key} className="rounded-lg border border-background-200 bg-white px-3 py-2">
            <p className="text-xs text-foreground-500">{column.label}</p>
            <p className="mt-1 text-sm font-semibold text-foreground-900">{demand.funnel[column.key]} 人</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-foreground-500">
        本岗位总体转化率：<span className="font-semibold text-primary-700">{demand.overall_conversion_rate}%</span>
      </p>
    </div>
  );
}

export default function MonthlyPerformancePanel() {
  const { role, userId } = useCompanyAuth();
  const [month, setMonth] = useState(currentMonth);
  const [owners, setOwners] = useState<DemandOwnerOption[]>([]);
  const [ownerId, setOwnerId] = useState<number | null>(role === 'recruiter' ? userId : null);
  const [performance, setPerformance] = useState<MonthlyPerformance | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedDemandId, setExpandedDemandId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (role === 'recruiter') {
      setOwnerId(userId);
      return;
    }
    if (!['manager', 'admin'].includes(role || '')) return;
    void demandsApi.listRecruiterOwners()
      .then((items) => {
        setOwners(items);
        setOwnerId((current) => current ?? items[0]?.id ?? null);
      })
      .catch(() => setError('招聘专员列表暂不可用'));
  }, [role, userId]);

  const loadPerformance = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setError('');
    try {
      setPerformance(await analyticsApi.monthlyPerformance(ownerId, month));
    } catch (loadError) {
      setPerformance(null);
      setError(loadError instanceof Error ? loadError.message : '月度数据暂不可用');
    } finally {
      setLoading(false);
    }
  }, [month, ownerId]);

  useEffect(() => {
    void loadPerformance();
  }, [loadPerformance]);

  return (
    <section data-ui="dashboard-monthly-performance" className="overflow-hidden rounded-xl border border-background-200 bg-white shadow-[0_8px_28px_rgba(44,62,52,0.035)]">
      <header className="flex flex-col gap-3 border-b border-background-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground-900">数据看板</h2>
            <p className="mt-0.5 truncate text-xs text-foreground-500">按自然月查看客观推进数据，只展示该招聘专员负责且当月有数据的招聘需求</p>
          </div>
          {performance && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">本月合计</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-foreground-500">
            月份
            <select
              aria-label="数据看板月份"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-8 min-w-[104px] rounded-lg border border-background-200 bg-white px-2 text-xs text-foreground-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            >
              {recentMonths().map((item) => <option key={item} value={item}>{item.replace('-', '年')}月</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-foreground-500">
            招聘专员
            <select
              aria-label="数据看板招聘专员"
              value={ownerId ?? ''}
              disabled={role === 'recruiter' || owners.length === 0}
              onChange={(event) => setOwnerId(Number(event.target.value))}
              className="h-8 min-w-[116px] rounded-lg border border-background-200 bg-white px-2 text-xs text-foreground-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:bg-background-50 disabled:text-foreground-500"
            >
              {role === 'recruiter' && <option value={userId ?? ''}>当前招聘专员</option>}
              {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadPerformance()}
            disabled={loading || !ownerId}
            aria-label="刷新数据看板"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-background-200 text-foreground-500 hover:bg-background-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary-300 bg-white px-3 text-xs font-medium text-primary-700 hover:bg-primary-50"
          >
            {expanded ? '收起岗位明细' : '查看岗位明细'}
            {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {error && <p className="border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">{error}</p>}
      {!error && !performance && loading && <p className="px-4 py-8 text-center text-sm text-foreground-500">正在加载月度数据...</p>}
      {!error && !performance && !loading && <p className="px-4 py-8 text-center text-sm text-foreground-500">暂无可展示的月度数据</p>}

      {performance && (
        <>
          <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 lg:grid-cols-7">
            <SummaryMetric label="负责招聘需求" value={performance.summary.demand_count} suffix=" 个" />
            <SummaryMetric label="简历进入" value={performance.summary.funnel.resumes} suffix=" 人" />
            <SummaryMetric label="初筛推进" value={performance.summary.funnel.screened} suffix=" 人" />
            <SummaryMetric label="面试推进" value={performance.summary.funnel.interview} suffix=" 人" />
            <SummaryMetric label="Offer" value={performance.summary.funnel.offer} suffix=" 人" />
            <SummaryMetric label="已入职" value={performance.summary.funnel.hired} suffix=" 人" />
            <SummaryMetric label="总体转化率" value={performance.summary.overall_conversion_rate} suffix="%" />
          </div>

          {expanded && (
            <div className="border-t border-background-100">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-background-50/60 text-left text-[11px] font-medium text-foreground-400">
                    <tr>
                      <th className="px-4 py-2.5">招聘需求</th>
                      {funnelColumns.map((column) => <th key={column.key} className="px-2 py-2.5 text-center">{column.label}</th>)}
                      <th className="px-3 py-2.5 text-center">转化率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-background-100">
                    {performance.demands.map((demand) => {
                      const isOpen = expandedDemandId === demand.demand_id;
                      return (
                        <tr key={demand.demand_id} className="align-top">
                          <td colSpan={isOpen ? 8 : 1} className={isOpen ? 'p-0' : 'px-4 py-3'}>
                            {isOpen ? (
                              <div>
                                <button type="button" onClick={() => setExpandedDemandId(null)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-background-50/70">
                                  <span><span className="font-medium text-foreground-900">{demand.title}</span><span className="ml-2 text-foreground-400">{demand.department} · {demand.city}</span></span>
                                  <ChevronDown size={14} className="text-foreground-400" aria-hidden="true" />
                                </button>
                                <DemandDetail demand={demand} />
                              </div>
                            ) : (
                              <button type="button" onClick={() => setExpandedDemandId(demand.demand_id)} className="flex max-w-[260px] items-center gap-1 text-left font-medium text-foreground-900 hover:text-primary-700">
                                <ChevronRight size={14} className="text-foreground-400" aria-hidden="true" />
                                <span className="truncate">{demand.title}</span>
                                <span className="ml-1 shrink-0 text-foreground-400">· {demand.department}</span>
                              </button>
                            )}
                          </td>
                          {!isOpen && funnelColumns.map((column) => <td key={column.key} className="px-2 py-3 text-center font-medium text-foreground-700">{demand.funnel[column.key]}</td>)}
                          {!isOpen && <td className="px-3 py-3 text-center font-medium text-primary-700">{demand.overall_conversion_rate}%</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {performance.demands.length === 0 && <p className="px-4 py-8 text-center text-sm text-foreground-500">这个月没有该招聘专员负责且发生招聘动作的招聘需求</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
