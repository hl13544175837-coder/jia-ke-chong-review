import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const readIfPresent = (file) => existsSync(path.join(root, file)) ? read(file) : '';

const analyticsPage = read('src/pages/analytics/page.tsx');
const panels = readIfPresent('src/features/analytics/components/ManagementAnalyticsPanels.tsx');
const dashboardSources = analyticsPage + panels;

test('第39项使用独立管理分析组件，不把图表继续堆进页面', () => {
  assert.match(analyticsPage, /ManagementAnalyticsPanels/);
  assert.match(analyticsPage, /<ManagementAnalyticsPanels\s+data=\{data\}/);
  assert.match(panels, /export default function ManagementAnalyticsPanels/);
});

test('管理图表按需加载，避免拖慢其他页面和管理看板首屏', () => {
  assert.match(analyticsPage, /lazy\(\(\)\s*=>\s*import\(['"]@\/features\/analytics\/components\/ManagementAnalyticsPanels['"]\)\)/);
  assert.match(analyticsPage, /<Suspense\s+fallback=/);
});

test('管理看板同时展示双线趋势、阶段占比和流程卡点', () => {
  assert.match(panels, /LineChart/);
  assert.match(panels, /PieChart/);
  assert.match(panels, /BarChart/);
  assert.match(panels, /data-ui="management-trend-comparison"/);
  assert.match(panels, /data-ui="management-stage-share"/);
  assert.match(panels, /data-ui="management-bottleneck-analysis"/);
  assert.match(panels, /招聘趋势对比/);
  assert.match(panels, /候选人阶段占比/);
  assert.match(panels, /流程卡点分析/);
});

test('趋势时间范围可以选择且只裁剪已有真实月度数据', () => {
  assert.match(dashboardSources, /aria-label="趋势时间范围"/);
  assert.match(dashboardSources, /近 3 个月/);
  assert.match(dashboardSources, /近 6 个月/);
  assert.match(dashboardSources, /近 7 个月/);
  assert.match(panels, /monthly_trends\.slice\(-trendMonths\)/);
  assert.match(panels, /dataKey="hires"/);
  assert.match(panels, /dataKey="offers"/);
});

test('阶段占比和卡点都由当前真实候选人数据计算，不写死审批图数字', () => {
  assert.match(panels, /funnel\.pending/);
  assert.match(panels, /funnel\.ai_screen/);
  assert.match(panels, /funnel\.business_review/);
  assert.match(panels, /candidate\.age_days/);
  assert.match(panels, /candidate\.stage/);
  assert.match(panels, /最大卡点/);
  assert.doesNotMatch(panels, /4\.8/);
});

test('原有指标和明细下钻继续保留', () => {
  assert.match(analyticsPage, /data-ui="analytics-kpi-drilldown"/);
  assert.match(analyticsPage, /data-ui="analytics-insight-detail"/);
  assert.match(analyticsPage, /ManagerTeamResponsibilityPanel/);
});
