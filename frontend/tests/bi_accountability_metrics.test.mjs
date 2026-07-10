import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const biPage = readSource('pages/BiPage.tsx');
const types = readSource('types/index.ts');

assert.match(
  types,
  /interface BiDemandOutstandingFeedback/,
  'BI should type demand-scoped interview feedback follow-up',
);
assert.match(
  types,
  /interface BiDemandCurrentResponsibility/,
  'BI should type the current demand responsibility view',
);
assert.match(
  types,
  /outstanding_feedback:\s*BiDemandOutstandingFeedback/,
  'Demand BI should expose outstanding feedback rows',
);
assert.match(
  types,
  /current_responsibility:\s*BiDemandCurrentResponsibility/,
  'Demand BI should expose current responsibility without rewriting history',
);
assert.match(
  biPage,
  /面试反馈跟进/,
  'BI page should frame interviewer accountability as feedback follow-up',
);
assert.match(
  biPage,
  /当前协同责任/,
  'BI page should show who owns the next coordination action',
);
assert.match(
  biPage,
  /待补反馈/,
  'BI accountability view should expose pending feedback',
);
assert.match(
  biPage,
  /不用于绩效考核/,
  'Operational accountability should avoid a performance interpretation',
);
assert.doesNotMatch(
  biPage,
  /HR 绩效|面试官排名|部门排名/,
  'The demand BI page should not rank people or departments',
);
