import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('候选人筛选状态区分页面范围、精确流程状态和入库日期', () => {
  const types = read('src/features/candidates/types.ts');
  const filters = read('src/features/candidates/library/useCandidateLibraryFilters.ts');
  const data = read('src/features/candidates/library/useCandidateLibraryData.ts');

  assert.match(types, /export type PipelineState/);
  assert.match(types, /created_from\?: string/);
  assert.match(types, /created_to\?: string/);
  assert.match(filters, /pipelineStateFilter/);
  assert.match(filters, /createdFrom/);
  assert.match(filters, /createdTo/);
  assert.match(data, /created_from: createdFrom/);
  assert.match(data, /created_to: createdTo/);
  assert.doesNotMatch(filters, /const \[skillFilter/);
  assert.doesNotMatch(filters, /const \[scoreFilter/);
});

test('候选人筛选采用等宽紧凑布局且顶部和表头不重复', () => {
  const filterBar = read('src/components/ui/FilterBar.tsx');
  const filters = read('src/features/candidates/components/library/CandidateLibraryFilters.tsx');
  const table = read('src/features/candidates/components/library/CandidateLibraryTable.tsx');

  assert.match(filterBar, /FILTER_GRID_CLASS/);
  assert.match(filterBar, /grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(filters, /入库开始日期/);
  assert.match(filters, /入库结束日期/);
  assert.match(filters, /来源渠道/);
  assert.match(filters, /解析状态/);
  assert.match(filters, /排序方式/);
  assert.doesNotMatch(filters, /技能关键词/);
  assert.doesNotMatch(filters, /最低技能分/);
  assert.match(table, /label="学历"/);
  assert.match(table, /label="意向城市"/);
  assert.doesNotMatch(table, /label="学历 \/ 城市"/);
  assert.doesNotMatch(table, /label="核心技能"/);
  assert.doesNotMatch(table, /data-ui="candidate-column-filter-parse"/);
  assert.doesNotMatch(table, /data-ui="candidate-column-filter-source"/);
  assert.doesNotMatch(table, /data-ui="candidate-column-filter-created"/);
  assert.match(table, /has_rejected_history/);
  assert.match(table, /setPipelineStateFilter/);
});

test('已有列表筛选栏复用同一套等宽控件和紧凑间距', () => {
  const filterPages = [
    'src/pages/jobs/components/RequisitionTable.tsx',
    'src/pages/interviews/components/InterviewWorkbenchToolbar.tsx',
    'src/pages/offers/page.tsx',
    'src/pages/interviewer/screening/page.tsx',
    'src/pages/interviewer/interviews/page.tsx',
  ];

  for (const path of filterPages) {
    const source = read(path);
    assert.match(source, /FILTER_GRID_CLASS/, `${path} 应使用统一筛选网格`);
    assert.match(source, /FILTER_CONTROL_CLASS/, `${path} 应使用统一筛选控件尺寸`);
  }
});
