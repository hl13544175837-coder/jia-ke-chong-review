import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const dashboard = read('src/pages/dashboard/page.tsx');
const offers = read('src/pages/offers/page.tsx');
const analytics = read('src/pages/analytics/page.tsx');
const roleViews = read('src/pages/analytics/components/RoleDataViews.tsx');
const directorData = read('src/pages/director/data.ts');
const directorCockpit = read('src/pages/director/cockpit/page.tsx');
const directorProgress = read('src/pages/director/progress/page.tsx');
const directorApprovals = read('src/pages/director/approvals/page.tsx');
const directorInsights = read('src/pages/director/insights/page.tsx');
const layout = read('src/components/feature/MainLayout.tsx');

test('招聘主管工作台优先处理团队审批和卡点，不再伪装成招聘专员工作台', () => {
  assert.match(dashboard, /const isManager = role === 'manager'/);
  assert.match(dashboard, /团队招聘统筹/);
  assert.match(dashboard, /审核需求/);
  assert.match(dashboard, /确认 Offer/);
  assert.match(dashboard, /招聘周期/);
  assert.match(dashboard, /团队岗位进展/);
  assert.match(dashboard, /招聘负责人：/);
});

test('招聘主管进入 Offer 时默认看待确认项并明确自己只负责确认和退回', () => {
  assert.match(offers, /role === 'manager'/);
  assert.match(offers, /setActiveTab\('pending'\)/);
  assert.match(offers, /主管处理范围/);
  assert.match(offers, /确认或退回/);
});

test('招聘主管数据看板先展示团队责任和卡点，并能按负责人下钻到真实需求', () => {
  assert.match(roleViews, /ManagerTeamResponsibilityPanel/);
  assert.match(roleViews, /团队责任与卡点/);
  assert.match(roleViews, /待补反馈/);
  assert.match(analytics, /`owner:\$\{number\}`/);
  assert.match(analytics, /owner_hr_id/);
  assert.match(analytics, /ManagerTeamResponsibilityPanel/);
});

test('总监驾驶舱的高风险提醒直达具体岗位，而不是打开无内容的通用面板', () => {
  assert.match(directorData, /positionId/);
  assert.match(directorCockpit, /director\/progress\?position=/);
  assert.doesNotMatch(directorCockpit, /详细数据请前往对应子页面/);
});

test('总监风险详情明确责任人和建议动作，审批页明确由招聘主管执行', () => {
  assert.match(directorProgress, /建议跟进动作/);
  assert.match(directorProgress, /selectedPosition\.recruiter/);
  assert.match(directorApprovals, /ReadOnlyDetailDrawer/);
  assert.match(directorApprovals, /招聘主管负责处理/);
  assert.match(directorApprovals, /总监负责/);
  assert.match(directorApprovals, /待关注/);
  assert.match(directorApprovals, /ri-arrow-right-s-line/);
  assert.doesNotMatch(directorApprovals, /ri-arrow-down-s-line/);
});

test('总监人才页面按真实内容命名为人才供需，数据看板与驾驶舱职责分开', () => {
  assert.match(layout, /path:\s*'\/director\/insights'[^}]*label:\s*'人才供需'/);
  assert.match(directorInsights, /title="人才供需"/);
  assert.match(directorInsights, /当前岗位与在途人才/);
  assert.match(analytics, /回到管理驾驶舱/);
  assert.match(analytics, /组织趋势与报表复盘/);
});
