import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const table = readFileSync(new URL('../src/features/demands/components/DemandTable.tsx', import.meta.url), 'utf8');
const filters = readFileSync(new URL('../src/features/demands/components/DemandFilters.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/features/demands/pages/DemandsPage.tsx', import.meta.url), 'utf8');
const types = readFileSync(new URL('../src/types/index.ts', import.meta.url), 'utf8');

for (const field of ['job_title', 'request_no', 'hc_status', 'target_date', 'pipeline_stage']) {
  assert.match(types, new RegExp(`${field}\\?`), `DemandListQuery 应包含 ${field} 真实后端筛选字段`);
}

for (const column of ['identity', 'location', 'owner', 'delivery', 'stage', 'status']) {
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
  'demand-target-date-filter',
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
assert.match(table, /aria-label="按招聘负责人筛选"/, '负责人筛选应留在表头');
assert.match(table, /data-ui="demand-owner-detail-trigger"/, '行内负责人应是详情入口');
assert.match(table, /aria-label=\{`在右侧查看负责人详情：\$\{demand\.owner_hr_name/, '负责人详情入口应说明点击动作');
assert.match(table, /onOpenDemand\(demand, \{ kind: 'owner' \}\)/, '负责人点击应在右侧打开责任人详情');
assert.match(table, /aria-label="按 HC 进度筛选"/, 'HC 筛选应留在表头');
assert.match(table, /data-ui="demand-hc-detail-trigger"/, '行内 HC 应是详情入口');
assert.match(table, /aria-label=\{`在右侧查看 HC 交付详情：\$\{demand\.metrics\.onboarded_count\} \/ \$\{demand\.headcount\}`\}/, 'HC 详情入口应说明点击动作');
assert.match(table, /onOpenDemand\(demand, \{ kind: 'headcount' \}\)/, 'HC 点击应在右侧打开交付详情');
assert.match(table, /onApplyFilter\(\{ target_date: demand\.target_date \}\)/, '截止日期点击应使用服务端日期筛选');
assert.match(table, /aria-label="按需求状态筛选"/, '状态表头应提供明确筛选控件');
assert.match(table, /onApplyFilter\(\{[\s\S]*status:[\s\S]*event\.target\.value/, '状态表头应使用服务端状态筛选');
assert.match(table, /aria-label="按候选人阶段筛选"/, '阶段筛选应留在表头');
assert.match(table, /data-ui="demand-stage-detail-trigger"/, '阶段数字应是当前需求的详情入口');
assert.match(table, /onOpen\(demand, \{ kind: 'stage', stage, label \}\)/, '阶段数字应在右侧打开对应需求和阶段');
assert.match(table, /data-ui="demand-status-detail-trigger"/, '行内状态应是右侧详情入口');
assert.match(table, /onOpenDemand\(demand, \{ kind: 'status' \}\)/, '行内状态应打开状态与风险抽屉');
assert.doesNotMatch(table, /onApplyFilter\(\{ pipeline_stage: filterStage \}\)/, '行内阶段不应又筛选列表又打开详情');
assert.doesNotMatch(table, /onApplyFilter\(\{ status: demand\.status \}\)/, '行内状态不应又筛选列表又打开详情');
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
assert.match(page, /description="[^"]*表头[^"]*筛选[^"]*行内负责人、HC、阶段和状态[^"]*右侧[^"]*"/, '页面说明应区分表头筛选与行内右侧详情');
assert.match(page, /query=\{query\}[\s\S]*onApplyFilter=\{applyTableFilter\}/, '表格应接入页面真实查询状态');

console.log('demand_click_filters: OK');
