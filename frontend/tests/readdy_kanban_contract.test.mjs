import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/KanbanPage.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');

// 页面标识与真实 API 调用（禁止 mock 数据）。
assert.match(page, /data-ui="readdy-kanban"/);
assert.match(page, /api\.listDemands/);
assert.match(page, /api\.getDemandPipelineBoard/);
assert.match(page, /api\.movePipeline/);
assert.match(page, /api\.listOffers/);
assert.match(page, /api\.getDemandPipelineHistory/);

// 角色守卫：面试官仅查看，不显示推进/淘汰/修正按钮。
assert.match(page, /role !== 'interviewer'/);
assert.match(page, /面试官角色仅可查看/);

// 状态覆盖：加载骨架、真实空态（区分无需求/无候选人）、错误重试。
assert.match(page, /Skeleton/);
assert.match(page, /ErrorState/);
assert.match(page, /EmptyState/);
assert.match(page, /暂无招聘需求/);
assert.match(page, /该需求暂无候选人/);
assert.match(page, /不是加载失败/);

// 需求选择器与跳转引导。
assert.match(page, /kanban-demand-select/);
assert.match(page, /to="\/jobs"/);

// 禁止引用 Readdy mock 或本地伪造数据源。
assert.doesNotMatch(page, /mocks\/candidates|candidateList|sessionStorage|zhipin-current-role|@\/mocks/);

// 依赖的 API 方法真实存在于 api client。
assert.match(api, /listDemands\(/);
assert.match(api, /getDemandPipelineBoard\(/);
assert.match(api, /movePipeline\(/);
assert.match(api, /getDemandPipelineHistory\(/);
assert.match(api, /listOffers\(/);

console.log('readdy_kanban_contract: OK');
