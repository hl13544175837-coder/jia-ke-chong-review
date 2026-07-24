import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = (relativePath) => path.join(root, relativePath);
const read = (relativePath) => fs.readFileSync(file(relativePath), 'utf8');

const requiredFiles = [
  'readdy-frontend/src/features/jobs/api.ts',
  'readdy-frontend/src/features/jobs/types.ts',
  'readdy-frontend/src/features/businessReviews/api.ts',
  'readdy-frontend/src/features/businessReviews/types.ts',
  'readdy-frontend/src/features/interviews/api.ts',
  'readdy-frontend/src/features/interviews/types.ts',
  'readdy-frontend/src/features/candidates/api.ts',
  'readdy-frontend/src/features/candidates/types.ts',
  'readdy-frontend/src/features/pipeline/api.ts',
  'readdy-frontend/src/features/pipeline/types.ts',
  'readdy-frontend/src/features/offers/api.ts',
  'readdy-frontend/src/features/offers/types.ts',
];

for (const relativePath of requiredFiles) {
  assert.ok(fs.existsSync(file(relativePath)), `MySQL 试点接口层缺少 ${relativePath}`);
}

const commonApi = read('readdy-frontend/src/lib/api.ts');
assert.match(commonApi, /apiRequest/, '必须保留统一 JSON 请求入口');
assert.match(commonApi, /apiMultipart/, '简历上传必须使用统一 multipart 请求入口');
assert.match(commonApi, /apiBlob/, '原版简历必须使用带登录态的 Blob 请求入口');
assert.match(commonApi, /companyAuthHeaders/, '全部业务接口必须复用公司登录请求头');
assert.match(commonApi, /hireinsight:unauthorized/, '全部请求必须统一处理 401');
assert.doesNotMatch(commonApi, /Content-Type[^\n]+multipart\/form-data/, 'FormData 不能手写 multipart Content-Type');

const demandApi = read('readdy-frontend/src/features/demands/api.ts');
for (const method of ['approveDemand', 'rejectDemand', 'resubmitDemand']) {
  assert.match(demandApi, new RegExp(method), `需求接口层必须提供 ${method}`);
}

const jobsApi = read('readdy-frontend/src/features/jobs/api.ts');
for (const method of ['listTemplates', 'getTemplate']) {
  assert.match(jobsApi, new RegExp(method), `岗位模板接口层必须提供 ${method}`);
}

const businessReviewApi = read('readdy-frontend/src/features/businessReviews/api.ts');
for (const method of ['listMine', 'listForHr', 'getTask', 'createTask', 'decideTask', 'loadResume', 'downloadResume']) {
  assert.match(businessReviewApi, new RegExp(method), `业务筛选接口层必须提供 ${method}`);
}

const interviewApi = read('readdy-frontend/src/features/interviews/api.ts');
for (const method of ['listMyAssignments', 'listFeedback', 'saveFeedback', 'updateFeedback']) {
  assert.match(interviewApi, new RegExp(method), `面试接口层必须提供 ${method}`);
}

const candidatesApi = read('readdy-frontend/src/features/candidates/api.ts');
for (const method of ['listCandidates', 'uploadResumes', 'getResume', 'pushToBusinessReview']) {
  assert.match(candidatesApi, new RegExp(method), `候选人接口层必须提供 ${method}`);
}

const pipelineApi = read('readdy-frontend/src/features/pipeline/api.ts');
for (const method of ['getBoard', 'getHistory', 'moveCandidate']) {
  assert.match(pipelineApi, new RegExp(method), `流程接口层必须提供 ${method}`);
}

const offersApi = read('readdy-frontend/src/features/offers/api.ts');
for (const method of ['listOffers', 'getOffer', 'saveDraft', 'runAction']) {
  assert.match(offersApi, new RegExp(method), `Offer 接口层必须提供 ${method}`);
}

const businessReviewTypes = read('readdy-frontend/src/features/businessReviews/types.ts');
for (const state of ['pending', 'approved', 'rejected', 'needs_info']) {
  assert.match(businessReviewTypes, new RegExp(`['"]${state}['"]`), `业务筛选状态缺少 ${state}`);
}

const interviewTypes = read('readdy-frontend/src/features/interviews/types.ts');
for (const state of ['satisfied', 'pending', 'unsatisfied']) {
  assert.match(interviewTypes, new RegExp(`['"]${state}['"]`), `满意程度缺少 ${state}`);
}

console.log('readdy_mysql_pilot_contract: OK');
