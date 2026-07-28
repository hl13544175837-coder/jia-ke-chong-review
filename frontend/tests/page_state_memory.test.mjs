import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('左侧导航记住四个招聘模块的最后网址和滚动位置', () => {
  const helperPath = path.join(root, 'readdy-frontend/src/features/navigation/pageMemory.ts');
  assert.ok(fs.existsSync(helperPath), '缺少共享页面记忆模块');

  const helper = read('readdy-frontend/src/features/navigation/pageMemory.ts');
  const layout = read('readdy-frontend/src/components/feature/MainLayout.tsx');

  for (const routePath of ['/jobs', '/candidates', '/interviews', '/offers']) {
    assert.match(helper, new RegExp(routePath.replace('/', '\\/')), `未记住 ${routePath}`);
  }
  assert.match(helper, /memoryKeyForPath/);
  assert.match(helper, /safeRememberedHref/);
  assert.match(layout, /pageMemoriesRef/);
  assert.match(layout, /mainScrollRef/);
  assert.match(layout, /rememberedNavTarget/);
  assert.match(layout, /onScroll=\{rememberMainScroll\}/);
  assert.doesNotMatch(`${helper}\n${layout}`, /localStorage|sessionStorage/);
});
