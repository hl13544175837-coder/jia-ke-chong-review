import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('普通筛选使用紧凑可收缩工具栏且绿色状态栏不在收缩区域内', () => {
  const filterBar = read('src/components/ui/FilterBar.tsx');
  const collapsiblePath = new URL('../src/components/ui/CollapsibleFilterBar.tsx', import.meta.url);

  assert.ok(existsSync(collapsiblePath), '应提供统一的 CollapsibleFilterBar 组件');
  const collapsible = read('src/components/ui/CollapsibleFilterBar.tsx');

  assert.match(filterBar, /FILTER_FIELD_CLASS/);
  assert.match(filterBar, /sm:w-40/);
  assert.match(filterBar, /h-9/);
  assert.doesNotMatch(filterBar, /FILTER_GRID_CLASS/);
  assert.match(collapsible, /activeFilterCount/);
  assert.match(collapsible, /aria-expanded/);
  assert.match(collapsible, /收起筛选/);
  assert.match(collapsible, /展开筛选/);
  assert.doesNotMatch(collapsible, /WorkspaceTabs/);
});

test('候选人顶部和表头筛选不重复', () => {
  const filters = read('src/features/candidates/components/library/CandidateLibraryFilters.tsx');
  const table = read('src/features/candidates/components/library/CandidateLibraryTable.tsx');

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

test('普通筛选位于绿色状态分类上方且页面复用同一套紧凑控件', () => {
  const orderedPages = [
    ['src/features/candidates/components/library/CandidateLibraryFilters.tsx', 'CollapsibleFilterBar', 'WorkspaceTabs'],
    ['src/pages/interviews/components/InterviewWorkbenchToolbar.tsx', 'CollapsibleFilterBar', 'WorkspaceTabs'],
    ['src/pages/offers/page.tsx', 'CollapsibleFilterBar', 'WorkspaceTabs'],
    ['src/pages/interviewer/screening/page.tsx', 'CollapsibleFilterBar', 'WorkspaceTabs'],
    ['src/pages/interviewer/interviews/page.tsx', 'CollapsibleFilterBar', 'WorkspaceTabs'],
  ];

  for (const [path, filters, tabs] of orderedPages) {
    const source = read(path);
    assert.ok(source.indexOf(`<${filters}`) >= 0, `${path} 应使用统一可收缩筛选栏`);
    assert.ok(source.indexOf(`<${filters}`) < source.indexOf(`<${tabs}`), `${path} 普通筛选必须位于状态分类上方`);
    assert.match(source, /FILTER_FIELD_CLASS/, `${path} 应使用统一紧凑字段宽度`);
    assert.match(source, /FILTER_CONTROL_CLASS/, `${path} 应使用统一筛选控件尺寸`);
  }

  const jobsPage = read('src/pages/jobs/page.tsx');
  assert.ok(jobsPage.indexOf('<RequisitionFilters') >= 0, '招聘需求页应把筛选移出表格');
  assert.ok(jobsPage.indexOf('<RequisitionFilters') < jobsPage.indexOf('<RequisitionTabs'), '招聘需求普通筛选必须位于状态分类上方');
  assert.ok(jobsPage.indexOf('<RequisitionTabs') < jobsPage.indexOf('<RequisitionTable'), '招聘需求状态分类必须位于列表上方');
});
