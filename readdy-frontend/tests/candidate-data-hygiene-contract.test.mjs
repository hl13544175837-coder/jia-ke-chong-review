import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('候选人列表类型包含只读重复提示和本地演示标记', () => {
  const types = read('src/features/candidates/types.ts');

  assert.match(types, /identical_resume_count:\s*number/);
  assert.match(types, /same_name_count:\s*number/);
  assert.match(types, /is_local_demo_record:\s*boolean/);
});

test('重复信息只显示提示，不触发删除、合并或覆盖', () => {
  const page = read('src/features/candidates/components/library/CandidateLibraryTable.tsx');

  assert.match(page, /相同文件\s*\{candidate\.identical_resume_count\}\s*条/);
  assert.match(page, /同名\s*\{candidate\.same_name_count\}\s*条/);
  assert.match(page, /candidate\.identical_resume_count\s*>\s*1/);
  assert.match(page, /candidate\.same_name_count\s*>\s*1/);
});

test('本地演示筛选只过滤当前已加载结果，并提供可恢复空态', () => {
  const filters = read('src/features/candidates/library/useCandidateLibraryFilters.ts');
  const filterUi = read('src/features/candidates/components/library/CandidateLibraryFilters.tsx');
  const viewModel = read('src/features/candidates/library/candidateLibraryViewModel.ts');
  const table = read('src/features/candidates/components/library/CandidateLibraryTable.tsx');
  const ui = `${filters}\n${filterUi}\n${viewModel}\n${table}`;

  assert.match(filters, /const \[hideLocalDemoRecords, setHideLocalDemoRecords\] = useState\(false\)/);
  assert.match(viewModel, /candidates\.filter\(\(candidate\) => !candidate\.is_local_demo_record\)/);
  assert.match(ui, /隐藏本地演示数据/);
  assert.match(ui, /仅筛选当前页已加载结果，不会删除数据/);
  assert.match(ui, /当前筛选条件下没有候选人/);
  assert.match(ui, /显示全部数据/);
});
