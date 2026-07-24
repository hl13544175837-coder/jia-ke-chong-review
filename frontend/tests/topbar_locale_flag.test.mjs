import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const appShell = readFileSync(
  resolve(root, 'readdy-frontend/src/components/feature/MainLayout.tsx'),
  'utf8',
);

assert.doesNotMatch(
  appShell,
  /enterprise-flag-cn|中文\s*▾/,
  'Readdy top bar should not show a fake locale selector that has no real language-switch behavior',
);
assert.match(appShell, /通知/, 'Readdy top bar should reserve its utility area for working product actions');
assert.match(appShell, /重新加载公司权限|退出登录/, 'Readdy top bar should expose the real company account menu');
