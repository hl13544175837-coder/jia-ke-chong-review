import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const navigationPath = path.join(root, 'readdy-frontend/src/pages/jobs/stageDrilldown.ts');
assert.equal(fs.existsSync(navigationPath), true, '阶段数字必须使用独立的分流规则');

const { demandStageDrilldown, canOpenDemandStage } = await import(`${pathToFileURL(navigationPath).href}?stage-drilldown`);
assert.deepEqual(demandStageDrilldown('feedback', 7), { kind: 'drawer', demandId: 7 });
assert.deepEqual(demandStageDrilldown('interview', 7), { kind: 'route', to: '/interviews?demand=7&from=jobs' });
assert.deepEqual(demandStageDrilldown('offer', 7), { kind: 'route', to: '/offers?demand=7&from=jobs' });
assert.equal(canOpenDemandStage(0), false, '数量为 0 的阶段不得打开空页面');
assert.equal(canOpenDemandStage(2), true);

const table = read('readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx');
const jobs = read('readdy-frontend/src/pages/jobs/page.tsx');
const drawer = read('readdy-frontend/src/pages/jobs/components/DemandBusinessReviewDrawer.tsx');
const interviews = read('readdy-frontend/src/pages/interviews/page.tsx');
const offers = read('readdy-frontend/src/pages/offers/page.tsx');

assert.match(table, /disabled=\{!canOpenDemandStage\(req\.stageFeedback\)\}/, '0 个业务筛选候选人必须禁用');
assert.match(table, /disabled=\{!canOpenDemandStage\(req\.stageInterview\)\}/, '0 个面试候选人必须禁用');
assert.match(table, /disabled=\{!canOpenDemandStage\(req\.stageOffer\)\}/, '0 个 Offer 必须禁用');
assert.match(jobs, /setBusinessReviewDemand\(req\.source\)/, '业务待反馈应留在需求页打开同页抽屉');
assert.match(drawer, /业务筛选进度/, '业务筛选抽屉必须说明当前内容');
assert.match(drawer, /查看简历/, '业务筛选抽屉必须可查看候选人简历');
assert.match(drawer, /催办/, '业务筛选抽屉必须提供真实催办动作');
assert.match(drawer, /businessReviewsApi\.remindTask/, '催办必须调用真实后端接口');
assert.match(drawer, /item\.status === 'pending' \|\| item\.candidate\.current_stage === 'business_review'/, '待处理任务即使阶段快照暂缺也必须展示');
assert.match(drawer, /candidatesApi\.listCandidates/, '抽屉必须以当前需求的候选人阶段为准，不能只依赖任务列表');
assert.match(drawer, /待推送业务筛选/, '进入业务筛选阶段但尚未创建任务时必须给出真实下一步');
assert.match(table, /业务筛选中/, '阶段数字必须使用与统计口径一致的名称');
assert.match(drawer, /改派/, '业务筛选抽屉必须提供改派入口');

assert.match(interviews, /row\.demand_id === requestedDemandId/, '面试页必须按需求 ID 精确限定结果');
assert.match(interviews, /!\(fromJobs \|\| fromDashboard\) \|\| row\.pipeline_stage === 'interview'/, '从“面试中”数字进入时不得混入历史面试');
assert.match(interviews, /当前岗位面试/, '面试页必须显示岗位上下文');
assert.match(interviews, /返回招聘需求/, '面试页必须提供返回入口');
assert.match(interviews, /new Set\(scopedRows\.map\(\(row\) => row\.candidate_id\)\)\.size/, '面试页必须区分候选人数和面试任务数');
assert.match(interviews, /条面试任务/, '面试页必须说清列表统计口径');
assert.match(offers, /offer\.demand_id === requestedDemandId/, 'Offer 页必须按需求 ID 精确限定结果');
assert.match(offers, /!\(fromJobs \|\| fromDashboard\) \|\| !\['declined', 'withdrawn', 'expired', 'onboarded'\]\.includes\(offer\.status\)/, '从“Offer中”数字进入时不得混入已结束 Offer');
assert.match(offers, /当前岗位 Offer/, 'Offer 页必须显示岗位上下文');
assert.match(offers, /返回招聘需求/, 'Offer 页必须提供返回入口');

console.log('demand_stage_drilldown: OK');
