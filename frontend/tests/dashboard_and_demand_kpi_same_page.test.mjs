import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
const widgets = readFileSync(new URL('../src/pages/director/widgets.tsx', import.meta.url), 'utf8');

assert.match(
  dashboard,
  /function TodoCard[\s\S]*?<button[\s\S]*data-ui="dashboard-todo-trigger"/,
  '今日待办应是当前页详情按钮，不应整卡跳转',
);
assert.match(dashboard, /function RecruiterTodoPanel\(\{\s*stats,\s*onOpenKpi,?\s*\}/, '今日待办应复用页面唯一 KPI 抽屉状态');
assert.match(
  dashboard,
  /onClick=\{\(\) => onActivate\(\{[\s\S]*?to,[\s\S]*?actionLabel: '进入完整工作台'/,
  '今日待办原入口应降级为抽屉 footer 次级动作',
);

assert.equal(
  [...widgets.matchAll(/data-ui="demand-summary-kpi-trigger"/g)].length,
  4,
  'DemandDrilldown 顶部四张 KPI 都应提供同页详情按钮',
);
assert.match(widgets, /kind: 'kpi'/, 'Demand KPI 应复用组件唯一的 selected detail 状态');
assert.match(
  widgets,
  /selectedDemandFact\?\.kind === 'kpi'/,
  'Demand KPI 事实应在现有统一抽屉中展示，避免嵌套抽屉',
);
assert.match(widgets, /进入完整工作台/, '完整工作台入口只能作为抽屉 footer 次级动作');

console.log('dashboard_and_demand_kpi_same_page: OK');
