import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { analyticsApi } from '@/features/analytics/api';
import type { AnalyticsOverview } from '@/features/analytics/types';

export default function CyclePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await analyticsApi.overview());
    } catch {
      setError('招聘周期暂时无法读取，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const cycleData = data?.cycle_rows ?? [];
  const totalAvg = data?.summary.average_cycle_days ?? null;
  const fastest = data?.summary.fastest_cycle_days ?? null;
  const slowest = data?.summary.slowest_cycle_days ?? null;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-sm text-foreground-500 transition-colors hover:text-foreground-800">
          <i className="ri-arrow-left-line"></i>返回工作台
        </button>
        <span className="text-foreground-300">/</span>
        <span className="text-sm font-medium text-foreground-900">平均招聘周期详情</span>
      </div>

      <PageHeader
        title="平均招聘周期"
        description="按已确认入职记录计算，从需求受理到实际入职"
        actions={<button type="button" onClick={() => void loadData()} disabled={loading} className="rounded-lg border border-background-200 bg-white px-3 py-2 text-sm text-foreground-600 hover:bg-background-50 disabled:opacity-50">刷新</button>}
      />

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span><button type="button" onClick={() => void loadData()} className="font-medium underline">重新加载</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['ri-time-line', '整体平均周期', totalAvg, 'bg-accent-50 text-accent-600'],
          ['ri-send-plane-line', '最快入职', fastest, 'bg-primary-50 text-primary-600'],
          ['ri-hourglass-line', '最慢入职', slowest, 'bg-background-200 text-foreground-600'],
          ['ri-file-list-3-line', '统计岗位数', cycleData.length, 'bg-secondary-50 text-secondary-600'],
        ].map(([icon, label, value, tone], index) => (
          <div key={String(label)} className="rounded-xl border border-background-200 bg-white p-5">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}><i className={String(icon)}></i></div>
            <p className="text-2xl font-bold text-foreground-900">{value ?? '—'}{index < 3 && value !== null ? <span className="ml-1 text-sm font-normal text-foreground-500">天</span> : null}</p>
            <p className="text-xs text-foreground-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-background-200 bg-white">
        <div className="border-b border-background-200 px-5 py-4"><h2 className="text-sm font-semibold text-foreground-900">各岗位招聘周期明细</h2></div>
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-foreground-500">正在计算本地招聘周期...</div>
        ) : cycleData.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-foreground-500">还没有同时记录需求起始时间和实际入职日期的数据。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr className="border-b border-background-200">
                {['岗位', '部门', '平均周期', '最快', '最慢', '入职人数', '周期分布'].map((label) => <th key={label} className="px-5 py-3 text-left text-xs font-medium text-foreground-500">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-background-100">
                {cycleData.map((row) => (
                  <tr key={row.demand_id} className="transition-colors hover:bg-background-50/50">
                    <td className="px-5 py-3.5 text-sm font-medium text-foreground-900">{row.position}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-600">{row.department}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-primary-600">{row.average_days} 天</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-600">{row.fastest_days} 天</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-600">{row.slowest_days} 天</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-600">{row.hired_count} 人</td>
                    <td className="px-5 py-3.5"><div className="flex items-center gap-2"><div className="h-2 w-full max-w-[120px] rounded-full bg-primary-100"><div className="h-2 rounded-full bg-primary-500" style={{ width: `${slowest ? Math.max(4, Math.round((row.average_days / slowest) * 100)) : 0}%` }}></div></div><span className="text-xs text-foreground-400">{row.average_days}d</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
