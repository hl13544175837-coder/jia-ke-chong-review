import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { analyticsApi } from '@/features/analytics/api';
import type { AnalyticsOverview } from '@/features/analytics/types';

export default function DirectorInsightsPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await analyticsApi.overview());
    } catch {
      setError('人才供需暂时无法读取，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const inProgress = useMemo(
    () => data?.demands.reduce((sum, row) => sum + row.in_progress, 0) ?? 0,
    [data],
  );
  const departmentRows = useMemo(
    () => {
      const groups = new Map<string, { department: string; headcount: number; onboarded: number; in_progress: number; remaining: number }>();
      (data?.demands ?? []).forEach((row) => {
        const current = groups.get(row.department) ?? { department: row.department, headcount: 0, onboarded: 0, in_progress: 0, remaining: 0 };
        current.headcount += row.headcount;
        current.onboarded += row.onboarded;
        current.in_progress += row.in_progress;
        current.remaining += row.remaining;
        groups.set(row.department, current);
      });
      return Array.from(groups.values()).sort((a, b) => b.remaining - a.remaining);
    },
    [data],
  );
  const maxSource = Math.max(0, ...(data?.sources.map((item) => item.count) ?? []));
  const highestGap = departmentRows[0];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <PageHeader
        title="人才供需"
        visuallyHiddenTitle
        description={`当前岗位与在途人才 · ${data?.summary.candidate_total ?? 0} 位候选人 · ${inProgress} 人在流程中 · ${data?.funnel.hired ?? 0} 人已入职 · 只读模式`}
        actions={<><button type="button" onClick={() => void loadData()} disabled={loading} className="rounded-lg border border-background-200 bg-white px-3 py-2 text-sm text-foreground-600 hover:bg-background-50 disabled:opacity-50">刷新</button><Link to="/director/cockpit" className="flex items-center gap-1 whitespace-nowrap text-sm text-foreground-500 transition-colors hover:text-foreground-800"><i className="ri-arrow-left-line"></i> 返回驾驶舱</Link></>}
      />

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => void loadData()} className="font-medium underline">重新加载</button></div>}
      {loading && !data && <div className="rounded-xl border border-background-200 bg-white px-5 py-10 text-center text-sm text-foreground-500">正在读取本地人才数据...</div>}

      <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white"><i className="ri-information-line"></i></div>
          <div>
            <p className="text-sm font-medium text-primary-900">本页只使用本地数据库已有记录</p>
            <p className="mt-1 text-sm leading-6 text-primary-800">
              {highestGap
                ? `${highestGap.department}当前剩余 HC 最多（${highestGap.remaining} 人），可优先检查在途候选人是否足够。`
                : '当前还没有可分析的在招部门数据。'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['候选人总量', data?.summary.candidate_total ?? 0, 'ri-group-line'],
          ['流程中候选人', inProgress, 'ri-route-line'],
          ['本月已入职', data?.summary.hires_month ?? 0, 'ri-user-add-line'],
          ['当前在招需求', data?.summary.open_demands ?? 0, 'ri-briefcase-line'],
        ].map(([label, value, icon]) => (
          <div key={String(label)} className="rounded-xl border border-background-200 bg-white p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><i className={String(icon)}></i></div>
            <p className="text-2xl font-bold text-foreground-900">{value}</p>
            <p className="text-xs text-foreground-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-background-200 bg-white p-5">
          <h2 className="font-heading font-bold text-foreground-900">简历来源记录</h2>
          <p className="mt-1 text-xs text-foreground-500">按本地上传批次统计，不等同于渠道效果排名</p>
          <div className="mt-5 space-y-3">
            {(data?.sources ?? []).map((item) => (
              <div key={item.channel}>
                <div className="mb-1 flex items-center justify-between text-xs"><span className="text-foreground-700">{item.channel}</span><span className="font-semibold text-foreground-900">{item.count} 批</span></div>
                <div className="h-2 rounded-full bg-background-100"><div className="h-2 rounded-full bg-primary-500" style={{ width: `${maxSource > 0 ? Math.max(4, Math.round((item.count / maxSource) * 100)) : 0}%` }}></div></div>
              </div>
            ))}
            {(data?.sources.length ?? 0) === 0 && <p className="py-10 text-center text-sm text-foreground-500">还没有记录简历来源。</p>}
          </div>
        </section>

        <section className="rounded-xl border border-background-200 bg-white p-5">
          <h2 className="font-heading font-bold text-foreground-900">部门人才供需</h2>
          <p className="mt-1 text-xs text-foreground-500">按当前在招 HC、在途候选人和已入职人数计算</p>
          <div className="mt-5 space-y-3">
            {departmentRows.map((row) => {
              const remaining = row.remaining;
              return (
                <div key={row.department} className="rounded-lg border border-background-100 px-4 py-3">
                  <div className="flex items-center justify-between"><span className="text-sm font-medium text-foreground-900">{row.department}</span><span className={`text-xs font-medium ${remaining > row.in_progress ? 'text-accent-700' : 'text-primary-700'}`}>剩余 HC {remaining}</span></div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-foreground-500"><span>目标 {row.headcount}</span><span>在途 {row.in_progress}</span><span>入职 {row.onboarded}</span></div>
                </div>
              );
            })}
            {departmentRows.length === 0 && <p className="py-10 text-center text-sm text-foreground-500">当前没有在招部门数据。</p>}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-background-200 bg-white">
        <div className="border-b border-background-200 px-5 py-4"><h2 className="text-sm font-semibold text-foreground-900">岗位人才缺口</h2><p className="mt-1 text-xs text-foreground-500">只展示当前在招需求，不开放候选人个人明细</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr className="border-b border-background-200">{['岗位', '部门', '招聘目标', '已入职', '在途', '剩余 HC', '风险'].map((label) => <th key={label} className="px-5 py-3 text-left text-xs font-medium text-foreground-500">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-background-100">
              {(data?.demands ?? []).map((row) => (
                <tr key={row.demand_id} className="hover:bg-background-50/50">
                  <td className="px-5 py-3.5 text-sm font-medium text-foreground-900">{row.title}</td>
                  <td className="px-5 py-3.5 text-sm text-foreground-600">{row.department}</td>
                  <td className="px-5 py-3.5 text-sm text-foreground-600">{row.headcount}</td>
                  <td className="px-5 py-3.5 text-sm text-foreground-600">{row.onboarded}</td>
                  <td className="px-5 py-3.5 text-sm text-foreground-600">{row.in_progress}</td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-foreground-900">{row.remaining}</td>
                  <td className="px-5 py-3.5"><span className={`rounded-full px-2 py-1 text-xs font-medium ${row.risk_flags.length ? 'bg-secondary-100 text-secondary-700' : 'bg-primary-50 text-primary-700'}`}>{row.risk_flags.length ? '需关注' : '正常'}</span></td>
                </tr>
              ))}
              {(data?.demands.length ?? 0) === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-foreground-500">当前没有在招需求。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
