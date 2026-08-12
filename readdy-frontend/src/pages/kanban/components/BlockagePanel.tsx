import { useMemo } from 'react';
import type { RecruitmentDemand } from '@/features/demands/types';
import type { KpiStandardConfig } from '@/features/kpiStandards/types';

interface BlockagePanelProps {
  demand: RecruitmentDemand;
  kpiConfig: KpiStandardConfig | null;
}

const FLAG_LABELS: Record<string, string> = {
  overdue: '已超过期望完成日期',
  business_feedback_pending: '有候选人等待业务反馈',
  low_interview_conversion: '推荐较多但尚未进入面试',
  open_too_long: '需求开放时间较长',
  hr_no_recommendation: '需求接收后尚未推荐候选人',
  paused_or_closed: '需求已暂停或关闭',
  zero_fill_and_blocked: '零入职且存在卡点',
  blocked: '存在阻塞问题',
  fill_ratio_low: 'HC 填充率偏低',
};

const HIGH_RISK_FLAGS = new Set(['overdue', 'paused_or_closed', 'zero_fill_and_blocked']);

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  active: '招聘中',
  paused: '已暂停',
  filled: '已完成',
  cancelled: '已取消',
  closed: '已关闭',
};

const STAGE_COLUMNS: { key: string; label: string }[] = [
  { key: 'pending', label: '待筛选' },
  { key: 'ai_screen', label: 'AI初筛' },
  { key: 'business_review', label: '业务筛选' },
  { key: 'interview', label: '面试' },
  { key: 'offer', label: 'Offer' },
  { key: 'onboarded', label: '已入职' },
  { key: 'rejected', label: '已淘汰' },
  { key: 'transferred', label: '已转需求' },
];

const LEVEL_RING: Record<'green' | 'yellow' | 'red', { color: string; label: string }> = {
  green: { color: 'oklch(var(--primary-500))', label: '正常' },
  yellow: { color: 'oklch(var(--accent-500))', label: '需关注' },
  red: { color: 'oklch(var(--accent-600))', label: '高风险' },
};

