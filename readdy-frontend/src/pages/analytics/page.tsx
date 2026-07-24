import { useState, useMemo } from 'react';
import {
  analyticsOverview,
  departmentHiring,
  monthlyTrends,
  sourceChannels,
  hiringFunnel,
  timeToFillByDept,
} from '@/mocks/analytics';
import { useToast } from '@/hooks/useToast';

const maxFunnelVal = hiringFunnel.resumes;

const kpiCards = [
  {
    label: '本月入职',
    value: analyticsOverview.totalHiresMonth,
    unit: '人',
    change: '+12%',
    up: true,
    icon: 'ri-user-add-line',
    color: 'primary',
  },
  {
    label: '本季度入职',
    value: analyticsOverview.totalHiresQuarter,
    unit: '人',
    change: '+8%',
    up: true,
    icon: 'ri-group-line',
    color: 'accent',
  },
  {
    label: '平均招聘周期',
    value: analyticsOverview.avgTimeToFill,
    unit: '天',
    change: '-3天',
    up: true,
    icon: 'ri-time-line',
    color: 'secondary',
  },
  {
    label: '人均招聘成本',
    value: analyticsOverview.avgCostPerHire,
    unit: '元',
    change: '-5%',
    up: true,
    icon: 'ri-money-cny-circle-line',
    color: 'primary',
  },
  {
    label: 'Offer 接受率',
    value: analyticsOverview.offerAcceptRate,
    unit: '%',
    change: '+2%',
    up: true,
    icon: 'ri-check-double-line',
    color: 'accent',
  },
  {
    label: '在招岗位',
    value: analyticsOverview.totalOpenReqs,
    unit: '个',
    change: '',
    up: false,
    icon: 'ri-briefcase-line',
    color: 'secondary',
  },
];

