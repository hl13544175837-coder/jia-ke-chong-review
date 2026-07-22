import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
const widgets = readFileSync(new URL('../src/pages/director/widgets.tsx', import.meta.url), 'utf8');

assert.match(dashboard, /selectedManagementAlert/, '工作台管理提醒应只选中一条真实提醒');
assert.match(
  dashboard,
  /<button[\s\S]*data-ui="dashboard-management-alert-trigger"/,
  '工作台管理提醒首击应是当前页按钮，不应是整行跳转链接',
);
assert.match(dashboard, /testId="dashboard-management-alert-drawer"/, '工作台提醒应在右侧详情抽屉展示');
assert.match(
  dashboard,
  /<Link[\s\S]*to=\{selectedManagementAlert\.action_path[\s\S]*进入完整工作台/,
  '工作台提醒的原工作流入口只能保留为抽屉内的次级动作',
);

assert.match(
  widgets,
  /<button[\s\S]*data-ui="director-alert-trigger"/,
  '总监提醒首击应打开当前页详情',
);
assert.match(widgets, /testId="director-alert-drawer"/, '总监提醒应使用右侧详情抽屉');
assert.match(
  widgets,
  /<button[\s\S]*data-ui="demand-funnel-stage-trigger"/,
  'Demand 阶段条首击应停留当前页',
);
assert.match(widgets, /testId="demand-funnel-stage-drawer"/, 'Demand 阶段事实应在抽屉展示');
assert.match(
  widgets,
  /data-ui="demand-stage-age-trigger"[\s\S]*data-ui="demand-feedback-trigger"/,
  '停留候选人与待补反馈都应提供同页详情入口',
);
assert.match(widgets, /testId="demand-fact-drawer"/, 'Demand 候选人和反馈事实应共用一个选中详情抽屉');
assert.match(
  widgets,
  /进入完整工作台/,
  '抽屉 footer 应明确标注次级完整工作台入口',
);

console.log('primary_information_same_page_drawers: OK');
