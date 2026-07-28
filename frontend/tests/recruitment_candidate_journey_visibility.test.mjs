import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const componentPath = path.join(root, 'readdy-frontend/src/components/candidates/CandidateJourneySummary.tsx');
assert.equal(existsSync(componentPath), true, '应复用一个候选人完整招聘过程组件');

const api = read('readdy-frontend/src/features/candidates/api.ts');
assert.match(api, /getJourney\(candidateId: number, demandId: number\)/, '候选人接口应按候选人和需求读取真实历程');
assert.match(api, /\/candidates\/\$\{candidateId\}\/journey\?demand_id=\$\{demandId\}/, '候选人历程必须使用受权限保护的后端接口');

const component = read('readdy-frontend/src/components/candidates/CandidateJourneySummary.tsx');
for (const label of ['完整招聘过程', '需求审核记录', '业务筛选', '面试过程', 'Offer']) {
  assert.match(component, new RegExp(label), `完整过程组件缺少“${label}”`);
}
assert.match(component, /只读记录/, '面试官看到的审核过程应明确为只读');

const candidates = read('readdy-frontend/src/pages/candidates/page.tsx');
const interviewerInterviews = read('readdy-frontend/src/pages/interviewer/interviews/page.tsx');
const reviewerDetail = read('readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx');
assert.match(candidates, /<CandidateJourneySummary/, '候选人现有详情抽屉应展示完整招聘过程');
assert.match(interviewerInterviews, /<CandidateJourneySummary/, '面试官的现有面试详情应展示完整招聘过程');
assert.match(reviewerDetail, /<CandidateJourneySummary/, '业务筛选详情也应展示同一份只读过程');

console.log('recruitment_candidate_journey_visibility: OK');
