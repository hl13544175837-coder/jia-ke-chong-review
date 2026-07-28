import { useEffect, useMemo, useState } from 'react';
import { analyticsApi } from '@/features/analytics/api';
import type { AnalyticsOverview } from '@/features/analytics/types';
import { useToast } from '@/hooks/useToast';

function displayTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export default function AnalyticsPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [trendView, setTrendView] = useState<'hires' | 'offers'>('hires');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await analyticsApi.overview());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '统计数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  const maxTrend = useMemo(() => Math.max(1, ...(data?.monthly_trends.map((item) => trendView === 'hires' ? item.hires : item.offers) ?? [0])), [data, trendView]);
  const funnel = data?.funnel;
  const funnelRows = funnel ? [
    ['简历收取', funnel.resumes], ['简历筛选通过', funnel.screened], ['进入面试', funnel.interviewed], ['发放 Offer', funnel.offered], ['成功入职', funnel.hired],
  ] : [];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await analyticsApi.exportCsv();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '招聘进展.csv';
      link.click();
      URL.revokeObjectURL(url);
      showToast('已下载当前组织的真实招聘进展 CSV');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : '导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  const cards = data ? [
    ['本月入职', data.summary.hires_month, '人'],
    ['本季度入职', data.summary.hires_quarter, '人'],
    ['在招岗位', data.summary.open_demands, '个'],
    ['可用 HC', data.summary.remaining_headcount, '人'],
    ['Offer 接受率', data.summary.offer_accept_rate, '%'],
    ['招聘成本', data.summary.cost_available ? '—' : '未接入', ''],
  ] : [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-foreground-900">人力资源分析看板</h1><p className="mt-1 text-sm text-foreground-500">{data?.purpose || '读取当前组织的真实招聘数据'}</p></div>
        <div className="flex items-center gap-3"><span className="text-xs text-foreground-400">数据更新于 {displayTime(data?.generated_at)}</span><button type="button" onClick={() => void exportCsv()} disabled={!data || exporting} className="rounded-lg border border-background-200 bg-background-100 px-3 py-1.5 text-xs font-medium text-foreground-700 hover:bg-background-200 disabled:opacity-50"><i className="ri-download-2-line mr-1" />{exporting ? '导出中' : '导出报表'}</button></div>
      </header>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" onClick={() => void load()} className="ml-3 underline">重新加载</button></div>}
      {loading && !data ? <div className="rounded-xl border border-background-200 bg-white px-5 py-12 text-center text-sm text-foreground-500">正在加载真实统计数据...</div> : data && <>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">{cards.map(([label, value, unit]) => <div key={String(label)} className="rounded-xl border border-background-200 bg-white p-4"><p className="text-xs text-foreground-500">{label}</p><p className="mt-2 text-2xl font-bold text-foreground-900">{value}<span className="ml-1 text-xs font-normal text-foreground-400">{unit}</span></p>{label === '招聘成本' && <p className="mt-1 text-[11px] text-foreground-400">成本数据待外部系统接入</p>}</div>)}</div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-xl border border-background-200 bg-white p-5 lg:col-span-2"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-heading font-bold text-foreground-900">月度招聘趋势</h2><p className="mt-0.5 text-xs text-foreground-500">近 7 个月入职与 Offer 发放</p></div><div className="rounded-lg bg-background-100 p-0.5"><button type="button" onClick={() => setTrendView('hires')} className={`rounded-md px-3 py-1.5 text-xs ${trendView === 'hires' ? 'bg-white shadow-sm' : 'text-foreground-500'}`}>入职人数</button><button type="button" onClick={() => setTrendView('offers')} className={`rounded-md px-3 py-1.5 text-xs ${trendView === 'offers' ? 'bg-white shadow-sm' : 'text-foreground-500'}`}>Offer 数量</button></div></div><div className="flex h-48 items-end gap-2">{data.monthly_trends.map((item) => { const value = trendView === 'hires' ? item.hires : item.offers; return <div key={item.month} className="flex flex-1 flex-col items-center gap-1"><span className="text-xs font-semibold">{value}</span><div className="flex h-36 w-full items-end justify-center"><div className="w-full max-w-10 rounded-t bg-primary-400" style={{ height: `${Math.max(4, value / maxTrend * 100)}%` }} /></div><span className="text-xs text-foreground-500">{item.month}</span></div>; })}</div></section>
          <section className="rounded-xl border border-background-200 bg-white p-5"><h2 className="font-heading font-bold text-foreground-900">招聘漏斗</h2><p className="mt-0.5 text-xs text-foreground-500">全流程当前事实</p><div className="mt-5 space-y-3">{funnelRows.map(([label, value]) => <div key={String(label)} className="flex items-center gap-3"><span className="w-24 text-xs text-foreground-600">{label}</span><div className="h-6 flex-1 overflow-hidden rounded-full bg-background-100"><div className="flex h-full items-center rounded-full bg-primary-400 pl-2 text-xs font-medium text-white" style={{ width: `${Math.max(5, Number(value) / Math.max(1, funnel!.resumes) * 100)}%` }}>{value}</div></div></div>)}</div></section>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><section className="rounded-xl border border-background-200 bg-white p-5"><h2 className="font-heading font-bold text-foreground-900">各部门招聘进度</h2><div className="mt-4 space-y-3">{data.departments.length ? data.departments.map((item) => <div key={item.department} className="flex items-center justify-between border-b border-background-100 pb-3 text-sm"><span>{item.department}</span><span className="text-foreground-500">HC {item.onboarded}/{item.headcount} · 流程中 {item.in_progress}</span></div>) : <p className="text-sm text-foreground-500">暂无部门招聘数据</p>}</div></section><section className="rounded-xl border border-background-200 bg-white p-5"><h2 className="font-heading font-bold text-foreground-900">简历来源分布</h2><div className="mt-4 space-y-3">{data.sources.length ? data.sources.map((item) => <div key={item.channel} className="flex items-center justify-between text-sm"><span>{item.channel}</span><span className="font-medium">{item.count} 批</span></div>) : <p className="text-sm text-foreground-500">暂无已记录的来源批次</p>}</div></section></div>
      </>}
    </div>
  );
}
