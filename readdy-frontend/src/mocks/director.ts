// ===== 人力资源总监 Mock 数据 =====

// ---------- 管理驾驶舱 ----------
export interface DirectorKpi {
  label: string;
  value: number | string;
  unit?: string;
  change: string;
  changeType: 'up' | 'down' | 'neutral';
  icon: string;
  color: 'primary' | 'accent' | 'secondary';
  drillKey: string;
}

export const directorKpis: DirectorKpi[] = [
  { label: '招聘HC总量', value: 186, unit: '个', change: '+12', changeType: 'up', icon: 'ri-building-2-line', color: 'primary', drillKey: 'hc' },
  { label: '平均招聘周期', value: 19.5, unit: '天', change: '-2.3天', changeType: 'up', icon: 'ri-time-line', color: 'secondary', drillKey: 'cycle' },
  { label: '人均招聘成本', value: 3850, unit: '元', change: '-8%', changeType: 'up', icon: 'ri-money-cny-circle-line', color: 'primary', drillKey: 'cost' },
  { label: 'Offer接受率', value: 84, unit: '%', change: '+3%', changeType: 'up', icon: 'ri-check-double-line', color: 'accent', drillKey: 'offer' },
  { label: '本月入职', value: 22, unit: '人', change: '+4', changeType: 'up', icon: 'ri-user-add-line', color: 'primary', drillKey: 'hires' },
  { label: '超期岗位', value: 8, unit: '个', change: '-2', changeType: 'up', icon: 'ri-alert-line', color: 'accent', drillKey: 'overdue' },
  { label: '待审批事项', value: 14, unit: '项', change: '+3', changeType: 'down', icon: 'ri-file-list-2-line', color: 'secondary', drillKey: 'approval' },
  { label: '在途候选人', value: 186, unit: '人', change: '+15', changeType: 'up', icon: 'ri-group-line', color: 'primary', drillKey: 'pipeline' },
];

// 招聘HC汇总 drill-down
export interface HcDetail {
  department: string;
  headcount: number;
  hired: number;
  inProgress: number;
  openReqs: number;
  fillRate: number;
}

export const hcDetails: HcDetail[] = [
  { department: '技术研发部', headcount: 65, hired: 8, inProgress: 12, openReqs: 4, fillRate: 31 },
  { department: '产品设计部', headcount: 18, hired: 3, inProgress: 5, openReqs: 2, fillRate: 44 },
  { department: '市场运营部', headcount: 28, hired: 4, inProgress: 6, openReqs: 3, fillRate: 36 },
  { department: '销售业务部', headcount: 32, hired: 3, inProgress: 8, openReqs: 5, fillRate: 34 },
  { department: '客户成功部', headcount: 16, hired: 2, inProgress: 3, openReqs: 1, fillRate: 31 },
  { department: '人力行政部', headcount: 10, hired: 1, inProgress: 1, openReqs: 0, fillRate: 20 },
  { department: '财务法务部', headcount: 8, hired: 1, inProgress: 0, openReqs: 1, fillRate: 13 },
  { department: '供应链管理部', headcount: 9, hired: 0, inProgress: 2, openReqs: 1, fillRate: 22 },
];

// 团队招聘表现
export interface TeamPerformance {
  recruiter: string;
  department: string;
  assignedReqs: number;
  hiresMonth: number;
  hiresQuarter: number;
  avgCycle: number;
  offerRate: number;
  blockedCount: number;
  healthScore: number;
}

export const teamPerformance: TeamPerformance[] = [
  { recruiter: '张敏', department: '技术研发部', assignedReqs: 8, hiresMonth: 4, hiresQuarter: 14, avgCycle: 18, offerRate: 88, blockedCount: 1, healthScore: 85 },
  { recruiter: '王磊', department: '产品设计部', assignedReqs: 5, hiresMonth: 2, hiresQuarter: 7, avgCycle: 22, offerRate: 76, blockedCount: 3, healthScore: 62 },
  { recruiter: '陈芳', department: '市场运营部', assignedReqs: 6, hiresMonth: 3, hiresQuarter: 10, avgCycle: 15, offerRate: 90, blockedCount: 0, healthScore: 92 },
  { recruiter: '刘洋', department: '销售业务部', assignedReqs: 7, hiresMonth: 2, hiresQuarter: 8, avgCycle: 25, offerRate: 72, blockedCount: 2, healthScore: 58 },
  { recruiter: '赵雪', department: '客户成功部', assignedReqs: 4, hiresMonth: 1, hiresQuarter: 5, avgCycle: 20, offerRate: 82, blockedCount: 1, healthScore: 75 },
  { recruiter: '孙婷', department: '人力行政部', assignedReqs: 3, hiresMonth: 1, hiresQuarter: 3, avgCycle: 28, offerRate: 68, blockedCount: 0, healthScore: 78 },
];

