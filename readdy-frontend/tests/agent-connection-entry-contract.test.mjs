import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createJiti } from 'jiti';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => existsSync(path.join(root, relativePath));

const promptModule = 'src/features/onlineResumes/agentConnection.ts';
const dialogModule = 'src/features/onlineResumes/components/AgentConnectionDialog.tsx';

test('在线简历页提供真实的连接 Agent 入口和限权凭证接口', () => {
  assert.equal(exists(promptModule), true, '缺少 Agent 连接提示词模块');
  assert.equal(exists(dialogModule), true, '缺少 Agent 连接弹窗');

  const page = read('src/pages/online-resumes/page.tsx');
  const api = read('src/features/onlineResumes/api.ts');
  const dialog = read(dialogModule);
  assert.match(page, /AgentConnectionDialog/);
  assert.match(dialog, /AI 招聘助手/);
  assert.match(api, /issueAgentImportToken/);
  assert.match(api, /['"]\/agent-imports\/token['"]/);
  assert.match(api, /method:\s*['"]POST['"]/);
  assert.doesNotMatch(`${page}\n${api}`, /@\/mocks|hardcodedToken|demo-token/i);
});

test('生成的提示词绑定具体需求并覆盖两条导入路线', async () => {
  assert.equal(exists(promptModule), true, '缺少 Agent 连接提示词模块');
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const { buildAgentConnectionPrompt } = await jiti.import(`../${promptModule}`);
  const prompt = buildAgentConnectionPrompt({
    apiBaseUrl: 'https://test.example.com/api/',
    token: 'scoped-agent-token',
    bossAccount: '招聘专员-BOSS账号',
    demand: {
      id: 42,
      request_no: 'REQ-AGENT-042',
      job_title: 'Java开发',
      jd_text: '需要Java、Spring Boot和微服务经验',
    },
  });

  for (const expected of [
    'https://test.example.com/api',
    'scoped-agent-token',
    '42',
    'REQ-AGENT-042',
    'Java开发',
    '需要Java、Spring Boot和微服务经验',
    '招聘专员-BOSS账号',
    '/agent-imports/online-resumes',
    '/agent-imports/full-resumes',
    'external_record_id',
    'external_import_id',
    '完整聊天记录',
    '不要在输出、聊天或日志中展示导入凭证',
  ]) {
    assert.match(prompt, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('连接弹窗只在内存展示凭证并提供关闭清理和复制失败提示', () => {
  assert.equal(exists(dialogModule), true, '缺少 Agent 连接弹窗');
  const dialog = read(dialogModule);
  assert.match(dialog, /demandsApi\.listDemands/);
  assert.match(dialog, /status\s*===\s*['"]active['"]/);
  assert.match(dialog, /BOSS账号/);
  assert.match(dialog, /生成授权指令/);
  assert.match(dialog, /navigator\.clipboard\.writeText/);
  assert.match(dialog, /复制失败/);
  assert.match(dialog, /有效至/);
  assert.doesNotMatch(dialog, /localStorage|sessionStorage|console\.(?:log|info|debug)/);
});