export default function AnalyticsPage() {
  const { showToast } = useToast();
  const [trendView, setTrendView] = useState<'hires' | 'offers'>('hires');
  const sortedChannels = useMemo(() => [...sourceChannels].sort((a, b) => b.hires - a.hires), []);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground-900">人力资源分析看板</h1>
          <p className="text-sm text-foreground-500 mt-1">全局招聘数据总览 · 实时更新</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground-400">数据截止</span>
          <span className="text-sm font-medium text-foreground-700">2026年7月15日</span>
          <button
            onClick={() => showToast('报表已导出，请查看下载列表')}
            className="ml-2 px-3 py-1.5 text-xs font-medium text-foreground-600 bg-background-100 border border-background-200 rounded-lg hover:bg-background-200/70 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-download-2-line mr-1"></i>导出报表
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-background-200 p-4 hover:border-background-300/60 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-foreground-500">{card.label}</span>
              <div className={`w-8 h-8 rounded-lg bg-${card.color}-50 flex items-center justify-center`}>
                <i className={`${card.icon} text-sm text-${card.color}-600`}></i>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground-900">{card.value}</span>
              <span className="text-xs text-foreground-400">{card.unit}</span>
            </div>
            {card.change && (
              <p className={`text-xs mt-1 ${card.up ? 'text-primary-600' : 'text-accent-600'}`}>
                <i className={`${card.up ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} mr-0.5`}></i>
                {card.change} 同比
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trends - takes 2/3 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-background-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-heading font-bold text-foreground-900">月度招聘趋势</h3>
              <p className="text-xs text-foreground-500 mt-0.5">近7个月入职与Offer发放趋势</p>
            </div>
            <div className="flex items-center bg-background-100 rounded-lg p-0.5">
              <button
                onClick={() => setTrendView('hires')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  trendView === 'hires' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'
                }`}
              >
                入职人数
              </button>
              <button
                onClick={() => setTrendView('offers')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  trendView === 'offers' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'
                }`}
              >
                Offer数量
              </button>
            </div>
          </div>

          <div className="flex items-end gap-2 h-48">
            {monthlyTrends.map((m) => {
              const val = trendView === 'hires' ? m.hires : m.offers;
              const maxVal = Math.max(...monthlyTrends.map((t) => (trendView === 'hires' ? t.hires : t.offers)));
              const heightPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
              const isLatest = m.month === '7月';
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground-800">{val}</span>
                  <div className="w-full flex flex-col items-center">
                    <div
                      className={`w-full max-w-[48px] rounded-t-md transition-all duration-500 ${
                        isLatest
                          ? trendView === 'hires' ? 'bg-primary-500' : 'bg-accent-500'
                          : trendView === 'hires' ? 'bg-primary-200' : 'bg-accent-200'
                      }`}
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    ></div>
                  </div>
                  <span className={`text-xs mt-1.5 ${isLatest ? 'font-semibold text-foreground-900' : 'text-foreground-500'}`}>
                    {m.month}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Summary line under chart */}
          <div className="flex items-center gap-6 mt-4 pt-3 border-t border-background-100 text-xs text-foreground-500">
            <span>
              累计入职 <strong className="text-foreground-900">{monthlyTrends.reduce((s, m) => s + m.hires, 0)}</strong> 人
            </span>
            <span>
              累计Offer <strong className="text-foreground-900">{monthlyTrends.reduce((s, m) => s + m.offers, 0)}</strong> 个
            </span>
            <span>
              Offer入职转化率 <strong className="text-foreground-900">
                {Math.round((monthlyTrends.reduce((s, m) => s + m.hires, 0) / monthlyTrends.reduce((s, m) => s + m.offers, 0)) * 100)}%
              </strong>
            </span>
          </div>
        </div>

        {/* Hiring Funnel - takes 1/3 */}
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div>
            <h3 className="font-heading font-bold text-foreground-900">招聘漏斗</h3>
            <p className="text-xs text-foreground-500 mt-0.5">全流程转化概览</p>
          </div>

          <div className="mt-5 space-y-3">
            {[
              { label: '简历收取', value: hiringFunnel.resumes, pct: 100 },
              { label: '简历筛选通过', value: hiringFunnel.screened, pct: Math.round((hiringFunnel.screened / maxFunnelVal) * 100) },
              { label: '进入面试', value: hiringFunnel.interviewed, pct: Math.round((hiringFunnel.interviewed / maxFunnelVal) * 100) },
              { label: '发放Offer', value: hiringFunnel.offered, pct: Math.round((hiringFunnel.offered / maxFunnelVal) * 100) },
              { label: '成功入职', value: hiringFunnel.hired, pct: Math.round((hiringFunnel.hired / maxFunnelVal) * 100) },
            ].map((item, idx) => {
              const colors = ['bg-primary-500', 'bg-primary-400', 'bg-accent-400', 'bg-accent-500', 'bg-secondary-500'];
              return (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-xs text-foreground-600 w-24 flex-shrink-0 whitespace-nowrap">{item.label}</span>
                  <div className="flex-1 bg-background-100 rounded-full h-6 relative overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors[idx]} transition-all duration-700 flex items-center pl-3`}
                      style={{ width: `${Math.max(item.pct, 5)}%` }}
                    >
                      <span className="text-xs font-semibold text-white">{item.value}</span>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-foreground-500 w-10 text-right">
                    {idx === 0 ? '-' : `${Math.round((item.value / hiringFunnel.resumes) * 100)}%`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-background-100">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground-500">整体转化率</span>
              <span className="font-semibold text-foreground-900">
                {Math.round((hiringFunnel.hired / hiringFunnel.resumes) * 100)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-foreground-500">面试到Offer转化率</span>
              <span className="font-semibold text-foreground-900">
                {Math.round((hiringFunnel.offered / hiringFunnel.interviewed) * 100)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-foreground-500">Offer接受率</span>
              <span className="font-semibold text-foreground-900">
                {Math.round((hiringFunnel.hired / hiringFunnel.offered) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Department Breakdown + Source Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Hiring */}
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="mb-4">
            <h3 className="font-heading font-bold text-foreground-900">各部门招聘进度</h3>
            <p className="text-xs text-foreground-500 mt-0.5">编制、入职与在途分布</p>
          </div>
          <div className="space-y-3">
            {departmentHiring.map((dept) => {
              const fillPct = Math.round(((dept.hired + dept.inProgress) / dept.headcount) * 100);
              return (
                <div key={dept.department} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground-800">{dept.department}</span>
                    <span className="text-xs text-foreground-500">
                      <strong className="text-foreground-900">{dept.hired + dept.inProgress}</strong>/{dept.headcount}
                    </span>
                  </div>
                  <div className="h-7 bg-background-100 rounded-full overflow-hidden flex">
                    <div
                      className="bg-primary-500 flex items-center pl-2 transition-all duration-500"
                      style={{ width: `${Math.max((dept.hired / dept.headcount) * 100, dept.hired > 0 ? 4 : 0)}%` }}
                    >
                      {dept.hired > 0 && (
                        <span className="text-[10px] font-semibold text-white whitespace-nowrap">已入职 {dept.hired}</span>
                      )}
                    </div>
                    <div
                      className="bg-accent-300 flex items-center pl-2 transition-all duration-500"
                      style={{ width: `${Math.max((dept.inProgress / dept.headcount) * 100, dept.inProgress > 0 ? 4 : 0)}%` }}
                    >
                      {dept.inProgress > 0 && (
                        <span className="text-[10px] font-semibold text-white whitespace-nowrap">在途 {dept.inProgress}</span>
                      )}
                    </div>
                    {dept.openReqs > 0 && (
                      <div className="flex-1 flex items-center pl-2">
                        <span className="text-[10px] text-foreground-400 whitespace-nowrap">{dept.openReqs} 岗空缺</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source Channels + Time to Fill */}
        <div className="space-y-6">
          {/* Source Channels */}
          <div className="bg-white rounded-xl border border-background-200 p-5">
            <div className="mb-4">
              <h3 className="font-heading font-bold text-foreground-900">渠道效能对比</h3>
              <p className="text-xs text-foreground-500 mt-0.5">各渠道入职转化排名</p>
            </div>
            <div className="space-y-2.5">
              {sortedChannels.map((ch, idx) => {
                const maxHires = sortedChannels[0].hires;
                const barW = (ch.hires / maxHires) * 100;
                const colors = ['bg-primary-500', 'bg-primary-400', 'bg-accent-400', 'bg-secondary-400', 'bg-secondary-300', 'bg-background-300', 'bg-background-300'];
                return (
                  <div key={ch.channel} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-foreground-400 w-5 flex-shrink-0">{idx + 1}</span>
                    <span className="text-sm text-foreground-700 w-20 flex-shrink-0 whitespace-nowrap">{ch.channel}</span>
                    <div className="flex-1 bg-background-100 rounded-full h-6 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors[idx]} flex items-center pl-2 transition-all duration-700`}
                        style={{ width: `${Math.max(barW, 8)}%` }}
                      >
                        <span className="text-[10px] font-semibold text-white whitespace-nowrap">入职 {ch.hires}人</span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-foreground-600 w-14 text-right whitespace-nowrap">{ch.rate}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time to Fill by Department */}
          <div className="bg-white rounded-xl border border-background-200 p-5">
            <div className="mb-4">
              <h3 className="font-heading font-bold text-foreground-900">各部门平均招聘周期</h3>
              <p className="text-xs text-foreground-500 mt-0.5">从需求提出到入职的天数</p>
            </div>
            <div className="space-y-2.5">
              {timeToFillByDept.map((item) => {
                const maxDays = Math.max(...timeToFillByDept.map((d) => d.days));
                const barW = (item.days / maxDays) * 100;
                const isSlow = item.days >= 22;
                return (
                  <div key={item.department} className="flex items-center gap-3">
                    <span className="text-sm text-foreground-700 w-24 flex-shrink-0 whitespace-nowrap">{item.department}</span>
                    <div className="flex-1 bg-background-100 rounded-full h-6 overflow-hidden">
                      <div
                        className={`h-full rounded-full flex items-center pl-2 transition-all duration-700 ${
                          isSlow ? 'bg-accent-500' : 'bg-secondary-400'
                        }`}
                        style={{ width: `${Math.max(barW, 12)}%` }}
                      >
                        <span className="text-[10px] font-semibold text-white">{item.days}天</span>
                      </div>
                    </div>
                    {isSlow && (
                      <span className="text-[10px] font-medium text-accent-600 w-12 text-right flex-shrink-0">
                        <i className="ri-alert-line mr-0.5"></i>偏长
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}