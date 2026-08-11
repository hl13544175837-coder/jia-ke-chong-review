import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('测试站前端通过同域 API 和公司测试 OAuth 网关访问业务服务', () => {
  const dockerfile = read('Dockerfile');

  assert.match(dockerfile, /ARG VITE_API_BASE_URL=\/api/);
  assert.match(dockerfile, /ARG VITE_OAUTH_BASE_URL=https:\/\/test-pgsgw\.yimidida\.com\/pgs\/oauth/);
});

test('AI 导入弹窗不会因父级重渲染而重复加载简历库', () => {
  const source = read('src/pages/talent-map/components/AiImportWizard.tsx');

  assert.match(source, /const \{ loadResumeCandidates \} = workspace;/);
  assert.match(source, /const result = await loadResumeCandidates\(kw\);/);
  assert.match(source, /\}, \[loadResumeCandidates, showToast\]\);/);
});

test('网络错误不会误称为本地业务服务故障', () => {
  const source = read('src/lib/api.ts');

  assert.doesNotMatch(source, /无法连接本地业务服务/);
  assert.match(source, /无法连接业务服务/);
});
