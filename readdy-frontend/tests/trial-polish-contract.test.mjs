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
