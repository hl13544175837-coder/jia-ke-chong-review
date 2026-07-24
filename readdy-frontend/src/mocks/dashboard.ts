import { candidateList } from './candidates';
import { requisitions } from './jobs';
import { offers } from './offers';
import { interviews, interviewerPool } from './interviews';

export const currentUser = {
  id: 'u1',
  name: '张敏',
  email: 'zhangmin@company.com',
  role: 'recruiter',
  roleLabel: '招聘专员',
  department: '人力资源部',
};

const THIS_WEEK_START = '2026-07-09';

// ===== 数据范围标签（按角色） =====
export const scopeLabels: Record<string, string> = {
  recruiter: '我的',
  manager: '团队',
  interviewer: '分配给我的',
};

// ===== 角色感知的岗位匹配辅助函数 =====
function normalizePosition(s: string) {
  return s.replace(/高级|资深|助理|初级|实习/g, '').trim();
}

function matchCandidateToRequisition(candidatePosition: string) {
  const normPos = normalizePosition(candidatePosition);
  let match = requisitions.find((r) => {
    const normName = normalizePosition(r.name);
    const normTitle = normalizePosition(r.title);
    return normPos === normName || normPos === normTitle
      || normName.includes(normPos) || normPos.includes(normName)
      || normTitle.includes(normPos) || normPos.includes(normTitle);
  });
  if (!match && normPos.includes('前端')) {
    match = requisitions.find((r) => normalizePosition(r.name).includes('前端') || normalizePosition(r.title).includes('前端'));
  }
  if (!match && normPos.includes('后端')) {
    match = requisitions.find((r) => normalizePosition(r.name).includes('后端') || normalizePosition(r.title).includes('后端'));
  }
  if (!match && normPos.includes('UI')) {
    match = requisitions.find((r) => normalizePosition(r.name).includes('UI') || normalizePosition(r.title).includes('UI'));
  }
  if (!match && normPos.includes('测试')) {
    match = requisitions.find((r) => normalizePosition(r.name).includes('测试') || normalizePosition(r.title).includes('测试'));
  }
  if (!match && normPos.includes('产品')) {
    match = requisitions.find((r) => normalizePosition(r.name).includes('产品') || normalizePosition(r.title).includes('产品'));
  }
  if (!match && normPos.includes('数据')) {
    match = requisitions.find((r) => normalizePosition(r.name).includes('数据') || normalizePosition(r.title).includes('数据'));
  }
  if (!match && normPos.includes('市场')) {
    match = requisitions.find((r) => normalizePosition(r.name).includes('市场') || normalizePosition(r.title).includes('市场'));
  }
  if (!match && normPos.includes('HRBP')) {
    match = requisitions.find((r) => normalizePosition(r.name).includes('HRBP') || normalizePosition(r.title).includes('HRBP'));
  }
  return match || null;
}

// ===== 统计卡片（带数据范围） =====
export interface StatCard {
  id: number;
  label: string;
  scopeLabel: string;
  value: number;
  suffix?: string;
  change: string;
  changeType: 'up' | 'down' | 'neutral';
  icon: string;
  color: 'primary' | 'accent' | 'secondary';
  link: string;
  linkState?: Record<string, unknown>;
}

