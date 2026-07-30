import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const pageSource = fs.readFileSync(
  path.join(root, 'src/pages/interviewer/interviews/page.tsx'),
  'utf8',
);
const apiSource = fs.readFileSync(
  path.join(root, 'src/features/interviews/api.ts'),
  'utf8',
);

test('已开始的面试允许所属面试官确认完成并立即进入评价', () => {
  assert.match(apiSource, /markConducted\(assignmentId: number\)/);
  assert.match(pageSource, /confirmAndStartFeedback/);
  assert.match(pageSource, /确认已面试并填写评价/);
  assert.match(pageSource, /interviewsApi\.markConducted\(item\.id\)/);
  assert.match(pageSource, /confirmationError/);
  assert.match(pageSource, /确认面试完成失败/);
});
