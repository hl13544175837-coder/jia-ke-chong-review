import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync(
  new URL('../src/lib/agentChat.tsx', import.meta.url),
  'utf8',
);
const page = readFileSync(
  new URL('../src/pages/AgentPage.tsx', import.meta.url),
  'utf8',
);
const agent = readFileSync(
  new URL('../src/lib/agent.ts', import.meta.url),
  'utf8',
);

assert.match(chat, /archivedConversations/, 'chat state must expose archived conversations');
assert.match(
  chat,
  /listConversations\(\{ archived: true, per_page: 100 \}\)/,
  'archived conversations must be fetched from the real API',
);
assert.match(
  chat,
  /setConversationId\(null\);[\s\S]*setMessages\(\[\]\)/,
  'archiving the active conversation must clear the persisted active id and messages',
);
assert.match(chat, /if \(data\.archived\)/, 'a cached archived conversation id must be cleared on reload');
assert.match(page, /已归档/, 'the sidebar must provide an archived-conversation view');
assert.match(page, /恢复会话/, 'archived conversations must be recoverable');
assert.match(page, /disabled=\{streaming\}/, 'streaming must disable conversation management actions');
assert.doesNotMatch(page, /DeepSeek v4 驱动/, 'the UI must not claim a route model it cannot verify');
assert.match(page, /AI 辅助/, 'the UI should describe the assistant neutrally');
assert.doesNotMatch(agent, /const body: Record<string, unknown> = \{ message, history \}/, 'client history must not be sent as backend source of truth');
assert.match(agent, /const body: Record<string, unknown> = \{ message \}/, 'chat requests should send only the new message plus conversation id');

console.log('agent_archived_conversations_contract: OK');