export function getStatsCards(role: string): StatCard[] {
  const scopeLabel = scopeLabels[role] || '全部';

  const cards: StatCard[] = [
    {
      id: 1,
      label: '在招岗位',
      scopeLabel: role === 'recruiter' ? `${scopeLabel}负责` : scopeLabel,
      value: role === 'recruiter'
        ? requisitions.filter(r => r.owner === '张敏' && r.statusCode === 'active').length
        : requisitions.filter(r => r.statusCode === 'active').length,
      change: '+1',
      changeType: 'up',
      icon: 'ri-briefcase-line',
      color: 'primary',
      link: '/jobs',
    },
    {
      id: 2,
      label: '本周新增简历',
      scopeLabel: scopeLabel,
      value: candidateList.filter(c => c.appliedAt >= THIS_WEEK_START).length,
      change: '+3',
      changeType: 'up',
      icon: 'ri-user-add-line',
      color: 'accent',
      link: '/candidates',
    },
  ];

  // 面试官角色添加面试事项卡片
  if (role === 'interviewer') {
    const myInterviews = interviews.filter(
      iv => (iv.interviewerId === 'iv5' || iv.interviewer === '周明辉') && iv.status === '待面试'
    );
    cards.push({
      id: 5,
      label: '待面试',
      scopeLabel: scopeLabel,
      value: myInterviews.length,
      suffix: ' 场',
      change: myInterviews.length > 0 ? `+${myInterviews.length}` : '0',
      changeType: 'up',
      icon: 'ri-calendar-check-line',
      color: 'accent',
      link: '/dashboard/interviews',
      linkState: { tab: '待面试' },
    });
  }

  cards.push(
    {
      id: 3,
      label: '本月Offer数',
      scopeLabel: scopeLabel,
      value: candidateList.filter(c => c.stage === 'Offer发放中').length,
      change: '+1',
      changeType: 'up',
      icon: 'ri-mail-send-line',
      color: 'secondary',
      link: '/dashboard/offers',
    },
    {
      id: 4,
      label: '本月已入职',
      scopeLabel: scopeLabel,
      value: candidateList.filter(c => c.stage === '已入职' || c.stage === '正式到岗中').length,
      change: '+1',
      changeType: 'up',
      icon: 'ri-team-line',
      color: 'primary',
      link: '/dashboard/hired',
    },
  );

  return cards;
}

// ===== 待办项类型 =====
export interface TodoItem {
  candidateId: number;
  candidateName: string;
  position: string;
  requisitionTitle: string;
  requisitionId: string;
  nextAction: string;
  targetPage: string;
  targetState: Record<string, unknown>;
  deadline: string; // YYYY-MM-DD
}

export interface TodoGroup {
  id: string;
  type: 'demand' | 'screening' | 'interview_arrange' | 'interview_feedback' | 'offer' | 'onboarding';
  priority: 'high' | 'normal' | 'low';
  icon: string;
  label: string;
  description: string;
  items: TodoItem[];
}

// ===== 精简优先级待办（按招聘专员真实节奏排序） =====
const TODAY = '2026-07-21';

export interface PriorityTodo {
  key: string;
  category: string;
  categoryIcon: string;
  accent: 'urgent' | 'high' | 'normal';
  candidateId: number;
  candidateName: string;
  title: string;
  detail: string;
  meta: string;
  targetPage: string;
  targetState: Record<string, unknown>;
}

function roundTab(stage: string): string {
  if (stage === '一面') return '一面';
  if (stage === '二面') return '二面';
  if (stage === '三面') return '三面';
  return '其他';
}

