import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const rulesPath = path.join(root, 'readdy-frontend/src/pages/dashboard/stageDrilldown.ts');

assert.equal(fs.existsSync(rulesPath), true, '工作台阶段概况必须使用统一分流规则');
const { dashboardStageDrilldown, canOpenDashboardStage } = await import(`${pathToFileURL(rulesPath).href}?dashboard-stage`);

assert.deepEqual(dashboardStageDrilldown('hr_screening'), { kind: 'candidate', state: { fromDashboard: true, targetStage: 'pending' } });
assert.deepEqual(dashboardStageDrilldown('ai_screening'), { kind: 'candidate', state: { fromDashboard: true, targetStage: 'ai_screen' } });
assert.deepEqual(dashboardStageDrilldown('business_review'), { kind: 'candidate', state: { fromDashboard: true, targetStage: 'business_review' } });
assert.deepEqual(dashboardStageDrilldown('interview'), { kind: 'route', to: '/interviews?from=dashboard' });
assert.deepEqual(dashboardStageDrilldown('offer'), { kind: 'route', to: '/offers?from=dashboard' });
assert.deepEqual(dashboardStageDrilldown('onboarding'), { kind: 'route', to: '/offers?tab=onboard&from=dashboard' });
assert.equal(canOpenDashboardStage(0), false);
assert.equal(canOpenDashboardStage(1), true);

const dashboard = read('readdy-frontend/src/pages/dashboard/page.tsx');
const candidates = read('readdy-frontend/src/pages/candidates/page.tsx');
const interviews = read('readdy-frontend/src/pages/interviews/page.tsx');
const offers = read('readdy-frontend/src/pages/offers/page.tsx');

for (const label of ['HR 初筛', 'AI 筛选', '业务筛选', '面试', 'Offer', '待入职']) {
  assert.match(dashboard, new RegExp(label), `阶段概况缺少“${label}”`);
}
assert.match(dashboard, /disabled=\{!canOpenDashboardStage\(Number\(value\)\)\}/, '工作台阶段为 0 时必须禁用');
assert.match(dashboard, /fromDashboard: true, demandId: item\.demand_id, targetStage: 'business_review'/, '等待业务筛选跟进时必须保留工作台来源和准确阶段');
assert.match(candidates, /fromDashboard\?: boolean/, '候选人页必须识别来自工作台的上下文');
assert.match(candidates, /返回工作台/, '候选人页必须能返回工作台');
assert.match(interviews, /fromDashboard/, '面试页必须识别来自工作台的上下文');
assert.match(interviews, /返回工作台/, '面试页必须能返回工作台');
assert.match(interviews, /!\(fromJobs \|\| fromDashboard\) \|\| row\.pipeline_stage === 'interview'/, '工作台按岗位进入面试时不能混入历史阶段记录');
assert.match(offers, /initialOfferTab/, 'Offer 页必须支持待入职阶段直达');
assert.match(offers, /返回工作台/, 'Offer 页必须能返回工作台');
assert.match(offers, /!\(fromJobs \|\| fromDashboard\) \|\| !\['declined', 'withdrawn', 'expired', 'onboarded'\]/, '工作台按岗位进入 Offer 时不能混入已结束记录');

console.log('dashboard_stage_drilldown: OK');
