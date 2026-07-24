import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const page = fs.readFileSync(path.join(root, 'readdy-frontend/src/pages/kanban/page.tsx'), 'utf8');

assert.match(page, /demandsApi\.listDemands/, '看板必须读取真实招聘需求');
assert.match(page, /pipelineApi\.getBoard/, '看板必须读取 Demand 维度真实流程');
assert.match(page, /pipelineApi\.getHistory/, '看板必须读取候选人真实历史');
assert.match(page, /pipelineApi\.moveCandidate/, 'HR 推进必须写入真实流程接口');
assert.match(page, /business_review/, '看板必须保留业务筛选阶段');
assert.match(page, /interview/, '看板必须保留统一面试阶段');
assert.match(page, /offer/, '看板必须保留 Offer 阶段');
assert.match(page, /状态已变化|刷新最新状态/, '409 冲突必须提示刷新');
assert.doesNotMatch(page, /@\/mocks\/candidates|candidateList/, '看板不得读取候选人假数据');
assert.doesNotMatch(page, /报表月份|报表已导出/, '无真实接口的月份与导出不得保留假交互');
assert.doesNotMatch(page, /stage:\s*['"]onboarded['"]/, '看板不能直接手工推进到入职');

console.log('readdy_mysql_pilot_pipeline_ui_contract: OK');