// 月度趋势
export interface DirectorTrend {
  month: string;
  hires: number;
  offers: number;
  cost: number;
  cycle: number;
}

export const directorTrends: DirectorTrend[] = [
  { month: '1月', hires: 18, offers: 24, cost: 4200, cycle: 22 },
  { month: '2月', hires: 14, offers: 19, cost: 3950, cycle: 20 },
  { month: '3月', hires: 22, offers: 30, cost: 3800, cycle: 18 },
  { month: '4月', hires: 16, offers: 22, cost: 4100, cycle: 21 },
  { month: '5月', hires: 20, offers: 27, cost: 3700, cycle: 19 },
  { month: '6月', hires: 24, offers: 32, cost: 3650, cycle: 17 },
  { month: '7月', hires: 16, offers: 21, cost: 3850, cycle: 19.5 },
];

// AI 洞察摘要
export const aiInsightSummary = {
  summary: '本月招聘整体健康，Offer接受率84%高于行业平均。需重点关注：①销售业务部招聘周期25天超阈值，②供应链管理部零入职需介入，③刘洋负责的7个岗位中有2个面临阻塞。建议本周召开招聘Review会议，重点解决长期未招满岗位问题。',
  alerts: [
    { type: 'warning' as const, text: '供应链管理部本季度零入职，HC填满率仅22%', drillKey: 'overdue' },
    { type: 'danger' as const, text: '销售业务部招聘周期25天，超过公司24天红线', drillKey: 'cycle' },
    { type: 'info' as const, text: '刘洋健康度58分偏低，建议主管关注其工作负荷', drillKey: 'team' },
  ],
};

