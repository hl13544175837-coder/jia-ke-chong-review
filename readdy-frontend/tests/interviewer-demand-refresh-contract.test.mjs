import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(
  path.join(root, 'src/pages/interviewer/jobs/page.tsx'),
  'utf8',
);

test('面试官返回需求页时重新读取审批状态', () => {
  assert.match(source, /const refresh = \(\) => void loadPage\(\);/);
  assert.match(source, /window\.addEventListener\('focus', refresh\);/);
  assert.match(source, /window\.removeEventListener\('focus', refresh\)/);
  assert.match(source, /setSelectedDemand\(\(current\) =>/);
  assert.match(source, /demandResponse\.items\.find\(\(item\) => item\.id === current\.id\)/);
});
