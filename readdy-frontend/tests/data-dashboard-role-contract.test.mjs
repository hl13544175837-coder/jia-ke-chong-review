import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('数据看板属于正常业务菜单且在人才地图下面', () => {
  const layout = read('src/components/feature/MainLayout.tsx');
  const recruiterMenu = layout.slice(
    layout.indexOf('const recruiterNavItems'),
    layout.indexOf('const managerNavItems'),
  );
  const managerMenu = layout.slice(
    layout.indexOf('const managerNavItems'),
    layout.indexOf('const adminNavItems'),
  );
  const adminMenu = layout.slice(
    layout.indexOf('const adminNavItems'),
    layout.indexOf('const directorNavItems'),
  );
  const directorMenu = layout.slice(
    layout.indexOf('const directorNavItems'),
    layout.indexOf('const interviewerNavItems'),
  );
  const interviewerMenu = layout.slice(
    layout.indexOf('const interviewerNavItems'),
    layout.indexOf('const bottomNavItems'),
  );
  const bottomMenu = layout.slice(
    layout.indexOf('const bottomNavItems'),
    layout.indexOf('const notificationVisuals'),
  );

  assert.match(recruiterMenu, /path:\s*'\/talent-map'[^}]*},\s*\n\s*\{\s*path:\s*'\/analytics'/);
  assert.match(recruiterMenu, /path:\s*'\/analytics'[^}]*roles:\s*\['recruiter'\]/);
  assert.match(managerMenu, /path:\s*'\/analytics'[^}]*label:\s*'团队进展'[^}]*roles:\s*\['manager'\]/);
  assert.match(adminMenu, /path:\s*'\/talent-map'[^}]*},\s*\n\s*\{\s*path:\s*'\/analytics'/);
  assert.match(adminMenu, /path:\s*'\/analytics'[^}]*roles:\s*\['admin'\]/);
  assert.match(directorMenu, /path:\s*'\/analytics'[^}]*roles:\s*\['hr_director'\]/);
  assert.match(interviewerMenu, /path:\s*'\/analytics'[^}]*roles:\s*\['interviewer'\]/);
  assert.doesNotMatch(bottomMenu, /path:\s*'\/analytics'/);
});

test('同一个数据看板地址按登录角色展示不同真实数据', () => {
  const router = read('src/router/config.tsx');
  const page = read('src/pages/analytics/page.tsx');
  const roleViews = read('src/pages/analytics/components/RoleDataViews.tsx');

  assert.match(router, /const analyticsRoles: ProductRole\[\] = \['recruiter', 'manager', 'admin', 'interviewer', 'hr_director'\]/);
  assert.match(page, /role === 'recruiter'/);
  assert.match(page, /role === 'interviewer'/);
  assert.match(page, /RecruiterDataBoard/);
  assert.match(page, /InterviewerDataBoard/);
  assert.match(page, /OrganizationDataBoard/);
  assert.match(roleViews, /analyticsApi\.monthlyPerformance|MonthlyPerformancePanel/);
  assert.match(roleViews, /businessReviewsApi\.listMine/);
  assert.match(roleViews, /interviewsApi\.listMyAssignments/);
  assert.doesNotMatch(roleViews, /@\/mocks\//);
});

test('工作台只保留行动信息，月度漏斗迁入数据看板', () => {
  const dashboard = read('src/pages/dashboard/page.tsx');
  const analytics = read('src/pages/analytics/page.tsx');
  const monthlyPanel = read('src/pages/dashboard/components/MonthlyPerformancePanel.tsx');

  assert.doesNotMatch(dashboard, /MonthlyPerformancePanel/);
  assert.match(analytics, /RecruiterDataBoard/);
  assert.match(monthlyPanel, /data-ui="analytics-monthly-performance"/);
  assert.doesNotMatch(monthlyPanel, /data-ui="dashboard-monthly-performance"/);
  assert.match(monthlyPanel, /我的月度招聘表现/);
  assert.match(monthlyPanel, /招聘专员月度表现/);
});

test('数据看板继续使用产品现有标题、颜色和组件规范', () => {
  const page = read('src/pages/analytics/page.tsx');
  const roleViews = read('src/pages/analytics/components/RoleDataViews.tsx');

  assert.match(page, /title="数据看板"/);
  assert.match(page, /PageHeader/);
  assert.match(roleViews, /PageHeader/);
  assert.match(roleViews, /bg-primary-50/);
  assert.match(roleViews, /border-background-200/);
  assert.match(roleViews, /text-2xl/);
  assert.doesNotMatch(roleViews, /#[0-9a-fA-F]{3,8}/);
});

test('总监下钻岗位后能继续展开真实候选人和责任信息', () => {
  const page = read('src/pages/analytics/page.tsx') + read('src/components/analytics/CandidateReadOnlyList.tsx');
  const types = read('src/features/analytics/types.ts');

  assert.match(types, /candidates:\s*AnalyticsCandidateRow\[\]/);
  assert.match(page, /data-ui="analytics-demand-candidates"/);
  assert.match(page, /aria-expanded=/);
  assert.match(page, /row\.candidates/);
  assert.match(page, /candidate\.candidate_name/);
  assert.match(page, /candidate\.stage_label/);
  assert.match(page, /candidate\.last_actor_name/);
  assert.match(page, /下一步责任/);
});
