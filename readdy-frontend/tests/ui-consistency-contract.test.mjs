import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('主业务页面统一使用同一个页面标题组件', () => {
  const pageHeader = read('src/components/ui/PageHeader.tsx');
  const pages = [
    'src/pages/dashboard/page.tsx',
    'src/pages/jobs/page.tsx',
    'src/pages/candidates/page.tsx',
    'src/pages/interviews/page.tsx',
    'src/pages/offers/page.tsx',
    'src/pages/talent-map/page.tsx',
    'src/pages/kanban/page.tsx',
    'src/pages/dashboard/hired/page.tsx',
    'src/pages/dashboard/cycle/page.tsx',
    'src/pages/analytics/page.tsx',
    'src/pages/settings/page.tsx',
    'src/pages/interviewer/dashboard/page.tsx',
    'src/pages/interviewer/jobs/page.tsx',
    'src/pages/interviewer/screening/page.tsx',
    'src/pages/interviewer/interviews/page.tsx',
    'src/pages/director/cockpit/page.tsx',
    'src/pages/director/progress/page.tsx',
    'src/pages/director/insights/page.tsx',
    'src/pages/director/approvals/page.tsx',
  ];

  assert.match(pageHeader, /data-ui="page-header-title"/);
  assert.match(pageHeader, /text-2xl/);
  pages.forEach((path) => {
    const source = read(path);
    assert.match(source, /import PageHeader from '@\/components\/ui\/PageHeader'/, path);
    assert.match(source, /<PageHeader/, path);
    assert.doesNotMatch(source, /<h1\b/, path);
  });

  const layout = read('src/components/feature/MainLayout.tsx');
  assert.match(layout, /data-ui="app-brand-title"/);
  assert.match(layout, /text-lg/);
});

test('左侧菜单页保留无障碍标题但不重复展示菜单名称', () => {
  const pageHeader = read('src/components/ui/PageHeader.tsx');
  const pages = [
    ['src/pages/jobs/page.tsx', '招聘需求'],
    ['src/pages/interviews/page.tsx', '面试管理'],
    ['src/pages/offers/page.tsx', 'Offer 管理'],
    ['src/pages/talent-map/page.tsx', '人才地图'],
    ['src/pages/analytics/page.tsx', '数据看板'],
    ['src/pages/interviewer/dashboard/page.tsx', '工作台'],
    ['src/pages/interviewer/jobs/page.tsx', '招聘需求'],
    ['src/pages/interviewer/screening/page.tsx', '待面试官筛选'],
    ['src/pages/interviewer/interviews/page.tsx', '我的面试'],
    ['src/pages/director/cockpit/page.tsx', '管理驾驶舱'],
    ['src/pages/director/progress/page.tsx', '招聘进展'],
    ['src/pages/director/insights/page.tsx', '人才储备'],
    ['src/pages/director/approvals/page.tsx', '审批与风险'],
    ['src/pages/settings/page.tsx', '系统设置'],
  ];

  assert.match(pageHeader, /visuallyHiddenTitle/);
  assert.match(pageHeader, /sr-only/);
  pages.forEach(([path, title]) => {
    assert.match(
      read(path),
      new RegExp(`<PageHeader[\\s\\S]*title="${title}"[\\s\\S]*visuallyHiddenTitle`),
      path,
    );
  });

  const candidatesPage = read('src/pages/candidates/page.tsx');
  assert.match(candidatesPage, /visuallyHiddenTitle=\{!navState\?\.jobTitle\}/);

  const roleDataViews = read('src/pages/analytics/components/RoleDataViews.tsx');
  assert.equal((roleDataViews.match(/title="数据看板"[\s\S]{0,180}?visuallyHiddenTitle/g) || []).length, 2);
});

test('状态页签统一为绿色实心选中态且 Offer 不再使用底部横线', () => {
  const tabs = read('src/components/ui/WorkspaceTabs.tsx');
  assert.match(tabs, /data-ui="workspace-tabs"/);
  assert.match(tabs, /bg-primary-500 text-white/);

  const consumers = [
    'src/pages/jobs/components/RequisitionTabs.tsx',
    'src/pages/candidates/page.tsx',
    'src/pages/offers/page.tsx',
    'src/pages/interviews/components/InterviewWorkbenchToolbar.tsx',
    'src/pages/interviewer/screening/page.tsx',
    'src/pages/interviewer/jobs/page.tsx',
    'src/pages/interviewer/interviews/page.tsx',
    'src/pages/director/approvals/page.tsx',
  ];
  consumers.forEach((path) => {
    const source = read(path);
    assert.match(source, /WorkspaceTabs/, path);
  });

  const offers = read('src/pages/offers/page.tsx');
  assert.doesNotMatch(offers, /absolute inset-x-3 bottom-0 h-0\.5 bg-primary-500/);
});
