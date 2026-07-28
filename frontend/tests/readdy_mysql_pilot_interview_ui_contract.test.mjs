import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const page = read('readdy-frontend/src/pages/interviewer/interviews/page.tsx');
assert.match(page, /interviewsApi\.listMyAssignments/, '我的面试必须读取真实任务');
assert.match(page, /interviewsApi\.listFeedback/, '我的面试必须读取真实评价');
assert.match(page, /SimpleFeedbackModal/, '我的面试必须使用简单评价弹窗');
assert.match(page, /candidatesApi\.getResume/, '面试详情必须读取真实结构化简历');
assert.match(page, /demandsApi\.getDemand/, '面试详情必须读取真实招聘需求和 JD');
assert.doesNotMatch(page, /@\/mocks\/interviews|@\/mocks\/interviewer/, '我的面试不得继续使用假任务');
assert.doesNotMatch(page, /ScorecardModal/, '试点评价不得继续使用复杂评分大表');
assert.match(page, /useSearchParams/, '面试官必须承接通知中的面试任务上下文');
assert.match(page, /searchParams\.get\(['"]candidate['"]\)/, '面试官页必须定位到对应候选人');
assert.match(page, /searchParams\.get\(['"]assignment['"]\)/, '面试官页必须优先定位到通知中的具体面试任务');
assert.match(page, /latestCandidateAssignment/, '旧通知没有任务编号时必须打开候选人的最新轮次');

const recruiterPage = read('readdy-frontend/src/pages/interviews/page.tsx');
const recruiterTable = read('readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx');
const recruiterToolbar = read('readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx');
const recruiterSurface = `${recruiterPage}\n${recruiterTable}\n${recruiterToolbar}`;
const interviewApi = read('readdy-frontend/src/features/interviews/api.ts');
const interviewDateTime = read('readdy-frontend/src/features/interviews/dateTime.ts');
const router = read('readdy-frontend/src/router/config.tsx');
for (const method of ['listManagementRows', 'listInterviewers', 'createAssignment', 'updateAssignment', 'markConducted', 'remindFeedback', 'cancelAssignment']) {
  assert.match(interviewApi, new RegExp(`${method}\\(`), `招聘专员面试 API 缺少 ${method}`);
}
assert.match(recruiterPage, /interviewsApi\.listManagementRows/, '招聘专员面试管理必须读真实待办');
assert.match(recruiterPage, /useSearchParams/, '招聘专员面试页必须承接业务筛选上下文');
assert.match(recruiterPage, /searchParams\.get\(['"]assignment['"]\)/, '招聘专员面试页必须优先定位到具体面试任务');
assert.match(recruiterPage, /latestCandidateManagementRow/, '旧通知没有任务编号时必须打开候选人的最新轮次');
for (const label of ['待安排', '已安排', '待反馈', '已完成', '安排面试', '调整安排', '确认已面试', '催反馈']) {
  assert.ok(recruiterSurface.includes(label), `招聘专员面试工作台缺少“${label}”`);
}
assert.doesNotMatch(recruiterPage, /@\/mocks\//, '招聘专员面试管理不得使用假任务');
const scheduleModal = read('readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx');
assert.match(scheduleModal, /type="datetime-local"[\s\S]*?onInput=/, '面试时间必须响应浏览器的实时输入事件');
assert.match(scheduleModal, /min=\{minimumInterviewTime\}/, '面试时间控件必须禁止选择过去时间');
assert.match(scheduleModal, /localInterviewInputToUtc\(scheduledAt\)/, '面试排期必须把浏览器本地时间转换为 UTC 后再保存');
assert.match(scheduleModal, /interviewDateTimeToLocalInput\(row\.scheduled_at\)/, '编辑排期时必须把 UTC 时间还原为浏览器本地时间');
assert.match(interviewDateTime, /value\.endsWith\(['"]Z['"]\)/, '后端无时区的面试时间必须明确按 UTC 解析');
assert.match(interviewDateTime, /date\.toISOString\(\)/, '浏览器本地面试时间必须使用标准 UTC 时间传输');
assert.match(scheduleModal, /企业微信.*待接入/, '排期必须如实说明企业微信外部日历尚未接入');
assert.match(recruiterPage, /confirmConductedRow/, '招聘专员确认已面试前必须二次确认');
assert.match(recruiterPage, /pipelineApi\.moveCandidate/, '面试结果必须通过真实流程接口进入 Offer 或淘汰');
for (const label of ['安排下一轮', '增加面试官', '进入 Offer', '淘汰候选人']) {
  assert.ok(recruiterPage.includes(label), `面试反馈后的下一步缺少“${label}”`);
}
for (const label of ['满意', '待定', '不满意']) {
  assert.ok(recruiterPage.includes(label), `招聘专员端必须与面试官端使用一致的“${label}”评价口径`);
}
assert.doesNotMatch(recruiterPage, /feedback_result === ['"]passed['"] \? ['"]通过['"]/, '招聘专员端不得把面试官的满意度改写成通过结论');
assert.match(page, /canSubmitFeedback/, '面试官页面必须根据面试状态控制评价入口');
assert.match(page, /item\.status === ['"]awaiting_feedback['"]/, '面试官必须等招聘专员确认已面试后才能评价');
assert.match(page, /interviewHasStarted\(item\.scheduled_at\)/, '面试官评价入口仍必须按统一时区判断是否开场');
assert.match(page, /等待招聘专员确认/, '面试时间已过但未确认时必须说明正在等待谁处理');
assert.match(page, /面试尚未开始/, '未来面试必须给出不能提前评价的说明');
assert.match(recruiterPage, /查看 Offer/, '已进入 Offer 的候选人必须能从面试详情直达 Offer');
assert.match(router, /RecruiterInterviewsPage/, '/interviews 必须切换为真实招聘专员面试工作台');
assert.match(router, /path:\s*['"]\/interviews['"][\s\S]*?<RecruiterInterviewsPage/, '/interviews 路由必须使用真实工作台');

const modal = read('readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx');
for (const value of ['satisfied', 'pending', 'unsatisfied']) {
  assert.match(modal, new RegExp(`['"]${value}['"]`), `评价弹窗缺少 ${value}`);
}
for (const label of ['满意', '待定', '不满意', '面试备注', '1000']) {
  assert.ok(modal.includes(label), `评价弹窗缺少 ${label}`);
}
assert.match(modal, /existingFeedback/, '评价弹窗必须支持修改已有评价');
assert.match(modal, /disabled=/, '保存中或未选择满意程度时必须禁用提交');

console.log('readdy_mysql_pilot_interview_ui_contract: OK');
