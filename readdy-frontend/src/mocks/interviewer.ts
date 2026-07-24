import { interviewerPool, positionScoreDimensions } from './interviews';

export const CURRENT_INTERVIEWER = interviewerPool.find(i => i.id === 'iv5') || interviewerPool[0];

export interface InterviewerInterview {
  id: number;
  candidateName: string;
  candidateAvatar: string;
  position: string;
  stage: string;
  scheduledAt: string;
  scheduledEndAt: string;
  type: string;
  location: string;
  status: '待确认' | '待面试' | '待反馈' | '已完成';
  hasConflict?: boolean;
  jdSent: boolean;
  scorecardSent: boolean;
  lastUpdated: string;
  reqId: string;
  reqName: string;
  interviewer?: string;
  interviewerId?: string;
  scores?: Array<{ dimension: string; score: number | null; max: number; note: string }>;
  overall?: '通过' | '不通过' | null;
  feedback?: string;
}

export interface InterviewerCandidate {
  id: number;
  name: string;
  avatar: string;
  position: string;
  myRound: string;
  myEvaluation: string;
  myScore: number | null;
  currentStage: string;
  stageColor: string;
  latestActivity: string;
  finalResult: string | null;
  appliedAt: string;
  resumeSummary: string;
  skills: string[];
  experienceYears: string;
  education: string;
  timeline: Array<{ date: string; event: string; detail: string }>;
}

export interface InterviewerPosition {
  id: string;
  title: string;
  department: string;
  city: string;
  status: string;
  priority: string;
  jd: string;
  requirements: string;
  interviewProcess: string;
  focusPoints: string[];
  assignedCandidates: Array<{ id: number; name: string; avatar: string; stage: string; stageColor: string }>;
  myRole: string;
}

