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
  /发起 Offer/,
  'The former BI page should now frame accountability as Offer management',
);
assert.match(
  biPage,
  /最新动态/,
  'Offer management should show the next coordination action',
);
assert.match(
  biPage,
  /待提交|审批中|待发放|待回复|待入职/,
  'Offer management should expose pending Offer states',
);
assert.match(
  biPage,
  /OfferHeaderFilter/,
  'Offer management should use table filtering instead of performance language',
);
assert.doesNotMatch(
  biPage,
  /HR 绩效|面试官排名|部门排名/,
  'The demand BI page should not rank people or departments',
);
