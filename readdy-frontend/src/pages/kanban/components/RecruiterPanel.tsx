import { useState, useMemo } from 'react';
import { type Candidate, stageColorMap } from '@/mocks/candidates';
import {
  loadKpiConfig,
  categorizeBlockReason,
  getHealthColorClass,
  getHealthStrokeColor,
} from '@/mocks/kpiStandards';

interface RecruiterInfo {
  name: string;
  title: string;
  years: string;
  candidates: Candidate[];
}

interface RecruiterPanelProps {
  candidates: Candidate[];
}

/** 从 "bg-primary-100 text-primary-700" 中提取 bg 类名 */
function extractBgClass(combined: string): string {
  return combined.split(' ').find((c) => c.startsWith('bg-')) || 'bg-background-100';
}

export default function RecruiterPanel({ candidates }: RecruiterPanelProps) {
  const kpiConfig = useMemo(() => loadKpiConfig(), []);
  const [selectedRecruiter, setSelectedRecruiter] = useState<string | 'all'>('all');
  const [expandedRecruiters, setExpandedRecruiters] = useState<Set<string>>(new Set());

  const isBlocked = (c: Candidate) => {
    return c.blockReason && c.blockReason !== '暂无' && c.blockReason !== '暂无明显阻塞';
  };

  const recruiters = useMemo<RecruiterInfo[]>(() => {
    const map: Record<string, Candidate[]> = {};
    candidates.forEach((c) => {
      const recruiter = c.recruiter || '未分配';
      if (!map[recruiter]) map[recruiter] = [];
      map[recruiter].push(c);
    });

    const meta: Record<string, { title: string; years: string }> = {
      '张敏': { title: '招聘主管', years: '5年' },
      '李华': { title: '高级招聘专员', years: '3年' },
      '王磊': { title: '招聘专员', years: '2年' },
      '未分配': { title: '待分配', years: '-' },
    };

    return Object.entries(map).map(([name, list]) => ({
      name,
      title: meta[name]?.title || '未知',
      years: meta[name]?.years || '-',
      candidates: list,
    })).sort((a, b) => {
      const blockedA = a.candidates.filter(isBlocked).length;
      const blockedB = b.candidates.filter(isBlocked).length;
      const healthA = a.candidates.length > 0 ? ((a.candidates.length - blockedA) / a.candidates.length) : 1;
      const healthB = b.candidates.length > 0 ? ((b.candidates.length - blockedB) / b.candidates.length) : 1;
      const healthDiff = healthA - healthB;
      if (healthDiff !== 0) return healthDiff;
      return blockedB - blockedA;
    });
  }, [candidates]);

  const blockBadgeStyle: Record<string, string> = {
    '需求侧': 'bg-accent-50 text-accent-700 border-accent-200',
    '薪资': 'bg-primary-50 text-primary-700 border-primary-200',
    '流程侧': 'bg-secondary-50 text-secondary-700 border-secondary-200',
    '候选人侧': 'bg-accent-50 text-accent-700 border-accent-200',
    '其他': 'bg-background-100 text-foreground-600 border-background-200',
  };

  const totalCandidates = candidates.length;

  const toggleExpand = (name: string) => {
    setExpandedRecruiters((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const displayRecruiters =
    selectedRecruiter === 'all'
      ? recruiters
      : recruiters.filter((r) => r.name === selectedRecruiter);

  return (
    <div className="bg-white rounded-xl border border-background-200 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="font-bold text-foreground-900 text-base">招聘专员负载 &amp; 阻塞概览</h3>
          <p className="text-xs text-foreground-500 mt-0.5">按专员维度追踪候选人进展与卡点</p>
        </div>
        <span className="text-xs text-foreground-400">
          {totalCandidates} 位候选人 · {recruiters.length} 位专员
        </span>
      </div>

      {/* Recruiter selector pills */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setSelectedRecruiter('all')}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap
            ${selectedRecruiter === 'all'
              ? 'bg-primary-500 text-white'
              : 'bg-background-100 text-foreground-600 hover:bg-background-200'
            }
          `}
        >
          <i className="ri-team-line text-sm"></i>
          全部
        </button>
        {recruiters.map((recruiter) => {
          const blocked = recruiter.candidates.filter(isBlocked).length;
          const isActive = selectedRecruiter === recruiter.name;
          return (
            <button
              key={recruiter.name}
              onClick={() => {
                setSelectedRecruiter(recruiter.name);
                // 选中单个时自动展开
                setExpandedRecruiters(new Set([recruiter.name]));
              }}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap relative
                ${isActive
                  ? 'bg-primary-500 text-white'
                  : 'bg-background-100 text-foreground-600 hover:bg-background-200'
                }
              `}
            >
              <div className={`
                w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0
                ${isActive ? 'bg-white/20 text-white' : 'bg-primary-50 text-primary-600'}
              `}>
                {recruiter.name.charAt(0)}
              </div>
              <span>{recruiter.name}</span>
              {blocked > 0 && (
                <span className={`
                  inline-flex items-center justify-center min-w-[16px] h-4 rounded-full text-[10px] font-bold px-1
                  ${isActive ? 'bg-white/20 text-white' : 'bg-accent-500 text-white'}
                `}>
                  {blocked}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {displayRecruiters.map((recruiter) => {
          const blocked = recruiter.candidates.filter(isBlocked);
          const blockedCount = blocked.length;
          const total = recruiter.candidates.length;
          const progressPercent = total > 0 ? ((total - blockedCount) / total) * 100 : 100;

          const stageDist: Record<string, number> = {};
          recruiter.candidates.forEach((c) => {
            stageDist[c.stage] = (stageDist[c.stage] || 0) + 1;
          });

          const healthColor = getHealthColorClass(progressPercent, kpiConfig.healthThresholds);
          const strokeColor = getHealthStrokeColor(progressPercent, kpiConfig.healthThresholds);

          // 选中单个时强制展开，否则按用户手动状态
          const isExpanded =
            selectedRecruiter !== 'all'
              ? true
              : expandedRecruiters.has(recruiter.name);

          return (
            <div
              key={recruiter.name}
              className={`border rounded-xl overflow-hidden transition-all ${
                selectedRecruiter === recruiter.name
                  ? 'border-primary-300 ring-1 ring-primary-100'
                  : 'border-background-200'
              }`}
            >
              {/* Compact header */}
              <div
                onClick={() => {
                  if (selectedRecruiter === 'all') toggleExpand(recruiter.name);
                }}
                className={`
                  px-4 py-3 bg-background-50 flex items-center justify-between
                  ${selectedRecruiter === 'all' ? 'cursor-pointer hover:bg-background-100 transition-colors' : ''}
                `}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary-600">{recruiter.name.charAt(0)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground-900">{recruiter.name}</p>
                      <span className="text-xs text-foreground-400">{recruiter.title}</span>
                      <span className="text-xs text-foreground-400">· {recruiter.years}经验</span>
                    </div>
                    <p className="text-xs text-foreground-400 mt-0.5">
                      {total} 位候选人负责中
                      {blockedCount > 0 && (
                        <span className="ml-2 text-accent-600 font-medium">
                          {blockedCount} 人阻塞
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* Health text */}
                  <div className="hidden sm:block text-right">
                    <p className={`text-sm font-bold ${healthColor}`}>
                      {Math.round(progressPercent)}%
                    </p>
                    <p className="text-[10px] text-foreground-400">健康度</p>
                  </div>
                  {/* Mini ring */}
                  <div className="w-8 h-8 relative flex-shrink-0">
                    <svg viewBox="0 0 40 40" className="w-8 h-8 -rotate-90">
                      <circle cx="20" cy="20" r="16" fill="none" stroke="oklch(var(--background-200))" strokeWidth="5" />
                      <circle
                        cx="20" cy="20" r="16" fill="none"
                        stroke={strokeColor}
                        strokeWidth="5"
                        strokeDasharray={`${progressPercent * 1.005} 100.5`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] font-bold text-foreground-700">{total}</span>
                    </div>
                  </div>
                  {selectedRecruiter === 'all' && (
                    <div className="w-6 h-6 flex items-center justify-center text-foreground-400">
                      {isExpanded ? (
                        <i className="ri-arrow-up-s-line text-lg transition-transform"></i>
                      ) : (
                        <i className="ri-arrow-down-s-line text-lg transition-transform"></i>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Expandable detail */}
              {isExpanded && (
                <div>
                  {/* Stage progress bar */}
                  {total > 0 && (
                    <div className="px-4 py-3 border-b border-background-100">
                      <p className="text-xs text-foreground-400 mb-2">阶段分布</p>
                      <div className="flex h-6 rounded-md overflow-hidden">
                        {Object.entries(stageDist).map(([stage, count]) => {
                          const pct = (count / total) * 100;
                          const bgClass = extractBgClass(stageColorMap[stage] || '');
                          return (
                            <div
                              key={stage}
                              className={`h-full ${bgClass} flex items-center justify-center transition-all`}
                              style={{ width: `${pct}%` }}
                              title={`${stage}: ${count}人 (${Math.round(pct)}%)`}
                            >
                              {pct > 12 && (
                                <span className="text-[10px] font-bold text-white drop-shadow-sm">{count}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[10px] flex-wrap">
                        {Object.entries(stageDist).map(([stage, count]) => (
                          <span key={stage} className="inline-flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${extractBgClass(stageColorMap[stage] || '')}`}></span>
                            <span className="text-foreground-500">{stage}</span>
                            <span className="font-semibold text-foreground-700">{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Blocked list - simplified */}
                  {blockedCount > 0 ? (
                    <div className="divide-y divide-background-100">
                      <div className="px-4 py-2 bg-background-50/50">
                        <p className="text-xs text-foreground-500 font-medium">
                          <i className="ri-error-warning-line text-accent-500 mr-1"></i>
                          阻塞候选人（{blockedCount} 人）
                        </p>
                      </div>
                      {blocked.map((c) => {
                        const cat = categorizeBlockReason(c.blockReason, kpiConfig.blockCategories);
                        return (
                          <div key={c.id} className="px-4 py-3 hover:bg-background-50/50 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-sm font-medium text-foreground-900">{c.name}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded-md ${c.stageColor}`}>{c.stage}</span>
                                  <span className="text-xs text-foreground-400">{c.position}</span>
                                </div>
                                <p className="text-xs text-foreground-500 leading-relaxed line-clamp-2">
                                  {c.blockReason}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                {cat && cat !== '无阻塞' && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${blockBadgeStyle[cat] || ''}`}>
                                    {cat}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-foreground-400">
                        <i className="ri-check-line text-primary-500 mr-1"></i>
                        该专员负责的候选人进展顺利，无阻塞
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {displayRecruiters.length === 0 && (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-3">
            <i className="ri-user-search-line text-xl text-foreground-400"></i>
          </div>
          <p className="text-sm text-foreground-500">暂无招聘专员数据</p>
        </div>
      )}
    </div>
  );
}