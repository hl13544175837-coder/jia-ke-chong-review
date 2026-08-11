import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const modalSource = fs.readFileSync(
  path.join(root, 'src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx'),
  'utf8',
);
const typeSource = fs.readFileSync(
  path.join(root, 'src/features/interviews/types.ts'),
  'utf8',
);
const pageSource = fs.readFileSync(
  path.join(root, 'src/pages/interviewer/interviews/page.tsx'),
  'utf8',
);
const drawerSource = fs.readFileSync(
  path.join(root, 'src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx'),
  'utf8',
);

test('面试评价包含岗位匹配、建议结论、优势、顾虑和补充备注', () => {
  for (const text of ['岗位匹配', '建议结论', '优势', '顾虑', '补充备注']) {
    assert.match(modalSource, new RegExp(text));
  }
  for (const field of ['job_match', 'recommendation', 'strengths', 'concerns']) {
    assert.match(typeSource, new RegExp(`${field}:`));
  }
  assert.match(modalSource, /satisfaction === 'pass'.*strengths/s);
  assert.match(modalSource, /satisfaction === 'fail'.*concerns/s);
  assert.doesNotMatch(modalSource, /satisfaction === 'pending'/);
  assert.match(pageSource, /completedAssignment/);
  assert.match(pageSource, /feedback_submitted: true/);
  assert.match(drawerSource, /高匹配/);
  assert.match(drawerSource, /进入下一轮/);
});
