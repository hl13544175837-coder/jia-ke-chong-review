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
