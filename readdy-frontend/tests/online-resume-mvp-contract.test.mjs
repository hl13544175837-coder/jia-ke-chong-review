import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const readOptional = (file) => {
  const absolute = path.join(root, file);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
};

const files = {
  page: 'src/pages/online-resumes/page.tsx',
  api: 'src/features/onlineResumes/api.ts',
  list: 'src/features/onlineResumes/components/OnlineResumeList.tsx',
  detail: 'src/features/onlineResumes/components/OnlineResumeDetailDrawer.tsx',
  types: 'src/features/onlineResumes/types.ts',
};

test('在线简历页面只组合 onlineResumes feature', () => {
  const page = readOptional(files.page);
  assert.notEqual(page, '', '缺少在线简历页面');

  const imports = [...page.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert.ok(imports.length > 0, '页面必须导入在线简历列表');
  imports.forEach((specifier) => {
    assert.match(specifier, /^@\/features\/onlineResumes(?:\/|$)/, `页面不应直接依赖 ${specifier}`);
  });
  assert.doesNotMatch(page, /@\/mocks/, '在线简历页面不得使用 mock 数据');
});

test('在线简历 API 使用真实的查询、详情、修改和删除接口', () => {
  const api = readOptional(files.api);
  assert.notEqual(api, '', '缺少在线简历 API');
  assert.match(api, /list\(page[^)]*perPage/);
  assert.match(api, /page=\$\{page\}/);
  assert.match(api, /per_page=\$\{perPage\}/);
  assert.match(api, /apiRequest<[^>]+>\(`\/online-resumes\/\$\{id\}`\)/);
  assert.match(api, /method:\s*['"]PATCH['"]/);
  assert.match(api, /method:\s*['"]DELETE['"]/);
  assert.doesNotMatch(api, /send|reply|message/i, '在线简历 API 不得提供发消息或回复能力');
});

test('列表覆盖加载、失败重试、空态和真实数据展示', () => {
  const list = readOptional(files.list);
  assert.notEqual(list, '', '缺少在线简历列表');
  assert.match(list, /正在加载在线简历/);
  assert.match(list, /重新加载/);
  assert.match(list, /暂无Agent导入的在线简历/);
  for (const content of ['候选人', '招聘需求', 'BOSS账号', '最新聊天', '导入时间']) {
    assert.match(list, new RegExp(content), `列表缺少“${content}”`);
  }
  assert.match(list, /onlineResumesApi\.list/);
  assert.match(list, /上一页/);
  assert.match(list, /下一页/);
  assert.match(list, /第 \{page\} \/ \{pages\} 页/);
  assert.match(list, /items\.length === 1 && page > 1/);
  assert.doesNotMatch(list, /@\/mocks/);
});

test('聊天发送方兼容未知值且来源链接安全打开', () => {
  const types = readOptional(files.types);
  const detail = readOptional(files.detail);

  assert.match(types, /sender:\s*string/);
  assert.match(types, /source_url:\s*string\s*\|\s*null/);
  assert.match(detail, /recruiter:\s*'招聘专员'/);
  assert.match(detail, /candidate:\s*'候选人'/);
  assert.match(detail, /system:\s*'系统'/);
  assert.match(detail, /message\.sender\.trim\(\)/);
  assert.match(detail, /未知发送方/);
  assert.match(detail, /href=\{resume\.source_url\}/);
  assert.match(detail, /target="_blank"/);
  assert.match(detail, /rel="noopener noreferrer"/);
  assert.match(detail, /打开BOSS聊天/);
});

test('详情只读展示完整聊天并允许编辑资料和硬删除', () => {
  const detail = readOptional(files.detail);
  assert.notEqual(detail, '', '缺少在线简历详情抽屉');
  assert.match(detail, /StructuredResumeView/);
  assert.match(detail, /chat_json/);
  assert.match(detail, /sent_at/);
  assert.match(detail, /sender/);
  assert.match(detail, /display_name/);
  assert.match(detail, /resume_json/);
  assert.match(detail, /onlineResumesApi\.update/);
  assert.match(detail, /onlineResumesApi\.remove/);
  assert.match(detail, /删除后在线简历内容无法恢复，但已统计的导入数量不会减少。/);

  const forbidden = /<textarea[^>]*(?:消息|聊天|回复)|发送消息|回复消息|状态推进|正式候选人|candidate[_-]?id/i;
  assert.doesNotMatch(detail, forbidden);
});
