import { interviewerPool } from './interviews';
import { candidateList } from './candidates';

// ── Types ───────────────────────────────────────────────

export interface ResumePushRecord {
  id: number;
  candidateId: number;
  candidateName: string;
  position: string;
  source: string;
  pusher: string;
  pushTime: string;
  reviewerId: string;
  reviewerName: string;
  reviewerTitle: string;
  deadline: string;
  keyRequirements: string;
  status: 'pending' | 'approved' | 'rejected' | 'needMoreInfo';
  reviewComment: string;
  reviewTime: string | null;
  scheduleMethod: 'interviewer_pick' | 'recruiter_assign' | null;
  scheduledTime: string | null;
  scheduledEndTime: string | null;
  interviewType: string | null;
  interviewLocation: string | null;
  interviewId: number | null;
  pushCount: number;
}

export const resumePushRecords: ResumePushRecord[] = [
  // ── Pending reviews (interviewer hasn't responded yet) ──
  {
    id: 1,
    candidateId: 21,
    candidateName: '彭宇辰',
    position: '测试工程师',
    source: '外部收录',
    pusher: '李华',
    pushTime: '2026-07-13 14:30',
    reviewerId: 'iv1',
    reviewerName: '张明远',
    reviewerTitle: '产品VP',
    deadline: '2026-07-20',
    keyRequirements: '重点关注自动化测试框架搭建经验和性能测试能力，需评估是否具备从0搭建测试体系的能力。',
    status: 'pending',
    reviewComment: '',
    reviewTime: null,
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount: 1,
  },
  {
    id: 2,
    candidateId: 26,
    candidateName: '叶思源',
    position: 'Java开发工程师',
    source: '内部推荐',
    pusher: '王磊',
    pushTime: '2026-07-15 09:15',
    reviewerId: 'iv7',
    reviewerName: '赵永刚',
    reviewerTitle: 'Java技术专家',
    deadline: '2026-07-22',
    keyRequirements: '评估Java基础和Spring Boot实战能力，注意考察数据库设计和SQL优化经验，岗位需要独立负责订单模块。',
    status: 'pending',
    reviewComment: '',
    reviewTime: null,
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount: 1,
  },
  {
    id: 3,
    candidateId: 17,
    candidateName: '宋文博',
    position: '后端开发工程师',
    source: '外部收录',
    pusher: '王磊',
    pushTime: '2026-07-14 16:00',
    reviewerId: 'iv2',
    reviewerName: '陈志强',
    reviewerTitle: '技术总监',
    deadline: '2026-07-21',
    keyRequirements: '7年Go+Java双栈经验，需要评估分布式系统设计能力和高并发实战深度，确认是否能带小团队。',
    status: 'pending',
    reviewComment: '',
    reviewTime: null,
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount: 1,
  },
  {
    id: 4,
    candidateId: 8,
    candidateName: '孙明',
    position: '前端开发工程师',
    source: 'PDF导入',
    pusher: '张敏',
    pushTime: '2026-07-16 10:30',
    reviewerId: 'iv5',
    reviewerName: '周明辉',
    reviewerTitle: '前端架构师',
    deadline: '2026-07-23',
    keyRequirements: '6年前端经验，有大型项目架构经验，需重点评估React/Next.js深度和前端监控体系建设能力。',
    status: 'pending',
    reviewComment: '',
    reviewTime: null,
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount: 1,
  },
  {
    id: 5,
    candidateId: 3,
    candidateName: '王磊',
    position: '后端开发工程师',
    source: 'PDF导入',
    pusher: '张敏',
    pushTime: '2026-07-15 15:45',
    reviewerId: 'iv2',
    reviewerName: '陈志强',
    reviewerTitle: '技术总监',
    deadline: '2026-07-22',
    keyRequirements: '7年Java后端，有电商高并发经验。需评估微服务拆分思路和分布式事务方案设计能力。',
    status: 'pending',
    reviewComment: '',
    reviewTime: null,
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount: 1,
  },

  // ── Approved reviews ──
  {
    id: 6,
    candidateId: 6,
    candidateName: '周杰',
    position: '测试工程师',
    source: 'PDF导入',
    pusher: '李华',
    pushTime: '2026-07-09 11:00',
    reviewerId: 'iv9',
    reviewerName: '黄志远',
    reviewerTitle: '测试经理',
    deadline: '2026-07-16',
    keyRequirements: '3年测试开发经验，有自动化测试体系建设经验，评估Selenium+Python实战深度和CI/CD集成能力。',
    status: 'approved',
    reviewComment: '简历质量不错，自动化测试经验扎实，有从0搭建的经验。建议安排一面，重点考察测试框架设计能力和接口测试深度。',
    reviewTime: '2026-07-12 10:30',
    scheduleMethod: 'recruiter_assign',
    scheduledTime: '2026-07-14 14:00',
    scheduledEndTime: '2026-07-14 15:00',
    interviewType: '视频面试',
    interviewLocation: '腾讯会议',
    interviewId: 6,
    pushCount: 1,
  },
  {
    id: 7,
    candidateId: 14,
    candidateName: '郑宇航',
    position: '高级前端工程师',
    source: '猎头公司推荐',
    pusher: '张敏',
    pushTime: '2026-07-10 09:30',
    reviewerId: 'iv5',
    reviewerName: '周明辉',
    reviewerTitle: '前端架构师',
    deadline: '2026-07-17',
    keyRequirements: '6年前端，微前端架构落地经验。重点评估React深度和大型B端中台产品架构能力，猎头费较高需慎重。',
    status: 'approved',
    reviewComment: '猎头推荐的候选人质量较高，技术栈匹配度高。微前端经验正是我们需要的，建议尽快安排一面。',
    reviewTime: '2026-07-13 16:00',
    scheduleMethod: 'interviewer_pick',
    scheduledTime: '2026-07-25 09:00',
    scheduledEndTime: '2026-07-25 10:00',
    interviewType: '线下面试',
    interviewLocation: '总部3楼会议室A',
    interviewId: 104,
    pushCount: 1,
  },
  {
    id: 8,
    candidateId: 12,
    candidateName: '何静',
    position: 'UI设计师',
    source: 'PDF导入',
    pusher: '李华',
    pushTime: '2026-07-11 14:00',
    reviewerId: 'iv3',
    reviewerName: '刘思琪',
    reviewerTitle: '设计主管',
    deadline: '2026-07-18',
    keyRequirements: '2年UI设计经验，有动效和C4D能力。重点看设计审美和Figma熟练度，岗位需要独立负责一个产品线的设计。',
    status: 'approved',
    reviewComment: '作品集质量不错，动效设计能力突出，C4D是加分项。建议安排一面，考察交互逻辑和设计规范意识。',
    reviewTime: '2026-07-14 09:00',
    scheduleMethod: 'recruiter_assign',
    scheduledTime: '2026-07-17 10:00',
    scheduledEndTime: '2026-07-17 11:00',
    interviewType: '线下面试',
    interviewLocation: '总部2楼设计室',
    interviewId: 3,
    pushCount: 1,
  },

  // ── Approved but pending schedule ──
  {
    id: 9,
    candidateId: 9,
    candidateName: '李明辉',
    position: 'Java开发工程师',
    source: '内部推荐',
    pusher: '张敏',
    pushTime: '2026-07-13 16:30',
    reviewerId: 'iv7',
    reviewerName: '赵永刚',
    reviewerTitle: 'Java技术专家',
    deadline: '2026-07-20',
    keyRequirements: '4年Java经验，金融行业背景。重点评估Spring Cloud微服务实战和分布式事务处理经验。',
    status: 'approved',
    reviewComment: '基础扎实，金融行业背景有利于理解我们的业务场景。建议安排一面，重点考察高并发场景下的代码质量。',
    reviewTime: '2026-07-17 14:30',
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount: 1,
  },
  {
    id: 10,
    candidateId: 23,
    candidateName: '苏浩宇',
    position: '前端开发工程师',
    source: '外部收录',
    pusher: '王磊',
    pushTime: '2026-07-12 15:00',
    reviewerId: 'iv5',
    reviewerName: '周明辉',
    reviewerTitle: '前端架构师',
    deadline: '2026-07-19',
    keyRequirements: '5年前端，有大型B端产品经验。评估React+TypeScript深度和工程化能力，注意考察代码质量意识。',
    status: 'approved',
    reviewComment: 'B端产品经验丰富，工程化意识好，组件化思维清晰。同意安排一面，时间可选7月23日或24日。',
    reviewTime: '2026-07-15 11:00',
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount: 1,
  },

  // ── Rejected reviews ──
  {
    id: 11,
    candidateId: 22,
    candidateName: '钟灵',
    position: '测试工程师',
    source: '内部推荐',
    pusher: '王磊',
    pushTime: '2026-07-08 10:00',
    reviewerId: 'iv9',
    reviewerName: '黄志远',
    reviewerTitle: '测试经理',
    deadline: '2026-07-15',
    keyRequirements: '4年测试经验，有移动端自动化经验。评估Appium实战深度和兼容性测试方案设计能力。',
    status: 'rejected',
    reviewComment: '移动端自动化经验丰富，但岗位目前更需要性能测试方向的人才。候选人缺乏Jmeter和LoadRunner经验，与岗位当前需求不匹配。建议保留在公司人才库，未来有移动端专项测试需求时再联系。',
    reviewTime: '2026-07-12 09:00',
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount: 1,
  },
  {
    id: 12,
    candidateId: 20,
    candidateName: '冯雅琪',
    position: '数据分析师',
    source: 'PDF导入',
    pusher: '李华',
    pushTime: '2026-07-12 13:00',
    reviewerId: 'iv4',
    reviewerName: '吴文杰',
    reviewerTitle: '数据分析主管',
    deadline: '2026-07-19',
    keyRequirements: '1年数据分析经验，统计学背景。重点评估SQL能力和业务分析sense，岗位为初级但需要较强的学习能力。',
    status: 'rejected',
    reviewComment: 'SQL基础较弱，目前的实际水平达不到岗位要求。虽然统计学背景不错，但数据分析实战经验太少。建议再积累1-2年经验后重新评估。',
    reviewTime: '2026-07-14 15:00',
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount: 1,
  },

  // ── Need more info ──
  {
    id: 13,
    candidateId: 29,
    candidateName: '秦雪梅',
    position: 'UI/UX设计师',
    source: '内部推荐',
    pusher: '李华',
    pushTime: '2026-07-16 11:00',
    reviewerId: 'iv3',
    reviewerName: '刘思琪',
    reviewerTitle: '设计主管',
    deadline: '2026-07-23',
    keyRequirements: '3年UX设计经验，B端产品经验。重点评估交互设计方法论和用户研究深度，岗位需独立负责用户体验优化。',
    status: 'needMoreInfo',
    reviewComment: '简历偏重交互设计描述，但缺少具体的用户研究成果和方法论描述。需要补充：1)过往项目中用户研究的完整案例；2)设计决策背后的数据支撑。请HR协助联系候选人补充作品集和项目案例。',
    reviewTime: '2026-07-18 10:00',
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount: 1,
  },
];