export function getPrioritizedTodos(role: string): PriorityTodo[] {
  const todos: PriorityTodo[] = [];

  // ============ 面试官视角 ============
  if (role === 'interviewer') {
    const mine = interviews.filter(iv => iv.interviewerId === 'iv5');
    mine.filter(iv => iv.status === '待面试' && iv.scheduledAt.startsWith(TODAY)).forEach(iv => {
      todos.push({
        key: `iv-today-${iv.id}`,
        category: '今天面试',
        categoryIcon: iv.type.includes('视频') ? 'ri-vidicon-line' : 'ri-user-voice-line',
        accent: 'urgent',
        candidateId: 0,
        candidateName: iv.candidateName,
        title: `${iv.candidateName} · ${iv.position}`,
        detail: `${iv.stage}面试 · ${iv.type} · ${iv.location}`,
        meta: `今天 ${iv.scheduledAt.slice(11)}`,
        targetPage: '/dashboard/interviews',
        targetState: { fromDashboard: true, tab: roundTab(iv.stage), openDetail: true },
      });
    });
    mine.filter(iv => iv.status === '待面试反馈').forEach(iv => {
      todos.push({
        key: `iv-score-${iv.id}`,
        category: '待我评分',
        categoryIcon: 'ri-edit-box-line',
        accent: 'high',
        candidateId: 0,
        candidateName: iv.candidateName,
        title: `${iv.candidateName} · ${iv.position}`,
        detail: `${iv.stage}已完成，请尽快提交面试评分`,
        meta: iv.scheduledAt ? iv.scheduledAt.slice(5, 10) : '',
        targetPage: '/dashboard/interviews',
        targetState: { fromDashboard: true, tab: roundTab(iv.stage), openDetail: true },
      });
    });
    mine.filter(iv => iv.status === '待面试' && !iv.scheduledAt.startsWith(TODAY)).forEach(iv => {
      todos.push({
        key: `iv-upcoming-${iv.id}`,
        category: '近期面试',
        categoryIcon: 'ri-calendar-2-line',
        accent: 'normal',
        candidateId: 0,
        candidateName: iv.candidateName,
        title: `${iv.candidateName} · ${iv.position}`,
        detail: `${iv.stage}面试 · ${iv.type} · ${iv.location}`,
        meta: iv.scheduledAt.slice(5, 16),
        targetPage: '/dashboard/interviews',
        targetState: { fromDashboard: true, tab: roundTab(iv.stage), openDetail: true },
      });
    });
    return todos;
  }

  // ============ 招聘专员视角（张敏） ============
  const myInterviews = interviews.filter(iv => iv.recruiter === '张敏');

  // 1) 今天面试 —— 最紧急
  myInterviews
    .filter(iv => iv.status === '待面试' && iv.scheduledAt.startsWith(TODAY))
    .forEach(iv => {
      todos.push({
        key: `today-${iv.id}`,
        category: '今天面试',
        categoryIcon: iv.type.includes('视频') ? 'ri-vidicon-line' : 'ri-user-voice-line',
        accent: 'urgent',
        candidateId: iv.id,
        candidateName: iv.candidateName,
        title: `${iv.candidateName} · ${iv.position}`,
        detail: `${iv.stage} · ${iv.interviewer}（${iv.interviewerRole}）· ${iv.type}`,
        meta: `今天 ${iv.scheduledAt.slice(11)}`,
        targetPage: '/dashboard/interviews',
        targetState: { fromDashboard: true, tab: roundTab(iv.stage), candidateName: iv.candidateName, openDetail: true },
      });
    });

  // 2) 面试待处理结果
  myInterviews
    .filter(iv => iv.status === '待处理结果')
    .forEach(iv => {
      todos.push({
        key: `result-${iv.id}`,
        category: '待处理结果',
        categoryIcon: 'ri-clipboard-line',
        accent: 'high',
        candidateId: iv.id,
        candidateName: iv.candidateName,
        title: `${iv.candidateName} · ${iv.position}`,
        detail: `${iv.stage}已评分（${iv.overall}），待确认是否推进下一轮`,
        meta: `${iv.interviewer} · ${iv.interviewerRole}`,
        targetPage: '/dashboard/interviews',
        targetState: { fromDashboard: true, tab: '其他', candidateName: iv.candidateName, openDetail: true },
      });
    });

  // 3) 面试待反馈
  myInterviews
    .filter(iv => iv.status === '待面试反馈')
    .forEach(iv => {
      todos.push({
        key: `feedback-${iv.id}`,
        category: '待面试反馈',
        categoryIcon: 'ri-chat-check-line',
        accent: 'high',
        candidateId: iv.id,
        candidateName: iv.candidateName,
        title: `${iv.candidateName} · ${iv.position}`,
        detail: `${iv.stage}已完成，待面试官 ${iv.interviewer} 提交评分`,
        meta: iv.scheduledAt ? iv.scheduledAt.slice(5, 10) : '',
        targetPage: '/dashboard/interviews',
        targetState: { fromDashboard: true, tab: '其他', candidateName: iv.candidateName, openDetail: true },
      });
    });

  // 4) Offer / 谈薪
  candidateList
    .filter(c => ['Offer发放中', '谈薪中', '沟通中'].includes(c.stage))
    .slice(0, 3)
    .forEach(c => {
      const req = matchCandidateToRequisition(c.position);
      const action = c.stage === 'Offer发放中'
        ? 'Offer 已发放，待候选人确认回复'
        : c.stage === '谈薪中'
        ? '正在谈薪，待推进薪资协商'
        : '面试通过，待沟通入职意向';
      todos.push({
        key: `offer-${c.id}`,
        category: 'Offer / 谈薪',
        categoryIcon: 'ri-mail-send-line',
        accent: 'high',
        candidateId: c.id,
        candidateName: c.name,
        title: `${c.name} · ${c.position}`,
        detail: action,
        meta: req?.title || c.position,
        targetPage: '/dashboard/offers',
        targetState: { fromDashboard: true, candidateName: c.name, candidateId: c.id },
      });
    });

  // 5) 新简历待筛选
  candidateList
    .filter(c => c.stage === '待筛选')
    .slice(0, 3)
    .forEach(c => {
      const req = matchCandidateToRequisition(c.position);
      todos.push({
        key: `screen-${c.id}`,
        category: '待筛选简历',
        categoryIcon: 'ri-file-search-line',
        accent: 'normal',
        candidateId: c.id,
        candidateName: c.name,
        title: `${c.name} · ${c.position}`,
        detail: `新简历待筛选，评估是否进入面试流程`,
        meta: req?.title || c.position,
        targetPage: '/candidates',
        targetState: { fromDashboard: true, candidateId: c.id, candidateName: c.name },
      });
    });

  // 6) 待安排面试
  candidateList
    .filter(c => c.stage === '初筛通过')
    .slice(0, 3)
    .forEach(c => {
      const req = matchCandidateToRequisition(c.position);
      todos.push({
        key: `arrange-${c.id}`,
        category: '待安排面试',
        categoryIcon: 'ri-calendar-schedule-line',
        accent: 'normal',
        candidateId: c.id,
        candidateName: c.name,
        title: `${c.name} · ${c.position}`,
        detail: `已通过初筛，待安排一面面试官与时间`,
        meta: req?.title || c.position,
        targetPage: '/dashboard/interviews',
        targetState: { fromDashboard: true, tab: '待安排', candidateName: c.name, candidateId: c.id, openDetail: true },
      });
    });

  return todos;
}

