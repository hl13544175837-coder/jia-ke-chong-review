import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const journeySource = fs.readFileSync(
  path.join(root, 'src/components/candidates/CandidateJourneySummary.tsx'),
  'utf8',
);
const typeSource = fs.readFileSync(
  path.join(root, 'src/features/candidates/types.ts'),
  'utf8',
);

test('历史面试评价始终展示，不再要求先提交本轮评价', () => {
  assert.doesNotMatch(typeSource, /feedback_locked/);
  assert.doesNotMatch(journeySource, /item\.feedback_locked/);
  assert.doesNotMatch(journeySource, /提交本轮评价后可查看此前面试结论/);
  assert.match(journeySource, /历史面试评价与操作记录/);
});

test('候选人已进入 Offer 但尚未登记时显示真实阶段', () => {
  assert.match(typeSource, /current_stage: CandidateStage \| null/);
  assert.match(journeySource, /journey\.current_stage/);
  assert.match(journeySource, /已进入 Offer，待登记 OA 结果/);
});
