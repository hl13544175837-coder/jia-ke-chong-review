import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboard = readFileSync(join(__dirname, '../src/pages/DashboardPage.tsx'), 'utf8');

assert.match(dashboard, /data-ui="readdy-dashboard"/, '工作台应使用 Readdy 最终页面布局');
assert.match(dashboard, /api\.listCandidates/, '工作台候选人数必须来自真实 API');
assert.match(dashboard, /api\.biOverview/, '主管工作台必须读取真实 Demand BI');
assert.match(dashboard, /数据暂不可用/, '工作台必须区分接口错误和真实零值');
assert.match(dashboard, /今日待办|管理提醒/, 'Readdy 工作台首屏应优先展示待处理事项');
assert.doesNotMatch(dashboard, /@\/mocks|zhipin-current-role/, '正式工作台不能读取 Readdy mock 或本地切换角色');
assert.doesNotMatch(dashboard, /getRecruiterPerformance|performanceStats/, '工作台不能把运营数据做成人员绩效排名');

console.log('readdy_dashboard_contract: OK');