export const myInterviews: InterviewerInterview[] = [
  {
    id: 101,
    candidateName: '赵晓月',
    candidateAvatar: '赵',
    position: 'UI/UX设计师',
    stage: '二面',
    scheduledAt: '2026-07-19 10:00',
    scheduledEndAt: '2026-07-19 11:00',
    type: '线下面试',
    location: '总部2楼设计室',
    status: '待面试',
    jdSent: true,
    scorecardSent: false,
    lastUpdated: '2026-07-14',
    reqId: 'REQ-20260708-FF123',
    reqName: 'UI/UX设计师',
    interviewer: '周明辉',
    interviewerId: 'iv5',
  },
  {
    id: 102,
    candidateName: '孙博文',
    candidateAvatar: '孙',
    position: '前端开发工程师',
    stage: '一面',
    scheduledAt: '2026-07-17 10:00',
    scheduledEndAt: '2026-07-17 11:00',
    type: '线下面试',
    location: '总部3楼会议室B',
    status: '已完成',
    jdSent: true,
    scorecardSent: true,
    lastUpdated: '2026-07-17 14:00',
    reqId: 'REQ-20260710-XYZ789',
    reqName: '前端开发工程师',
    interviewer: '周明辉',
    interviewerId: 'iv5',
    scores: [
      { dimension: '技术深度', score: 9, max: 10, note: 'React源码级别理解，能清晰解释Fiber架构和并发模式' },
      { dimension: '编码能力', score: 8, max: 10, note: '现场编写的组件结构清晰，TypeScript类型定义完善' },
      { dimension: '架构思维', score: 8, max: 10, note: '对前端架构分层有较好理解，但对微前端实践经验偏少' },
      { dimension: '工程化能力', score: 9, max: 10, note: '熟悉Webpack/Vite配置，有自建组件库经验' },
      { dimension: '协作能力', score: 9, max: 10, note: '表达清晰，能有效沟通技术方案，有跨团队协作案例' },
      { dimension: '学习能力', score: 8, max: 10, note: '关注前端前沿，但对Rust/WASM等新技术了解较浅' },
    ],
    overall: '通过',
    feedback: '技术扎实，React和Vue都有深度经验，沟通能力好，建议推进二面。需要重点关注架构设计能力在实际项目中的深度。',
  },
  {
    id: 103,
    candidateName: '陈伟',
    candidateAvatar: '陈',
    position: '前端开发工程师',
    stage: '一面',
    scheduledAt: '2026-07-22 14:00',
    scheduledEndAt: '2026-07-22 15:00',
    type: '视频面试',
    location: '腾讯会议',
    status: '待确认',
    jdSent: true,
    scorecardSent: false,
    lastUpdated: '2026-07-18',
    reqId: 'REQ-20260710-XYZ789',
    reqName: '前端开发工程师',
    interviewer: '周明辉',
    interviewerId: 'iv5',
  },
  {
    id: 104,
    candidateName: '郑宇航',
    candidateAvatar: '郑',
    position: '高级前端工程师',
    stage: '二面',
    scheduledAt: '2026-07-25 09:00',
    scheduledEndAt: '2026-07-25 10:00',
    type: '线下面试',
    location: '总部3楼会议室A',
    status: '待面试',
    jdSent: true,
    scorecardSent: true,
    lastUpdated: '2026-07-18',
    reqId: 'REQ-20260710-XYZ789',
    reqName: '前端开发工程师',
    interviewer: '周明辉',
    interviewerId: 'iv5',
  },
  {
    id: 105,
    candidateName: '苏浩宇',
    candidateAvatar: '苏',
    position: '前端开发工程师',
    stage: '一面',
    scheduledAt: '2026-07-23 15:00',
    scheduledEndAt: '2026-07-23 16:00',
    type: '线下面试',
    location: '总部3楼会议室B',
    status: '待面试',
    jdSent: true,
    scorecardSent: true,
    lastUpdated: '2026-07-17',
    reqId: 'REQ-20260710-XYZ789',
    reqName: '前端开发工程师',
    interviewer: '周明辉',
    interviewerId: 'iv5',
  },
  {
    id: 106,
    candidateName: '马晓峰',
    candidateAvatar: '马',
    position: '高级前端工程师',
    stage: '二面',
    scheduledAt: '2026-07-20 15:00',
    scheduledEndAt: '2026-07-20 16:00',
    type: '视频面试',
    location: '飞书会议',
    status: '待面试',
    jdSent: true,
    scorecardSent: true,
    lastUpdated: '2026-07-17',
    reqId: 'REQ-20260710-XYZ789',
    reqName: '前端开发工程师',
    interviewer: '周明辉',
    interviewerId: 'iv5',
  },
  {
    id: 107,
    candidateName: '许嘉怡',
    candidateAvatar: '许',
    position: '前端开发工程师',
    stage: '一面',
    scheduledAt: '2026-07-24 10:00',
    scheduledEndAt: '2026-07-24 11:00',
    type: '线下面试',
    location: '总部3楼会议室A',
    status: '待确认',
    jdSent: false,
    scorecardSent: false,
    lastUpdated: '2026-07-18',
    reqId: 'REQ-20260710-XYZ789',
    reqName: '前端开发工程师',
    interviewer: '周明辉',
    interviewerId: 'iv5',
  },
  {
    id: 108,
    candidateName: '王浩然',
    candidateAvatar: '王',
    position: '后端开发工程师',
    stage: '三面',
    scheduledAt: '2026-07-18 14:00',
    scheduledEndAt: '2026-07-18 15:00',
    type: '线下面试',
    location: '总部3楼会议室C',
    status: '待反馈',
    jdSent: true,
    scorecardSent: true,
    lastUpdated: '2026-07-18 15:30',
    reqId: 'REQ-20260610-GG345',
    reqName: '后端开发工程师',
    interviewer: '周明辉',
    interviewerId: 'iv5',
  },
];

