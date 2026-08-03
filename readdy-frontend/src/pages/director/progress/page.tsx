import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import ReadOnlyDetailDrawer from '@/components/ui/ReadOnlyDetailDrawer';
import { analyticsApi } from '@/features/analytics/api';
import type { AnalyticsOverview } from '@/features/analytics/types';
import { buildDirectorData, type PositionProgress } from '../data';

type SortKey = 'daysOpen' | 'risk' | 'department';

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function positionFollowUpActions(position: PositionProgress) {
  const actions = new Set<string>();
  position.blockReasons.forEach((reason) => {
    if (reason.includes('反馈')) actions.add('由招聘主管催办对应面试官补齐反馈');
    if (reason.includes('超出招聘 HC')) actions.add('由招聘主管核对 HC、Offer 与历史入职记录');
    if (reason.includes('目标日期已过')) actions.add('由招聘主管确认继续招聘、调整日期或结束需求');
    if (reason.includes('暂无在途候选人')) actions.add('由招聘主管安排招聘专员补充候选人');
    if (reason.includes('开放时间较长')) actions.add('由招聘主管复核岗位画像、渠道和招聘优先级');
  });
  if (actions.size === 0) actions.add('由招聘主管继续跟进当前岗位，发生卡点后再升级给总监');
  return Array.from(actions);
}

