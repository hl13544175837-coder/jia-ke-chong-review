import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

test('AI 助手 API 层：会话/工具/流式 chat 全部走真实后端', () => {
  const api = read('src/features/aiAssistant/api.ts');
  assert.match(api, /aiAssistantApi\s*=/);
  assert.match(api, /listTools\s*\(\)/);
  assert.match(api, /listConversations\s*\(archived = false\)/);
  assert.match(api, /createConversation\s*\(title\?: string\)/);
  assert.match(api, /getConversation\s*\(id: number\)/);
  assert.match(api, /renameConversation\s*\(id: number, title: string\)/);
  assert.match(api, /archiveConversation\s*\(id: number\)/);
  // 流式 SSE：/agent/chat + 逐行解析 data: 事件
  assert.match(api, /\/agent\/chat/);
  assert.match(api, /response\.body\.getReader\(\)/);
  assert.match(api, /indexOf\('\\n\\n'\)/);
  assert.match(api, /conversation_id: conversationId \?\? undefined/);
  assert.match(api, /dispatchEvent\(new Event\('hireinsight:unauthorized'\)\)/);
  assert.doesNotMatch(api, /setTimeout|localStorage|@\/mocks/i);
});

test('AI 助手页面：无假回答，接真实会话与流式渲染', () => {
  const page = read('src/pages/ai-assistant/page.tsx');
  assert.match(page, /aiAssistantApi\s*\.chatStream/);
  assert.match(page, /aiAssistantApi\s*\.listConversations\(\)/);
  assert.match(page, /aiAssistantApi\s*\.getConversation\(/);
  assert.match(page, /aiAssistantApi\s*\.renameConversation\(/);
  assert.match(page, /aiAssistantApi\s*\.archiveConversation\(/);
  assert.match(page, /aiAssistantApi\s*\.listTools\(\)/);
  // 流式 token 事件渲染
  assert.match(page, /event\.type === 'token'/);
  assert.match(page, /event\.type === 'thought'/);
  assert.match(page, /event\.type === 'tool_call'/);
  assert.match(page, /event\.type === 'done'/);
  // 不再有假回答
  assert.doesNotMatch(page, /setTimeout\(/);
  assert.doesNotMatch(page, /陈伟|孙明|450|92%/);
  assert.doesNotMatch(page, /@\/mocks|localStorage/);
});

test('AI 助手路由与菜单：放开给 recruiter/manager/admin', () => {
  const router = read('src/router/config.tsx');
  assert.match(router, /AIAssistantPage/);
  assert.match(router, /path: '\/ai-assistant'/);
  assert.match(router, /RequireCompanyRole allow=\{hrRoles\}/);
  assert.doesNotMatch(
    router.slice(router.indexOf("path: '/ai-assistant'"), router.indexOf("path: '/ai-assistant'") + 200),
    /RoleHomeRedirect/,
  );
  const layout = read('src/components/feature/MainLayout.tsx');
  assert.match(layout, /path: '\/ai-assistant'/);
  assert.match(layout, /label: 'AI 助手'/);
  assert.match(layout, /roles: \['recruiter'\]/);
  assert.match(layout, /roles: \['manager'\]/);
  assert.match(layout, /roles: \['admin'\]/);
});
