import type {
  AnalyticsAttentionType,
  AnalyticsDemandRow,
  AnalyticsOverview,
} from '@/features/analytics/types';

export type ApprovalType = AnalyticsAttentionType;

export interface DirectorKpi {
  label: string;
  value: number | string;
  unit?: string;
  note: string;
  icon: string;
  color: 'primary' | 'accent' | 'secondary';
  drillKey: string;
}

export interface HcDetail {
  department: string;
  headcount: number;
  hired: number;
  inProgress: number;
  openReqs: number;
  fillRate: number;
}

export interface TeamPerformance {
  recruiter: string;
  department: string;
  assignedReqs: number;
  hiresMonth: number;
  hiresQuarter: number;
  avgCycle: number | null;
  offerRate: number;
  blockedCount: number;
  completionRate: number;
}

export interface DirectorTrend {
  month: string;
  hires: number;
  offers: number;
}

export interface PositionProgress {
  id: string;
  demandId: number;
  title: string;
  department: string;
  headcount: number;
  filled: number;
  screening: number;
  interview: number;
  offer: number;
  onboarding: number;
  blocked: number;
  risk: 'high' | 'medium' | 'normal';
  deadline: string;
  recruiter: string;
  daysOpen: number;
  blockReasons: string[];
}

export interface ApprovalItem {
  id: string;
  type: ApprovalType;
  title: string;
  department: string;
  applicant: string;
  submittedAt: string;
  urgency: 'urgent' | 'normal' | 'low';
  detail: string;
  daysRemaining?: number;
}

const riskLabels: Record<string, string> = {
  over_headcount: '超出招聘 HC',
  overdue: '目标日期已过',
  open_too_long: '开放时间较长',
  no_active_candidate: '暂无在途候选人',
  feedback_pending: '面试反馈待补',
};

function positionRisk(row: AnalyticsDemandRow): PositionProgress['risk'] {
  if (row.risk_flags.includes('overdue') || row.risk_flags.includes('over_headcount') || row.risk_flags.length >= 2) return 'high';
  return row.risk_flags.length > 0 ? 'medium' : 'normal';
}

