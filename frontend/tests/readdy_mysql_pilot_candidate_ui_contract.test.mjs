import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const page = read('readdy-frontend/src/pages/candidates/page.tsx');
const modal = read('readdy-frontend/src/pages/candidates/components/PushToReviewerModal.tsx');
const pipelineModal = read('readdy-frontend/src/pages/candidates/components/AddToPipelineModal.tsx');
const duplicateModal = read('readdy-frontend/src/pages/candidates/components/DuplicateCandidatesModal.tsx');
const candidateApi = read('readdy-frontend/src/features/candidates/api.ts');
const candidateTypes = read('readdy-frontend/src/features/candidates/types.ts');

for (const method of [
  'candidatesApi.listCandidates',
  'candidatesApi.uploadResumes',
  'candidatesApi.getResume',
  'candidatesApi.pushToBusinessReview',
]) {
  assert.match(page, new RegExp(method.replace('.', '\\.')), `候选人页面必须调用 ${method}`);
}

assert.match(page, /demandsApi\.listDemands/, '候选人页面必须读取真实招聘需求');
assert.match(
  page,
  /demand\.status === 'active'\s*&&\s*demand\.approval_status === 'approved'/,
  '上传和业务推送只能选择审批通过且招聘中的需求',
);
assert.match(
  page,
  /apiRequest<[^>]*>\('\/interview\/interviewers'\)/,
  '评审人必须从现有 interviewers 接口读取',
);
assert.match(page, /target_demand_id:\s*uploadDemandId \|\| undefined/, '导入简历必须允许先入公司人才库再匹配需求');
assert.match(page, /暂不关联，先存公司人才库/, '导入简历必须提供不关联需求的明确选项');
assert.match(page, /uploadResponse\.results/, '上传后必须展示后端逐文件结果');
assert.match(page, /failedSourceNames/, '解析失败的源文件必须保留以便重试');
assert.match(page, /loadCandidates/, '真实写入后必须重新加载候选人列表');

for (const field of ['education', 'skill', 'min_score', 'city', 'source_channel', 'parse_status', 'pipeline_status', 'favorite', 'sort_by', 'sort_order']) {
  assert.match(candidateTypes, new RegExp(`${field}\\?:`), `5190 候选人查询类型缺少 ${field}`);
  assert.match(page, new RegExp(`${field}:`), `5190 候选人筛选必须向后端传递 ${field}`);
}
for (const column of ['identity', 'parse', 'profile', 'skills', 'source', 'stage', 'created']) {
  assert.match(
    page,
    new RegExp(`data-ui="candidate-column-filter-${column}"`),
    `5190 候选人表头 ${column} 必须可展开筛选`,
  );
}
assert.match(page, /重置筛选/, '5190 候选人筛选必须提供一键重置');
for (const scope of ['全部候选人', '招聘流程中', '公司人才库', '我的收藏']) {
  assert.match(page, new RegExp(scope), `5190 候选人库缺少“${scope}”范围`);
}
assert.match(page, /candidatesApi\.setFavorites/, '候选人必须支持单人和批量收藏');
assert.match(page, /candidatesApi\.addToPipeline/, '人才库候选人必须能加入正式招聘流程');
assert.match(page, /批量收藏/, '候选人列表必须提供批量收藏');
assert.match(page, /加入招聘流程/, '候选人列表必须提供批量加入流程');

assert.match(pipelineModal, /candidatesApi\.previewMatches/, '加入流程前必须预览候选人与岗位匹配结果');
assert.match(candidateTypes, /latest_stage:\s*CandidateStage \| null/, '岗位匹配结果必须返回目标需求内的最新阶段');
assert.match(pipelineModal, /match\.latest_stage === 'rejected'/, '重新启用判断必须使用目标需求内的阶段');
assert.match(pipelineModal, /人才库重新启用|重新启用原因/, '淘汰候选人必须可填写原因后重新启用');
assert.match(duplicateModal, /完整手机号或邮箱|手机号或邮箱完全一致/, '查重必须使用可解释的精确联系方式规则');
assert.match(duplicateModal, /已有招聘历史，必须保留/, '合并不得静默迁移已有业务历史的重复档案');
for (const endpoint of [
  '/candidates/favorites/set',
  '/candidates/pipeline/add',
  '/candidates/match/preview',
  '/candidates/duplicates/get',
  '/candidates/duplicates/merge',
]) {
  assert.match(candidateApi, new RegExp(endpoint.replaceAll('/', '\\/')), `候选人 API 缺少 ${endpoint}`);
}

for (const stateCopy of [
  '加载候选人中',
  '重试',
  '暂无候选人',
  '加载简历详情中',
  '暂无可用的原版简历',
]) {
  assert.match(page, new RegExp(stateCopy), `候选人页面缺少真实状态：${stateCopy}`);
}

assert.match(page, /businessReviewsApi\.loadResume/, '原版简历预览必须使用带登录态的 Blob 请求');
assert.match(page, /businessReviewsApi\.downloadResume/, '原版简历下载必须使用带登录态的 Blob 请求');
assert.match(page, /deduplicated/, '页面必须识别后端返回的重复推送');
assert.match(page, /该候选人已在等待业务筛选/, '重复推送必须明确告知 HR');
assert.doesNotMatch(page, /候选人 ID/, '候选人页面不得向用户展示内部候选人 ID');
assert.doesNotMatch(modal, /候选人 ID|任务 #/, '业务推送结果不得向用户展示内部 ID');

assert.doesNotMatch(page, /@\/mocks\//, '候选人页不得再读取 mock 业务数据');
assert.doesNotMatch(page, /resumePushRecords|requisitionCandidates|setTimeout\s*\(/, '不得保留内存写入或延时模拟');
assert.doesNotMatch(page, /演示解析|模拟成功/, '页面不得伪造成功状态');

assert.doesNotMatch(modal, /@\/mocks\//, '业务推送弹窗不得使用 mock 评审人或候选人');
for (const field of ['demandId: number', 'reviewerId: number', 'hrNote: string', 'dueAt: string | null']) {
  assert.match(modal, new RegExp(field.replace('|', '\\|')), `推送表单缺少字段 ${field}`);
}
assert.match(modal, /disabled=\{!canSubmit \|\| isSubmitting\}/, '推送请求期间必须禁用提交');
assert.match(modal, /暂无可推送的已审批在招需求/, '无可用需求时必须显示真实空状态');
assert.match(modal, /加载业务评审人中/, '评审人列表必须有加载状态');

console.log('readdy_mysql_pilot_candidate_ui_contract: OK');
