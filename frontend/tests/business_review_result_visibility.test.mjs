import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stagesUrl = pathToFileURL(
  path.join(root, 'readdy-frontend/src/features/businessReviews/stages.ts'),
).href;
const stages = await import(`${stagesUrl}?test=business-review-result-visibility`);

assert.equal(
  typeof stages.isActionableBusinessReviewResult,
  'function',
  '业务筛选结果必须有统一的“是否仍待招聘专员处理”判断',
);

for (const status of ['approved', 'rejected', 'needs_info']) {
  assert.equal(
    stages.isActionableBusinessReviewResult(status, 'business_review'),
    true,
    `${status} 且仍在业务筛选阶段时应显示为招聘专员待办`,
  );
}
assert.equal(stages.isActionableBusinessReviewResult('pending', 'business_review'), false);
for (const stage of ['interview', 'offer', 'onboarded', 'rejected', 'transferred']) {
  assert.equal(
    stages.isActionableBusinessReviewResult('approved', stage),
    false,
    `已进入 ${stage} 的历史业务结果不得继续置顶`,
  );
}

const page = fs.readFileSync(
  path.join(root, 'readdy-frontend/src/pages/candidates/page.tsx'),
  'utf8',
);
assert.match(page, /isActionableBusinessReviewResult/, '候选人页必须使用统一的待处理判断');
assert.match(page, /待处理的业务筛选反馈/, '置顶区域必须明确说明这是待处理反馈');
assert.match(page, /已进入后续流程的结果可在候选人详情中查看/, '页面必须说明历史结果去向');

console.log('business_review_result_visibility: OK');