export default function BlockagePanel({ demand, kpiConfig }: BlockagePanelProps) {
  const health = demand.health ?? { score: 100, level: 'green' as const };
  const ring = LEVEL_RING[health.level];
  const flags = useMemo(() => demand.risk_flags ?? [], [demand.risk_flags]);

  const activeSwitchChips = useMemo(() => {
    if (!kpiConfig) return [];
    const thresholds = kpiConfig.risk_thresholds;
    const chips: { label: string; on: boolean }[] = [
      { label: '暂停/关闭视为高风险', on: thresholds.high_if_status_paused_or_closed },
      { label: '零入职且有卡点视为高风险', on: thresholds.high_if_zero_fill_and_blocked },
      { label: '存在阻塞视为需关注', on: thresholds.medium_if_blocked },
      {
        label: `填充率低于 ${Math.round(thresholds.medium_fill_ratio_threshold * 100)}% 视为需关注`,
        on: thresholds.medium_fill_ratio_threshold > 0,
      },
    ];
    return chips;
  }, [kpiConfig]);

  const stageRows = useMemo(() => {
    const counts = demand.metrics?.current_stage_counts ?? {};
    return STAGE_COLUMNS.map((column) => ({
      ...column,
      count: counts[column.key] ?? 0,
    }));
  }, [demand.metrics]);

  const flagList = useMemo(
    () =>
      flags.map((flag) => ({
        id: flag,
        label: FLAG_LABELS[flag] ?? flag,
        high: HIGH_RISK_FLAGS.has(flag),
      })),
    [flags],
  );

  const completionRate = useMemo(() => {
    const headcount = Math.max(1, demand.headcount || 1);
    return Math.round(((demand.metrics?.onboarded_count ?? 0) / headcount) * 100);
  }, [demand]);

  return (
    <div className="space-y-6">
      {/* 需求健康度 + 风险标记 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-background-200 p-6 flex items-center gap-5">
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="oklch(var(--background-200))" strokeWidth="10" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={ring.color}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${health.score * 2.64} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-foreground-900">{health.score}</span>
              <span className="text-[10px] text-foreground-400">健康度</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground-900">需求健康度</p>
            <span
              className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                health.level === 'green'
                  ? 'text-primary-600 bg-primary-50 border-primary-200'
                  : health.level === 'yellow'
                    ? 'text-accent-600 bg-accent-50 border-accent-200'
                    : 'text-accent-700 bg-accent-100 border-accent-200'
              }`}
            >
              {ring.label}
            </span>
            <p className="text-xs text-foreground-400">
              {STATUS_LABELS[demand.status] ?? demand.status} · {demand.metrics?.onboarded_count ?? 0}/{demand.headcount || 1} HC
            </p>
            {demand.target_date && (
              <p className="text-xs text-foreground-400">截止 {demand.target_date.slice(0, 10)}</p>
            )}
          </div>
        </div>

        <div className="sm:col-span-2 bg-white rounded-xl border border-background-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-foreground-900 text-base">风险标记</h3>
            {flags.length > 0 ? (
              <span className="text-xs text-foreground-500">
                共 <span className="font-semibold text-accent-600">{flags.length}</span> 项
              </span>
            ) : (
              <span className="text-xs text-primary-600 font-medium">当前无风险标记</span>
            )}
          </div>

          {flagList.length > 0 ? (
            <ul className="space-y-2">
              {flagList.map((flag) => (
                <li key={flag.id} className="flex items-center gap-2.5">
                  <i
                    className={`${flag.high ? 'ri-alert-fill text-accent-600' : 'ri-information-line text-primary-600'} text-sm`}
                  ></i>
                  <span className="text-sm text-foreground-700 flex-1">{flag.label}</span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium border whitespace-nowrap ${
                      flag.high
                        ? 'text-accent-600 bg-accent-50 border-accent-200'
                        : 'text-primary-600 bg-primary-50 border-primary-200'
                    }`}
                  >
                    {flag.high ? '高风险' : '需关注'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground-500">
              需求推进正常，没有需要关注的卡点。
            </p>
          )}

          {activeSwitchChips.length > 0 && (
            <div className="mt-4 pt-4 border-t border-background-100">
              <p className="text-xs text-foreground-400 mb-2">当前生效的风险口径（来自组织口径配置）</p>
              <div className="flex flex-wrap gap-2">
                {activeSwitchChips.map((chip) => (
                  <span
                    key={chip.label}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                      chip.on
                        ? 'bg-primary-50 text-primary-700 border-primary-200'
                        : 'bg-background-50 text-foreground-400 border-background-100'
                    }`}
                  >
                    <i className={`${chip.on ? 'ri-checkbox-circle-line' : 'ri-checkbox-blank-circle-line'} text-xs`}></i>
                    {chip.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 招聘进度矩阵 */}
      <div className="bg-white rounded-xl border border-background-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-foreground-900 text-base">招聘进度矩阵</h3>
            <p className="text-xs text-foreground-500 mt-0.5">
              候选人阶段分布与 HC 完成情况 · 填充率 {completionRate}%
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200">
                <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap sticky left-0 bg-white z-10">
                  需求 / HC
                </th>
                {STAGE_COLUMNS.map((column) => (
                  <th key={column.key} className="text-center px-2 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">
                    {column.label}
                  </th>
                ))}
                <th className="text-center px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">
                  风险标记
                </th>
                <th className="text-center px-3 py-2.5 text-xs font-medium text-foreground-500 whitespace-nowrap">
                  健康度
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-100">
              <tr className="hover:bg-background-50/50 transition-colors">
                <td className="px-3 py-3 sticky left-0 bg-white z-10">
                  <p className="text-sm font-medium text-foreground-900">{demand.job_title}</p>
                  <p className="text-xs text-foreground-400">
                    {demand.metrics?.onboarded_count ?? 0}/{demand.headcount || 1} HC
                    {demand.owner_hr_name && <span className="ml-1">· {demand.owner_hr_name}</span>}
                  </p>
                </td>
                {stageRows.map((column) => (
                  <td key={column.key} className="text-center px-2 py-3">
                    <span
                      className={`inline-flex items-center justify-center min-w-[28px] h-7 rounded-md text-xs font-semibold ${
                        column.count > 0
                          ? column.key === 'interview'
                            ? 'bg-accent-100 text-accent-700'
                            : column.key === 'onboarded'
                              ? 'bg-primary-200 text-primary-800'
                              : column.key === 'rejected' || column.key === 'transferred'
                                ? 'bg-background-200 text-foreground-500'
                                : 'bg-primary-100 text-primary-700'
                          : 'bg-background-100 text-foreground-400'
                      }`}
                    >
                      {column.count}
                    </span>
                  </td>
                ))}
                <td className="text-center px-3 py-3">
                  {flags.length > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-[28px] h-7 rounded-md text-xs font-bold bg-accent-100 text-accent-700">
                      <i className="ri-alert-line mr-0.5"></i>
                      {flags.length}
                    </span>
                  ) : (
                    <span className="text-xs text-foreground-400">-</span>
                  )}
                </td>
                <td className="text-center px-3 py-3">
                  <span
                    className={`inline-block px-2 py-1 rounded-md text-[10px] font-medium border whitespace-nowrap ${
                      health.level === 'green'
                        ? 'text-primary-600 bg-primary-50 border-primary-200'
                        : health.level === 'yellow'
                          ? 'text-primary-600 bg-primary-50 border-primary-200'
                          : 'text-accent-600 bg-accent-50 border-accent-200'
                    }`}
                  >
                    {health.score} 分 · {ring.label}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 动态洞察 */}
      {flagList.length > 0 && (
        <div className="bg-background-50 border border-background-200 rounded-xl p-4">
          <p className="text-sm text-foreground-700 leading-relaxed">
            <i className="ri-lightbulb-line text-accent-500 mr-1"></i>
            <strong>洞察：</strong>
            该需求存在 {flags.length} 项需关注问题：
            {flagList.slice(0, 2).map((flag) => flag.label).join('、')}
            {flagList.length > 2 ? ` 等 ${flagList.length} 项` : ''}。
            建议优先处理高风险标记后再推进候选人流程。
          </p>
        </div>
      )}
    </div>
  );
}