export function getPendingTodos(role: string): TodoGroup[] {
  const groups: TodoGroup[] = [];

  // ===== 1. 需求处理：待确认/审批的招聘需求 =====
  const pendingReqs = requisitions.filter(r => r.statusCode === 'pending');
  if (pendingReqs.length > 0) {
    groups.push({
      id: 'demand',
      type: 'demand',
      priority: 'high',
      icon: 'ri-file-list-3-line',
      label: '待确认招聘需求',
      description: '有招聘需求等待审批确认，请尽快处理',
      items: pendingReqs.map(r => ({
        candidateId: 0,
        candidateName: '',
        position: r.title,
        requisitionTitle: r.title,
        requisitionId: r.id,
        nextAction: `需求待审批：${r.department}部门申请 ${r.title} HC ${r.headcount}人`,
        targetPage: '/jobs',
        targetState: { openTitle: r.title, tab: 'pending' },
        deadline: r.id === 'REQ-20260701-TEST456' ? '2026-07-22' : '2026-07-20',
      })),
    });
  }

  // ===== 2. 候选人筛选：待筛选简历 =====
  const screeningCandidates = candidateList.filter(c => c.stage === '待筛选');
  if (screeningCandidates.length > 0) {
    const screeningItems: TodoItem[] = screeningCandidates.slice(0, 6).map((c, idx) => {
      const req = matchCandidateToRequisition(c.position);
      return {
        candidateId: c.id,
        candidateName: c.name,
        position: c.position,
        requisitionTitle: req?.title || c.position,
        requisitionId: req?.id || '',
        nextAction: req
          ? `请筛选「${c.name}」的简历，应聘 ${req.title}，投递于 ${c.appliedAt}`
          : `请筛选「${c.name}」的简历，应聘 ${c.position}，投递于 ${c.appliedAt}`,
        targetPage: '/candidates',
        targetState: { fromDashboard: true, candidateId: c.id, candidateName: c.name },
        deadline: idx < 2 ? '2026-07-20' : idx < 4 ? '2026-07-21' : '2026-07-22',
      };
    });
    groups.push({
      id: 'screening',
      type: 'screening',
      priority: 'high',
      icon: 'ri-file-search-line',
      label: '待筛选简历',
      description: screeningItems.length > 5
        ? `共${screeningCandidates.length}份新简历需筛选，显示前${screeningItems.length}份`
        : `${screeningCandidates.length}份新简历需要筛选`,
      items: screeningItems,
    });
  }

  // ===== 3. 面试安排：初筛通过待安排面试 =====
  const arrangeCandidates = candidateList.filter(c => c.stage === '初筛通过');
  if (arrangeCandidates.length > 0) {
    const arrangeItems: TodoItem[] = arrangeCandidates.slice(0, 4).map((c, idx) => {
      const req = matchCandidateToRequisition(c.position);
      return {
        candidateId: c.id,
        candidateName: c.name,
        position: c.position,
        requisitionTitle: req?.title || c.position,
        requisitionId: req?.id || '',
        nextAction: req
          ? `「${c.name}」已通过初筛，请为 ${req.title} 岗位安排一面面试官和时间`
          : `「${c.name}」已通过初筛，请安排一面面试`,
        targetPage: '/dashboard/interviews',
        targetState: { fromDashboard: true, tab: '待安排', candidateName: c.name, candidateId: c.id },
        deadline: idx < 2 ? '2026-07-21' : '2026-07-22',
      };
    });
    groups.push({
      id: 'interview_arrange',
      type: 'interview_arrange',
      priority: 'high',
      icon: 'ri-calendar-schedule-line',
      label: '待安排面试',
      description: arrangeItems.length > 3
        ? `共${arrangeCandidates.length}位候选人待安排面试，显示前${arrangeItems.length}位`
        : `${arrangeCandidates.length}位候选人待安排面试`,
      items: arrangeItems,
    });
  }

  // ===== 4. 面试反馈：面试中待评分/跟进 =====
  const feedbackCandidates = candidateList.filter(c => ['一面', '二面', '终面'].includes(c.stage));
  if (feedbackCandidates.length > 0) {
    const feedbackItems: TodoItem[] = feedbackCandidates.slice(0, 5).map((c, idx) => {
      const req = matchCandidateToRequisition(c.position);
      return {
        candidateId: c.id,
        candidateName: c.name,
        position: c.position,
        requisitionTitle: req?.title || c.position,
        requisitionId: req?.id || '',
        nextAction: req
          ? `「${c.name}」${c.stage}已完成，请跟进面试官反馈并安排下一轮`
          : `「${c.name}」${c.stage}已完成，请跟进面试官反馈`,
        targetPage: '/dashboard/interviews',
        targetState: { fromDashboard: true, tab: '待评分', candidateName: c.name, candidateId: c.id },
        deadline: idx < 2 ? '2026-07-20' : idx < 3 ? '2026-07-21' : '2026-07-22',
      };
    });
    groups.push({
      id: 'interview_feedback',
      type: 'interview_feedback',
      priority: 'normal',
      icon: 'ri-chat-check-line',
      label: '面试反馈跟进',
      description: feedbackItems.length > 4
        ? `共${feedbackCandidates.length}位候选人面试中需跟进，显示前${feedbackItems.length}位`
        : `${feedbackCandidates.length}位候选人面试中需跟进`,
      items: feedbackItems,
    });
  }

  // ===== 5. Offer：Offer/谈薪阶段 =====
  const offerCandidates = candidateList.filter(c =>
    ['谈薪中', '沟通中', 'Offer发放中'].includes(c.stage)
  );
  if (offerCandidates.length > 0) {
    const offerItems: TodoItem[] = offerCandidates.slice(0, 4).map((c, idx) => {
      const req = matchCandidateToRequisition(c.position);
      const stageAction = c.stage === 'Offer发放中'
        ? 'Offer已发放，请跟进候选人确认'
        : c.stage === '谈薪中'
        ? '正在谈薪中，请推进薪资协商'
        : '面试通过，请与候选人沟通入职意向';
      return {
        candidateId: c.id,
        candidateName: c.name,
        position: c.position,
        requisitionTitle: req?.title || c.position,
        requisitionId: req?.id || '',
        nextAction: `「${c.name}」${c.stage}，${stageAction}`,
        targetPage: '/dashboard/offers',
        targetState: { fromDashboard: true, candidateName: c.name, candidateId: c.id },
        deadline: idx < 2 ? '2026-07-21' : '2026-07-22',
      };
    });
    groups.push({
      id: 'offer',
      type: 'offer',
      priority: 'normal',
      icon: 'ri-mail-send-line',
      label: 'Offer / 谈薪确认',
      description: offerItems.length > 3
        ? `共${offerCandidates.length}位候选人Offer阶段，显示前${offerItems.length}位`
        : `${offerCandidates.length}位候选人Offer处理中`,
      items: offerItems,
    });
  }

  // ===== 6. 入职：待到岗 =====
  const onboardingCandidates = candidateList.filter(c => c.stage === '正式到岗中');
  if (onboardingCandidates.length > 0) {
    const onboardingItems: TodoItem[] = onboardingCandidates.slice(0, 3).map((c, idx) => {
      const req = matchCandidateToRequisition(c.position);
      return {
        candidateId: c.id,
        candidateName: c.name,
        position: c.position,
        requisitionTitle: req?.title || c.position,
        requisitionId: req?.id || '',
        nextAction: req
          ? `「${c.name}」已接受Offer，跟进入职材料准备，预计入职 ${req.title} 岗位`
          : `「${c.name}」已接受Offer，请跟进入职准备`,
        targetPage: '/dashboard/hired',
        targetState: { fromDashboard: true, candidateName: c.name, candidateId: c.id },
        deadline: '2026-07-22',
      };
    });
    groups.push({
      id: 'onboarding',
      type: 'onboarding',
      priority: 'low',
      icon: 'ri-user-received-line',
      label: '入职跟进',
      description: `${onboardingCandidates.length}位候选人待入职，请跟进入职流程`,
      items: onboardingItems,
    });
  }

  return groups;
}

