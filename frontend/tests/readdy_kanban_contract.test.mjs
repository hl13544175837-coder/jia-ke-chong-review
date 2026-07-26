import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/KanbanPage.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');

// 页面标识与真实 API 调用（禁止 mock 数据）。
assert.match(page, /data-ui="readdy-kanban"/);
assert.match(page, /api\.listDemands/);
assert.match(
  page,
  /api\.getDemand\(requestedDemandId\)/,
  '显式 Demand 深链必须单独按 ID 查询，不能被前 100 条列表截断',
);
assert.match(page, /api\.getDemandPipelineBoard/);
assert.match(page, /api\.movePipeline/);
assert.match(page, /api\.transferPipeline/);
assert.match(page, /api\.listOffers/);
assert.match(page, /api\.getDemandPipelineHistory/);
assert.match(page, /to="\/offers"/, 'Offer 阶段必须引导到 Offer 管理完成确认入职');
assert.match(page, /offerActionGuidance/, 'Offer 阶段必须按真实 Offer 状态给出下一步引导');
assert.match(page, /stage\.key !== 'onboarded'/, '阶段修正不能将候选人直接写入已入职');

const sharedStages = readFileSync(new URL('../src/lib/pipelineInsights.ts', import.meta.url), 'utf8');
assert.doesNotMatch(sharedStages, /offer:\s*'onboarded'/, '普通阶段推进不能绕过 Offer 确认入职');

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
assert.match(
  page,
  /offersAsync\.error[\s\S]*Offer 状态加载失败[\s\S]*offersAsync\.reload/,
  'Offer 徽标接口失败必须可见且可重试，不能伪装成没有 Offer',
);

// 需求选择器与跳转引导。
assert.match(page, /kanban-demand-select/);
assert.match(page, /selectableDemands\.map/);
assert.match(page, /to="\/jobs"/);
assert.match(page, /useSearchParams/);
assert.match(page, /searchParams\.get\('demand'\)/);
assert.match(page, /searchParams\.get\('job'\)/);
assert.match(page, /searchParams\.get\('candidate'\)/);
assert.match(page, /系统不会替你猜/);
assert.match(page, /链接中的招聘需求编号无效/);
assert.match(page, /链接中的岗位编号无效/);
assert.match(page, /requestedStage/);
assert.match(page, /kanban-stage-\$\{stage\.key\}/);
assert.match(page, /转到其他需求/);
assert.match(page, /转需原因（必填）/);
assert.match(page, /isDemandWritable/);
assert.match(page, /canTransfer/);
assert.match(page, /candidate\.stage !== 'transferred'/);
assert.match(page, /高亮的候选人不在当前需求流程中/);
assert.match(page, /maxLength=\{240\}/, '转需原因长度必须与后端 240 字保存上限一致');
assert.match(
  page,
  /const moved = await moveCandidate[\s\S]*if \(moved\) setRejectTarget\(null\)/,
  '阶段写入失败时必须保留淘汰弹窗与用户输入',
);
assert.match(
  page,
  /const moved = await moveCandidate[\s\S]*if \(moved\) setCorrectTarget\(null\)/,
  '阶段写入失败时必须保留修正弹窗与用户输入',
);

// 禁止引用 Readdy mock 或本地伪造数据源。
assert.doesNotMatch(page, /mocks\/candidates|candidateList|sessionStorage|zhipin-current-role|@\/mocks/);

// 依赖的 API 方法真实存在于 api client。
assert.match(api, /listDemands\(/);
assert.match(api, /getDemandPipelineBoard\(/);
assert.match(api, /movePipeline\(/);
assert.match(api, /transferPipeline\(/);
assert.match(api, /getDemandPipelineHistory\(/);
assert.match(api, /listOffers\(/);

console.log('readdy_kanban_contract: OK');
