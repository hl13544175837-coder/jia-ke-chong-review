import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const readIfExists = (path) => existsSync(join(root, path)) ? read(path) : '';
const page = read('readdy-frontend/src/pages/dashboard/page.tsx');
const panel = readIfExists('readdy-frontend/src/pages/dashboard/components/MonthlyPerformancePanel.tsx');
const funnel = read('readdy-frontend/src/pages/dashboard/components/FunnelChart.tsx');
const types = read('readdy-frontend/src/features/analytics/types.ts');
const api = read('readdy-frontend/src/features/analytics/api.ts');

assert.match(types, /interface MonthlyPerformance/);
assert.match(api, /monthlyPerformance\(hrId: number, month: string\)/);
assert.match(panel, /自然月/);
assert.match(panel, /只展示该招聘专员负责且当月有数据的招聘需求/);
assert.match(panel, /查看岗位明细/);
assert.match(panel, /本月合计/);
assert.match(panel, /当月招聘漏斗/);
assert.match(panel, /performance\.summary\.funnel/);
assert.match(panel, /performance\.summary\.conversion_rates/);
assert.match(panel, /<FunnelChart/);
assert.match(funnel, /onStageClick/);
assert.match(funnel, /转化[^\n]*—/);
assert.doesNotMatch(funnel, /@\/mocks\/dashboard/);
assert.match(page, /MonthlyPerformancePanel/);
assert.doesNotMatch(page, /import FunnelChart/);
assert.doesNotMatch(page, /<FunnelChart/);
assert.doesNotMatch(page, /data-ui="dashboard-data-overview"/);
assert.doesNotMatch(page, /data-ui="dashboard-performance-overview"/);

console.log('dashboard_monthly_performance: OK');