// ===== 旧版兼容导出（保持其他组件不报错） =====
function getCandidatesByStage(stages: string[]) {
  return candidateList
    .filter(c => stages.includes(c.stage))
    .map(c => ({
      id: c.id,
      name: c.name,
      position: c.position,
      stage: c.stage,
    }));
}

export const statsCards = getStatsCards('recruiter');

export const pendingTodos = [
  {
    id: 'screening',
    priority: 'high' as const,
    icon: 'ri-file-search-line',
    label: '待筛选简历',
    count: candidateList.filter(c => c.stage === '待筛选').length,
    candidates: getCandidatesByStage(['待筛选']),
  },
  {
    id: 'arrange',
    priority: 'high' as const,
    icon: 'ri-calendar-schedule-line',
    label: '待安排面试',
    count: candidateList.filter(c => c.stage === '初筛通过').length,
    candidates: getCandidatesByStage(['初筛通过']),
  },
  {
    id: 'followup',
    priority: 'normal' as const,
    icon: 'ri-loader-4-line',
    label: '面试跟进中',
    count: candidateList.filter(c => ['一面', '二面', '终面'].includes(c.stage)).length,
    candidates: getCandidatesByStage(['一面', '二面', '终面']),
  },
  {
    id: 'offer',
    priority: 'low' as const,
    icon: 'ri-mail-send-line',
    label: 'Offer/入职确认',
    count: candidateList.filter(c => ['终面', 'Offer发放中'].includes(c.stage)).length,
    candidates: getCandidatesByStage(['终面', 'Offer发放中']),
  },
];

