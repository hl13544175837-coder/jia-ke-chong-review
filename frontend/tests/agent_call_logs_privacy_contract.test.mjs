import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(
  new URL('../src/pages/admin/AgentCallLogsPage.tsx', import.meta.url),
  'utf8',
);

assert.match(page, /不保存候选人对话原文/);
assert.doesNotMatch(page, /完整输入\/输出\/思考过程/);
assert.doesNotMatch(page, /log\.input_text/);
assert.doesNotMatch(page, /log\.output_text/);
assert.doesNotMatch(page, /log\.thoughts/);
assert.match(page, /token 未提供/);
assert.doesNotMatch(page, /log\.prompt_tokens \?\? 0/);
assert.doesNotMatch(page, /log\.completion_tokens \?\? 0/);

console.log('agent_call_logs_privacy_contract: OK');
