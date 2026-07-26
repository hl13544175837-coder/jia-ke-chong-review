import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const api = read('readdy-frontend/src/lib/api.ts');
assert.match(api, /VITE_API_BASE_URL/, '5190 业务接口必须支持隔离后端地址配置');
assert.match(api, /companyAuthHeaders/, '5190 业务请求必须复用公司 Token 和工号请求头');
assert.match(api, /Idempotency-Key/, '创建需求必须支持防重复提交键');
assert.match(api, /hireinsight:unauthorized/, '业务接口 401 必须通知公司会话统一处理');

const demandApi = read('readdy-frontend/src/features/demands/api.ts');
for (const method of ['listDemands', 'getDemand', 'createDemand', 'updateDemand', 'closeDemand', 'restoreDemand', 'listRecruiterOwners']) {
  assert.match(demandApi, new RegExp(method), `5190 需求接口层必须提供 ${method}`);
}

const page = read('readdy-frontend/src/pages/jobs/page.tsx');
assert.match(page, /demandsApi\.listDemands/, '需求列表必须从隔离后端读取');
assert.match(page, /demandsApi\.getDemand/, '打开详情必须读取包含完整 JD 的真实需求');
assert.match(page, /demandsApi\.createDemand/, '创建需求必须写入隔离后端');
assert.match(page, /demandsApi\.updateDemand/, '编辑需求必须写入隔离后端');
assert.match(page, /demandsApi\.closeDemand/, '关闭需求必须写入隔离后端');
assert.match(page, /demandsApi\.restoreDemand/, '恢复需求必须写入隔离后端');
assert.match(page, /加载招聘需求|正在加载/, '需求页必须有加载状态');
assert.match(page, /重新加载|重试/, '需求页必须有失败重试入口');
assert.doesNotMatch(page, /@\/mocks\/jobs|initialRequisitions/, '正式需求页不得再读取需求假数据');
assert.doesNotMatch(page, /zhipin-current-role/, '需求页不得使用假角色开关');

const form = read('readdy-frontend/src/pages/jobs/components/RequisitionForm.tsx');
assert.match(form, /onSubmit/, '创建表单必须把真实需求参数交给页面提交');
assert.match(form, /hiring_manager_name|hiringManagerName/, '创建需求必须填写用人负责人');
assert.doesNotMatch(form, /disabled=\{role === 'recruiter'\}/, '招聘专员的招聘负责人下拉不能被前端禁用');
assert.match(form, /role === 'recruiter' && owners\.length === 1/, '后端只返回本人时必须自动选中招聘负责人');
assert.match(page, /\['recruiter', 'manager', 'admin'\]\.includes\(role \?\? ''\)/, '招聘专员必须从后端读取受权负责人选项');
assert.doesNotMatch(form, /alert\(['"]招聘需求创建成功/, '创建表单不得再弹出假成功');

const table = read('readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx');
assert.match(table, /操作原因|关闭原因|恢复原因/, '关闭和恢复必须要求用户填写原因');
assert.doesNotMatch(table, /@\/mocks\/jobs/, '需求表格不得再读取需求假数据样式');

const detail = read('readdy-frontend/src/pages/jobs/components/DemandDetailPanel.tsx');
assert.match(detail, /保存修改/, '真实需求详情必须提供编辑保存入口');
assert.match(detail, /onSave/, '编辑保存必须回调真实 API');
assert.match(detail, /选择候选人/, '已通过需求详情必须提供直接选人入口');
assert.match(detail, /上传简历/, '已通过需求详情必须提供直接上传入口');

console.log('readdy_real_demands_contract: OK');
