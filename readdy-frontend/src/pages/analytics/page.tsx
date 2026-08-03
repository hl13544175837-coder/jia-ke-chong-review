import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCompanyAuth } from '@/auth/companyAuth';
import CandidateReadOnlyList from '@/components/analytics/CandidateReadOnlyList';
import PageHeader from '@/components/ui/PageHeader';
import ReadOnlyDetailDrawer from '@/components/ui/ReadOnlyDetailDrawer';
import { analyticsApi } from '@/features/analytics/api';
import type { AnalyticsCandidateRow, AnalyticsDemandRow, AnalyticsOverview } from '@/features/analytics/types';
import { useToast } from '@/hooks/useToast';
import {
  InterviewerDataBoard,
  ManagerTeamResponsibilityPanel,
  MonthlyPerformanceDataPanel,
  RecruiterDataBoard,
} from './components/RoleDataViews';

type InsightKey =
  | 'candidate-total'
  | 'pipeline-active'
  | 'hires-month'
  | 'hires-quarter'
  | 'open-demands'
  | 'remaining-hc'
  | 'offer-rate'
  | 'funnel-resumes'
  | 'funnel-screened'
  | 'funnel-interviewed'
  | 'funnel-offered'
  | 'funnel-hired'
  | `owner:${number}`
  | `department:${string}`;

interface InsightView {
  key: InsightKey;
  title: string;
  description: string;
  rows: AnalyticsDemandRow[];
}

interface KpiCard {
  label: string;
  value: number | string;
  unit: string;
  key?: InsightKey;
  note?: string;
}

function displayTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function insightMetric(row: AnalyticsDemandRow, key: InsightKey) {
  switch (key) {
    case 'candidate-total': return row.funnel.funnel_total;
    case 'pipeline-active': return row.funnel.pipeline_total;
    case 'hires-month': return row.hires_month;
    case 'hires-quarter': return row.hires_quarter;
    case 'open-demands': return 1;
    case 'remaining-hc': return row.remaining;
    case 'offer-rate': return row.offers_issued;
    case 'funnel-resumes': return row.funnel.funnel_total;
    case 'funnel-screened': return Math.max(0, row.funnel.funnel_total - row.funnel.pending);
    case 'funnel-interviewed': return row.funnel.interview + row.funnel.offer + row.funnel.onboarded;
    case 'funnel-offered': return row.offers_issued;
    case 'funnel-hired': return row.funnel.onboarded;
    default: return row.department === key.slice('department:'.length) ? row.headcount : 0;
  }
}

function insightMetricLabel(row: AnalyticsDemandRow, key: InsightKey) {
  if (key === 'open-demands') return '在招中';
  if (key === 'remaining-hc') return `剩余 ${row.remaining} 人`;
  if (key === 'offer-rate') return `接受 ${row.offers_accepted}/${row.offers_issued} 份`;
  if (key.startsWith('owner:')) return `剩余 HC ${row.remaining} · 卡点 ${row.risk_flags.length}`;
  if (key.startsWith('department:')) return `已入职 ${row.onboarded}/${row.headcount} 人`;
  return `${insightMetric(row, key)} 人`;
}

function buildInsight(data: AnalyticsOverview, key: string | null): InsightView | null {
  if (!key) return null;
  const demandRows = data.demands;
  const definitions: Partial<Record<InsightKey, [string, string]>> = {
    'candidate-total': ['候选人岗位组成', '只展示能够对应到当前在招需求的候选人；人才库中暂无岗位归属的数据不会强行拼入。'],
    'pipeline-active': ['流程中候选人组成', '当前仍在筛选、业务反馈、面试或 Offer 阶段的候选人。'],
    'hires-month': ['本月入职组成', '本月已经办理入职，并能对应到当前在招需求的岗位。'],
    'hires-quarter': ['本季度入职组成', '本季度已经办理入职，并能对应到当前在招需求的岗位。'],
    'open-demands': ['在招岗位明细', '当前状态为在招的需求清单。'],
    'remaining-hc': ['剩余 HC 明细', '仍有招聘名额的岗位，按剩余人数展示。'],
    'offer-rate': ['Offer 接受组成', '存在已发 Offer 的岗位，并显示接受份数与发放份数。'],
    'funnel-resumes': ['简历收取组成', '当前在招需求中，已进入招聘流程的候选人组成。'],
    'funnel-screened': ['筛选通过组成', '当前阶段已经离开待筛选环节的候选人组成。'],
    'funnel-interviewed': ['进入面试组成', '当前处于面试、Offer 或已入职阶段的候选人组成。'],
    'funnel-offered': ['发放 Offer 组成', '当前在招需求中已正式发放 Offer 的组成。'],
    'funnel-hired': ['成功入职组成', '当前在招需求中已经进入已入职阶段的组成。'],
  };

  if (key.startsWith('department:')) {
    const department = key.slice('department:'.length);
    return {
      key: key as InsightKey,
      title: `${department}招聘需求`,
      description: `只显示${department}当前在招需求的真实汇总。`,
      rows: demandRows.filter((row) => row.department === department),
    };
  }

  if (key.startsWith('owner:')) {
    const ownerId = Number(key.slice('owner:'.length));
    if (!Number.isInteger(ownerId) || ownerId <= 0) return null;
    const rows = demandRows.filter((row) => row.owner_hr_id === ownerId);
    return {
      key: key as InsightKey,
      title: `${rows[0]?.owner_name || '招聘负责人'}负责的岗位`,
      description: '只显示该负责人当前负责的在招需求、剩余 HC 和卡点。',
      rows,
    };
  }

  const definition = definitions[key as InsightKey];
  if (!definition) return null;
  const insightKey = key as InsightKey;
  return {
    key: insightKey,
    title: definition[0],
    description: definition[1],
    rows: demandRows.filter((row) => insightMetric(row, insightKey) > 0),
  };
}