// ===== 最近候选人（新投递） =====
export const recentCandidates = candidateList
  .slice()
  .sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime())
  .slice(0, 5)
  .map(c => ({
    id: c.id,
    name: c.name,
    position: c.position,
    stage: c.stage,
    stageColor: c.stageColor,
    applied: c.appliedAt,
    source: c.source,
    tags: c.tags,
  }));

// ===== 待安排面试（无具体时间） =====
export const pendingInterviews = candidateList
  .filter(c => ['初筛通过', '一面', '二面'].includes(c.stage))
  .map(c => ({
    id: c.id,
    candidate: c.name,
    position: c.position,
    currentStage: c.stage,
    nextAction: c.stage === '初筛通过' ? '安排一面' : c.stage === '一面' ? '安排二面' : '安排终面',
  }));

// ===== 简历来源分布 =====
const sourceCounts: Record<string, number> = {};
candidateList.forEach(c => {
  sourceCounts[c.source] = (sourceCounts[c.source] || 0) + 1;
});
export const sourceDistribution = Object.entries(sourceCounts).map(([name, value]) => ({ name, value }));

// ===== 阶段分布（使用与简历库一致的阶段名称） =====
const stageCounts: Record<string, number> = {};
candidateList.forEach(c => {
  stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
});
export const stageDistribution = Object.entries(stageCounts)
  .map(([name, value]) => ({ name, value }))
  .sort((a, b) => b.value - a.value);