export const myCandidates: InterviewerCandidate[] = [
  {
    id: 1,
    name: '孙博文',
    avatar: '孙',
    position: '前端开发工程师',
    myRound: '一面',
    myEvaluation: '技术扎实，React源码级理解，编码规范好。沟通清晰有逻辑，推荐通过。',
    myScore: 8.5,
    currentStage: '二面',
    stageColor: 'bg-accent-100 text-accent-700',
    latestActivity: '二面已安排，面试官：赵永刚（Java技术专家），时间：7月21日',
    finalResult: null,
    appliedAt: '2026-07-05',
    resumeSummary: '5年前端开发经验，精通React/Vue双栈，有组件库搭建和开源贡献经验。上家负责核心交易链路前端重构，加载速度提升50%。',
    skills: ['React', 'TypeScript', 'Vue', 'Webpack', 'Node.js'],
    experienceYears: '5年',
    education: '全日制本科 · 华中科技大学',
    timeline: [
      { date: '2026-07-05', event: '简历入库', detail: '内部推荐渠道投递，推荐人周明辉（前端架构师）' },
      { date: '2026-07-05', event: 'AI初筛通过', detail: '岗位匹配度评分95分' },
      { date: '2026-07-08', event: '面试安排', detail: '一面安排：面试官周明辉（前端架构师），7月17日 10:00' },
      { date: '2026-07-17', event: '我完成面试', detail: '完成一面面试，评分8.5/10，评价：技术扎实推荐通过' },
      { date: '2026-07-17', event: '进入二面', detail: '综合评审通过，进入二面' },
    ],
  },
  {
    id: 2,
    name: '陈伟',
    avatar: '陈',
    position: '前端开发工程师',
    myRound: '一面（待面试）',
    myEvaluation: '待面试',
    myScore: null,
    currentStage: '一面',
    stageColor: 'bg-accent-100 text-accent-700',
    latestActivity: '面试已安排，7月22日 14:00 视频面试',
    finalResult: null,
    appliedAt: '2026-07-14',
    resumeSummary: '3年前端开发经验，Vue技术栈为主，React经验较少但有学习意愿。有活动页面和营销工具开发经验。',
    skills: ['Vue', 'JavaScript', 'CSS', '微信小程序'],
    experienceYears: '3年',
    education: '本科 · 南京邮电大学',
    timeline: [
      { date: '2026-07-14', event: '简历入库', detail: 'HR从拉勾网下载简历导入系统' },
      { date: '2026-07-14', event: 'AI初筛通过', detail: '岗位匹配度评分76分' },
      { date: '2026-07-18', event: '面试安排', detail: '一面安排：面试官周明辉（前端架构师），7月22日 14:00' },
    ],
  },
  {
    id: 3,
    name: '苏浩宇',
    avatar: '苏',
    position: '前端开发工程师',
    myRound: '一面（待面试）',
    myEvaluation: '待面试',
    myScore: null,
    currentStage: '一面',
    stageColor: 'bg-accent-100 text-accent-700',
    latestActivity: '面试已安排，7月23日 15:00 总部3楼会议室B',
    finalResult: null,
    appliedAt: '2026-07-12',
    resumeSummary: '5年前端开发经验，有大型B端产品开发经验。React+TypeScript技术栈，注重代码质量与工程化建设。',
    skills: ['React', 'TypeScript', '微前端', 'Webpack', 'Node.js'],
    experienceYears: '5年',
    education: '全日制本科 · 合肥工业大学',
    timeline: [
      { date: '2026-07-12', event: '简历入库', detail: '系统从外部收录入库' },
      { date: '2026-07-12', event: 'AI初筛通过', detail: '岗位匹配度评分82分' },
      { date: '2026-07-16', event: '面试安排', detail: '一面安排：面试官周明辉（前端架构师），7月23日 15:00' },
    ],
  },
  {
    id: 4,
    name: '郑宇航',
    avatar: '郑',
    position: '高级前端工程师',
    myRound: '二面（待面试）',
    myEvaluation: '待面试',
    myScore: null,
    currentStage: '二面',
    stageColor: 'bg-accent-100 text-accent-700',
    latestActivity: '一面已通过（陈志强），二面已安排：7月25日 09:00',
    finalResult: null,
    appliedAt: '2026-07-13',
    resumeSummary: '6年前端开发经验，精通React全家桶与工程化建设，有大型B端中台产品开发经验。主导过微前端架构落地。',
    skills: ['React', 'TypeScript', 'Node.js', 'Webpack', '微前端'],
    experienceYears: '6年',
    education: '全日制本科 · 北京邮电大学',
    timeline: [
      { date: '2026-07-13', event: '简历入库', detail: '猎头公司推荐' },
      { date: '2026-07-13', event: 'AI初筛通过', detail: '岗位匹配度评分88分' },
      { date: '2026-07-18', event: '一面完成', detail: '面试官：陈志强（技术总监），评分8.2，通过' },
      { date: '2026-07-18', event: '进入二面', detail: '二面安排：面试官周明辉（前端架构师），7月25日 09:00' },
    ],
  },
  {
    id: 5,
    name: '马晓峰',
    avatar: '马',
    position: '高级前端工程师',
    myRound: '二面（待面试）',
    myEvaluation: '待面试',
    myScore: null,
    currentStage: '二面',
    stageColor: 'bg-accent-100 text-accent-700',
    latestActivity: '一面已通过（陈志强），二面已安排：7月20日 15:00 飞书视频面试',
    finalResult: null,
    appliedAt: '2026-07-16',
    resumeSummary: '4年前端开发经验，全栈偏前端，有跨端开发和小程序经验。熟悉Vue和React双栈。',
    skills: ['Vue', 'React', '小程序', 'Uni-app', 'WebSocket'],
    experienceYears: '4年',
    education: '非全日制本科 · 电子科技大学',
    timeline: [
      { date: '2026-07-16', event: '简历入库', detail: '内部推荐投递' },
      { date: '2026-07-16', event: 'AI初筛通过', detail: '岗位匹配度评分74分' },
      { date: '2026-07-17', event: '一面完成', detail: '面试官：陈志强（技术总监），评分7.5，通过' },
      { date: '2026-07-17', event: '进入二面', detail: '二面安排：面试官周明辉（前端架构师），7月20日 15:00' },
    ],
  },
  {
    id: 6,
    name: '王浩然',
    avatar: '王',
    position: '后端开发工程师',
    myRound: '三面',
    myEvaluation: '待提交反馈',
    myScore: null,
    currentStage: '三面',
    stageColor: 'bg-accent-100 text-accent-700',
    latestActivity: '一面通过（陈志强），二面通过（赵永刚），三面完成等待我提交反馈（7月18日）',
    finalResult: null,
    appliedAt: '2026-07-10',
    resumeSummary: '5年Java后端经验，阿里P6背景。技术基础扎实，系统设计能力突出，对分布式系统有深入理解。',
    skills: ['Java', 'Spring Boot', 'MySQL', 'Redis', 'Kafka', '微服务'],
    experienceYears: '5年',
    education: '全日制本科 · 同济大学',
    timeline: [
      { date: '2026-07-10', event: '简历入库', detail: '猎头公司推荐' },
      { date: '2026-07-12', event: '一面完成', detail: '面试官：陈志强（技术总监），评分8.5，通过' },
      { date: '2026-07-15', event: '二面完成', detail: '面试官：赵永刚（Java技术专家），评分8.1，通过' },
      { date: '2026-07-18', event: '我完成三面', detail: '三面面试完成，等待我提交反馈' },
    ],
  },
  {
    id: 7,
    name: '许嘉怡',
    avatar: '许',
    position: '前端开发工程师',
    myRound: '一面（待确认）',
    myEvaluation: '待面试',
    myScore: null,
    currentStage: '一面',
    stageColor: 'bg-accent-100 text-accent-700',
    latestActivity: '面试待确认，7月24日 10:00 总部3楼会议室A',
    finalResult: null,
    appliedAt: '2026-07-16',
    resumeSummary: '2年前端开发经验，熟悉Vue生态，有活动页面与营销工具开发经验。基础较扎实但项目深度有限。',
    skills: ['Vue', 'JavaScript', 'CSS', 'jQuery', '微信小程序'],
    experienceYears: '2年',
    education: '本科 · 南京邮电大学',
    timeline: [
      { date: '2026-07-16', event: '简历入库', detail: 'HR从Boss直聘下载简历PDF导入' },
      { date: '2026-07-18', event: '面试安排', detail: '一面安排：面试官周明辉（前端架构师），7月24日 10:00，待确认' },
    ],
  },
  {
    id: 8,
    name: '赵晓月',
    avatar: '赵',
    position: 'UI/UX设计师',
    myRound: '二面',
    myEvaluation: '待面试',
    myScore: null,
    currentStage: '二面',
    stageColor: 'bg-accent-100 text-accent-700',
    latestActivity: '一面已通过（刘思琪），二面已安排：7月19日 10:00 总部2楼设计室',
    finalResult: null,
    appliedAt: '2026-07-10',
    resumeSummary: '2年UI/UX设计经验，擅长设计系统搭建。有从0到1设计系统经验，注重设计规范。',
    skills: ['Figma', 'Sketch', '设计系统', '交互设计', '用户研究'],
    experienceYears: '2年',
    education: '本科 · 中央美术学院',
    timeline: [
      { date: '2026-07-10', event: '简历入库', detail: '内部推荐投递' },
      { date: '2026-07-12', event: '一面完成', detail: '面试官：刘思琪（设计主管），评分8.0，通过' },
      { date: '2026-07-14', event: '进入二面', detail: '二面安排：面试官周明辉（前端架构师），7月19日 10:00 总部2楼设计室' },
    ],
  },
];

