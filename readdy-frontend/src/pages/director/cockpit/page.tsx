import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  directorKpis,
  hcDetails,
  teamPerformance,
  directorTrends,
  aiInsightSummary,
} from '@/mocks/director';

type DrillKey = string | null;
type TrendMode = 'hires' | 'offers' | 'cost' | 'cycle';
const trendData = directorTrends;

export default function DirectorCockpitPage() {
  const [drillDown, setDrillDown] = useState<DrillKey>(null);
  const [trendMode, setTrendMode] = useState<TrendMode>('hires');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('month');

  const departments = useMemo(() => {
    const set = new Set(teamPerformance.map(t => t.department));
    return ['all', ...Array.from(set)];
  }, []);

  const filteredTeam = useMemo(() => {
    if (deptFilter === 'all') return teamPerformance;
    return teamPerformance.filter(t => t.department === deptFilter);
  }, [deptFilter]);

  const trendMaxVal = useMemo(() => {
    if (trendMode === 'cycle') return Math.max(...trendData.map(d => d.cycle));
    if (trendMode === 'cost') return Math.max(...trendData.map(d => d.cost));
    if (trendMode === 'offers') return Math.max(...trendData.map(d => d.offers));
    return Math.max(...trendData.map(d => d.hires));
  }, [trendMode]);

  const trendTotal = useMemo(() => {
    if (trendMode === 'cycle') return (trendData.reduce((s, d) => s + d.cycle, 0) / trendData.length).toFixed(1);
    return trendData.reduce((s, d) => {
      if (trendMode === 'cost') return s + d.cost;
      if (trendMode === 'offers') return s + d.offers;
      return s + d.hires;
    }, 0).toString();
  }, [trendMode]);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground-900">管理驾驶舱</h1>
          <p className="text-sm text-foreground-500 mt-1">全局招聘数据总览 · 实时更新 · 只读模式</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-background-100 rounded-lg p-0.5">
            {(['month', 'quarter', 'year'] as const).map(k => (
              <button
                key={k}
                onClick={() => setTimeRange(k)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  timeRange === k ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'
                }`}
              >
                {k === 'month' ? '本月' : k === 'quarter' ? '本季度' : '年度'}
              </button>
            ))}
          </div>
          <span className="text-xs text-foreground-400">数据截止 2026.07.19</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {directorKpis.map(card => {
          const isActive = drillDown === card.drillKey;
          return (
            <button
              key={card.label}
              onClick={() => setDrillDown(isActive ? null : card.drillKey)}
              className={`bg-white rounded-xl border p-4 text-left transition-all cursor-pointer ${
                isActive
                  ? 'border-primary-300 ring-2 ring-primary-100'
                  : 'border-background-200 hover:border-background-300/60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-foreground-500">{card.label}</span>
                <div className={`w-8 h-8 rounded-lg bg-${card.color}-50 flex items-center justify-center`}>
                  <i className={`${card.icon} text-sm text-${card.color}-600`}></i>
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground-900">{card.value}</span>
                {card.unit && <span className="text-xs text-foreground-400">{card.unit}</span>}
              </div>
              <p className={`text-xs mt-1 ${card.changeType === 'up' ? 'text-primary-600' : card.changeType === 'down' ? 'text-accent-600' : 'text-foreground-400'}`}>
                <i className={`${card.changeType === 'up' ? 'ri-arrow-up-s-line' : card.changeType === 'down' ? 'ri-arrow-down-s-line' : 'ri-subtract-line'} mr-0.5`}></i>
                {card.change} {timeRange === 'month' ? '环比' : '同比'}
              </p>
            </button>
          );
        })}
      </div>

      {/* AI Insight Bar */}
      <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-robot-2-line text-white text-sm"></i>
          </div>
          <div className="flex-1">
            <p className="text-sm text-foreground-800 leading-relaxed">{aiInsightSummary.summary}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {aiInsightSummary.alerts.map((a, i) => (
                <button
                  key={i}
                  onClick={() => setDrillDown(a.drillKey)}
                  className={`text-xs px-2 py-1 rounded-full font-medium cursor-pointer whitespace-nowrap ${
                    a.type === 'danger' ? 'bg-accent-100 text-accent-700' :
                    a.type === 'warning' ? 'bg-secondary-100 text-secondary-800' :
                    'bg-primary-50 text-primary-700'
                  }`}
                >
                  <i className={`${a.type === 'danger' ? 'ri-error-warning-line' : a.type === 'warning' ? 'ri-alert-line' : 'ri-information-line'} mr-1`}></i>
                  {a.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down Panels */}
      {drillDown === 'hc' && (
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-foreground-900">HC 明细 · 各部门编制与填满率</h3>
            <button onClick={() => setDrillDown(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 cursor-pointer">
              <i className="ri-close-line text-foreground-400"></i>
            </button>
          </div>
          <div className="space-y-3">
            {hcDetails.map(dept => (
              <div key={dept.department} className="flex items-center gap-4">
                <span className="text-sm text-foreground-700 w-28 flex-shrink-0 whitespace-nowrap">{dept.department}</span>
                <div className="flex-1 h-7 bg-background-100 rounded-full overflow-hidden flex">
                  <div className="bg-primary-500 flex items-center pl-2 transition-all duration-500" style={{ width: `${Math.max((dept.hired / dept.headcount) * 100, dept.hired > 0 ? 4 : 0)}%` }}>
                    {dept.hired > 0 && <span className="text-[10px] font-semibold text-white whitespace-nowrap">入职 {dept.hired}</span>}
                  </div>
                  <div className="bg-accent-300 flex items-center pl-2 transition-all duration-500" style={{ width: `${Math.max((dept.inProgress / dept.headcount) * 100, dept.inProgress > 0 ? 4 : 0)}%` }}>
                    {dept.inProgress > 0 && <span className="text-[10px] font-semibold text-white whitespace-nowrap">在途 {dept.inProgress}</span>}
                  </div>
                </div>
                <span className="text-xs font-medium text-foreground-600 w-20 text-right whitespace-nowrap">
                  <strong className="text-foreground-900">{dept.hired + dept.inProgress}</strong>/{dept.headcount}
                </span>
                <span className={`text-xs font-medium w-12 text-right ${dept.fillRate >= 30 ? 'text-primary-600' : dept.fillRate >= 15 ? 'text-secondary-600' : 'text-accent-600'}`}>
                  {dept.fillRate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {drillDown === 'team' && (
        <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
            <h3 className="font-bold text-foreground-900">团队招聘表现 · 专员健康度</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="text-xs bg-background-100 border border-background-200 rounded-lg px-3 py-1.5 text-foreground-600 cursor-pointer appearance-none pr-8"
                >
                  {departments.map(d => (
                    <option key={d} value={d}>{d === 'all' ? '全部部门' : d}</option>
                  ))}
                </select>
                <i className="ri-arrow-down-s-line text-xs text-foreground-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"></i>
              </div>
              <button onClick={() => setDrillDown(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 cursor-pointer">
                <i className="ri-close-line text-foreground-400"></i>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-200">
                  <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">招聘专员</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">负责部门</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">负责岗位</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">本月入职</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">季入职</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">平均周期</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">Offer率</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">阻塞数</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">健康度</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-100">
                {filteredTeam.map(t => (
                  <tr key={t.recruiter} className="hover:bg-background-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary-600">{t.recruiter.charAt(0)}</span>
                        </div>
                        <span className="text-sm font-medium text-foreground-900">{t.recruiter}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-foreground-600">{t.department}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-700 text-center">{t.assignedReqs}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-foreground-900 text-center">{t.hiresMonth}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-600 text-center">{t.hiresQuarter}</td>
                    <td className="px-5 py-3.5 text-sm text-center">
                      <span className={t.avgCycle > 24 ? 'text-accent-600 font-semibold' : 'text-foreground-700'}>{t.avgCycle}天</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-center">
                      <span className={t.offerRate >= 80 ? 'text-primary-600 font-semibold' : 'text-secondary-600'}>{t.offerRate}%</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {t.blockedCount > 0 ? (
                        <span className="text-xs px-2 py-0.5 bg-accent-100 text-accent-700 rounded-full font-medium">{t.blockedCount}</span>
                      ) : (
                        <span className="text-xs text-foreground-400">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          t.healthScore >= 80 ? 'bg-primary-50' : t.healthScore >= 60 ? 'bg-secondary-50' : 'bg-accent-50'
                        }`}>
                          <span className={`text-xs font-bold ${
                            t.healthScore >= 80 ? 'text-primary-600' : t.healthScore >= 60 ? 'text-secondary-600' : 'text-accent-600'
                          }`}>{t.healthScore}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Other drill-downs just close */}
      {(drillDown && drillDown !== 'hc' && drillDown !== 'team') && (
        <div className="bg-white rounded-xl border border-background-200 p-8 text-center">
          <p className="text-sm text-foreground-500">点击指标可查看对应明细。详细数据请前往对应子页面。</p>
          <button onClick={() => setDrillDown(null)} className="mt-2 text-xs text-primary-600 hover:text-primary-700 cursor-pointer">
            关闭面板
          </button>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart - 2/3 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-background-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-heading font-bold text-foreground-900">招聘趋势</h3>
              <p className="text-xs text-foreground-500 mt-0.5">近7个月关键指标走势</p>
            </div>
            <div className="flex items-center bg-background-100 rounded-lg p-0.5">
              {([
                { key: 'hires' as const, label: '入职' },
                { key: 'offers' as const, label: 'Offer' },
                { key: 'cost' as const, label: '成本' },
                { key: 'cycle' as const, label: '周期' },
              ]).map(item => (
                <button
                  key={item.key}
                  onClick={() => setTrendMode(item.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    trendMode === item.key ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2 h-48">
            {trendData.map((m, idx) => {
              const val = trendMode === 'cost' ? m.cost : trendMode === 'cycle' ? m.cycle : trendMode === 'offers' ? m.offers : m.hires;
              const heightPct = trendMaxVal > 0 ? (val / trendMaxVal) * 100 : 0;
              const isLatest = idx === trendData.length - 1;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground-800">
                    {trendMode === 'cost' ? `${val}` : trendMode === 'cycle' ? val : val}
                  </span>
                  <div className="w-full flex flex-col items-center">
                    <div
                      className={`w-full max-w-[48px] rounded-t-md transition-all duration-500 ${
                        isLatest ? 'bg-primary-500' : 'bg-primary-200'
                      }`}
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    ></div>
                  </div>
                  <span className={`text-xs mt-1.5 ${isLatest ? 'font-semibold text-foreground-900' : 'text-foreground-500'}`}>{m.month}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-6 mt-4 pt-3 border-t border-background-100 text-xs text-foreground-500">
            <span>累计入职 <strong className="text-foreground-900">{trendData.reduce((s, m) => s + m.hires, 0)}</strong> 人</span>
            <span>累计Offer <strong className="text-foreground-900">{trendData.reduce((s, m) => s + m.offers, 0)}</strong> 个</span>
            <span>Offer入职转化率 <strong className="text-foreground-900">
              {Math.round((trendData.reduce((s, m) => s + m.hires, 0) / trendData.reduce((s, m) => s + m.offers, 0)) * 100)}%
            </strong></span>
          </div>
        </div>

        {/* Department Overview - 1/3 */}
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <h3 className="font-heading font-bold text-foreground-900 mb-4">部门填满率排行</h3>
          <div className="space-y-3">
            {[...hcDetails].sort((a, b) => b.fillRate - a.fillRate).map((dept, idx) => (
              <div key={dept.department} className="flex items-center gap-3">
                <span className="text-xs font-semibold text-foreground-400 w-5">{idx + 1}</span>
                <span className="text-xs text-foreground-700 w-24 flex-shrink-0 truncate">{dept.department}</span>
                <div className="flex-1 h-5 bg-background-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      dept.fillRate >= 35 ? 'bg-primary-500' : dept.fillRate >= 20 ? 'bg-secondary-400' : 'bg-accent-400'
                    }`}
                    style={{ width: `${Math.max(dept.fillRate, 8)}%` }}
                  ></div>
                </div>
                <span className="text-xs font-semibold text-foreground-800 w-10 text-right">{dept.fillRate}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/director/progress" className="bg-white rounded-xl border border-background-200 p-4 hover:border-background-300/60 transition-colors group cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
              <i className="ri-bar-chart-grouped-line text-primary-600"></i>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground-900">招聘进展</p>
              <p className="text-xs text-foreground-500">漏斗与阻塞分析</p>
            </div>
            <i className="ri-arrow-right-line text-foreground-300 ml-auto group-hover:text-primary-500"></i>
          </div>
        </Link>
        <Link to="/director/insights" className="bg-white rounded-xl border border-background-200 p-4 hover:border-background-300/60 transition-colors group cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-50 flex items-center justify-center">
              <i className="ri-organization-chart text-accent-600"></i>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground-900">人才洞察</p>
              <p className="text-xs text-foreground-500">市场与供给分析</p>
            </div>
            <i className="ri-arrow-right-line text-foreground-300 ml-auto group-hover:text-accent-500"></i>
          </div>
        </Link>
        <Link to="/director/approvals" className="bg-white rounded-xl border border-background-200 p-4 hover:border-background-300/60 transition-colors group cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary-50 flex items-center justify-center">
              <i className="ri-shield-check-line text-secondary-600"></i>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground-900">审批与风险</p>
              <p className="text-xs text-foreground-500">待审批 14 项</p>
            </div>
            <i className="ri-arrow-right-line text-foreground-300 ml-auto group-hover:text-secondary-500"></i>
          </div>
        </Link>
        <Link to="/analytics" className="bg-white rounded-xl border border-background-200 p-4 hover:border-background-300/60 transition-colors group cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
              <i className="ri-download-2-line text-primary-600"></i>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground-900">导出报表</p>
              <p className="text-xs text-foreground-500">月度/季度报告</p>
            </div>
            <i className="ri-arrow-right-line text-foreground-300 ml-auto group-hover:text-primary-500"></i>
          </div>
        </Link>
      </div>
    </div>
  );
}