export default function DirectorProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPositionId = searchParams.get('position');
  const requestedRisk = searchParams.get('risk');
  const [deptFilter, setDeptFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('daysOpen');
  const [activeFunnelStage, setActiveFunnelStage] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await analyticsApi.overview());
    } catch {
      setError('招聘进展暂时无法读取，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (requestedRisk === 'high' || requestedRisk === 'medium' || requestedRisk === 'normal') {
      setRiskFilter(requestedRisk);
    }
  }, [requestedRisk]);

  const view = useMemo(() => data ? buildDirectorData(data) : null, [data]);
  const allPositionProgress = useMemo(() => view?.allPositionProgress ?? [], [view]);
  const directorFunnel = useMemo(() => view?.directorFunnel ?? { resumes: 0, screened: 0, interviewed: 0, offered: 0, hired: 0 }, [view]);
  const blockageDistribution = useMemo(() => view?.blockageDistribution ?? [], [view]);
  const highRiskPositions = useMemo(() => view?.highRiskPositions ?? [], [view]);

  const departments = useMemo(() => {
    const set = new Set(allPositionProgress.map(p => p.department));
    return ['all', ...Array.from(set)];
  }, [allPositionProgress]);

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
  }, [allPositionProgress, deptFilter, riskFilter, sortBy]);

  const funnel = useMemo(() => {
    const stages = [
      { key: 'resumes', label: '简历收取', value: directorFunnel.resumes, pct: 100 },
      { key: 'screened', label: '初筛通过', value: directorFunnel.screened, pct: percent(directorFunnel.screened, directorFunnel.resumes) },
      { key: 'interviewed', label: '进入面试', value: directorFunnel.interviewed, pct: percent(directorFunnel.interviewed, directorFunnel.resumes) },
      { key: 'offered', label: '发放Offer', value: directorFunnel.offered, pct: percent(directorFunnel.offered, directorFunnel.resumes) },
      { key: 'hired', label: '成功入职', value: directorFunnel.hired, pct: percent(directorFunnel.hired, directorFunnel.resumes) },
    ];
    return stages;
  }, [directorFunnel]);

  const totalBlocked = useMemo(() => {
    return allPositionProgress.reduce((s, p) => s + p.blocked, 0);
  }, [allPositionProgress]);

  const selectedPosition = useMemo(
    () => allPositionProgress.find((position) => position.id === requestedPositionId) || null,
    [allPositionProgress, requestedPositionId],
  );

  const openPosition = useCallback((position: PositionProgress) => {
    const next = new URLSearchParams(searchParams);
    next.set('position', position.id);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const closePosition = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('position');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const riskLabel = (risk: PositionProgress['risk']) => (
    risk === 'high' ? '高风险' : risk === 'medium' ? '需关注' : '正常'
  );

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="招聘进展"
        visuallyHiddenTitle
        description={`${allPositionProgress.length} 个在招岗位 · ${highRiskPositions.length} 个高风险 · ${totalBlocked} 人阻塞中 · 只读模式`}
        actions={<><button type="button" onClick={() => void loadData()} disabled={loading} className="rounded-lg border border-background-200 bg-white px-3 py-2 text-sm text-foreground-600 hover:bg-background-50 disabled:opacity-50">刷新</button><Link to="/director/cockpit" className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer whitespace-nowrap"><i className="ri-arrow-left-line"></i> 返回驾驶舱</Link></>}
      />

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => void loadData()} className="font-medium underline">重新加载</button></div>}
      {loading && !data && <div className="rounded-xl border border-background-200 bg-white px-5 py-10 text-center text-sm text-foreground-500">正在读取本地招聘进展...</div>}

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
          <p className="text-2xl font-bold text-foreground-900">{directorFunnel.offered > 0 ? `${percent(directorFunnel.hired, directorFunnel.offered)}%` : '—'}</p>
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
              <strong className="text-foreground-900">{directorFunnel.resumes > 0 ? `${percent(directorFunnel.hired, directorFunnel.resumes)}%` : '—'}</strong>
            </div>
            <div>
              <span className="text-foreground-500">面试→Offer </span>
              <strong className="text-foreground-900">{directorFunnel.interviewed > 0 ? `${percent(directorFunnel.offered, directorFunnel.interviewed)}%` : '—'}</strong>
            </div>
            <div>
              <span className="text-foreground-500">Offer接受率 </span>
              <strong className="text-foreground-900">{directorFunnel.offered > 0 ? `${percent(directorFunnel.hired, directorFunnel.offered)}%` : '—'}</strong>
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
            {blockageDistribution.length === 0 && <p className="py-8 text-center text-sm text-foreground-500">当前没有已识别的阻塞原因。</p>}
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
              <button
                key={pos.id}
                type="button"
                data-ui="director-risk-position"
                onClick={() => openPosition(pos)}
                className="bg-white rounded-lg border border-accent-200 p-4 text-left transition hover:border-accent-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-200"
              >
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
                <span className="mt-3 inline-flex items-center text-xs font-medium text-accent-700">查看只读详情 <i className="ri-arrow-right-s-line"></i></span>
              </button>
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
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">负责人</th>
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
                <tr
                  key={pos.id}
                  data-ui="director-position-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`查看${pos.title}只读详情`}
                  onClick={() => openPosition(pos)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openPosition(pos);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-background-50/80 focus:bg-primary-50/60 focus:outline-none"
                >
                  <td className="px-5 py-3.5 text-sm font-medium text-foreground-900">{pos.title}</td>
                  <td className="px-5 py-3.5 text-sm text-foreground-600">{pos.department}</td>
                  <td className="px-5 py-3.5 text-sm text-foreground-600">{pos.recruiter}</td>
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
              {filtered.length === 0 && <tr><td colSpan={10} className="px-5 py-12 text-center text-sm text-foreground-500">当前筛选条件下没有在招岗位。</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPosition && (
        <ReadOnlyDetailDrawer
          title={selectedPosition.title}
          description={`${selectedPosition.department} · 负责人：${selectedPosition.recruiter} · 只读详情`}
          onClose={closePosition}
        >
          <div data-ui="director-position-detail" className="space-y-5">
            <div className="rounded-lg border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm text-primary-800">
              当前为本地数据库真实记录的只读详情，只帮助管理层判断风险，不会修改招聘流程。
            </div>

            <section>
              <h3 className="text-sm font-semibold text-foreground-900">岗位概况</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {[
                  ['风险状态', riskLabel(selectedPosition.risk)],
                  ['招聘目标', `${selectedPosition.filled}/${selectedPosition.headcount} 人`],
                  ['开放时间', `${selectedPosition.daysOpen} 天`],
                  ['截止日期', selectedPosition.deadline],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-background-200 bg-background-50 px-3 py-3">
                    <dt className="text-xs text-foreground-500">{label}</dt>
                    <dd className="mt-1 font-medium text-foreground-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-foreground-900">当前招聘进度</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['筛选中', selectedPosition.screening],
                  ['面试中', selectedPosition.interview],
                  ['Offer', selectedPosition.offer],
                  ['待入职', selectedPosition.onboarding],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-background-200 px-3 py-3 text-center">
                    <p className="text-xl font-bold text-foreground-900">{value}</p>
                    <p className="mt-1 text-xs text-foreground-500">{label}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-foreground-900">阻塞原因</h3>
              {selectedPosition.blockReasons.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {selectedPosition.blockReasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2 rounded-lg border border-accent-100 bg-accent-50/40 px-3 py-2.5 text-sm text-foreground-700">
                      <i className="ri-error-warning-line mt-0.5 text-accent-600"></i>{reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-lg bg-background-50 px-3 py-4 text-sm text-foreground-500">当前没有已记录的阻塞原因。</p>
              )}
            </section>

            <section className="rounded-xl border border-primary-100 bg-primary-50/40 p-4">
              <h3 className="text-sm font-semibold text-foreground-900">责任人与建议跟进动作</h3>
              <p className="mt-2 text-sm text-foreground-700">当前招聘负责人：<span className="font-semibold text-foreground-900">{selectedPosition.recruiter}</span></p>
              <ul className="mt-3 space-y-2">
                {positionFollowUpActions(selectedPosition).map((action) => (
                  <li key={action} className="flex items-start gap-2 text-sm text-foreground-700">
                    <i className="ri-checkbox-circle-line mt-0.5 text-primary-600" aria-hidden="true" />{action}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-foreground-500">总监负责判断是否需要升级、调整资源或改变优先级，不直接代替招聘主管推进候选人流程。</p>
              <Link to="/director/approvals" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800">查看相关审批与风险<i className="ri-arrow-right-line" aria-hidden="true" /></Link>
            </section>
          </div>
        </ReadOnlyDetailDrawer>
      )}
    </div>
  );
}
