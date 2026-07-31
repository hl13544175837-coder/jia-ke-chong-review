import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('业务页面按路由加载而不是全部塞进首屏文件', () => {
  const routes = read('src/router/config.tsx');

  assert.match(routes, /import \{ lazy \} from 'react'/);
  assert.match(routes, /lazy\(\(\) => import\('@\/pages\/dashboard\/page'\)\)/);
  assert.match(routes, /lazy\(\(\) => import\('@\/pages\/interviewer\/interviews\/page'\)\)/);
  assert.match(routes, /lazy\(\(\) => import\('@\/pages\/director\/cockpit\/page'\)\)/);
  assert.doesNotMatch(routes, /import [A-Z][A-Za-z]+ from '@\/pages\//);
  assert.ok((routes.match(/lazy\(\(\) => import\(/g) || []).length >= 20);
});

test('路由加载期间显示产品统一的加载状态', () => {
  const fallbackPath = path.join(root, 'src/components/ui/RouteLoadingFallback.tsx');
  assert.equal(existsSync(fallbackPath), true, '缺少路由加载状态组件');
  const fallback = read('src/components/ui/RouteLoadingFallback.tsx');
  const app = read('src/App.tsx');

  assert.match(fallback, /role="status"/);
  assert.match(fallback, /aria-live="polite"/);
  assert.match(fallback, /页面加载中/);
  assert.match(app, /import \{ Suspense/);
  assert.match(app, /import RouteLoadingFallback from ['"]@\/components\/ui\/RouteLoadingFallback['"]/);
  assert.match(app, /<Suspense fallback=\{<RouteLoadingFallback \/>\}>[\s\S]*<AppRoutes \/>[\s\S]*<\/Suspense>/);
});