export const myPositions: InterviewerPosition[] = [
  {
    id: 'REQ-20260710-XYZ789',
    title: '前端开发工程师',
    department: '技术研发部',
    city: '上海',
    status: '招聘中',
    priority: '高',
    jd: `【岗位职责】
1. 负责公司核心产品的前端架构设计与开发
2. 参与前端工程化建设，提升开发效率与代码质量
3. 与UI设计师和后端工程师紧密协作
4. 持续优化前端性能与用户体验
5. 技术选型与前沿技术调研落地

【任职要求】
1. 本科及以上学历，3年以上前端开发经验
2. 精通React/Vue等主流框架，熟悉TypeScript
3. 具备组件化和工程化思维
4. 了解Node.js，有全栈能力优先
5. 良好的编码习惯与团队协作精神`,
    requirements: `1. 本科及以上学历，3年以上前端开发经验
2. 精通React/Vue等主流框架，熟悉TypeScript
3. 具备组件化和工程化思维
4. 了解Node.js，有全栈能力优先
5. 良好的编码习惯与团队协作精神`,
    interviewProcess: 'HR初筛 → 技术一面（周明辉·前端架构师）→ 技术二面（陈志强·技术总监）→ HR终面（孙晓峰）→ Offer审批',
    focusPoints: [
      'React/Vue技术深度：源码理解、性能优化、状态管理方案',
      'TypeScript使用熟练度：类型系统设计、泛型应用',
      '工程化能力：构建工具配置、组件库设计、CI/CD理解',
      '架构设计思维：微前端、模块化拆分、跨团队协作方案',
      '沟通与协作能力：技术方案表达、跨角色协作经验',
    ],
    assignedCandidates: [
      { id: 1, name: '孙博文', avatar: '孙', stage: '二面', stageColor: 'bg-accent-100 text-accent-700' },
      { id: 2, name: '陈伟', avatar: '陈', stage: '一面', stageColor: 'bg-accent-100 text-accent-700' },
      { id: 3, name: '苏浩宇', avatar: '苏', stage: '一面', stageColor: 'bg-accent-100 text-accent-700' },
      { id: 4, name: '郑宇航', avatar: '郑', stage: '二面', stageColor: 'bg-accent-100 text-accent-700' },
      { id: 5, name: '马晓峰', avatar: '马', stage: '二面', stageColor: 'bg-accent-100 text-accent-700' },
      { id: 7, name: '许嘉怡', avatar: '许', stage: '一面', stageColor: 'bg-accent-100 text-accent-700' },
    ],
    myRole: '技术一面面试官 · 前端架构师',
  },
  {
    id: 'REQ-20260708-FF123',
    title: 'UI/UX设计师',
    department: '设计部',
    city: '深圳',
    status: '招聘中',
    priority: '普通',
    jd: `【岗位职责】
1. 负责产品界面设计与交互体验优化
2. 参与设计系统与组件库的搭建与维护
3. 与产品经理、前端工程师紧密协作
4. 输出高质量的设计方案与交互原型
5. 参与用户研究，持续优化产品体验

【任职要求】
1. 本科及以上学历，2年以上UI/UX设计经验
2. 精通Figma、Sketch等设计工具
3. 具备设计系统搭建经验
4. 了解前端基础知识，能有效与工程师沟通
5. 有B端产品设计经验优先`,
    requirements: `1. 本科及以上学历，2年以上UI/UX设计经验
2. 精通Figma、Sketch等设计工具
3. 具备设计系统搭建经验
4. 了解前端基础知识，能有效与工程师沟通
5. 有B端产品设计经验优先`,
    interviewProcess: 'HR初筛 → 一面·设计面（刘思琪·设计主管）→ 二面·技术面（周明辉·前端架构师）→ 终面（HR）→ Offer审批',
    focusPoints: [
      '设计组件化思维：是否能理解前端组件化开发模式',
      '设计与开发的协作流程：设计交接规范、标注与沟通方式',
      '对设计系统的理解：Design Token、组件变体、响应式设计',
      '交互细节的把控：状态切换、动效设计、边界情况处理',
    ],
    assignedCandidates: [
      { id: 8, name: '赵晓月', avatar: '赵', stage: '二面', stageColor: 'bg-accent-100 text-accent-700' },
    ],
    myRole: '二面面试官 · 前端架构师',
  },
];

export function getTodayInterviews(): InterviewerInterview[] {
  const today = '2026-07-19';
  return myInterviews.filter(iv => iv.scheduledAt.startsWith(today));
}

export function getPendingConfirmations(): InterviewerInterview[] {
  return myInterviews.filter(iv => iv.status === '待确认');
}

export function getPendingFeedback(): InterviewerInterview[] {
  return myInterviews.filter(iv => iv.status === '待反馈');
}

export function getUpcomingInterviews(): InterviewerInterview[] {
  return myInterviews.filter(iv => iv.status === '待面试' || iv.status === '待确认');
}