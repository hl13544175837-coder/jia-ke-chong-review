import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const widgets = readFileSync(new URL('../src/pages/director/widgets.tsx', import.meta.url), 'utf8');
const analytics = readFileSync(new URL('../src/pages/AnalyticsPage.tsx', import.meta.url), 'utf8');
const cockpit = readFileSync(new URL('../src/pages/director/DirectorCockpitPage.tsx', import.meta.url), 'utf8');

assert.match(
  widgets,
  /export function KpiCard\([\s\S]*onActivate/,
  '共享 KPI 卡应支持可选的同页下钻行为',
);
assert.match(
  widgets,
  /type="button"[\s\S]*onClick=\{onActivate\}/,
  '可下钻 KPI 应使用真实按钮语义',
);

assert.match(analytics, /analyticsKpiDetail/, '数据分析页应保存当前 KPI 下钻上下文');
assert.match(
  analytics,
  /<DrawerShell[\s\S]*analytics-kpi-drawer/,
  '数据分析 KPI 应在当前页右侧抽屉打开',
);
assert.match(analytics, /onActivate=\{\(\) => setAnalyticsKpiDetail/, '数据分析 KPI 应可点击');

assert.match(cockpit, /cockpitKpiDetail/, '总监驾驶舱应保存当前 KPI 下钻上下文');
assert.match(
  cockpit,
  /<DrawerShell[\s\S]*director-cockpit-kpi-drawer/,
  '驾驶舱 KPI 应在当前页右侧抽屉打开',
);
assert.match(cockpit, /onActivate=\{\(\) => setCockpitKpiDetail/, '驾驶舱 KPI 应可点击');

console.log('analytics_same_page_drilldown: OK');