// ===== 我的岗位进展（使用与简历库一致的阶段名称） =====
export const myPositionProgress = (() => {
  const myJobs = requisitions.filter(r => r.owner === '张敏' && r.statusCode === 'active');
  return myJobs.map(job => {
    const jobCandidates = candidateList.filter(c => {
      const jt = job.title.toLowerCase();
      const cp = c.position.toLowerCase();
      return cp.includes(jt) || jt.includes(cp) ||
        (jt.includes('前端') && cp.includes('前端')) ||
        (jt.includes('java') && cp.includes('java')) ||
        (jt.includes('ui') && cp.includes('ui')) ||
        (jt.includes('测试') && cp.includes('测试')) ||
        (jt.includes('产品') && cp.includes('产品')) ||
        (jt.includes('数据') && cp.includes('数据')) ||
        (jt.includes('设计') && cp.includes('设计')) ||
        (jt.includes('hrbp') && cp.includes('hrbp')) ||
        (jt.includes('市场') && cp.includes('市场'));
    });
    return {
      id: job.id,
      title: job.title,
      department: job.department,
      headcount: job.headcount,
      filled: job.filled,
      totalCandidates: jobCandidates.length,
      stages: {
        screening: jobCandidates.filter(c => c.stage === '待筛选').length,
        passed: jobCandidates.filter(c => c.stage === '初筛通过').length,
        interview1: jobCandidates.filter(c => c.stage === '一面').length,
        interview2: jobCandidates.filter(c => c.stage === '二面').length,
        final: jobCandidates.filter(c => c.stage === '终面').length,
        salary: jobCandidates.filter(c => c.stage === '谈薪中').length,
        communicating: jobCandidates.filter(c => c.stage === '沟通中').length,
        offer: jobCandidates.filter(c => c.stage === 'Offer发放中').length,
        onboarding: jobCandidates.filter(c => c.stage === '正式到岗中').length,
        hired: jobCandidates.filter(c => c.stage === '已入职').length,
      },
    };
  });
})();

