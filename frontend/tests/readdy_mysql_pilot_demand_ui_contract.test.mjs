import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const businessJobs = read('readdy-frontend/src/pages/interviewer/jobs/page.tsx');
const hrJobs = read('readdy-frontend/src/pages/jobs/page.tsx');
const detailPanel = read('readdy-frontend/src/pages/jobs/components/DemandDetailPanel.tsx');

assert.match(businessJobs, /jobsApi\.listTemplates/, '业务端必须读取真实岗位模板');
assert.match(businessJobs, /jobsApi\.getTemplate/, '业务端选择模板后必须读取完整 JD');
assert.match(businessJobs, /demandsApi\.listDemands/, '业务端必须读取本人真实需求');
assert.match(businessJobs, /demandsApi\.listRecruiterOwners/, '业务端必须读取可选招聘负责人');
assert.match(businessJobs, /demandsApi\.createDemand/, '业务端必须提交真实需求');
assert.match(businessJobs, /demandsApi\.resubmitDemand/, '业务端必须允许修改被驳回需求并重新提交');
assert.match(businessJobs, /status:\s*['"]pending['"]/, '业务提交状态必须固定为 pending');
for (const status of ['pending', 'approved', 'rejected']) {
  assert.match(businessJobs, new RegExp(`['"]${status}['"]`), `业务端缺少 ${status} 状态视图`);
}
assert.match(businessJobs, /focus_points/, '业务提交必须带模板中的面试关注点');
assert.match(businessJobs, /review_reason/, '业务端必须展示驳回原因');
assert.doesNotMatch(businessJobs, /@\/mocks\//, '业务需求页不得继续读取 mock 数据');

assert.match(hrJobs, /demandsApi\.approveDemand/, 'HR 页面必须调用通过接口');
assert.match(hrJobs, /demandsApi\.rejectDemand/, 'HR 页面必须调用驳回接口');
assert.match(hrJobs, /instanceof ApiError[^]*status === 409|status === 409[^]*instanceof ApiError/, 'HR 页面必须处理审核状态冲突');
assert.doesNotMatch(hrJobs, /@\/mocks\//, 'HR 需求页不得继续读取 mock 数据');

assert.match(detailPanel, /approval_status/, '详情必须展示审批状态');
assert.match(detailPanel, /submitted_at/, '详情必须展示提交时间');
assert.match(detailPanel, /reviewed_at/, '详情必须展示审核时间');
assert.match(detailPanel, /review_reason/, '详情必须展示驳回原因');
assert.match(detailPanel, /通过/, '待审核详情必须提供通过按钮');
assert.match(detailPanel, /不通过/, '待审核详情必须提供不通过按钮');
assert.match(detailPanel, /rejectReason\.trim\(\)/, '驳回提交前必须拦截空白理由');

console.log('readdy_mysql_pilot_demand_ui_contract: OK');
