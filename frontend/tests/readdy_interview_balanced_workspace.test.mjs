import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const modelPath = path.join(root, 'readdy-frontend/src/pages/interviews/workbench.ts');

assert.ok(existsSync(modelPath), '面试管理必须有独立筛选模型');
const model = read('readdy-frontend/src/pages/interviews/workbench.ts');
for (const symbol of [
  'emptyInterviewFilters',
  'rowStatus',
  'statusLabel',
  'interviewLocalDateKey',
  'deriveInterviewFilterOptions',
  'filterInterviewRows',
  'activeInterviewFilterCount',
]) {
  assert.match(model, new RegExp(`export (const|function) ${symbol}`), `缺少 ${symbol}`);
}
assert.doesNotMatch(model, /@\/mocks\//, '筛选模型不得依赖 Mock 数据');

console.log('readdy_interview_balanced_workspace: OK');