// ===== 招聘漏斗（保留供其他页面使用） =====
export const recruitmentFunnel = [
  { stage: '简历投递', count: candidateList.length },
  { stage: '初筛通过', count: candidateList.filter(c => ['初筛通过', '一面', '二面', '终面', 'Offer发放中', '已入职', '正式到岗中'].includes(c.stage)).length },
  { stage: '面试中', count: candidateList.filter(c => ['一面', '二面', '终面'].includes(c.stage)).length },
  { stage: '终面', count: candidateList.filter(c => ['终面', 'Offer发放中', '已入职', '正式到岗中'].includes(c.stage)).length },
  { stage: 'Offer发出', count: candidateList.filter(c => ['Offer发放中', '已入职', '正式到岗中'].includes(c.stage)).length },
  { stage: '已入职', count: candidateList.filter(c => c.stage === '已入职').length },
];

// ===== 待审批需求（保留兼容） =====
export const requisitionPending = requisitions
  .filter(r => r.statusCode === 'pending')
  .map(r => ({
    id: r.id,
    department: r.department,
    position: r.title,
    headcount: r.headcount,
    urgency: r.priority,
    status: '待审批',
    submittedBy: r.owner,
    submittedAt: r.createdAt,
  }));

// ===== 兼容旧导出 =====
export const openPositions = myPositionProgress.map(j => ({
  id: parseInt(j.id.replace(/\D/g, '').slice(-6), 10) || 0,
  title: j.title,
  department: j.department,
  applicants: j.totalCandidates,
  status: 'active',
  priority: 'normal',
  posted: '2026-07-01',
  owner: '张敏',
}));

export const upcomingInterviews = pendingInterviews.slice(0, 4).map(p => ({
  id: p.id,
  candidate: p.candidate,
  position: p.position,
  interviewer: '待定',
  time: '待安排',
  type: p.nextAction,
}));

// ===== 招聘阶段分布（按业务阶段聚合） =====
export const recruitmentStageDistribution = [
  { name: '筛选', value: candidateList.filter(c => c.stage === '待筛选').length, icon: 'ri-file-search-line', bar: 'bg-secondary-400' },
  { name: '业务评审', value: candidateList.filter(c => ['初筛通过', '面试官评审中'].includes(c.stage)).length, icon: 'ri-user-star-line', bar: 'bg-accent-400' },
  { name: '面试', value: candidateList.filter(c => ['一面', '二面', '终面'].includes(c.stage)).length, icon: 'ri-chat-check-line', bar: 'bg-primary-400' },
  { name: '谈薪', value: candidateList.filter(c => ['谈薪中', '沟通中'].includes(c.stage)).length, icon: 'ri-bank-card-line', bar: 'bg-accent-500' },
  { name: 'Offer', value: candidateList.filter(c => c.stage === 'Offer发放中').length, icon: 'ri-mail-send-line', bar: 'bg-primary-500' },
  { name: '待入职', value: candidateList.filter(c => c.stage === '正式到岗中').length, icon: 'ri-user-received-line', bar: 'bg-primary-600' },
  { name: '已入职', value: candidateList.filter(c => c.stage === '已入职').length, icon: 'ri-team-line', bar: 'bg-primary-700' },
];

// ===== 面试轮次分布 =====
export const interviewRoundDistribution = [
  { name: '一面', value: candidateList.filter(c => c.stage === '一面').length, bar: 'bg-accent-400' },
  { name: '二面', value: candidateList.filter(c => c.stage === '二面').length, bar: 'bg-accent-500' },
  { name: '三面', value: candidateList.filter(c => c.stage === '三面').length, bar: 'bg-primary-500' },
  { name: '终面', value: candidateList.filter(c => c.stage === '终面').length, bar: 'bg-primary-600' },
];