import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const modelPath = path.join(root, 'readdy-frontend/src/pages/interviews/workbench.ts');

assert.ok(existsSync(modelPath), '面试管理必须有独立筛选模型');
const model = read('readdy-frontend/src/pages/interviews/workbench.ts');
for (const symbol of [
  'emptyInterviewFilters',
  'rowStatus',
  'statusLabel',
  'interviewLocalDateKey',
  'deriveInterviewFilterOptions',
  'filterInterviewRows',
  'activeInterviewFilterCount',
]) {
  assert.match(model, new RegExp(`export (const|function) ${symbol}`), `缺少 ${symbol}`);
}
assert.doesNotMatch(model, /@\/mocks\//, '筛选模型不得依赖 Mock 数据');

const toolbarPath = path.join(root, 'readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx');
const popoverPath = path.join(root, 'readdy-frontend/src/pages/interviews/components/InterviewFilterPopover.tsx');
assert.ok(existsSync(toolbarPath), '面试管理必须有单排工具栏组件');
assert.ok(existsSync(popoverPath), '面试筛选必须使用隐藏式浮层');
const toolbar = read('readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx');
const popover = read('readdy-frontend/src/pages/interviews/components/InterviewFilterPopover.tsx');
for (const label of ['搜索候选人、岗位或面试官', '筛选', '列表', '日历']) {
  assert.ok(toolbar.includes(label), `单排工具栏缺少“${label}”`);
}
for (const label of ['岗位', '面试官', '日期范围', '面试轮次', '城市', '部门', '重置全部']) {
  assert.ok(popover.includes(label), `筛选浮层缺少“${label}”`);
}
assert.match(toolbar, /Escape/, '筛选浮层必须支持 Esc 关闭');
assert.match(popover, /onApply/, '筛选浮层必须支持确认应用');
assert.match(toolbar, /activeInterviewFilterCount/, '筛选按钮必须显示有效筛选数量');
assert.match(toolbar, /data-interview-filter-root/, '筛选按钮和浮层必须共享同一外部点击边界');

const tablePath = path.join(root, 'readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx');
assert.ok(existsSync(tablePath), '面试管理必须使用平衡双行表格');
const table = read('readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx');
for (const label of ['候选人 / 应聘岗位', '轮次', '面试安排', '面试官', '状态', '操作']) {
  assert.ok(table.includes(label), `平衡表格缺少“${label}”列`);
}
for (const action of ['安排面试', '调整安排', '确认已面试', '催反馈', '查看反馈']) {
  assert.ok(table.includes(action), `平衡表格缺少“${action}”操作`);
}
assert.match(table, /更多操作/, '低频操作必须收进更多菜单');
assert.doesNotMatch(table, /@\/mocks\//, '平衡表格不得依赖 Mock 数据');

const calendarPath = path.join(root, 'readdy-frontend/src/pages/interviews/components/InterviewManagementCalendar.tsx');
assert.ok(existsSync(calendarPath), '面试管理必须提供真实日历视图');
const calendar = read('readdy-frontend/src/pages/interviews/components/InterviewManagementCalendar.tsx');
assert.match(calendar, /InterviewManagementRow/, '日历必须消费真实管理行');
assert.match(calendar, /待安排/, '日历必须保留未排期任务入口');
assert.match(calendar, /今天/, '日历必须支持回到今天');
assert.match(calendar, /onOpenDetails/, '日历任务必须打开同一详情');
assert.doesNotMatch(calendar, /@\/mocks\//, '日历不得重新接入旧 Mock 数据');

console.log('readdy_interview_balanced_workspace: OK');