function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export function buildDirectorData(data: AnalyticsOverview) {
  const positions: PositionProgress[] = data.demands.map((row) => ({
    id: `demand-${row.demand_id}`,
    demandId: row.demand_id,
    title: row.title,
    department: row.department,
    headcount: row.headcount,
    filled: row.onboarded,
    screening: row.funnel.pending + row.funnel.ai_screen + row.funnel.business_review,
    interview: row.funnel.interview,
    offer: row.funnel.offer,
    onboarding: Math.max(0, row.offers_accepted - row.onboarded),
    blocked: row.outstanding_feedback + (row.risk_flags.includes('no_active_candidate') ? 1 : 0),
    risk: positionRisk(row),
    deadline: row.target_date || '未设置',
    recruiter: row.owner_name,
    daysOpen: row.days_open,
    blockReasons: row.risk_flags.map((flag) => riskLabels[flag] || flag),
  }));

  const overdueCount = positions.filter((item) => item.risk === 'high').length;
  const hcDetails: HcDetail[] = data.departments.map((row) => ({
    department: row.department,
    headcount: row.headcount,
    hired: row.onboarded,
    inProgress: row.in_progress,
    openReqs: data.demands.filter((item) => item.department === row.department).length,
    fillRate: Math.min(100, safeRate(row.onboarded, row.headcount)),
  }));

  const teamGroups = new Map<string, AnalyticsDemandRow[]>();
  data.demands.forEach((row) => {
    const key = `${row.owner_hr_id ?? 'none'}:${row.owner_name}`;
    teamGroups.set(key, [...(teamGroups.get(key) ?? []), row]);
  });
  const teamPerformance: TeamPerformance[] = Array.from(teamGroups.values()).map((rows) => {
    const demandIds = new Set(rows.map((row) => row.demand_id));
    const cycles = data.cycle_rows.filter((row) => demandIds.has(row.demand_id));
    const headcount = rows.reduce((sum, row) => sum + row.headcount, 0);
    const hired = rows.reduce((sum, row) => sum + row.onboarded, 0);
    const issued = rows.reduce((sum, row) => sum + row.offers_issued, 0);
    const accepted = rows.reduce((sum, row) => sum + row.offers_accepted, 0);
    return {
      recruiter: rows[0]?.owner_name || '未分配',
      department: Array.from(new Set(rows.map((row) => row.department))).join('、'),
      assignedReqs: rows.length,
      hiresMonth: rows.reduce((sum, row) => sum + row.hires_month, 0),
      hiresQuarter: rows.reduce((sum, row) => sum + row.hires_quarter, 0),
      avgCycle: cycles.length ? Math.round(cycles.reduce((sum, row) => sum + row.average_days, 0) / cycles.length) : null,
      offerRate: safeRate(accepted, issued),
      blockedCount: rows.filter((row) => row.risk_flags.length > 0).length,
      completionRate: safeRate(hired, headcount),
    };
  });

  const kpis: DirectorKpi[] = [
    { label: '招聘 HC 总量', value: data.summary.headcount, unit: '个', note: '当前在招需求', icon: 'ri-building-2-line', color: 'primary', drillKey: 'hc' },
    { label: '平均招聘周期', value: data.summary.average_cycle_days ?? '—', unit: data.summary.average_cycle_days === null ? '' : '天', note: '按已入职记录', icon: 'ri-time-line', color: 'secondary', drillKey: 'cycle' },
    { label: '招聘成本', value: '未接入', note: '本地暂无成本数据', icon: 'ri-money-cny-circle-line', color: 'primary', drillKey: 'cost' },
    { label: 'Offer 接受率', value: data.summary.offer_accept_rate, unit: '%', note: '已接受/已发放', icon: 'ri-check-double-line', color: 'accent', drillKey: 'offer' },
    { label: '本月入职', value: data.summary.hires_month, unit: '人', note: '已确认入职', icon: 'ri-user-add-line', color: 'primary', drillKey: 'hires' },
    { label: '高风险岗位', value: overdueCount, unit: '个', note: '按真实风险规则', icon: 'ri-alert-line', color: 'accent', drillKey: 'overdue' },
    { label: '待关注事项', value: data.summary.attention_count, unit: '项', note: '审批与到期风险', icon: 'ri-file-list-2-line', color: 'secondary', drillKey: 'approval' },
    { label: '在途候选人', value: data.demands.reduce((sum, row) => sum + row.in_progress, 0), unit: '人', note: '当前招聘流程', icon: 'ri-group-line', color: 'primary', drillKey: 'pipeline' },
  ];

  const riskCounts = new Map<string, number>();
  data.demands.forEach((row) => row.risk_flags.forEach((flag) => riskCounts.set(flag, (riskCounts.get(flag) ?? 0) + 1)));
  const totalRisk = Array.from(riskCounts.values()).reduce((sum, value) => sum + value, 0);
  const blockageDistribution = Array.from(riskCounts.entries()).map(([flag, count]) => ({
    reason: riskLabels[flag] || flag,
    count,
    pct: totalRisk ? Math.round((count / totalRisk) * 100) : 0,
  }));

  const approvalItems: ApprovalItem[] = data.attention_items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    department: item.department,
    applicant: item.applicant,
    submittedAt: item.submitted_at ? item.submitted_at.slice(0, 10) : '未记录',
    urgency: item.urgency,
    detail: item.detail,
    daysRemaining: item.days_remaining ?? undefined,
  }));
  const urgentCount = approvalItems.filter((item) => item.urgency === 'urgent').length;
  const highRisk = positions.filter((item) => item.risk === 'high');

  return {
    directorKpis: kpis,
    hcDetails,
    teamPerformance,
    directorTrends: data.monthly_trends as DirectorTrend[],
    insightSummary: {
      summary: highRisk.length
        ? `当前有 ${highRisk.length} 个高风险岗位、${data.summary.attention_count} 项待关注事项，建议优先处理目标日期已过和暂无在途候选人的岗位。`
        : `当前没有高风险岗位，共有 ${data.summary.open_demands} 个在招需求。`,
      alerts: highRisk.slice(0, 3).map((item) => ({
        type: 'warning' as const,
        text: `${item.title}：${item.blockReasons.join('、') || '需关注'}`,
        drillKey: 'overdue',
        positionId: item.id,
      })),
    },
    allPositionProgress: positions,
    directorFunnel: data.funnel,
    blockageDistribution,
    highRiskPositions: highRisk,
    approvalItems,
    riskSummary: {
      summary: approvalItems.length
        ? `当前共 ${approvalItems.length} 项真实待关注事项，其中 ${urgentCount} 项紧急。建议优先跟进已超期需求和待审批事项。`
        : '当前本地数据中没有待审批或临期风险事项。',
      alerts: approvalItems.filter((item) => item.urgency === 'urgent').slice(0, 3).map((item) => ({ type: 'warning' as const, text: `${item.title}：${item.detail}`, drillKey: item.type })),
    },
  };
}
