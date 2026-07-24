import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { candidateList } from '@/mocks/candidates';
import { allCandidateProfiles, talentPoolIds } from '@/mocks/candidateProfiles';
import { offers } from '@/mocks/offers';
import { interviews } from '@/mocks/interviews';

// ── Re-import talent pool IDs for direct use ──
const POOL_IDS: Set<number> = talentPoolIds;

// ── Reactivatable talent type ──
interface ReactivatableEntry {
  id: number;
  name: string;
  position: string;
  source: string;
  category: 'talentPool' | 'offerRejected' | 'finalRoundEliminated' | 'excellentEliminated';
  reason: string;
  lastContact: string;
}

export default function DirectorInsightsPage() {
  const navigate = useNavigate();
  const [showAiDetail, setShowAiDetail] = useState(false);
  const [expandedPosition, setExpandedPosition] = useState<string | null>(null);

  // ── Compute all metrics from real mock data ──
  const metrics = useMemo(() => {
    const total = candidateList.length;

    const recruiting = allCandidateProfiles.filter(p => p.status === 'recruiting').length;
    const poolCount = allCandidateProfiles.filter(p => p.status === 'talentPool').length;

    // Hired: candidates with stage '已入职' + offers with status '已入职'
    const hiredFromCandidates = candidateList.filter(c => c.stage === '已入职').length;
    const hiredFromOffers = offers.filter(o => o.status === '已入职').length;

    // Deduplicate: check if offer candidate is also in candidateList
    const offerHiredNames = new Set(offers.filter(o => o.status === '已入职').map(o => o.candidateName));
    const candidateHiredNames = new Set(candidateList.filter(c => c.stage === '已入职').map(c => c.name));
    let hiredTotal = hiredFromCandidates;
    offerHiredNames.forEach(name => {
      if (!candidateHiredNames.has(name)) hiredTotal++;
    });

    // 本月新增: applied in July 2026
    const thisMonthNew = candidateList.filter(c => c.appliedAt.startsWith('2026-07')).length;

    // 可重新激活: talent pool + offer rejected + final round eliminated + excellent eliminated
    const poolCandidates = candidateList.filter(c => POOL_IDS.has(c.id));
    const offerRejectedCount = offers.filter(o => o.status === '已拒绝').length;

    // Final round / excellent eliminated candidates who could be re-contacted
    const excellentEliminated = candidateList.filter(c => {
      if (c.stage !== '已淘汰') return false;
      if (POOL_IDS.has(c.id)) return false;
      // Those who were good but lost to competitors or had salary mismatch
      const reason = c.blockReason || '';
      return reason.includes('接受了另一家') || reason.includes('其他公司') || reason.includes('Offer') || reason.includes('薪资');
    });

    const reactivatable = poolCount + offerRejectedCount + excellentEliminated.length;

    return {
      total,
      recruiting,
      poolCount,
      reactivatable,
      thisMonthNew,
      hiredTotal,
      excellentEliminated,
      offerRejectedCount,
    };
  }, []);

  // ── Build reactivatable talent list ──
  const reactivatableList: ReactivatableEntry[] = useMemo(() => {
    const entries: ReactivatableEntry[] = [];

    // 1. Talent pool candidates
    candidateList.filter(c => POOL_IDS.has(c.id)).forEach(c => {
      entries.push({
        id: c.id,
        name: c.name,
        position: c.position,
        source: c.source,
        category: 'talentPool',
        reason: '已在人才池中，可随时激活',
        lastContact: c.appliedAt,
      });
    });

    // 2. Offer rejected candidates
    offers.filter(o => o.status === '已拒绝').forEach(o => {
      const cand = candidateList.find(c => c.name === o.candidateName);
      entries.push({
        id: cand?.id || 999,
        name: o.candidateName,
        position: o.position,
        source: '猎头公司推荐',
        category: 'offerRejected',
        reason: `Offer被拒：${o.rejectionReason || '薪酬不具竞争力'}`,
        lastContact: o.respondedAt || o.sentAt || '',
      });
    });

    // 3. Excellent eliminated candidates
    candidateList.filter(c => {
      if (c.stage !== '已淘汰') return false;
      if (POOL_IDS.has(c.id)) return false;
      const reason = c.blockReason || '';
      return reason.includes('接受了另一家') || reason.includes('其他公司') || reason.includes('Offer') || reason.includes('薪资');
    }).forEach(c => {
      entries.push({
        id: c.id,
        name: c.name,
        position: c.position,
        source: c.source,
        category: c.blockReason?.includes('终面') ? 'finalRoundEliminated' : 'excellentEliminated',
        reason: c.blockReason || '优秀候选人，可再次联系',
        lastContact: c.appliedAt,
      });
    });

    return entries;
  }, []);

  // ── Key position talent pool data ──
  const positionTalentData = useMemo(() => {
    // Group candidates by position
    const positionMap = new Map<string, {
      totalInPool: number;
      totalInProcess: number;
      reactivatable: number;
    }>();

    // All unique positions from candidates
    const allPositions = new Set(candidateList.map(c => c.position));

    allPositions.forEach(pos => {
      const posCands = candidateList.filter(c => c.position === pos);
      const inPool = posCands.filter(c => POOL_IDS.has(c.id)).length;
      const ended = posCands.filter(c => c.stage === '已入职' || c.stage === '已淘汰').length;
      const inProcess = posCands.length - inPool - ended;
      const reactivatableCount = inPool; // base reactivatable = pool

      positionMap.set(pos, {
        totalInPool: inPool,
        totalInProcess: Math.max(0, inProcess),
        reactivatable: reactivatableCount,
      });
    });

    // Sort: positions with most candidates first
    return Array.from(positionMap.entries())
      .map(([position, data]) => ({ position, ...data }))
      .sort((a, b) => (b.totalInPool + b.totalInProcess) - (a.totalInPool + a.totalInProcess));
  }, []);

  // ── Talent structure data ──
  const talentStructure = useMemo(() => {
    // Position categories
    const categoryMap = new Map<string, number>();
    candidateList.forEach(c => {
      const pos = c.position;
      let cat = '其他';
      if (pos.includes('前端')) cat = '前端开发';
      else if (pos.includes('后端') || pos.includes('Java')) cat = '后端开发';
      else if (pos.includes('产品')) cat = '产品设计';
      else if (pos.includes('UI') || pos.includes('设计')) cat = 'UI/UX设计';
      else if (pos.includes('数据')) cat = '数据分析';
      else if (pos.includes('测试')) cat = '测试';
      else if (pos.includes('运营') || pos.includes('市场')) cat = '市场运营';
      else if (pos.includes('HR') || pos.includes('人力')) cat = '人力资源';
      else if (pos.includes('架构')) cat = '架构师';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    });
    const positionCategories = Array.from(categoryMap.entries())
      .map(([cat, count]) => ({ label: cat, count }))
      .sort((a, b) => b.count - a.count);

    // Work years distribution
    const yearMap = new Map<string, number>();
    candidateList.forEach(c => {
      const y = c.experienceYears;
      yearMap.set(y, (yearMap.get(y) || 0) + 1);
    });
    const yearDistribution = Array.from(yearMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => {
        const aNum = parseInt(a.label) || 0;
        const bNum = parseInt(b.label) || 0;
        return aNum - bNum;
      });

    // Education distribution
    const eduMap = new Map<string, number>();
    candidateList.forEach(c => {
      const edu = c.education;
      let level = '未知';
      if (edu.includes('博士')) level = '博士';
      else if (edu.includes('硕士')) level = '硕士';
      else if (edu.includes('本科')) level = '本科';
      eduMap.set(level, (eduMap.get(level) || 0) + 1);
    });
    const eduDistribution = ['博士', '硕士', '本科', '未知']
      .map(label => ({ label, count: eduMap.get(label) || 0 }))
      .filter(d => d.count > 0);

    // Source distribution
    const sourceMap = new Map<string, number>();
    candidateList.forEach(c => {
      sourceMap.set(c.source, (sourceMap.get(c.source) || 0) + 1);
    });
    const sourceDistribution = Array.from(sourceMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // Top skills
    const skillMap = new Map<string, number>();
    candidateList.forEach(c => {
      c.skills.forEach(s => {
        skillMap.set(s, (skillMap.get(s) || 0) + 1);
      });
    });
    const topSkills = Array.from(skillMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    return { positionCategories, yearDistribution, eduDistribution, sourceDistribution, topSkills };
  }, []);

  // ── AI Insight text ──
  const aiSummary = useMemo(() => {
    const poolCount = metrics.poolCount;
    const reactivatable = metrics.reactivatable;
    const recruiting = metrics.recruiting;
    const shortages = positionTalentData.filter(p => p.totalInPool === 0 && p.totalInProcess < 3);
    const shortageNames = shortages.slice(0, 3).map(s => s.position).join('、');

    return `当前人才储备总量${metrics.total}人，其中${recruiting}人在招聘流程中，${poolCount}人在人才池待激活。${reactivatable > poolCount ? `另有${reactivatable - poolCount}名优秀候选人可重新联系。` : ''}${shortageNames ? `需重点关注${shortageNames}等岗位的人才储备不足问题，建议加大主动寻访力度。` : '各岗位人才储备充足，建议持续维护人才关系。'}`;
  }, [metrics, positionTalentData]);

  // ── Navigate to candidates with preset filter ──
  const goToCandidates = (filter: Record<string, string>) => {
    navigate('/candidates', { state: { presetFilter: filter } });
  };

  // ── Adequacy badge ──
  const getAdequacyBadge = (inPool: number, inProcess: number) => {
    const total = inPool + inProcess;
    if (total >= 5) return { label: '储备充足', color: 'bg-primary-50 text-primary-700' };
    if (total >= 2) return { label: '储备一般', color: 'bg-secondary-50 text-secondary-700' };
    return { label: '储备不足', color: 'bg-accent-100 text-accent-700' };
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground-900">人才储备</h1>
          <p className="text-sm text-foreground-500 mt-1">
            {metrics.total} 位候选人 · {metrics.recruiting} 人流程中 · {metrics.poolCount} 人人才池 · {metrics.hiredTotal} 人已录用 · 只读模式
          </p>
        </div>
        <Link to="/director/cockpit" className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer whitespace-nowrap">
          <i className="ri-arrow-left-line"></i> 返回驾驶舱
        </Link>
      </div>

      {/* AI Insight Bar */}
      <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-robot-2-line text-white text-sm"></i>
          </div>
          <div className="flex-1">
            <p className="text-sm text-foreground-800 leading-relaxed">{aiSummary}</p>
            {showAiDetail && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-secondary-200 space-y-2">
                <p className="text-xs text-foreground-700 leading-relaxed">
                  建议行动：①对人才池中的{metrics.poolCount}名候选人，建议每季度至少联系一次，保持关系热度；
                  ②对有Offer拒绝和优秀淘汰经历的候选人，可在3-6个月后重新接触，彼时其职业状态可能发生变化；
                  ③关注储备不足的岗位，提前启动被动寻访计划，避免因急招导致质量下降或成本上升。
                </p>
              </div>
            )}
            <button
              onClick={() => setShowAiDetail(!showAiDetail)}
              className="text-xs text-accent-600 hover:text-accent-700 font-medium mt-2 cursor-pointer"
            >
              {showAiDetail ? '收起建议' : '查看AI建议'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section 1: Top 6 Metric Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <button
          onClick={() => goToCandidates({})}
          className="bg-white rounded-xl border border-background-200 p-4 text-left hover:border-primary-200 hover:bg-primary-50/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <i className="ri-user-line text-primary-600 text-sm"></i>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{metrics.total}</p>
          <p className="text-xs text-foreground-500 mt-0.5">候选人总数</p>
          <p className="text-[10px] text-foreground-400 mt-1 group-hover:text-primary-500 transition-colors">
            点击查看详情 <i className="ri-arrow-right-line"></i>
          </p>
        </button>

        <button
          onClick={() => goToCandidates({ status: 'recruiting' })}
          className="bg-white rounded-xl border border-background-200 p-4 text-left hover:border-primary-200 hover:bg-primary-50/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <i className="ri-user-follow-line text-primary-600 text-sm"></i>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{metrics.recruiting}</p>
          <p className="text-xs text-foreground-500 mt-0.5">招聘流程中</p>
          <p className="text-[10px] text-foreground-400 mt-1 group-hover:text-primary-500 transition-colors">
            点击查看详情 <i className="ri-arrow-right-line"></i>
          </p>
        </button>

        <button
          onClick={() => goToCandidates({ status: 'talentPool' })}
          className="bg-white rounded-xl border border-background-200 p-4 text-left hover:border-accent-200 hover:bg-accent-50/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center">
              <i className="ri-archive-line text-accent-600 text-sm"></i>
            </div>
          </div>
          <p className="text-2xl font-bold text-accent-600">{metrics.poolCount}</p>
          <p className="text-xs text-foreground-500 mt-0.5">人才池人数</p>
          <p className="text-[10px] text-foreground-400 mt-1 group-hover:text-accent-500 transition-colors">
            点击查看详情 <i className="ri-arrow-right-line"></i>
          </p>
        </button>

        <button
          onClick={() => goToCandidates({ reactivatable: 'true' })}
          className="bg-white rounded-xl border border-background-200 p-4 text-left hover:border-accent-200 hover:bg-accent-50/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center">
              <i className="ri-restart-line text-accent-600 text-sm"></i>
            </div>
          </div>
          <p className="text-2xl font-bold text-accent-600">{metrics.reactivatable}</p>
          <p className="text-xs text-foreground-500 mt-0.5">可重新激活</p>
          <p className="text-[10px] text-foreground-400 mt-1 group-hover:text-accent-500 transition-colors">
            点击查看详情 <i className="ri-arrow-right-line"></i>
          </p>
        </button>

        <button
          onClick={() => goToCandidates({ month: 'new' })}
          className="bg-white rounded-xl border border-background-200 p-4 text-left hover:border-primary-200 hover:bg-primary-50/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <i className="ri-user-add-line text-primary-600 text-sm"></i>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground-900">{metrics.thisMonthNew}</p>
          <p className="text-xs text-foreground-500 mt-0.5">本月新增人才</p>
          <p className="text-[10px] text-foreground-400 mt-1 group-hover:text-primary-500 transition-colors">
            点击查看详情 <i className="ri-arrow-right-line"></i>
          </p>
        </button>

        <button
          onClick={() => goToCandidates({ status: 'hired' })}
          className="bg-white rounded-xl border border-background-200 p-4 text-left hover:border-primary-200 hover:bg-primary-50/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <i className="ri-check-double-line text-primary-600 text-sm"></i>
            </div>
          </div>
          <p className="text-2xl font-bold text-primary-600">{metrics.hiredTotal}</p>
          <p className="text-xs text-foreground-500 mt-0.5">已录用人数</p>
          <p className="text-[10px] text-foreground-400 mt-1 group-hover:text-primary-500 transition-colors">
            点击查看详情 <i className="ri-arrow-right-line"></i>
          </p>
        </button>
      </div>

      {/* ── Section 2: Key Position Talent Pool ── */}
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-foreground-900">关键岗位人才储备</h3>
            <p className="text-xs text-foreground-500 mt-0.5">按岗位查看人才池、流程中人数与储备充足度</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-background-200">
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">岗位名称</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">人才池</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">流程中</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">可重新激活</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-foreground-500">储备状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-100">
              {positionTalentData.map(row => {
                const adequacy = getAdequacyBadge(row.totalInPool, row.totalInProcess);
                const isExpanded = expandedPosition === row.position;
                const poolCands = candidateList.filter(c => c.position === row.position && POOL_IDS.has(c.id));
                const processCands = candidateList.filter(c => {
                  if (c.position !== row.position) return false;
                  if (POOL_IDS.has(c.id)) return false;
                  return c.stage !== '已入职' && c.stage !== '已淘汰';
                });

                return (
                  <tr key={row.position} className="hover:bg-background-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => {
                          setExpandedPosition(isExpanded ? null : row.position);
                          if (!isExpanded) goToCandidates({ position: row.position });
                        }}
                        className="text-sm font-medium text-primary-600 hover:text-primary-700 cursor-pointer text-left flex items-center gap-1.5"
                      >
                        {row.position}
                        <i className={`text-xs transition-transform ${isExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`}></i>
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-sm font-semibold ${row.totalInPool > 0 ? 'text-accent-600' : 'text-foreground-400'}`}>
                        {row.totalInPool}
                      </span>
                      {isExpanded && poolCands.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                          {poolCands.map(c => (
                            <span key={c.id} className="text-[10px] px-1.5 py-0.5 bg-accent-50 text-accent-700 rounded-full whitespace-nowrap">{c.name}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-sm font-semibold ${row.totalInProcess > 0 ? 'text-primary-600' : 'text-foreground-400'}`}>
                        {row.totalInProcess}
                      </span>
                      {isExpanded && processCands.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                          {processCands.slice(0, 5).map(c => (
                            <span key={c.id} className="text-[10px] px-1.5 py-0.5 bg-primary-50 text-primary-700 rounded-full whitespace-nowrap">{c.name}·{c.stage}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="text-sm text-foreground-600">{row.reactivatable}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${adequacy.color}`}>
                        {adequacy.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 3: Talent Structure ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Position Categories */}
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <h4 className="text-sm font-semibold text-foreground-900 mb-4">岗位类别分布</h4>
          <div className="space-y-3">
            {talentStructure.positionCategories.map(cat => {
              const pct = Math.round((cat.count / metrics.total) * 100);
              return (
                <button
                  key={cat.label}
                  onClick={() => goToCandidates({ positionCategory: cat.label })}
                  className="w-full text-left cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground-700 group-hover:text-primary-600 transition-colors">{cat.label}</span>
                    <span className="text-xs font-semibold text-foreground-900">{cat.count}人</span>
                  </div>
                  <div className="h-1.5 bg-background-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-400 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Work Years Distribution */}
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <h4 className="text-sm font-semibold text-foreground-900 mb-4">工作年限分布</h4>
          <div className="space-y-3">
            {talentStructure.yearDistribution.map(yr => {
              const pct = Math.round((yr.count / metrics.total) * 100);
              return (
                <button
                  key={yr.label}
                  onClick={() => goToCandidates({ experience: yr.label })}
                  className="w-full text-left cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground-700 group-hover:text-primary-600 transition-colors">{yr.label}</span>
                    <span className="text-xs font-semibold text-foreground-900">{yr.count}人</span>
                  </div>
                  <div className="h-1.5 bg-background-100 rounded-full overflow-hidden">
                    <div className="h-full bg-secondary-400 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Education Distribution */}
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <h4 className="text-sm font-semibold text-foreground-900 mb-4">学历分布</h4>
          <div className="space-y-3">
            {talentStructure.eduDistribution.map(edu => {
              const pct = Math.round((edu.count / metrics.total) * 100);
              return (
                <button
                  key={edu.label}
                  onClick={() => goToCandidates({ education: edu.label })}
                  className="w-full text-left cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground-700 group-hover:text-primary-600 transition-colors">{edu.label}</span>
                    <span className="text-xs font-semibold text-foreground-900">{edu.count}人</span>
                  </div>
                  <div className="h-1.5 bg-background-100 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-400 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Source + Skills row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source Distribution */}
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <h4 className="text-sm font-semibold text-foreground-900 mb-4">简历来源分布</h4>
          <div className="flex flex-wrap gap-2">
            {talentStructure.sourceDistribution.map(src => (
              <button
                key={src.label}
                onClick={() => goToCandidates({ source: src.label })}
                className="flex items-center gap-2 px-3 py-2 bg-background-50 rounded-lg hover:bg-primary-50 transition-colors cursor-pointer group"
              >
                <span className="text-xs text-foreground-700 group-hover:text-primary-600 transition-colors">{src.label}</span>
                <span className="text-xs font-bold text-foreground-900">{src.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Top Skills */}
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <h4 className="text-sm font-semibold text-foreground-900 mb-4">技能标签 Top12</h4>
          <div className="flex flex-wrap gap-2">
            {talentStructure.topSkills.map(skill => (
              <button
                key={skill.label}
                onClick={() => goToCandidates({ skill: skill.label })}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-background-50 rounded-full hover:bg-accent-50 transition-colors cursor-pointer group"
              >
                <span className="text-xs text-foreground-600 group-hover:text-accent-600 transition-colors">{skill.label}</span>
                <span className="text-[11px] font-bold text-foreground-400">{skill.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 4: Reactivatable Talent ── */}
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200">
          <h3 className="font-bold text-foreground-900">待激活人才</h3>
          <p className="text-xs text-foreground-500 mt-0.5">
            长期未联系 · 曾进入终面 · Offer拒绝可再次联系 · 优秀淘汰候选人
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-background-200">
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">候选人</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">岗位</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">分类</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">原因 / 备注</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">最后联系</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-100">
              {reactivatableList.map(entry => {
                const categoryLabel = {
                  talentPool: '人才池',
                  offerRejected: 'Offer拒绝',
                  finalRoundEliminated: '终面淘汰',
                  excellentEliminated: '优秀淘汰',
                }[entry.category];
                const categoryColor = {
                  talentPool: 'bg-accent-50 text-accent-700',
                  offerRejected: 'bg-secondary-50 text-secondary-700',
                  finalRoundEliminated: 'bg-primary-50 text-primary-700',
                  excellentEliminated: 'bg-background-100 text-foreground-600',
                }[entry.category];

                return (
                  <tr
                    key={`${entry.category}-${entry.id}`}
                    onClick={() => goToCandidates({ name: entry.name })}
                    className="hover:bg-background-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-medium text-primary-600">{entry.name}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-foreground-700">{entry.position}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor}`}>
                        {categoryLabel}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-foreground-600 max-w-[300px] truncate block">{entry.reason}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-foreground-500">{entry.lastContact || '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {reactivatableList.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-3">
              <i className="ri-user-smile-line text-xl text-foreground-400"></i>
            </div>
            <p className="text-sm text-foreground-500">当前没有待激活人才</p>
          </div>
        )}
      </div>
    </div>
  );
}