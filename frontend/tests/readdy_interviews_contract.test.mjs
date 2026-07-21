import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/ReaddyInterviewsPage.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');

// Readdy 视觉嫁接标记
assert.match(page, /data-ui="readdy-interviews"/);

// 必须调用真实 API 方法
assert.match(page, /api\.listInterviewAssignments/);
assert.match(page, /api\.listInterviews\(/);
assert.match(page, /api\.listDemands\(/);
assert.match(page, /api\.listInterviewers\(/);
assert.match(page, /api\.createInterviewAssignment/);
assert.match(page, /api\.cancelInterviewAssignment/);
assert.match(page, /api\.getDemandPipelineBoard/);

// 禁止引入 mock 数据 / 本地存储角色 hack
assert.doesNotMatch(page, /mocks\/interviews|zhipin-current-role|sessionStorage|initialInterviews/);

// 空态 / 错误态 / 加载态
assert.match(page, /暂无面试任务/);
assert.match(page, /暂无符合条件的面试/);
assert.match(page, /加载失败/);
assert.match(page, /加载面试任务/);
assert.match(page, /ErrorState/);
assert.match(page, /EmptyState/);
assert.match(page, /Spinner/);

// 安排面试关键交互
assert.match(page, /安排面试/);
assert.match(page, /interviewer_schedule_conflict/);
assert.match(page, /默认面试官/);
assert.match(page, /pending \/ active/);

// 取消面试关键交互（必填原因）
assert.match(page, /取消面试/);
assert.match(page, /取消原因（必填）/);

// 待反馈标记 + 查看/填写反馈入口
assert.match(page, /待反馈/);
assert.match(page, /填写反馈/);
assert.match(page, /查看反馈/);

// 无权限提示
assert.match(page, /无权限/);

// 反馈提交不得自动推进主流程：只允许调用反馈接口，禁止 pipeline move
assert.doesNotMatch(page, /movePipeline|api\.transferPipeline/);

// api.ts 中确实存在这些方法
assert.match(api, /listInterviewAssignments\(/);
assert.match(api, /createInterviewAssignment\(/);
assert.match(api, /cancelInterviewAssignment\(/);
assert.match(api, /listInterviewers\(/);

console.log('readdy_interviews_contract: OK');
