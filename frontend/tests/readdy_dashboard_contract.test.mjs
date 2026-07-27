import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboard = readFileSync(join(__dirname, '../src/pages/DashboardPage.tsx'), 'utf8');
const readdyDashboard = readFileSync(join(__dirname, '../../readdy-frontend/src/pages/dashboard/page.tsx'), 'utf8');
const interviewerDashboard = readFileSync(join(__dirname, '../../readdy-frontend/src/pages/interviewer/dashboard/page.tsx'), 'utf8');

assert.match(dashboard, /data-ui="readdy-dashboard"/, '工作台应使用 Readdy 最终页面布局');
assert.match(dashboard, /api\.listCandidates/, '工作台候选人数必须来自真实 API');
assert.match(dashboard, /api\.biOverview/, '主管工作台必须读取真实 Demand BI');
assert.match(dashboard, /数据暂不可用/, '工作台必须区分接口错误和真实零值');
assert.match(dashboard, /今日待办|管理提醒/, 'Readdy 工作台首屏应优先展示待处理事项');
assert.doesNotMatch(dashboard, /@\/mocks|zhipin-current-role/, '正式工作台不能读取 Readdy mock 或本地切换角色');
assert.doesNotMatch(dashboard, /getRecruiterPerformance|performanceStats/, '工作台不能把运营数据做成人员绩效排名');

assert.match(readdyDashboard, /demandsApi\./, '5190 招聘工作台必须读取真实需求数据');
assert.doesNotMatch(readdyDashboard, /candidatesApi\./, '5190 招聘工作台移除候选人总数卡片后不得继续请求无用数据');
assert.match(readdyDashboard, /interviewsApi\./, '5190 招聘工作台必须读取真实面试数据');
assert.match(readdyDashboard, /offersApi\./, '5190 招聘工作台必须读取真实 Offer 数据');
assert.match(readdyDashboard, /数据暂不可用/, '5190 工作台必须区分接口失败和真实零值');
for (const label of ['草稿', '待审批', '待发放', '待回复', '待入职']) {
  assert.ok(readdyDashboard.includes(label), `5190 工作台必须用中文展示 Offer 状态“${label}”`);
}
assert.doesNotMatch(readdyDashboard, /当前状态 \{item\.status\}/, '5190 工作台不得向用户展示 Offer 内部状态代码');
assert.doesNotMatch(readdyDashboard, /@\/mocks|zhipin-current-role|getRecruiterPerformance/, '5190 工作台不能读取演示数据或本地假角色');

assert.match(interviewerDashboard, /businessReviewsApi\.listMine/, '面试官工作台必须读取真实业务筛选任务');
assert.match(interviewerDashboard, /interviewsApi\.listMyAssignments/, '面试官工作台必须读取真实面试任务');
assert.match(interviewerDashboard, /数据暂不可用/, '面试官工作台必须提示真实接口读取失败');
assert.doesNotMatch(interviewerDashboard, /@\/mocks/, '面试官工作台不能混入演示待办');

console.log('readdy_dashboard_contract: OK');
