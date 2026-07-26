import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const businessJobs = read('readdy-frontend/src/pages/interviewer/jobs/page.tsx');
const hrJobs = read('readdy-frontend/src/pages/jobs/page.tsx');
const detailPanel = read('readdy-frontend/src/pages/jobs/components/DemandDetailPanel.tsx');
const candidateDrawerPath = 'readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx';

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
assert.ok(fs.existsSync(path.join(root, candidateDrawerPath)), '需求页必须提供真实的同页候选人工作区');
const candidateDrawer = read(candidateDrawerPath);
const candidateTypes = read('readdy-frontend/src/features/candidates/types.ts');
assert.match(hrJobs, /DemandCandidateDrawer/, '需求页必须接入同页候选人工作区');
assert.match(hrJobs, /setCandidateDemand\(req\.source\)/, '“选候选人”必须打开当前需求的工作区');
assert.match(hrJobs, /candidateDemand &&/, '需求候选人工作区必须由当前需求控制显示');
assert.match(hrJobs, /useSearchParams/, '需求页必须承接工作台和通知的真实需求深链');
assert.match(hrJobs, /searchParams\.get\(['"]demand['"]\)/, '需求页必须按 demand 参数定位对应需求');
for (const method of ['candidatesApi.listCandidates', 'candidatesApi.previewMatches', 'candidatesApi.addToPipeline', 'candidatesApi.transferToDemand', 'candidatesApi.uploadResumes']) {
  assert.match(candidateDrawer, new RegExp(method.replace('.', '\\.')), `需求候选人工作区必须调用 ${method}`);
}
assert.match(candidateDrawer, /target_demand_id:\s*demand\.id/, '需求内导入简历必须自动关联当前需求');
assert.match(candidateDrawer, /onDrop=/, '需求内候选人工作区必须支持拖入简历');
assert.match(candidateDrawer, /岗位匹配度/, '需求内选人必须展示当前岗位匹配度');
assert.match(candidateDrawer, /转入当前需求/, '其他需求中的候选人必须能在当前页明确转入');
assert.match(candidateDrawer, /推送业务筛选/, '已在当前需求的候选人必须能在当前页继续推送');
assert.match(candidateDrawer, /onReadyToPush/, '需求候选人工作区必须把已选候选人交给真实业务筛选流程');
for (const filter of ['city', 'education', 'skill', 'source_channel', 'stage', 'min_score', 'pipeline_status', 'sort_by']) {
  assert.match(candidateDrawer, new RegExp(filter), `需求候选人工作区缺少 ${filter} 真实筛选`);
}
assert.match(candidateDrawer, /page:\s*page/, '需求候选人工作区必须请求当前页而不是固定第一页');
assert.match(candidateDrawer, /candidateResponse\.total/, '候选人工作区必须显示真实总数');
assert.match(candidateDrawer, /candidateResponse\.pages/, '候选人工作区必须提供真实前后分页');
assert.match(candidateDrawer, /candidatesApi\.getResume/, '勾选前必须能读取完整候选人简历');
assert.match(candidateDrawer, /businessReviewsApi\.loadResume/, '需求内简历必须能安全预览原版文件');
assert.match(candidateDrawer, /businessReviewsApi\.downloadResume/, '需求内简历必须能下载原版文件');
assert.match(candidateDrawer, /查看简历/, '候选人卡片必须分离查看简历和勾选动作');
assert.match(candidateDrawer, /matchConfigured/, '需求候选人工作区必须区分岗位匹配是否已配置');
assert.match(candidateDrawer, /岗位技能尚未配置/, '未配置岗位技能时不能把未知匹配展示成 0 分');
assert.match(candidateTypes, /match_configured:\s*boolean/, '匹配预览类型必须承接服务端配置状态');
assert.match(candidateTypes, /required_skills:\s*string\[\]/, '匹配预览类型必须承接岗位必备技能');
assert.match(hrJobs, /PushToReviewerModal/, '需求页面必须在同页打开真实业务筛选人选择弹窗');
assert.match(hrJobs, /candidatesApi\.pushToBusinessReview/, '需求页面必须把候选人投递给真实业务筛选接口');

assert.match(detailPanel, /approval_status/, '详情必须展示审批状态');
assert.match(detailPanel, /submitted_at/, '详情必须展示提交时间');
assert.match(detailPanel, /reviewed_at/, '详情必须展示审核时间');
assert.match(detailPanel, /review_reason/, '详情必须展示驳回原因');
assert.match(detailPanel, /通过/, '待审核详情必须提供通过按钮');
assert.match(detailPanel, /不通过/, '待审核详情必须提供不通过按钮');
assert.match(detailPanel, /rejectReason\.trim\(\)/, '驳回提交前必须拦截空白理由');

console.log('readdy_mysql_pilot_demand_ui_contract: OK');
