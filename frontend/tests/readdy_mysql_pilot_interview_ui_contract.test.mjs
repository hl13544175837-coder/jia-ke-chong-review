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

const recruiterPage = read('readdy-frontend/src/pages/interviews/page.tsx');
const interviewApi = read('readdy-frontend/src/features/interviews/api.ts');
const router = read('readdy-frontend/src/router/config.tsx');
for (const method of ['listManagementRows', 'listInterviewers', 'createAssignment', 'updateAssignment', 'markConducted', 'remindFeedback', 'cancelAssignment']) {
  assert.match(interviewApi, new RegExp(`${method}\\(`), `招聘专员面试 API 缺少 ${method}`);
}
assert.match(recruiterPage, /interviewsApi\.listManagementRows/, '招聘专员面试管理必须读真实待办');
assert.match(recruiterPage, /useSearchParams/, '招聘专员面试页必须承接业务筛选上下文');
for (const label of ['待安排', '已安排', '待反馈', '已完成', '安排面试', '调整安排', '确认已面试', '催反馈']) {
  assert.ok(recruiterPage.includes(label), `招聘专员面试工作台缺少“${label}”`);
}
assert.doesNotMatch(recruiterPage, /@\/mocks\//, '招聘专员面试管理不得使用假任务');
const scheduleModal = read('readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx');
assert.match(scheduleModal, /type="datetime-local"[\s\S]*?onInput=/, '面试时间必须响应浏览器的实时输入事件');
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