// ── Helper functions ────────────────────────────────────

let pushIdCounter = 100;

export function addResumePushRecord(record: Omit<ResumePushRecord, 'id' | 'pushCount' | 'scheduleMethod' | 'scheduledTime' | 'scheduledEndTime' | 'interviewType' | 'interviewLocation' | 'interviewId'> & { candidateId?: number }): ResumePushRecord {
  const id = pushIdCounter++;
  const existingPushes = resumePushRecords.filter(r => r.candidateId === (record.candidateId || 0) && r.reviewerId === record.reviewerId);
  const pushCount = existingPushes.length + 1;
  const newRecord: ResumePushRecord = {
    id,
    candidateId: record.candidateId || 0,
    candidateName: record.candidateName,
    position: record.position,
    source: record.source,
    pusher: record.pusher,
    pushTime: record.pushTime,
    reviewerId: record.reviewerId,
    reviewerName: record.reviewerName,
    reviewerTitle: record.reviewerTitle,
    deadline: record.deadline,
    keyRequirements: record.keyRequirements,
    status: record.status,
    reviewComment: record.reviewComment || '',
    reviewTime: record.reviewTime || null,
    scheduleMethod: null,
    scheduledTime: null,
    scheduledEndTime: null,
    interviewType: null,
    interviewLocation: null,
    interviewId: null,
    pushCount,
  };
  resumePushRecords.push(newRecord);
  return newRecord;
}

