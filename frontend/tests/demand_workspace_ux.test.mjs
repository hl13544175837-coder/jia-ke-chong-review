import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const helperPath = join(root, 'readdy-frontend/src/pages/jobs/workbench.ts');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

assert.ok(existsSync(helperPath), '招聘需求工作台应提供可独立验证的筛选与排序规则');

const {
  buildDemandFilterOptions,
  demandStatusLabel,
  filterAndSortRequisitions,
  matchesDemandTab,
} = await import(pathToFileURL(helperPath).href);

const row = (overrides = {}) => ({
  id: '1',
  name: '默认岗位',
  title: '默认岗位',
  department: '默认部门',
  city: '北京',
  owner: '招聘专员甲',
  priority: '普通',
  createdAt: '2026-07-01',
  deadline: '2026-08-01',
  statusCode: 'active',
  stageAll: 0,
  stageFeedback: 0,
  stageInterview: 0,
  stageOffer: 0,
  source: { request_no: 'REQ-001', approval_status: 'approved' },
  ...overrides,
});

const pending = row({ id: 'pending', statusCode: 'pending', source: { request_no: 'REQ-P', approval_status: 'pending' } });
const rejected = row({ id: 'rejected', statusCode: 'pending', source: { request_no: 'REQ-R', approval_status: 'rejected' } });
const paused = row({ id: 'paused', statusCode: 'paused' });
const closed = row({ id: 'closed', statusCode: 'closed' });
const cancelled = row({ id: 'cancelled', statusCode: 'cancelled' });
assert.equal(matchesDemandTab(pending, 'pendingApproval'), true, '待审核只识别 approval_status=pending');
assert.equal(matchesDemandTab(rejected, 'pendingApproval'), false, '已驳回不能混进待审核');
assert.equal(matchesDemandTab(paused, 'stopped'), true, '暂停需求应统一进入已停止');
assert.equal(matchesDemandTab(closed, 'stopped'), true, '关闭需求应统一进入已停止');
assert.equal(matchesDemandTab(cancelled, 'stopped'), true, '取消需求应统一进入已停止');
assert.equal(typeof demandStatusLabel, 'function', '表格应使用审批状态生成用户可见状态');
assert.equal(demandStatusLabel(pending), '待审核');
assert.equal(demandStatusLabel(rejected), '已驳回');

const oldRow = row({ id: 'old', createdAt: '2026-07-01' });
const newRow = row({ id: 'new', createdAt: '2026-07-20' });
const noCreatedAt = row({ id: 'no-date', createdAt: '' });
const urgent = row({ id: 'urgent', priority: '紧急' });
const high = row({ id: 'high', priority: '高' });
const normal = row({ id: 'normal', priority: '普通' });
const soon = row({ id: 'soon', deadline: '2026-07-28' });
const later = row({ id: 'later', deadline: '2026-08-30' });
const noDeadline = row({ id: 'no-deadline', deadline: null });
const base = { activeTab: 'all', searchQuery: '', filters: { department: '', city: '', owner: '', stage: '' } };
assert.deepEqual(filterAndSortRequisitions([oldRow, noCreatedAt, newRow], { ...base, sortField: 'newest', sortDirection: 'desc' }).map((item) => item.id), ['new', 'old', 'no-date']);
assert.deepEqual(filterAndSortRequisitions([normal, urgent, high], { ...base, sortField: 'priority', sortDirection: 'desc' }).map((item) => item.id), ['urgent', 'high', 'normal']);
assert.deepEqual(filterAndSortRequisitions([later, noDeadline, soon], { ...base, sortField: 'deadline', sortDirection: 'asc' }).map((item) => item.id), ['soon', 'later', 'no-deadline']);

const searchable = [
  row({ id: 'number', source: { request_no: 'DEMO-7788', approval_status: 'approved' } }),
  row({ id: 'job', name: '风控算法工程师', title: '风控算法工程师' }),
  row({ id: 'owner', owner: '招聘专员乙' }),
  row({ id: 'department', department: '国际业务部' }),
  row({ id: 'city', city: '深圳' }),
];
for (const [query, expected] of [['7788', 'number'], ['风控', 'job'], ['专员乙', 'owner'], ['国际业务', 'department'], ['深圳', 'city']]) {
  assert.deepEqual(filterAndSortRequisitions(searchable, { ...base, searchQuery: query, sortField: 'newest', sortDirection: 'desc' }).map((item) => item.id), [expected], `搜索应覆盖 ${query}`);
}

const options = buildDemandFilterOptions([
  row({ owner: '招聘专员甲', department: '研发部', city: '北京' }),
  row({ owner: '招聘专员乙', department: '市场部', city: '上海' }),
]);
assert.deepEqual(options.owners, ['招聘专员甲', '招聘专员乙'], '负责人选项必须来自完整需求集合');

const page = read('readdy-frontend/src/pages/jobs/page.tsx');
const table = read('readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx');
const tabs = read('readdy-frontend/src/pages/jobs/components/RequisitionTabs.tsx');
const layout = read('readdy-frontend/src/components/feature/MainLayout.tsx');
for (const label of ['全部', '待审核', '招聘中', '已完成', '已停止']) assert.match(tabs, new RegExp(label));
for (const removedLabel of ['已驳回', '已暂停', '已结束', '更多']) assert.doesNotMatch(tabs, new RegExp(removedLabel));
assert.match(layout, /displayLabel: '招聘需求'/, '招聘专员侧栏应显示“招聘需求”');
assert.match(layout, /item\.displayLabel \?\? item\.label/, '侧栏应优先渲染新的用户可见名称');
assert.match(page, /新建招聘需求/, '创建按钮应说明这是新建动作');
assert.match(page, /optionSource=\{requisitions\}/, '筛选选项必须从完整需求集合生成');
assert.match(table, /搜索需求编号、职位、负责人、部门或城市/);
assert.match(table, /清空筛选/);
assert.match(table, /移除.*筛选|removeFilter/);
assert.match(table, /\['stage', '阶段', filters\.stage\s*\?/, '未选择阶段时不能显示“阶段：全部”的假筛选标签');
assert.match(table, /排序：/);
assert.doesNotMatch(table, /statusOptions|headerFilterOpen === 'status'/, '表头不得保留重复状态筛选');
assert.match(
  table,
  /const canSelectCandidates = req\.statusCode === 'active'\s*&&\s*req\.source\.approval_status === 'approved'/,
  '选候选人只允许已通过审核且正在招聘的需求',
);
assert.doesNotMatch(
  table,
  /canSelectCandidates\s*=\s*[^;]*statusCode === 'pending'/,
  '待审核需求不得显示选候选人入口',
);

console.log('demand_workspace_ux: OK');
