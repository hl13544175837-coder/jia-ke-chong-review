import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const drawerPath = path.join(root, 'src/components/ui/ReadOnlyDetailDrawer.tsx');
const drawerSource = existsSync(drawerPath) ? readFileSync(drawerPath, 'utf8') : '';
const dashboardSource = readFileSync(path.join(root, 'src/pages/dashboard/page.tsx'), 'utf8');

test('只读详情抽屉统一提供关闭、键盘、加载、错误和重试能力', () => {
  assert.notEqual(drawerSource, '', '只读详情抽屉组件尚未创建');
  assert.match(drawerSource, /role="dialog"/);
  assert.doesNotMatch(drawerSource, /aria-modal="true"/);
  assert.match(drawerSource, /workspace-detail-backdrop/);
  assert.match(drawerSource, /workspace-detail-panel/);
  assert.match(drawerSource, /event\.key === 'Escape'/);
  assert.match(drawerSource, /window\.addEventListener\('keydown'/);
  assert.match(drawerSource, /aria-label="关闭详情"/);
  assert.match(drawerSource, /loading/);
  assert.match(drawerSource, /error/);
  assert.match(drawerSource, /onRetry/);
  assert.match(drawerSource, />重新加载</);
  assert.match(drawerSource, /footer/);
});

test('工作台待办整条可点击且岗位详情和数字下钻含义分开', () => {
  assert.match(dashboardSource, /data-ui="dashboard-task-row"/);
  assert.match(dashboardSource, /onClick=\{item\.action\}/);
  assert.doesNotMatch(dashboardSource, /<article key=\{item\.key\}/);
  assert.match(dashboardSource, /data-ui="dashboard-demand-detail-link"/);
  assert.match(dashboardSource, /查看需求/);
  assert.match(dashboardSource, /data-ui="dashboard-drilldown-business-review"/);
  assert.match(dashboardSource, /data-ui="dashboard-drilldown-interview"/);
  assert.match(dashboardSource, /data-ui="dashboard-drilldown-offer"/);
});
