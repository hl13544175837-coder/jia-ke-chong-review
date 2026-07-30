import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const buildInfoPath = path.join(root, 'src/config/buildInfo.ts');
const loginPath = path.join(root, 'src/pages/login/page.tsx');

test('前端构建身份证有安全默认值并显示在登录页', () => {
  assert.ok(existsSync(buildInfoPath), '缺少统一的前端构建身份证');
  const buildInfoSource = readFileSync(buildInfoPath, 'utf8');
  const loginSource = readFileSync(loginPath, 'utf8');

  assert.match(buildInfoSource, /VITE_BUILD_VERSION/);
  assert.match(buildInfoSource, /VITE_BUILD_CHANNEL/);
  assert.match(buildInfoSource, /VITE_BUILD_TIME/);
  assert.match(buildInfoSource, /['"]local['"]/);
  assert.match(buildInfoSource, /['"]unknown['"]/);
  assert.match(buildInfoSource, /formatBuildLabel/);
  assert.match(loginSource, /formatBuildLabel\(\)/);
  assert.doesNotMatch(buildInfoSource, /SECRET|PASSWORD|DATABASE_URL/);
});
