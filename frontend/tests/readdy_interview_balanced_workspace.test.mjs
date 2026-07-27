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

console.log('readdy_interview_balanced_workspace: OK');
