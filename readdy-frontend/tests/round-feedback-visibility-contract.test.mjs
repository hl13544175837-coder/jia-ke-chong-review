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

test('二面提交前只显示一面已完成，不显示一面文字结论', () => {
  assert.match(typeSource, /feedback_locked: boolean/);
  assert.match(journeySource, /item\.feedback_locked/);
  assert.match(journeySource, /提交本轮评价后可查看此前面试结论/);
});
