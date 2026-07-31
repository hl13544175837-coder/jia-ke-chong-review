import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('应用异常时显示大白话提示和两个恢复动作', () => {
  const boundaryPath = path.join(root, 'src/components/ui/AppErrorBoundary.tsx');
  assert.equal(existsSync(boundaryPath), true, '缺少应用错误兜底组件');
  const boundary = read('src/components/ui/AppErrorBoundary.tsx');

  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /页面暂时无法显示/);
  assert.match(boundary, /重新加载/);
  assert.match(boundary, /返回工作台/);
  assert.match(boundary, /window\.location\.reload\(\)/);
  assert.match(boundary, /window\.location\.assign\('\/'\)/);
  assert.doesNotMatch(boundary, /error\.message/);
  assert.doesNotMatch(boundary, /error\.stack/);
});

test('错误兜底包裹认证、权限和业务路由', () => {
  const app = read('src/App.tsx');
  assert.match(app, /import AppErrorBoundary from ['"]@\/components\/ui\/AppErrorBoundary['"]/);
  assert.match(app, /<AppErrorBoundary>[\s\S]*<FutureBrowserRouter/);
  assert.match(app, /<AppRoutes \/>[\s\S]*<\/AppErrorBoundary>/);
});
