import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  allPositionProgress,
  directorFunnel,
  blockageDistribution,
  highRiskPositions,
} from '@/mocks/director';

type SortKey = 'daysOpen' | 'risk' | 'department';

export default function DirectorProgressPage() {
  const [deptFilter, setDeptFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('daysOpen');
  const [activeFunnelStage, setActiveFunnelStage] = useState<string | null>(null);

  const departments = useMemo(() => {
    const set = new Set(allPositionProgress.map(p => p.department));
    return ['all', ...Array.from(set)];
  }, []);

  const filtered = useMemo(() => {
    let res = [...allPositionProgress];
    if (deptFilter !== 'all') res = res.filter(p => p.department === deptFilter);
    if (riskFilter !== 'all') res = res.filter(p => p.risk === riskFilter);
    res.sort((a, b) => {
      if (sortBy === 'daysOpen') return b.daysOpen - a.daysOpen;
      if (sortBy === 'risk') {
        const order: Record<string, number> = { high: 0, medium: 1, normal: 2 };
        return order[a.risk] - order[b.risk];
      }
      return a.department.localeCompare(b.department);
    });
    return res;
  }, [deptFilter, riskFilter, sortBy]);

  const funnel = useMemo(() => {
    const stages = [
      { key: 'resumes', label: '简历收取', value: directorFunnel.resumes, pct: 100 },
      { key: 'screened', label: '初筛通过', value: directorFunnel.screened, pct: Math.round((directorFunnel.screened / directorFunnel.resumes) * 100) },
      { key: 'interviewed', label: '进入面试', value: directorFunnel.interviewed, pct: Math.round((directorFunnel.interviewed / directorFunnel.resumes) * 100) },
      { key: 'offered', label: '发放Offer', value: directorFunnel.offered, pct: Math.round((directorFunnel.offered / directorFunnel.resumes) * 100) },
      { key: 'hired', label: '成功入职', value: directorFunnel.hired, pct: Math.round((directorFunnel.hired / directorFunnel.resumes) * 100) },
    ];
    return stages;
  }, []);

  const totalBlocked = useMemo(() => {
    return allPositionProgress.reduce((s, p) => s + p.blocked, 0);
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground-900">招聘进展</h1>
          <p className="text-sm text-foreground-500 mt-1">
            {allPositionProgress.length} 个在招岗位 · {highRiskPositions.length} 个高风险 · {totalBlocked} 人阻塞中 · 只读模式
          </p>
        </div>
        <Link to="/director/cockpit" className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer whitespace-nowrap">
          <i className="ri-arrow-left-line"></i> 返回驾驶舱
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-background-200 p-4">
          <p className="text-xs text-foreground-500 mb-1">在招岗位</p>
          <p className="text-2xl font-bold text-foreground-900">{allPositionProgress.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-4">
          <p className="text-xs text-foreground-500 mb-1">简历总量</p>
          <p className="text-2xl font-bold text-foreground-900">{directorFunnel.resumes}</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-4">
          <p className="text-xs text-foreground-500 mb-1">总入职</p>
          <p className="text-2xl font-bold text-primary-600">{directorFunnel.hired}</p>
        </div>
        <div className="bg-white rounded-xl border border-background-200 p-4">
          <p className="text-xs text-foreground-500 mb-1">Offer转化率</p>
          <p className="text-2xl font-bold text-foreground-900">{Math.round((directorFunnel.hired / directorFunnel.offered) * 100)}%</p>
        </div>
        <div className={`rounded-xl border p-4 ${totalBlocked > 0 ? 'bg-accent-50/30 border-accent-200' : 'bg-white border-background-200'}`}>
          <p className="text-xs text-foreground-500 mb-1">当前阻塞</p>
          <p className={`text-2xl font-bold ${totalBlocked > 0 ? 'text-accent-600' : 'text-foreground-900'}`}>{totalBlocked}</p>
        </div>
      </div>

      {/* Funnel + Blockage */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Funnel - 3/5 */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-background-200 p-5">
          <h3 className="font-heading font-bold text-foreground-900 mb-4">招聘漏斗</h3>
          <div className="space-y-3">
            {funnel.map((stage, idx) => {
              const isActive = activeFunnelStage === stage.key;
              const colors = ['bg-primary-500', 'bg-primary-400', 'bg-accent-400', 'bg-accent-500', 'bg-secondary-500'];
              return (
                <button
                  key={stage.key}
                  onClick={() => setActiveFunnelStage(isActive ? null : stage.key)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg text-left cursor-pointer transition-all ${
                    isActive ? 'bg-primary-50 border border-primary-200' : 'hover:bg-background-50'
                  }`}
                >
                  <span className="text-xs text-foreground-600 w-20 flex-shrink-0 whitespace-nowrap">{stage.label}</span>
                  <div className="flex-1 bg-background-100 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors[idx]} flex items-center pl-3 transition-all duration-700`}
                      style={{ width: `${Math.max(stage.pct, 5)}%` }}
                    >
                      <span className="text-xs font-semibold text-white">{stage.value}</span>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-foreground-500 w-12 text-right">
                    {idx === 0 ? '-' : `${stage.pct}%`}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-background-100 grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-foreground-500">简历→入职转化率 </span>
              <strong className="text-foreground-900">{Math.round((directorFunnel.hired / directorFunnel.resumes) * 100)}%</strong>
            </div>
            <div>
              <span className="text-foreground-500">面试→Offer </span>
              <strong className="text-foreground-900">{Math.round((directorFunnel.offered / directorFunnel.interviewed) * 100)}%</strong>
            </div>
            <div>
              <span className="text-foreground-500">Offer接受率 </span>
              <strong className="text-foreground-900">{Math.round((directorFunnel.hired / directorFunnel.offered) * 100)}%</strong>
            </div>
          </div>
        </div>

        {/* Blockage distribution - 2/5 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-background-200 p-5">
          <h3 className="font-heading font-bold text-foreground-900 mb-4">阻塞原因分布</h3>
          <div className="space-y-3">
            {blockageDistribution.map(item => (
              <div key={item.reason}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground-700">{item.reason}</span>
                  <span className="text-xs font-semibold text-foreground-900">{item.count}人 · {item.pct}%</span>
                </div>
                <div className="h-5 bg-background-100 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-400 rounded-full" style={{ width: `${item.pct}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* High Risk Positions */}
      {highRiskPositions.length > 0 && (
        <div className="bg-accent-50/30 rounded-xl border border-accent-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
              <i className="ri-error-warning-line text-accent-600"></i>
            </div>
            <div>
              <h3 className="font-bold text-foreground-900">高风险岗位</h3>
              <p className="text-xs text-foreground-500">以下岗位需重点关注和介入</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {highRiskPositions.map(pos => (
              <div key={pos.id} className="bg-white rounded-lg border border-accent-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground-900">{pos.title}</p>
                    <p className="text-xs text-foreground-500">{pos.department} · 负责人：{pos.recruiter}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 font-medium whitespace-nowrap">高风险</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-foreground-500">
                  <span>开放 {pos.daysOpen} 天</span>
                  <span>填满 {pos.filled}/{pos.headcount}</span>
                  <span>阻塞 {pos.blocked} 人</span>
                  <span className="text-accent-600">Deadline {pos.deadline}</span>
                </div>
                {pos.blockReasons.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {pos.blockReasons.map((r, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-background-100 text-foreground-500 rounded-full">{r}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Position Table */}
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200 flex flex-wrap items-center gap-3">
          <h3 className="font-bold text-foreground-900 text-sm">岗位招聘进展清单</h3>
          <div className="flex-1"></div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="text-xs bg-background-100 border border-background-200 rounded-lg px-3 py-1.5 text-foreground-600 cursor-pointer appearance-none pr-8"
              >
                {departments.map(d => <option key={d} value={d}>{d === 'all' ? '全部部门' : d}</option>)}
              </select>
              <i className="ri-arrow-down-s-line text-xs text-foreground-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"></i>
            </div>
            <div className="relative">
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="text-xs bg-background-100 border border-background-200 rounded-lg px-3 py-1.5 text-foreground-600 cursor-pointer appearance-none pr-8"
              >
                <option value="all">全部风险</option>
                <option value="high">高风险</option>
                <option value="medium">中风险</option>
                <option value="normal">正常</option>
              </select>
              <i className="ri-arrow-down-s-line text-xs text-foreground-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"></i>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-background-200">
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">岗位名称</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">部门</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">HC/入职</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">筛选中</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">面试中</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">Offer</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">阻塞</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">开放天数</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">风险</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-100">
              {filtered.map(pos => (
                <tr key={pos.id} className="hover:bg-background-50/50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-foreground-900">{pos.title}</td>
                  <td className="px-5 py-3.5 text-sm text-foreground-600">{pos.department}</td>
                  <td className="px-5 py-3.5 text-sm text-center">
                    <span className="font-semibold text-foreground-900">{pos.filled}</span>
                    <span className="text-foreground-400">/{pos.headcount}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-center text-foreground-600">{pos.screening}</td>
                  <td className="px-5 py-3.5 text-sm text-center text-foreground-600">{pos.interview}</td>
                  <td className="px-5 py-3.5 text-sm text-center text-foreground-600">{pos.offer}</td>
                  <td className="px-5 py-3.5 text-center">
                    {pos.blocked > 0 ? (
                      <span className="text-xs px-2 py-0.5 bg-accent-100 text-accent-700 rounded-full font-medium">{pos.blocked}</span>
                    ) : (
                      <span className="text-xs text-foreground-400">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-center">
                    <span className={pos.daysOpen > 45 ? 'text-accent-600 font-semibold' : 'text-foreground-600'}>{pos.daysOpen}天</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      pos.risk === 'high' ? 'bg-accent-100 text-accent-700' :
                      pos.risk === 'medium' ? 'bg-secondary-100 text-secondary-700' :
                      'bg-primary-50 text-primary-600'
                    }`}>
                      {pos.risk === 'high' ? '高风险' : pos.risk === 'medium' ? '需关注' : '正常'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}