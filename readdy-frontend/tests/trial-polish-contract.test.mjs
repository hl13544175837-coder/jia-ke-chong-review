import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('共享页面状态同时覆盖加载、空数据、失败和重试', () => {
  const file = 'src/components/ui/PageStateCard.tsx';
  assert.equal(existsSync(path.join(root, file)), true, '缺少共享页面状态组件');
  const source = read(file);

  assert.match(source, /type PageStateVariant = 'loading' \| 'empty' \| 'error'/);
  assert.match(source, /onAction\?: \(\) => void/);
  assert.match(source, /role=\{variant === 'error' \? 'alert' : 'status'\}/);
  assert.match(source, /重新加载/);
});

test('技术错误统一翻译为业务用户看得懂的提示', () => {
  const file = 'src/lib/userFacingError.ts';
  assert.equal(existsSync(path.join(root, file)), true, '缺少统一错误翻译函数');
  const source = read(file);

  assert.match(source, /export function userFacingError/);
  assert.match(source, /Failed to fetch|NetworkError|HTTP\\s\*/);
  assert.match(source, /请稍后重试/);
});

test('六个核心工作页复用统一状态和错误翻译', () => {
  const pages = [
    'src/pages/jobs/page.tsx',
    'src/pages/interviews/page.tsx',
    'src/pages/offers/page.tsx',
    'src/pages/interviewer/jobs/page.tsx',
    'src/pages/interviewer/screening/page.tsx',
    'src/pages/interviewer/interviews/page.tsx',
  ];

  pages.forEach((file) => {
    const source = read(file);
    assert.match(source, /import PageStateCard from '@\/components\/ui\/PageStateCard'/, file);
    assert.match(source, /import \{ userFacingError \} from '@\/lib\/userFacingError'/, file);
    assert.match(source, /<PageStateCard/, file);
    assert.match(source, /variant="error"[\s\S]{0,260}?onAction=/, file);
  });
});

test('候选人详情的图标关闭按钮有可读名称', () => {
  const source = read('src/pages/candidates/components/CandidateDetailDrawer.tsx');
  assert.match(
    source,
    /<button[\s\S]{0,220}?type="button"[\s\S]{0,220}?aria-label="关闭候选人详情"/,
  );
  assert.match(source, /ri-close-line[^>]*aria-hidden="true"/);
});
