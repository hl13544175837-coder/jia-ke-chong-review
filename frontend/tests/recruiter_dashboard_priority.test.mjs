import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const summaryPath = path.join(root, 'readdy-frontend/src/pages/dashboard/summary.ts');
assert.equal(fs.existsSync(summaryPath), true, '工作台必须用独立规则区分“我的待办”和“等待他人”');

const { buildDashboardSummary } = await import(`${pathToFileURL(summaryPath).href}?dashboard-priority`);
assert.equal(typeof buildDashboardSummary, 'function');

const facts = {
  demands: [
    {
      id: 1,
      status: 'active',
      approval_status: 'pending',
      completion_suggested: true,
      headcount: 1,
      metrics: { remaining_headcount: 0, over_headcount: 0 },
    },
    {
      id: 2,
      status: 'active',
      approval_status: 'approved',
      completion_suggested: false,
      headcount: 2,
      metrics: { remaining_headcount: 1, over_headcount: 0 },
    },
  ],
  candidateTotal: 8,
  reviews: [{ demand_id: 2, status: 'pending' }],
  interviews: [
    { demand_id: 2, assignment_status: 'awaiting_feedback', feedback_submitted: false },
    { demand_id: 2, assignment_status: 'scheduled', feedback_submitted: false },
  ],
  offers: [
    { demand_id: 2, status: 'draft' },
    { demand_id: 2, status: 'pending' },
    { demand_id: 2, status: 'sent' },
    { demand_id: 2, status: 'accepted' },
  ],
};

const recruiter = buildDashboardSummary(facts, 'recruiter');
assert.equal(recruiter.gap, 1);
assert.equal(recruiter.completionDemands.length, 1);
assert.deepEqual(recruiter.myOfferActions.map((item) => item.status), ['draft', 'accepted']);
assert.deepEqual(recruiter.waitingOfferActions.map((item) => item.status), ['pending', 'sent']);
assert.equal(recruiter.myTaskCount, 3);
assert.equal(recruiter.waitingOthersCount, 4);
assert.equal(recruiter.scheduledInterviews.length, 1);

const manager = buildDashboardSummary(facts, 'manager');
assert.deepEqual(manager.myOfferActions.map((item) => item.status), ['pending']);
assert.deepEqual(manager.waitingOfferActions.map((item) => item.status), ['draft', 'sent', 'accepted']);
assert.equal(manager.myTaskCount, 2);
assert.equal(manager.waitingOthersCount, 5);

const page = fs.readFileSync(
  path.join(root, 'readdy-frontend/src/pages/dashboard/page.tsx'),
  'utf8',
);
for (const label of ['待处理事项', '今日面试', '我的岗位进展', '阶段概况', '等待他人']) {
  assert.match(page, new RegExp(label), `工作台缺少“${label}”`);
}
for (const duplicate of ['现在最该处理', '候选人档案', '进入面试管理']) {
  assert.doesNotMatch(page, new RegExp(duplicate), `工作台仍保留重复内容“${duplicate}”`);
}
assert.doesNotMatch(page, /candidatesApi\./, '移除候选人总数卡片后不得继续请求无用数据');
assert.match(page, /当前没有需要你处理的事项/, '待处理事项必须使用准确空态');
assert.match(page, /当前没有等待他人处理的事项/, '等待他人必须使用准确空态');

console.log('recruiter_dashboard_priority: OK');