// ---------- 招聘进展（看板） ----------
export interface PositionProgress {
  id: string;
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

export const allPositionProgress: PositionProgress[] = [
  { id: 'req-1', title: '高级前端工程师', department: '技术研发部', headcount: 3, filled: 2, screening: 12, interview: 5, offer: 2, onboarding: 1, blocked: 0, risk: 'normal', deadline: '2026-08-15', recruiter: '张敏', daysOpen: 28, blockReasons: [] },
  { id: 'req-2', title: 'Java后端开发', department: '技术研发部', headcount: 5, filled: 3, screening: 18, interview: 8, offer: 3, onboarding: 1, blocked: 2, risk: 'medium', deadline: '2026-08-30', recruiter: '张敏', daysOpen: 35, blockReasons: ['薪资期望偏高'] },
  { id: 'req-3', title: '产品经理', department: '产品设计部', headcount: 2, filled: 1, screening: 8, interview: 3, offer: 1, onboarding: 0, blocked: 1, risk: 'medium', deadline: '2026-09-01', recruiter: '王磊', daysOpen: 42, blockReasons: ['候选人放弃面试'] },
  { id: 'req-4', title: 'UI/UX设计师', department: '产品设计部', headcount: 2, filled: 1, screening: 6, interview: 2, offer: 1, onboarding: 0, blocked: 0, risk: 'normal', deadline: '2026-08-20', recruiter: '王磊', daysOpen: 22, blockReasons: [] },
  { id: 'req-5', title: '市场运营经理', department: '市场运营部', headcount: 1, filled: 0, screening: 15, interview: 4, offer: 1, onboarding: 0, blocked: 1, risk: 'high', deadline: '2026-07-30', recruiter: '陈芳', daysOpen: 55, blockReasons: ['薪资不匹配', '岗位要求过高'] },
  { id: 'req-6', title: '品牌推广专员', department: '市场运营部', headcount: 2, filled: 1, screening: 10, interview: 3, offer: 1, onboarding: 1, blocked: 0, risk: 'normal', deadline: '2026-08-10', recruiter: '陈芳', daysOpen: 20, blockReasons: [] },
  { id: 'req-7', title: '大客户销售', department: '销售业务部', headcount: 4, filled: 1, screening: 20, interview: 7, offer: 2, onboarding: 0, blocked: 3, risk: 'high', deadline: '2026-07-25', recruiter: '刘洋', daysOpen: 60, blockReasons: ['薪资不匹配', '候选人拒绝Offer', '竞争激烈'] },
  { id: 'req-8', title: '渠道销售主管', department: '销售业务部', headcount: 2, filled: 0, screening: 12, interview: 4, offer: 1, onboarding: 0, blocked: 2, risk: 'high', deadline: '2026-08-05', recruiter: '刘洋', daysOpen: 48, blockReasons: ['候选人拒绝Offer'] },
  { id: 'req-9', title: '客户成功经理', department: '客户成功部', headcount: 2, filled: 1, screening: 8, interview: 3, offer: 1, onboarding: 0, blocked: 0, risk: 'normal', deadline: '2026-08-15', recruiter: '赵雪', daysOpen: 25, blockReasons: [] },
  { id: 'req-10', title: 'HRBP', department: '人力行政部', headcount: 1, filled: 0, screening: 6, interview: 2, offer: 1, onboarding: 0, blocked: 1, risk: 'medium', deadline: '2026-08-20', recruiter: '孙婷', daysOpen: 38, blockReasons: ['薪资期望偏高'] },
  { id: 'req-11', title: '供应链分析师', department: '供应链管理部', headcount: 2, filled: 0, screening: 4, interview: 1, offer: 0, onboarding: 0, blocked: 1, risk: 'high', deadline: '2026-07-20', recruiter: '张敏', daysOpen: 68, blockReasons: ['岗位要求过高'] },
  { id: 'req-12', title: '数据分析师', department: '技术研发部', headcount: 2, filled: 1, screening: 9, interview: 3, offer: 1, onboarding: 0, blocked: 0, risk: 'normal', deadline: '2026-08-25', recruiter: '张敏', daysOpen: 30, blockReasons: [] },
];

// 招聘漏斗（总监视角 — 数据确保前后合理）
export const directorFunnel = {
  resumes: 1420,
  screened: 520,
  interviewed: 215,
  offered: 85,
  hired: 62,
};

// 阻塞原因分布
export const blockageDistribution = [
  { reason: '薪资不匹配', count: 8, pct: 32 },
  { reason: '候选人拒绝Offer', count: 5, pct: 20 },
  { reason: '岗位要求过高', count: 4, pct: 16 },
  { reason: '竞争激烈', count: 3, pct: 12 },
  { reason: '候选人放弃面试', count: 3, pct: 12 },
  { reason: '入职时间不合', count: 2, pct: 8 },
];

// 高风险岗位
export const highRiskPositions = allPositionProgress.filter(p => p.risk === 'high');

// ---------- 人才洞察 ----------
export interface TalentInsightCompany {
  id: string;
  name: string;
  shortName: string;
  industry: string;
  mappedTalent: number;
  confirmedTalent: number;
  keyRoles: string[];
  talentSupply: 'rich' | 'moderate' | 'scarce';
  reachableCount: number;
}

export const talentInsightCompanies: TalentInsightCompany[] = [
  { id: 'co-bytedance', name: '字节跳动', shortName: '字节跳动', industry: '互联网/科技', mappedTalent: 16, confirmedTalent: 2, keyRoles: ['推荐算法', '大模型研究', '基础架构'], talentSupply: 'rich', reachableCount: 8 },
  { id: 'co-alibaba', name: '阿里巴巴集团', shortName: '阿里巴巴', industry: '互联网/科技', mappedTalent: 16, confirmedTalent: 1, keyRoles: ['搜索推荐', '云计算', '物流技术'], talentSupply: 'rich', reachableCount: 7 },
  { id: 'co-tencent', name: '腾讯', shortName: '腾讯', industry: '互联网/科技', mappedTalent: 14, confirmedTalent: 2, keyRoles: ['微信技术', '游戏引擎', 'AI Lab'], talentSupply: 'moderate', reachableCount: 5 },
  { id: 'co-sf', name: '顺丰速运', shortName: '顺丰', industry: '物流/快递', mappedTalent: 20, confirmedTalent: 3, keyRoles: ['智慧物流', '航空运营', '冷链'], talentSupply: 'moderate', reachableCount: 9 },
  { id: 'co-zto', name: '中通快递', shortName: '中通', industry: '物流/快递', mappedTalent: 18, confirmedTalent: 2, keyRoles: ['路由算法', '分拣控制', '数据平台'], talentSupply: 'scarce', reachableCount: 3 },
];

export interface TalentGapAnalysis {
  role: string;
  demand: number;
  supply: number;
  gap: number;
  scarcity: 'critical' | 'high' | 'moderate' | 'low';
  avgCost: number;
  avgCycle: number;
}

export const talentGapAnalysis: TalentGapAnalysis[] = [
  { role: '高级前端工程师', demand: 5, supply: 12, gap: 0, scarcity: 'low', avgCost: 3200, avgCycle: 18 },
  { role: 'Java后端开发', demand: 8, supply: 15, gap: 0, scarcity: 'low', avgCost: 3500, avgCycle: 20 },
  { role: '算法工程师', demand: 4, supply: 3, gap: 1, scarcity: 'critical', avgCost: 5200, avgCycle: 35 },
  { role: '大客户销售', demand: 6, supply: 4, gap: 2, scarcity: 'critical', avgCost: 4800, avgCycle: 28 },
  { role: '供应链分析师', demand: 3, supply: 2, gap: 1, scarcity: 'high', avgCost: 4100, avgCycle: 32 },
  { role: '产品经理', demand: 3, supply: 8, gap: 0, scarcity: 'low', avgCost: 3600, avgCycle: 22 },
  { role: 'UI/UX设计师', demand: 2, supply: 6, gap: 0, scarcity: 'low', avgCost: 3000, avgCycle: 16 },
  { role: 'HRBP', demand: 2, supply: 3, gap: 0, scarcity: 'moderate', avgCost: 2800, avgCycle: 25 },
];

// AI 洞察
export const talentAiInsight = {
  summary: '当前目标公司人才池中，算法工程师和大客户销售供给严重不足，供给缺口合计3人。建议：①启动猎头定向挖猎算法人才，预算需上调至5200元/人；②对供应链分析师岗位考虑放宽5年以上经验要求扩大漏斗；③字节跳动和阿里巴巴人才储备丰富，建议优先触达。',
  suggestion: '本周可触达字节跳动架构师3人、阿里巴巴搜索推荐专家2人，建议HRBP本周内完成初步接触。',
};

// ---------- 审批与风险 ----------
export type ApprovalType = 'requisition' | 'offer' | 'budget' | 'overdue' | 'feedback' | 'expiring';

export interface ApprovalItem {
  id: string;
  type: ApprovalType;
  title: string;
  department: string;
  applicant: string;
  submittedAt: string;
  urgency: 'urgent' | 'normal' | 'low';
  detail: string;
  amount?: number;
  daysRemaining?: number;
}

export const approvalItems: ApprovalItem[] = [
  { id: 'appr-1', type: 'requisition', title: '供应链管理部新增仓储主管', department: '供应链管理部', applicant: '赵雪', submittedAt: '2026-07-18', urgency: 'urgent', detail: '申请新增仓储主管HC 1人，预算范围8K-12K/月', amount: 12000 },
  { id: 'appr-2', type: 'requisition', title: '技术研发部新增安全工程师', department: '技术研发部', applicant: '张敏', submittedAt: '2026-07-17', urgency: 'normal', detail: '申请新增安全工程师HC 1人，预算范围15K-25K/月', amount: 25000 },
  { id: 'appr-3', type: 'requisition', title: '市场运营部新增内容运营', department: '市场运营部', applicant: '陈芳', submittedAt: '2026-07-16', urgency: 'normal', detail: '申请新增内容运营专员HC 1人，预算范围8K-12K/月', amount: 12000 },
  { id: 'appr-4', type: 'requisition', title: '销售业务部扩编渠道销售', department: '销售业务部', applicant: '刘洋', submittedAt: '2026-07-15', urgency: 'low', detail: '申请渠道销售主管HC从2人扩至3人', amount: 18000 },
  { id: 'appr-5', type: 'offer', title: '王建国 — 高级前端工程师', department: '技术研发部', applicant: '张敏', submittedAt: '2026-07-18', urgency: 'urgent', detail: 'Offer薪资22K/月，候选人要求3日内回复', amount: 22000 },
  { id: 'appr-6', type: 'offer', title: '李思远 — Java后端开发', department: '技术研发部', applicant: '张敏', submittedAt: '2026-07-17', urgency: 'normal', detail: 'Offer薪资28K/月，含3个月年终奖', amount: 28000 },
  { id: 'appr-7', type: 'offer', title: '陈晓 — 产品经理', department: '产品设计部', applicant: '王磊', submittedAt: '2026-07-16', urgency: 'normal', detail: 'Offer薪资25K/月，候选人要求加期权', amount: 25000 },
  { id: 'appr-8', type: 'budget', title: '算法工程师猎头费超预算', department: '技术研发部', applicant: '张敏', submittedAt: '2026-07-18', urgency: 'urgent', detail: '猎头推荐费超出预算5200元，需追加审批', amount: 5200 },
  { id: 'appr-9', type: 'budget', title: '大客户销售招聘预算超支', department: '销售业务部', applicant: '刘洋', submittedAt: '2026-07-15', urgency: 'normal', detail: '招聘渠道费用超出预算3500元', amount: 3500 },
  { id: 'appr-10', type: 'overdue', title: '供应链分析师岗位', department: '供应链管理部', applicant: '张敏', submittedAt: '2026-05-12', urgency: 'urgent', detail: '已开放68天，面试仅1人，需决策是否调整策略', daysRemaining: -8 },
  { id: 'appr-11', type: 'overdue', title: '大客户销售岗位', department: '销售业务部', applicant: '刘洋', submittedAt: '2026-05-20', urgency: 'urgent', detail: '已开放60天，7人面试3人阻塞，薪资不匹配严重', daysRemaining: 0 },
  { id: 'appr-12', type: 'overdue', title: '市场运营经理岗位', department: '市场运营部', applicant: '陈芳', submittedAt: '2026-05-25', urgency: 'urgent', detail: '已开放55天，岗位要求过高需调整JD', daysRemaining: 5 },
  { id: 'appr-13', type: 'feedback', title: '张伟 — 二面反馈超时', department: '技术研发部', applicant: '周明辉', submittedAt: '2026-07-17', urgency: 'urgent', detail: '面试完成48小时未提交反馈，影响候选人体验', daysRemaining: -1 },
  { id: 'appr-14', type: 'feedback', title: '刘芳 — 终面反馈超时', department: '产品设计部', applicant: '王磊', submittedAt: '2026-07-16', urgency: 'normal', detail: '面试完成36小时未提交反馈', daysRemaining: 0 },
  { id: 'appr-15', type: 'expiring', title: '市场运营经理', department: '市场运营部', applicant: '陈芳', submittedAt: '2026-05-25', urgency: 'urgent', detail: '岗位Deadline 7月30日，仅余11天，当前0入职', daysRemaining: 11 },
  { id: 'appr-16', type: 'expiring', title: '大客户销售', department: '销售业务部', applicant: '刘洋', submittedAt: '2026-05-20', urgency: 'urgent', detail: '岗位Deadline 7月25日，仅余6天，填满率25%', daysRemaining: 6 },
  { id: 'appr-17', type: 'expiring', title: '供应链分析师', department: '供应链管理部', applicant: '张敏', submittedAt: '2026-05-12', urgency: 'urgent', detail: '岗位Deadline已过(7月20日)，至今零入职', daysRemaining: -1 },
];

// AI 风险洞察
export const riskAiInsight = {
  summary: '当前共17项待处理审批与风险事项，其中紧急项8项。最严重的问题是供应链分析师岗位已超期且零入职，建议立即召开跨部门Review会议。同时3个岗位即将到期，需优先关注。面试反馈超时问题已影响候选人体验，建议对面试官设置24小时反馈SLA。',
  alerts: [
    { type: 'danger' as const, text: '供应链分析师岗位Deadline已过且零入职 — 立即处理！', drillKey: 'overdue' },
    { type: 'warning' as const, text: '3个岗位Deadline即将到期（≤11天），需加速推进', drillKey: 'expiring' },
    { type: 'warning' as const, text: '技术研发部二面反馈超时48小时，影响候选人体验', drillKey: 'feedback' },
  ],
};