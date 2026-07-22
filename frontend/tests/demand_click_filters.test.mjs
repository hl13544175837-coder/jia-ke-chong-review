import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const table = readFileSync(new URL('../src/features/demands/components/DemandTable.tsx', import.meta.url), 'utf8');
const filters = readFileSync(new URL('../src/features/demands/components/DemandFilters.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/features/demands/pages/DemandsPage.tsx', import.meta.url), 'utf8');
const types = readFileSync(new URL('../src/types/index.ts', import.meta.url), 'utf8');

for (const field of ['job_title', 'request_no', 'hc_status', 'target_date', 'pipeline_stage']) {
  assert.match(types, new RegExp(`${field}\\?`), `DemandListQuery 应包含 ${field} 真实后端筛选字段`);
}

for (const column of ['identity', 'location', 'owner', 'delivery', 'stage']) {
  assert.match(
    table,
    new RegExp(`data-ui="demand-column-filter-${column}"`),
    `${column} 表头应能打开列筛选控件`,
  );
}

for (const trigger of [
  'demand-job-filter',
  'demand-request-filter',
  'demand-department-filter',
  'demand-city-filter',
  'demand-owner-filter',
  'demand-hc-filter',
  'demand-target-date-filter',
  'demand-stage-filter',
]) {
  assert.match(table, new RegExp(`data-ui="${trigger}"`), `${trigger} 应是一键筛选入口`);
}

assert.match(table, /onApplyFilter\(\{ job_title: demand\.job_title \}\)/, '职位点击应使用服务端精确职位筛选');
assert.match(table, /onApplyFilter\(\{ request_no: demand\.request_no \}\)/, '需求编号点击应使用服务端精确编号筛选');
assert.match(table, /disabled=\{!demand\.request_no\}/, '无需求编号时应禁用编号筛选入口');
assert.doesNotMatch(table, /q: demand\.(?:job_title|request_no)/, '职位和需求编号不得再混入 q 搜索');
assert.doesNotMatch(table, /q: demand\.request_no \|\| String\(demand\.id\)/, '无需求编号时不得把内部 id 发给 q');
assert.match(table, /jobTitle: query\.job_title \?\? ''/, '表头应维护可完整输入的职位草稿');
assert.match(table, /requestNo: query\.request_no \?\? ''/, '表头应维护可完整输入的需求编号草稿');
assert.match(table, /onApplyFilter\(\{[\s\S]*job_title: drafts\.jobTitle\.trim\(\) \|\| undefined,[\s\S]*request_no: drafts\.requestNo\.trim\(\) \|\| undefined,[\s\S]*\}\)/, '表头应一次应用职位和需求编号精确筛选');
assert.match(table, /onApplyFilter\(\{ department: demand\.job_department \}\)/, '部门点击应使用服务端精确筛选');
assert.match(table, /onApplyFilter\(\{ city: demand\.job_city \}\)/, '城市点击应使用服务端精确筛选');
assert.match(table, /onApplyFilter\(\{ owner_hr_id: demand\.owner_hr_id \}\)/, '负责人点击应使用服务端负责人筛选');
assert.match(table, /hc_status: demand\.completion_suggested \? 'complete' : 'incomplete'/, 'HC 点击应筛选完成或未完成');
assert.match(table, /onApplyFilter\(\{ target_date: demand\.target_date \}\)/, '截止日期点击应使用服务端日期筛选');
assert.match(table, /onApplyFilter\(\{ pipeline_stage: filterStage \}\)/, '阶段数字点击应使用服务端当前阶段筛选');
assert.match(table, /data-ui="demand-details-trigger"/, '原详情能力应保留为明确按钮');
assert.doesNotMatch(table, /response\.items\.filter\(/, '不得只过滤当前页造成分页总数失真');

assert.match(filters, /data-ui="demand-active-filters"/, '顶部应有紧凑的当前筛选区');
for (const field of ['job_title', 'request_no', 'hc_status', 'target_date', 'pipeline_stage']) {
  assert.match(filters, new RegExp(`query\\.${field}`), `顶部应能显示 ${field} 活动条件`);
  assert.match(filters, new RegExp(`field: '${field}'`), `顶部应能单独清除 ${field}`);
}
assert.match(filters, /patch\(\{ \[filter\.field\]: undefined \}\)/, '点击活动条件应单独清除并回到第 1 页');
for (const field of ['job_title', 'request_no', 'hc_status', 'target_date', 'pipeline_stage']) {
  assert.doesNotMatch(filters, new RegExp(`value=\\{query\\.${field}`), `${field} 不应作为顶部常驻控件`);
}
assert.match(page, /function applyTableFilter[\s\S]*page: 1/, '单元格筛选后必须回到第 1 页');
assert.match(page, /query\.job_title,[\s\S]*query\.request_no,/, '精确职位或需求编号改变后应重新请求列表');
assert.match(page, /description="[^"]*点击表头或信息可筛选[^"]*右侧[^"]*"/, '页面说明应区分筛选与右侧查看详情');
assert.match(page, /query=\{query\}[\s\S]*onApplyFilter=\{applyTableFilter\}/, '表格应接入页面真实查询状态');

console.log('demand_click_filters: OK');