const activeCandidateStages = new Set(['pending', 'ai_screen', 'business_review', 'interview', 'offer']);

function candidatesForInsight(row: AnalyticsDemandRow, key: InsightKey) {
  if (key === 'hires-month') return row.candidates.filter((candidate) => candidate.hired_this_month);
  if (key === 'hires-quarter') return row.candidates.filter((candidate) => candidate.hired_this_quarter);
  if (key === 'pipeline-active') return row.candidates.filter((candidate) => activeCandidateStages.has(candidate.stage));
  if (key === 'offer-rate' || key === 'funnel-offered') return row.candidates.filter((candidate) => candidate.offer_issued);
  if (key === 'funnel-screened') return row.candidates.filter((candidate) => candidate.stage !== 'pending');
  if (key === 'funnel-interviewed') return row.candidates.filter((candidate) => ['interview', 'offer', 'onboarded'].includes(candidate.stage));
  if (key === 'funnel-hired') return row.candidates.filter((candidate) => candidate.stage === 'onboarded');
  return row.candidates;
}

function OrganizationDataBoard({ includeRecruiterPerformance }: { includeRecruiterPerformance: boolean }) {
  const { role } = useCompanyAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedInsight = searchParams.get('insight');
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [trendView, setTrendView] = useState<'hires' | 'offers'>('hires');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [expandedDemandId, setExpandedDemandId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await analyticsApi.overview());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '统计数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const maxTrend = useMemo(
    () => Math.max(1, ...(data?.monthly_trends.map((item) => (
      trendView === 'hires' ? item.hires : item.offers
    )) ?? [0])),
    [data, trendView],
  );
  const selectedInsight = useMemo(() => {
    const insight = data ? buildInsight(data, requestedInsight) : null;
    if (!insight || !requestedDemandId) return insight;
    return { ...insight, rows: insight.rows.filter((row) => row.demand_id === requestedDemandId) };
  }, [data, requestedDemandId, requestedInsight]);

  const openInsight = useCallback((key: InsightKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('insight', key);
    next.delete('demand');
    setExpandedDemandId(null);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeInsight = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('insight');
    next.delete('demand');
    setExpandedDemandId(null);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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

  const cards: KpiCard[] = data ? [
    { label: '本月入职', value: data.summary.hires_month, unit: '人', key: 'hires-month' },
    { label: '本季度入职', value: data.summary.hires_quarter, unit: '人', key: 'hires-quarter' },
    { label: '在招岗位', value: data.summary.open_demands, unit: '个', key: 'open-demands' },
    { label: '剩余 HC', value: data.summary.remaining_headcount, unit: '人', key: 'remaining-hc' },
    { label: 'Offer 接受率', value: data.summary.offer_accept_rate, unit: '%', key: 'offer-rate' },
    { label: '招聘成本', value: data.summary.cost_available ? '—' : '未接入', unit: '', note: '成本数据待外部系统接入' },
  ] : [];
  const funnelRows: Array<{ key: InsightKey; label: string; value: number }> = data ? [
    { key: 'funnel-resumes', label: '简历收取', value: data.funnel.resumes },
    { key: 'funnel-screened', label: '简历筛选通过', value: data.funnel.screened },
    { key: 'funnel-interviewed', label: '进入面试', value: data.funnel.interviewed },
    { key: 'funnel-offered', label: '发放 Offer', value: data.funnel.offered },
    { key: 'funnel-hired', label: '成功入职', value: data.funnel.hired },
  ] : [];

  return (
    <div className="min-h-full bg-background-50 px-4 pb-8 pt-5 sm:px-6" data-ui="organization-data-board">
      <div className="mx-auto max-w-[1540px] space-y-4">
      <PageHeader
        title="数据看板"
        visuallyHiddenTitle
        description={role === 'hr_director'
          ? '组织趋势与报表复盘；当天需要关注的决策请回到管理驾驶舱'
          : role === 'manager'
            ? '查看团队招聘进度、责任归属和卡点'
            : data?.purpose || '读取当前组织的真实招聘数据'}
        actions={<div className="flex flex-wrap items-center gap-3">
          {role === 'hr_director' && <Link to="/director/cockpit" className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100">回到管理驾驶舱</Link>}
          <span className="text-xs text-foreground-400">数据更新于 {displayTime(data?.generated_at)}</span>
          <button type="button" onClick={() => void exportCsv()} disabled={!data || exporting} className="rounded-lg border border-background-200 bg-background-100 px-3 py-1.5 text-xs font-medium text-foreground-700 hover:bg-background-200 disabled:opacity-50">
            <i className="ri-download-2-line mr-1" />{exporting ? '导出中' : '导出报表'}
          </button>
        </div>}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}<button type="button" onClick={() => void load()} className="ml-3 underline">重新加载</button>
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-xl border border-background-200 bg-white px-5 py-12 text-center text-sm text-foreground-500">正在加载真实统计数据...</div>
      ) : data && (
        <>
          {includeRecruiterPerformance && (
            <ManagerTeamResponsibilityPanel
              data={data}
              onOwnerClick={(ownerId) => openInsight(`owner:${ownerId}`)}
            />
          )}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {cards.map((card) => card.key ? (
              <button
                key={card.label}
                type="button"
                data-ui="analytics-kpi-drilldown"
                onClick={() => openInsight(card.key!)}
                className="group rounded-xl border border-background-200 bg-white p-4 text-left transition hover:border-primary-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                <p className="text-xs text-foreground-500">{card.label}</p>
                <p className="mt-2 text-2xl font-bold text-foreground-900">{card.value}<span className="ml-1 text-xs font-normal text-foreground-400">{card.unit}</span></p>
                <span className="mt-2 inline-flex items-center text-[11px] font-medium text-primary-700">查看明细 <ChevronRight size={12} /></span>
              </button>
            ) : (
              <div key={card.label} data-ui="analytics-cost-unavailable" className="rounded-xl border border-background-200 bg-background-50 p-4">
                <p className="text-xs text-foreground-500">{card.label}</p>
                <p className="mt-2 text-2xl font-bold text-foreground-500">{card.value}</p>
                <p className="mt-1 text-[11px] text-foreground-400">{card.note}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-background-200 bg-white p-5 lg:col-span-2">
              <div className="mb-5 flex items-center justify-between">
                <div><h2 className="font-heading font-bold text-foreground-900">月度招聘趋势</h2><p className="mt-0.5 text-xs text-foreground-500">近 7 个月入职与 Offer 发放</p></div>
                <div className="rounded-lg bg-background-100 p-0.5">
                  <button type="button" onClick={() => setTrendView('hires')} className={`rounded-md px-3 py-1.5 text-xs ${trendView === 'hires' ? 'bg-white shadow-sm' : 'text-foreground-500'}`}>入职人数</button>
                  <button type="button" onClick={() => setTrendView('offers')} className={`rounded-md px-3 py-1.5 text-xs ${trendView === 'offers' ? 'bg-white shadow-sm' : 'text-foreground-500'}`}>Offer 数量</button>
                </div>
              </div>
              <div className="flex h-48 items-end gap-2">
                {data.monthly_trends.map((item) => {
                  const value = trendView === 'hires' ? item.hires : item.offers;
                  return (
                    <div key={item.month} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-xs font-semibold">{value}</span>
                      <div className="flex h-36 w-full items-end justify-center"><div className="w-full max-w-10 rounded-t bg-primary-400" style={{ height: `${Math.max(4, value / maxTrend * 100)}%` }} /></div>
                      <span className="text-xs text-foreground-500">{item.month}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-background-200 bg-white p-5">
              <h2 className="font-heading font-bold text-foreground-900">招聘漏斗</h2>
              <p className="mt-0.5 text-xs text-foreground-500">点击阶段查看当前在招需求组成</p>
              <div className="mt-5 space-y-2">
                {funnelRows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    data-ui="analytics-funnel-drilldown"
                    onClick={() => openInsight(row.key)}
                    className="group flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-background-50 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  >
                    <span className="w-24 text-xs text-foreground-600">{row.label}</span>
                    <span className="h-6 flex-1 overflow-hidden rounded-full bg-background-100">
                      <span className="flex h-full items-center rounded-full bg-primary-400 pl-2 text-xs font-medium text-white" style={{ width: `${Math.max(5, row.value / Math.max(1, data.funnel.resumes) * 100)}%` }}>{row.value}</span>
                    </span>
                    <ChevronRight size={14} className="text-foreground-400 group-hover:text-primary-600" />
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-background-200 bg-white p-5">
              <h2 className="font-heading font-bold text-foreground-900">各部门招聘进度</h2>
              <div className="mt-4 space-y-1">
                {data.departments.length ? data.departments.map((item) => (
                  <button
                    key={item.department}
                    type="button"
                    data-ui="analytics-department-drilldown"
                    onClick={() => openInsight(`department:${item.department}`)}
                    className="group flex w-full items-center justify-between rounded-lg border-b border-background-100 px-2 py-3 text-left text-sm hover:bg-background-50 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  >
                    <span>{item.department}</span>
                    <span className="inline-flex items-center gap-2 text-foreground-500">HC {item.onboarded}/{item.headcount} · 流程中 {item.in_progress}<ChevronRight size={14} /></span>
                  </button>
                )) : <p className="text-sm text-foreground-500">暂无部门招聘数据</p>}
              </div>
            </section>
            <section className="rounded-xl border border-background-200 bg-white p-5">
              <h2 className="font-heading font-bold text-foreground-900">简历来源分布</h2>
              <div className="mt-4 space-y-3">
                {data.sources.length ? data.sources.map((item) => (
                  <div key={item.channel} className="flex items-center justify-between text-sm"><span>{item.channel}</span><span className="font-medium">{item.count} 批</span></div>
                )) : <p className="text-sm text-foreground-500">暂无已记录的来源批次</p>}
              </div>
            </section>
          </div>

          {includeRecruiterPerformance && <MonthlyPerformanceDataPanel />}
        </>
      )}

      {selectedInsight && (
        <ReadOnlyDetailDrawer
          title={selectedInsight.title}
          description={selectedInsight.description}
          onClose={closeInsight}
        >
          <div data-ui="analytics-insight-detail" className="space-y-4">
            <p className="rounded-lg border border-primary-100 bg-primary-50/60 px-4 py-3 text-xs leading-5 text-primary-800">
              下方只列出能对应到当前在招需求的数据；没有归属或已关闭需求的历史数字不会强行拼进明细。
            </p>
            {selectedInsight.rows.length ? selectedInsight.rows.map((row) => {
              const candidates = candidatesForInsight(row, selectedInsight.key);
              const expanded = expandedDemandId === row.demand_id;
              return (
                <article key={row.demand_id} className="overflow-hidden rounded-lg border border-background-200">
                  <button
                    type="button"
                    data-ui="analytics-demand-candidates"
                    aria-expanded={expanded}
                    onClick={() => setExpandedDemandId(expanded ? null : row.demand_id)}
                    className="w-full px-4 py-4 text-left transition hover:bg-background-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground-900">{row.title}</p>
                        <p className="mt-1 text-xs text-foreground-500">{row.request_no} · {row.department} · 负责人：{row.owner_name || '未分配'}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">{insightMetricLabel(row, selectedInsight.key)}</span>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-background-50 px-2 py-2"><dt className="text-[11px] text-foreground-500">HC</dt><dd className="mt-1 text-sm font-semibold text-foreground-900">{row.headcount}</dd></div>
                      <div className="rounded-md bg-background-50 px-2 py-2"><dt className="text-[11px] text-foreground-500">已入职</dt><dd className="mt-1 text-sm font-semibold text-foreground-900">{row.onboarded}</dd></div>
                      <div className="rounded-md bg-background-50 px-2 py-2"><dt className="text-[11px] text-foreground-500">流程中 / 剩余</dt><dd className="mt-1 text-sm font-semibold text-foreground-900">{row.in_progress} / {row.remaining}</dd></div>
                    </dl>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-700">{expanded ? '收起候选人' : `查看候选人 ${candidates.length} 人`}<ChevronRight size={13} className={expanded ? 'rotate-90' : ''} /></span>
                  </button>
                  {expanded && <div className="border-t border-background-100 bg-background-50/40 px-4 py-4"><CandidateReadOnlyList candidates={candidates} /></div>}
                </article>
              );
            }) : (
              <div className="rounded-lg border border-dashed border-background-300 py-16 text-center text-sm text-foreground-500">当前条件下暂无组成明细</div>
            )}
          </div>
        </ReadOnlyDetailDrawer>
      )}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { role } = useCompanyAuth();
  if (role === 'recruiter') return <RecruiterDataBoard />;
  if (role === 'interviewer') return <InterviewerDataBoard />;
  return <OrganizationDataBoard includeRecruiterPerformance={role === 'manager' || role === 'admin'} />;
}
