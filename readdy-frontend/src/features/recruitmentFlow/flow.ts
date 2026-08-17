export type RecruitmentSwimlaneId = 'requester' | 'recruiter' | 'business_reviewer' | 'interviewer' | 'candidate' | 'manager' | 'system';

export interface RecruitmentSwimlane {
  id: RecruitmentSwimlaneId;
  label: string;
  description: string;
}

export interface RecruitmentFlowNode {
  id: string;
  lane: RecruitmentSwimlaneId;
  column: number;
  status: string;
  title: string;
  detail: string;
  tone: 'normal' | 'waiting' | 'terminal' | 'system';
}

export interface RecruitmentFlowConnection {
  from: string;
  to: string;
  label?: string;
  kind?: 'normal' | 'branch' | 'loop';
}

export const recruitmentSwimlanes: RecruitmentSwimlane[] = [
  { id: 'requester', label: '用人部门', description: '发起招聘需求' },
  { id: 'recruiter', label: '招聘专员', description: '推进候选人和 Offer' },
  { id: 'business_reviewer', label: '业务筛选人', description: '判断业务匹配度' },
  { id: 'interviewer', label: '面试官', description: '完成面试和评价' },
  { id: 'candidate', label: '候选人', description: '答复 Offer 与确认入职' },
  { id: 'manager', label: '招聘主管', description: '审批需求与 Offer' },
  { id: 'system', label: '系统', description: '记录状态与结束结果' },
];

export const recruitmentFlowNodes: RecruitmentFlowNode[] = [
  { id: 'demand_create', lane: 'requester', column: 1, status: 'pending', title: '创建需求', detail: '填写岗位、人数与到岗日期', tone: 'waiting' },
  { id: 'demand_approve', lane: 'manager', column: 2, status: 'pending', title: '需求审批', detail: '通过或驳回补充', tone: 'waiting' },
  { id: 'demand_active', lane: 'system', column: 3, status: 'active', title: '需求生效', detail: '允许候选人进入流程', tone: 'system' },
  { id: 'resume_pending', lane: 'recruiter', column: 3, status: 'pending', title: '简历收录', detail: '确认可进入招聘流程', tone: 'waiting' },
  { id: 'ai_screen', lane: 'system', column: 4, status: 'ai_screen', title: 'AI 初筛', detail: '可转业务筛选或淘汰', tone: 'system' },
  { id: 'business_review', lane: 'business_reviewer', column: 4, status: 'business_review', title: '业务筛选', detail: '通过进入面试，不通过淘汰', tone: 'waiting' },
  { id: 'interview_schedule', lane: 'recruiter', column: 5, status: 'scheduled', title: '安排面试', detail: '创建、改约或取消面试任务', tone: 'waiting' },
  { id: 'interview', lane: 'interviewer', column: 5, status: 'interview', title: '完成面试', detail: '提交本轮评价', tone: 'normal' },
  { id: 'offer_draft', lane: 'recruiter', column: 6, status: 'draft', title: 'Offer 草稿', detail: '完善薪资和入职日期', tone: 'waiting' },
  { id: 'offer_pending', lane: 'manager', column: 6, status: 'pending', title: 'Offer 待确认', detail: '审批或退回修改', tone: 'waiting' },
  { id: 'offer_approved', lane: 'manager', column: 7, status: 'approved', title: 'Offer 已批准', detail: '等待招聘专员发放', tone: 'normal' },
  { id: 'offer_sent', lane: 'recruiter', column: 7, status: 'sent', title: 'Offer 待回复', detail: '跟进候选人答复', tone: 'waiting' },
  { id: 'offer_accepted', lane: 'candidate', column: 7, status: 'accepted', title: '接受 Offer', detail: '进入待入职状态', tone: 'normal' },
  { id: 'offer_closed', lane: 'candidate', column: 8, status: 'declined / expired', title: '未接受 Offer', detail: '拒绝或过期，流程结束', tone: 'terminal' },
  { id: 'onboard', lane: 'recruiter', column: 8, status: 'onboard', title: '确认入职', detail: '登记实际入职日期', tone: 'waiting' },
  { id: 'onboarded', lane: 'system', column: 8, status: 'onboarded', title: '已入职', detail: 'HC 缺口减少，流程结束', tone: 'terminal' },
  { id: 'rejected', lane: 'system', column: 6, status: 'rejected', title: '已淘汰', detail: '保留淘汰原因和人才库去向', tone: 'terminal' },
];

export const recruitmentFlowConnections: RecruitmentFlowConnection[] = [
  { from: 'demand_create', to: 'demand_approve' }, { from: 'demand_approve', to: 'demand_active', label: '通过' },
  { from: 'demand_active', to: 'resume_pending' }, { from: 'resume_pending', to: 'ai_screen' },
  { from: 'ai_screen', to: 'business_review', label: '通过' }, { from: 'ai_screen', to: 'rejected', label: '淘汰', kind: 'branch' },
  { from: 'business_review', to: 'interview_schedule', label: '通过' }, { from: 'business_review', to: 'rejected', label: '淘汰', kind: 'branch' },
  { from: 'interview_schedule', to: 'interview' }, { from: 'interview', to: 'interview_schedule', label: '加面', kind: 'loop' },
  { from: 'interview', to: 'offer_draft', label: '通过' }, { from: 'interview', to: 'rejected', label: '淘汰', kind: 'branch' },
  { from: 'offer_draft', to: 'offer_pending', label: '提交' }, { from: 'offer_pending', to: 'offer_approved', label: '批准' },
  { from: 'offer_approved', to: 'offer_sent', label: '发放' }, { from: 'offer_sent', to: 'offer_accepted', label: '接受' },
  { from: 'offer_sent', to: 'offer_closed', label: '拒绝', kind: 'branch' }, { from: 'offer_sent', to: 'offer_closed', label: '过期', kind: 'branch' },
  { from: 'offer_accepted', to: 'onboard' }, { from: 'onboard', to: 'onboarded' },
];
