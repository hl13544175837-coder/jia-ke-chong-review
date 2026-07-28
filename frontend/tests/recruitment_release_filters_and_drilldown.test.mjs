import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const demandModelPath = path.join(root, 'readdy-frontend/src/pages/jobs/workbench.ts');
const demandModel = await import(`${pathToFileURL(demandModelPath).href}?release-filter`);

const baseDemand = {
  id: '1',
  name: 'Java 开发工程师',
  title: 'Java 开发工程师',
  owner: '招聘专员01',
  department: '技术部',
  city: '上海',
  priority: '高',
  deadline: '2026-08-01',
  createdAt: '2026-07-28',
  statusCode: 'active',
  remainingHeadcount: 2,
  stageAll: 1,
  stageFeedback: 0,
  stageInterview: 1,
  stageOffer: 0,
  source: { approval_status: 'approved', request_no: 'REQ-001' },
};
const demandQuery = {
  activeTab: 'all',
  searchQuery: '',
  filters: { department: '', city: '', owner: '', stage: '', headcount: 'available', deadline: '' },
  sortField: 'newest',
  sortDirection: 'desc',
};
assert.equal(demandModel.filterAndSortRequisitions([baseDemand, { ...baseDemand, id: '2', remainingHeadcount: 0 }], demandQuery).length, 1, 'HC 表头筛选应只留下仍有名额的岗位');

const interviewModel = read('readdy-frontend/src/pages/interviews/workbench.ts');
assert.match(interviewModel, /schedule: string/, '面试筛选模型应保存面试安排条件');
assert.match(interviewModel, /filters\.schedule === 'unassigned'/, '面试安排表头应能筛出待安排任务');

const demandTable = read('readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx');
for (const key of ['identity', 'location', 'owner', 'delivery', 'stage', 'status']) {
  assert.match(demandTable, new RegExp(`<HeaderFilter id="${key}"`), `招聘需求缺少 ${key} 表头筛选`);
}
const interviewTable = read('readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx');
for (const key of ['round', 'schedule', 'interviewer', 'status']) {
  assert.match(interviewTable, new RegExp(`<HeaderFilter id="${key}"`), `面试管理缺少 ${key} 表头筛选`);
}
assert.match(demandTable, /max-h-60[^"']*overflow-y-auto/, '招聘需求表头筛选应使用向下可滚动列表');
assert.match(interviewTable, /max-h-60[^"']*overflow-y-auto/, '面试管理表头筛选应使用向下可滚动列表');

const dashboard = read('readdy-frontend/src/pages/dashboard/page.tsx');
for (const key of ['business-review', 'interview', 'offer', 'onboarded']) {
  assert.match(dashboard, new RegExp(`data-ui="dashboard-drilldown-${key}"`), `工作台缺少 ${key} 精准入口`);
}
assert.match(dashboard, /MonthlyPerformancePanel/, '工作台应使用新的自然月数据看板');
assert.doesNotMatch(dashboard, /dashboard-data-overview|dashboard-performance-overview/, '旧底部数据板块应移除');
assert.match(dashboard, /targetStage: 'business_review'/, '业务筛选人数必须直达对应候选人阶段');
assert.match(dashboard, /\?status=scheduled&from=dashboard/, '已排面试必须直达已安排列表');

console.log('recruitment_release_filters_and_drilldown: OK');
