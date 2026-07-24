import { useMemo } from 'react';
import { type Candidate } from '@/mocks/candidates';
import { requisitions } from '@/mocks/jobs';
import { loadKpiConfig, categorizeBlockReason } from '@/mocks/kpiStandards';

interface BlockagePanelProps {
  candidates: Candidate[];
}

export default function BlockagePanel({ candidates }: BlockagePanelProps) {
  const kpiConfig = useMemo(() => loadKpiConfig(), []);

  // Block reason analysis
  const blockAnalysis = useMemo(() => {
    const map: Record<string, number> = {};
    candidates.forEach((c) => {
      const cat = categorizeBlockReason(c.blockReason, kpiConfig.blockCategories);
      map[cat] = (map[cat] || 0) + 1;
    });

    const order = kpiConfig.blockCategories.map((c) => c.name);
    if (!order.includes('无阻塞')) order.push('无阻塞');
    return order.filter((k) => map[k] > 0).map((name) => ({ name, count: map[name] }));
  }, [candidates, kpiConfig.blockCategories]);

  const blockedCount = candidates.filter((c) =>
    c.blockReason && c.blockReason !== '暂无' && c.blockReason !== '暂无明显阻塞'
  ).length;

  // Position matrix - derive from requisitions
  const positionMatrix = useMemo(() => {
    const positions = candidates.map((c) => c.position);
    const uniquePositions = [...new Set(positions)];
    const thresholds = kpiConfig.riskThresholds;

    return uniquePositions.map((pos) => {
      const posCandidates = candidates.filter((c) => c.position === pos);
      const req = requisitions.find((r) => r.title === pos);

      const stageDist: Record<string, number> = {};
      posCandidates.forEach((c) => {
        stageDist[c.stage] = (stageDist[c.stage] || 0) + 1;
      });

      const blocked = posCandidates.filter((c) =>
        c.blockReason && c.blockReason !== '暂无' && c.blockReason !== '暂无明显阻塞'
      );

      let risk: 'high' | 'medium' | 'low' = 'low';
      if (req) {
        const fillRatio = req.headcount > 0 ? req.filled / req.headcount : 0;

        // High risk
        if (
          (thresholds.highIfStatusPausedOrClosed && (req.statusCode === 'paused' || req.statusCode === 'closed')) ||
          (thresholds.highIfZeroFillAndBlocked && fillRatio === 0 && blocked.length > 0)
        ) {
          risk = 'high';
        }

        // Medium risk
        if (risk === 'low') {
          if (thresholds.mediumIfBlocked && fillRatio < thresholds.mediumFillRatioThreshold && blocked.length > 0) {
            risk = 'medium';
          } else if (req.deadline) {
            const today = new Date();
            const deadline = new Date(req.deadline);
            const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= thresholds.deadlineWarningDays) {
              risk = 'medium';
            }
          }
        }
      }

      return {
        position: pos,
        total: posCandidates.length,
        stages: stageDist,
        blocked: blocked.length,
        headcount: req?.headcount || 0,
        filled: req?.filled || 0,
        status: req?.status || '未知',
        deadline: req?.deadline || null,
        risk,
      };
    }).sort((a, b) => {
      // 招聘专员视角：风险 > deadline 紧急度 > HC 缺口 > 阻塞人数
      const riskScore = (r: typeof a.risk) => ({ high: 3, medium: 2, low: 1 }[r] || 0);
      const riskDiff = riskScore(b.risk) - riskScore(a.risk);
      if (riskDiff !== 0) return riskDiff;

      const deadlineA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const deadlineB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      const deadlineDiff = deadlineA - deadlineB; // 越近越靠前
      if (deadlineDiff !== 0) return deadlineDiff;

      const gapA = a.headcount - a.filled;
      const gapB = b.headcount - b.filled;
      const gapDiff = gapB - gapA; // 缺口越大越靠前
      if (gapDiff !== 0) return gapDiff;

      return b.blocked - a.blocked;
    });
  }, [candidates, kpiConfig.riskThresholds]);

  const riskColor: Record<string, string> = {
    high: 'text-accent-600 bg-accent-50 border-accent-200',
    medium: 'text-primary-600 bg-primary-50 border-primary-200',
    low: 'text-foreground-500 bg-background-100 border-background-200',
  };

  const riskLabel: Record<string, string> = {
    high: '高风险',
    medium: '需关注',
    low: '正常',
  };

  // Color palette for the donut-like visualization
  const catColors: Record<string, string> = {
    '用人部门需求模糊': 'oklch(var(--accent-500))',
    '面试官/用人部门响应慢': 'oklch(var(--secondary-500))',
    '薪资不匹配': 'oklch(var(--primary-500))',
    '候选人放弃': 'oklch(0.55 0.15 30)',
    '其他原因': 'oklch(var(--foreground-400))',
    '无阻塞': 'oklch(var(--background-300))',
  };

  const total = candidates.length;
  let conicGradient = '';
  let cumulative = 0;
  blockAnalysis.forEach((item) => {
    const pct = (item.count / total) * 100;
    if (pct > 0) {
      conicGradient += `${conicGradient ? ', ' : ''}${catColors[item.name] || 'oklch(var(--foreground-400))'} ${cumulative}% ${cumulative + pct}%`;
      cumulative += pct;
    }
  });

  return (
    <div className="space-y-6">
      {/* Blockage Reason Distribution */}
      <div className="bg-white rounded-xl border border-background-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-foreground-900 text-base">阻塞原因分析</h3>
            <p className="text-xs text-foreground-500 mt-0.5">
              共 <span className="font-semibold text-accent-600">{blockedCount}</span> 人阻塞中
              · {total - blockedCount} 人正常推进
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Donut */}
          <div className="w-44 h-44 relative flex-shrink-0">
            <div
              className="w-full h-full rounded-full"
              style={{ background: `conic-gradient(${conicGradient || 'oklch(var(--background-200)) 0% 100%'})` }}
            >
              <div className="absolute inset-0 m-8 bg-white rounded-full flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground-900">{blockedCount}</span>
                <span className="text-[10px] text-foreground-400">阻塞中</span>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-2.5">
            {blockAnalysis.map((item) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <div key={item.name} className="flex items-center gap-3 group cursor-pointer">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: catColors[item.name] || '#999' }}
                  ></div>
                  <span className="text-sm text-foreground-700 flex-1">{item.name}</span>
                  <span className="text-sm font-semibold text-foreground-900">{item.count} 人</span>
                  <span className="text-xs text-foreground-400 w-10 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Position × Stage Matrix */}
      <div className="bg-white rounded-xl border border-background-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-foreground-900 text-base">岗位招聘进度矩阵</h3>
            <p className="text-xs text-foreground-500 mt-0.5">按岗位追踪各阶段候选人分布 · 一眼定位卡点</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200">
                <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap sticky left-0 bg-white z-10">
                  岗位 / HC
                </th>
                {['待筛选', '初筛通过', '面试中', '已发Offer', '已入职', '已淘汰'].map((s) => (
                  <th key={s} className="text-center px-2 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">
                    {s}
                  </th>
                ))}
                <th className="text-center px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">
                  阻塞数
                </th>
                <th className="text-center px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">
                  风险
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-100">
              {positionMatrix.map((row) => {
                const interviewCount = (row.stages['一面'] || 0) + (row.stages['二面'] || 0) + (row.stages['终面'] || 0);
                return (
                  <tr key={row.position} className="hover:bg-background-50/50 transition-colors">
                    <td className="px-3 py-3 sticky left-0 bg-white z-10">
                      <p className="text-sm font-medium text-foreground-900">{row.position}</p>
                      <p className="text-xs text-foreground-400">
                        {row.filled}/{row.headcount} HC
                        {row.deadline && <span className="ml-1">· 截止 {row.deadline}</span>}
                      </p>
                    </td>
                    <td className="text-center px-2 py-3">
                      <span className={`inline-flex items-center justify-center min-w-[28px] h-7 rounded-md text-xs font-semibold ${
                        (row.stages['待筛选'] || 0) > 0 ? 'bg-secondary-100 text-secondary-700' : 'bg-background-100 text-foreground-400'
                      }`}>{row.stages['待筛选'] || 0}</span>
                    </td>
                    <td className="text-center px-2 py-3">
                      <span className={`inline-flex items-center justify-center min-w-[28px] h-7 rounded-md text-xs font-semibold ${
                        (row.stages['初筛通过'] || 0) > 0 ? 'bg-primary-100 text-primary-700' : 'bg-background-100 text-foreground-400'
                      }`}>{row.stages['初筛通过'] || 0}</span>
                    </td>
                    <td className="text-center px-2 py-3">
                      <span className={`inline-flex items-center justify-center min-w-[28px] h-7 rounded-md text-xs font-semibold ${
                        interviewCount > 0 ? 'bg-accent-100 text-accent-700' : 'bg-background-100 text-foreground-400'
                      }`}>{interviewCount}</span>
                    </td>
                    <td className="text-center px-2 py-3">
                      <span className={`inline-flex items-center justify-center min-w-[28px] h-7 rounded-md text-xs font-semibold ${
                        (row.stages['已发Offer'] || 0) > 0 ? 'bg-primary-200 text-primary-800' : 'bg-background-100 text-foreground-400'
                      }`}>{row.stages['已发Offer'] || 0}</span>
                    </td>
                    <td className="text-center px-2 py-3">
                      <span className={`inline-flex items-center justify-center min-w-[28px] h-7 rounded-md text-xs font-semibold ${
                        (row.stages['已入职'] || 0) > 0 ? 'bg-primary-300 text-primary-800' : 'bg-background-100 text-foreground-400'
                      }`}>{row.stages['已入职'] || 0}</span>
                    </td>
                    <td className="text-center px-2 py-3">
                      <span className={`inline-flex items-center justify-center min-w-[28px] h-7 rounded-md text-xs font-semibold ${
                        (row.stages['已淘汰'] || 0) > 0 ? 'bg-background-200 text-foreground-500' : 'bg-background-100 text-foreground-400'
                      }`}>{row.stages['已淘汰'] || 0}</span>
                    </td>
                    <td className="text-center px-3 py-3">
                      {row.blocked > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[28px] h-7 rounded-md text-xs font-bold bg-accent-100 text-accent-700">
                          <i className="ri-alert-line mr-0.5"></i>{row.blocked}
                        </span>
                      ) : (
                        <span className="text-xs text-foreground-400">-</span>
                      )}
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className={`inline-block px-2 py-1 rounded-md text-[10px] font-medium border whitespace-nowrap ${riskColor[row.risk]}`}>
                        {riskLabel[row.risk]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary insight */}
      <div className="bg-background-50 border border-background-200 rounded-xl p-4">
        <p className="text-sm text-foreground-700 leading-relaxed">
          <i className="ri-lightbulb-line text-accent-500 mr-1"></i>
          <strong>洞察：</strong>
          当前 {blockedCount} 位候选人处于阻塞状态，主要集中在「面试官响应慢」与「薪资不匹配」。
          建议重点关注「高级前端工程师」岗位（需求模糊导致 1 人卡在初筛，JD 已反复修改 3 次），
          以及「测试工程师」岗位（面试官 5 天未反馈，候选人有竞品 Offer 流失风险）。
          招聘专员 <strong>张敏</strong> 的 4 位候选人中 3 人阻塞，负载压力最大。
        </p>
      </div>
    </div>
  );
}