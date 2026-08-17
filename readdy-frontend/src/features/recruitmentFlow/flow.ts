export type IntegrationStatus = 'backend_ready' | 'frontend_connected' | 'external_pending' | 'validated';

export const integrationStatusMeta: Record<IntegrationStatus, { label: string; className: string }> = {
  backend_ready: { label: '后端已实现', className: 'bg-amber-100 text-amber-800' },
  frontend_connected: { label: '前后端已串联', className: 'bg-blue-100 text-blue-800' },
  external_pending: { label: '外部待对接', className: 'bg-rose-100 text-rose-800' },
  validated: { label: '已联调验收', className: 'bg-emerald-100 text-emerald-800' },
};

export interface RecruitmentFlowStep {
  order: number;
  title: string;
  transition: string;
  owner: string;
  action: string;
  endpoint: string;
  statuses: IntegrationStatus[];
  branch?: string;
}

export interface RecruitmentFlowGroup {
  title: string;
  tone: 'blue' | 'violet' | 'sky' | 'orange' | 'green';
  steps: RecruitmentFlowStep[];
}

export const recruitmentFlowGroups: RecruitmentFlowGroup[] = [
  {
    title: '需求启动',
    tone: 'blue',
    steps: [
      { order: 1, title: '创建并提交招聘需求', transition: '必填校验后进入待审批', owner: '用人部门', action: '提交岗位、JD、计划人数、优先级与到岗日期。', endpoint: 'POST /api/demands', statuses: ['frontend_connected', 'external_pending'] },
      { order: 2, title: '审核需求并生效', transition: '通过 → approved + active；驳回 → 补充信息', owner: '招聘专员', action: '审核合理性并承接招聘任务。', endpoint: 'POST /api/demands/{id}/approve | reject', statuses: ['frontend_connected'] },
    ],
  },
  {
    title: '候选人筛选',
    tone: 'violet',
    steps: [
      { order: 3, title: '导入简历并关联需求', transition: '解析成功 → 待筛选；失败 → 保留原文待处理', owner: '招聘专员', action: '选择来源、关联需求并复核解析结果。', endpoint: 'POST /api/resume/upload', statuses: ['frontend_connected'] },
      { order: 4, title: '初筛并推送业务审核', transition: '通过初筛后分配业务审核人', owner: '招聘专员', action: '完成 HR 初筛并推送候选人信息。', endpoint: 'POST /api/business-reviews', statuses: ['frontend_connected', 'external_pending'] },
      { order: 5, title: '业务初筛并返回结论', transition: '通过 → 安排面试；不通过 → 结束', owner: '业务面试官', action: '查看完整简历并给出业务适配性结论。', endpoint: 'POST /api/business-reviews/{id}/decision', statuses: ['frontend_connected', 'external_pending'] },
    ],
  },
  {
    title: '面试决策',
    tone: 'sky',
    steps: [
      { order: 6, title: '双方确认后创建面试安排', transition: '确认后生成面试任务', owner: '招聘专员', action: '协调候选人与面试官，确认时间、地点和轮次。', endpoint: 'POST/PATCH /api/interview/assignments', statuses: ['backend_ready', 'external_pending'] },
      { order: 7, title: '面试进行并确认任务状态', transition: '已进行 → 待评价；取消/改约 → 重新排期', owner: '招聘专员 + 系统', action: 'HR 确认系统中的面试状态。', endpoint: '外部状态接口', statuses: ['external_pending'] },
      { order: 8, title: '主面试官提交本轮评价', transition: '通过/不通过 + 简评；协同面试官可补充', owner: '主面试官', action: '面试评价完成后回传候选人评价信息。', endpoint: 'POST /api/interview/feedback', statuses: ['frontend_connected', 'external_pending'] },
      { order: 9, title: 'HR 确认本轮处理结果', transition: '加面 → 回到第 6 步；淘汰 → 结束；全通过 → Offer', owner: '招聘专员', action: '根据评价决定后续推进。', endpoint: 'POST /api/pipeline/demands/{id}/move', statuses: ['frontend_connected'], branch: '加面 → 回到第 6 步；淘汰 → 结束；全通过 → Offer' },
    ],
  },
  {
    title: 'Offer 管理',
    tone: 'orange',
    steps: [
      { order: 10, title: 'Offer 拟定、审批、发放与答复', transition: '草稿 → 待审 → 已批准 → 已发送 → 接受/拒绝', owner: '招聘专员', action: '拟定与发放 Offer，并登记候选人答复。拒绝、过期或撤回会释放名额。', endpoint: 'PUT /offer/{candidate} | POST /api/offers/{id}/actions', statuses: ['frontend_connected', 'external_pending'] },
    ],
  },
  {
    title: '入职闭环',
    tone: 'green',
    steps: [
      { order: 11, title: '确认实际入职并结算岗位缺口', transition: 'accepted 锁定；onboarded 后缺口 -1；未到岗 → 释放', owner: '招聘专员', action: '填写实际入职日期，并由 HR 手动关闭已满足 HC 的需求。', endpoint: '/offers/{id}/actions:onboard | /demands/{id}/close', statuses: ['frontend_connected', 'external_pending'] },
    ],
  },
];
