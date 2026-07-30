import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/pages/candidates/components/ResumeRecoveryPanel.tsx', import.meta.url),
  'utf8',
);

test('disabled resume AI directs Test users to manual completion without retry', () => {
  assert.match(source, /当前测试环境未启用模型解析/);
  assert.match(source, /模型解析未启用，请手动补录/);
  assert.match(source, /aiDisabled/);
  assert.match(source, /needsConfirmation && !aiDisabled/);
  assert.match(source, /手动补录/);
});