export function getPendingReviews(reviewerId?: string): ResumePushRecord[] {
  const pending = resumePushRecords.filter(r => r.status === 'pending');
  if (reviewerId) return pending.filter(r => r.reviewerId === reviewerId);
  return pending;
}

export function getApprovedPendingSchedule(): ResumePushRecord[] {
  return resumePushRecords.filter(r => r.status === 'approved' && !r.scheduledTime);
}

export function getPushRecordsByCandidate(candidateId: number): ResumePushRecord[] {
  return resumePushRecords.filter(r => r.candidateId === candidateId);
}

export function getPushRecordsByRecruiter(recruiter: string): ResumePushRecord[] {
  return resumePushRecords.filter(r => r.pusher === recruiter);
}

export function getActivePushRecord(candidateId: number): ResumePushRecord | undefined {
  return resumePushRecords.find(r => r.candidateId === candidateId && r.status === 'pending');
}

export function updatePushRecordStatus(
  candidateId: number,
  reviewerId: string,
  status: 'approved' | 'rejected' | 'needMoreInfo',
  comment: string
) {
  const record = resumePushRecords.find(
    (r) => r.candidateId === candidateId && r.reviewerId === reviewerId && r.status === 'pending'
  );
  if (record) {
    record.status = status;
    record.reviewComment = comment;
    record.reviewTime = new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
}

// ── Performance stats ───────────────────────────────────

export interface RecruiterPerformanceStats {
  recruiter: string;
  collectedResumes: number;
  pushedResumes: number;
  approvedResumes: number;
  actualInterviews: number;
  passedInterviews: number;
  reviewPassRate: number; // percentage
  interviewSuccessRate: number; // percentage
}

export function getRecruiterPerformance(
  recruiter?: string,
  position?: string,
  source?: string,
  month?: string
): RecruiterPerformanceStats[] {
  // Build per-recruiter stats from push records + candidate data
  const recruiterSet = new Set(resumePushRecords.map(r => r.pusher));
  // Also include recruiters who have candidates but no pushes
  candidateList.forEach(c => {
    if (c.recruiter) recruiterSet.add(c.recruiter);
  });

  const stats: RecruiterPerformanceStats[] = [];

  recruiterSet.forEach(rec => {
    // Filter push records for this recruiter
    let pushes = resumePushRecords.filter(r => r.pusher === rec);
    if (position) pushes = pushes.filter(r => r.position === position);
    if (source) pushes = pushes.filter(r => r.source === source);
    if (month) pushes = pushes.filter(r => r.pushTime.startsWith(month));

    // Count collected resumes (candidates assigned to this recruiter)
    let candidates = candidateList.filter(c => c.recruiter === rec);
    if (position) candidates = candidates.filter(c => c.position === position);
    if (source) candidates = candidates.filter(c => c.source === source);
    if (month) candidates = candidates.filter(c => c.appliedAt && c.appliedAt.startsWith(month));

    const collectedResumes = candidates.length;
    const pushedResumes = pushes.length;
    const approvedResumes = pushes.filter(r => r.status === 'approved').length;
    const actualInterviews = pushes.filter(r => r.scheduledTime !== null).length;
    // Passed = approved + has interview and (not rejected)
    const passedInterviews = pushes.filter(r => r.status === 'approved' && r.scheduledTime).length;

    const reviewPassRate = pushedResumes > 0 ? Math.round((approvedResumes / pushedResumes) * 100) : 0;
    const interviewSuccessRate = actualInterviews > 0 ? Math.round((passedInterviews / actualInterviews) * 100) : 0;

    stats.push({
      recruiter: rec,
      collectedResumes,
      pushedResumes,
      approvedResumes,
      actualInterviews,
      passedInterviews,
      reviewPassRate,
      interviewSuccessRate,
    });
  });

  return stats;
}

export function getAggregatedStats(
  position?: string,
  source?: string,
  month?: string
): Omit<RecruiterPerformanceStats, 'recruiter'> {
  const allStats = getRecruiterPerformance(undefined, position, source, month);
  return {
    collectedResumes: allStats.reduce((s, st) => s + st.collectedResumes, 0),
    pushedResumes: allStats.reduce((s, st) => s + st.pushedResumes, 0),
    approvedResumes: allStats.reduce((s, st) => s + st.approvedResumes, 0),
    actualInterviews: allStats.reduce((s, st) => s + st.actualInterviews, 0),
    passedInterviews: allStats.reduce((s, st) => s + st.passedInterviews, 0),
    reviewPassRate: 0,
    interviewSuccessRate: 0,
  };
}
