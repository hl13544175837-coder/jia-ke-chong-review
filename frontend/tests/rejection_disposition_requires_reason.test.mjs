import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const projectRoot = join(__dirname, '../..');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const rejectionForm = readSource('components/pipeline/RejectionDispositionForm.tsx');
const reviewModal = readFileSync(
  join(projectRoot, 'readdy-frontend/src/pages/candidates/components/PushToReviewerModal.tsx'),
  'utf8',
);
const reviewStages = readFileSync(
  join(projectRoot, 'readdy-frontend/src/features/businessReviews/stages.ts'),
  'utf8',
);
const candidatePage = readFileSync(
  join(projectRoot, 'readdy-frontend/src/pages/candidates/page.tsx'),
  'utf8',
);
const screeningModal = readFileSync(
  join(projectRoot, 'readdy-frontend/src/pages/interviewer/dashboard/components/ReviewActionModal.tsx'),
  'utf8',
);

assert.match(
  rejectionForm,
  /请填写淘汰原因/,
  'Rejecting a candidate should block submission until HR provides a reason',
);

assert.match(
  rejectionForm,
  /disabled=\{busy \|\| !reason\.trim\(\)\}/,
  'The confirm-reject button should be disabled when the required reason is empty',
);

assert.match(screeningModal, /该筛选结论必须填写备注/, '业务筛选不合适或需补充时必须填写具体原因');
assert.match(screeningModal, /commentRequired/, '业务筛选弹窗必须根据结论校验原因');
assert.match(reviewStages, /BUSINESS_REVIEW_ENTRY_STAGES/, '必须集中定义允许进入业务筛选的阶段');
assert.match(reviewModal, /canEnterBusinessReview/, '推送弹窗必须识别允许进入业务筛选的阶段');
assert.match(reviewModal, /不能退回业务筛选/, '后续流程候选人必须显示不能退回的原因');
assert.match(candidatePage, /canEnterBusinessReview/, '候选人页面必须隐藏或禁用后续阶段的业务筛选动作');
