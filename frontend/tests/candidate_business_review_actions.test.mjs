import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const actionPath = 'readdy-frontend/src/features/businessReviews/actions.ts';
assert.ok(fs.existsSync(path.join(root, actionPath)), '必须提供统一的候选人下一步动作规则');

const actions = read(actionPath);
const api = read('readdy-frontend/src/features/businessReviews/api.ts');
const types = read('readdy-frontend/src/features/businessReviews/types.ts');
const candidateTypes = read('readdy-frontend/src/features/candidates/types.ts');
const candidatePage = read('readdy-frontend/src/pages/candidates/page.tsx');
const demandDrawer = read('readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx');
const pushModal = read('readdy-frontend/src/pages/candidates/components/PushToReviewerModal.tsx');
const router = read('readdy-frontend/src/router/config.tsx');
const dashboard = read('readdy-frontend/src/pages/dashboard/page.tsx');

assert.match(actions, /export function candidateBusinessAction/, '必须由共享函数决定候选人下一步');
for (const phrase of [
  '选择招聘需求并推送业务筛选',
  '推送业务筛选',
  '等待「',
  '反馈',
  '安排正式面试',
  '补充并再次推送',
  '去流程处理',
]) {
  assert.ok(actions.includes(phrase), `下一步动作缺少“${phrase}”`);
}
assert.doesNotMatch(actions, /加入当前需求并推送业务筛选/, '未选需求时不能假装已经有“当前需求”');
assert.match(candidateTypes, /desired_position\?:\s*string/, '候选人列表必须返回简历中的求职目标');
assert.match(candidatePage, /candidate\.desired_position/, '简历库目标岗位必须优先展示简历求职目标');
assert.match(candidatePage, /目标岗位 \/ 当前需求/, '目标岗位和流程归属必须明确区分');
assert.match(actions, /pendingTask[\s\S]*reviewer_name/, '等待状态必须显示当前业务筛选人');
assert.match(actions, /interview|offer|onboarded|rejected|transferred/, '后续流程不得退回业务筛选');

assert.match(types, /ReassignBusinessReviewInput/, '必须提供改派请求类型');
assert.match(api, /reassignTask\s*\(/, '前端 API 必须提供显式改派方法');
assert.match(api, /method:\s*'PATCH'/, '改派必须调用 PATCH 接口');
assert.match(api, /\/business-reviews\/\$\{taskId\}\/reviewer/, '改派必须调用独立任务接口');

assert.match(candidatePage, /candidateBusinessAction/, '候选人库必须使用统一下一步动作规则');
assert.match(candidatePage, /businessReviewsApi\.reassignTask/, '候选人库改派必须写入后端');
assert.match(candidatePage, /改派筛选人/, '待处理任务必须提供明确改派入口');
assert.match(candidatePage, /安排正式面试/, '业务筛选通过后必须出现正式面试入口');

assert.match(demandDrawer, /candidateBusinessAction/, '需求候选人抽屉必须使用统一下一步动作规则');
assert.match(demandDrawer, /等待「[\s\S]*反馈/, '需求候选人抽屉必须展示当前接收人');
assert.match(demandDrawer, /改派筛选人/, '需求候选人抽屉必须提供明确改派入口');

assert.match(pushModal, /mode\?:\s*'create'\s*\|\s*'reassign'/, '推送弹窗必须区分新建和改派');
assert.match(pushModal, /当前接收人/, '改派弹窗必须展示当前接收人');
assert.match(pushModal, /改派业务筛选人/, '改派弹窗必须使用明确标题和按钮');
assert.doesNotMatch(pushModal, /推送给面试官/, '业务筛选不得称为推送给面试官');

assert.match(
  router,
  /path:\s*'\/interviewer\/screening'[\s\S]*allow=\{businessReviewerRoles\}/,
  '所有可被选择的业务筛选角色都必须能打开处理页面',
);
assert.match(dashboard, /userId/, '经理工作台必须识别分配给当前账号的业务筛选');
assert.match(dashboard, /assignedBusinessReviews/, '经理自己的业务筛选必须进入“我的待办”');
assert.match(dashboard, /\/interviewer\/screening\?task=/, '经理必须能从工作台直接处理业务筛选');

console.log('candidate_business_review_actions: OK');
