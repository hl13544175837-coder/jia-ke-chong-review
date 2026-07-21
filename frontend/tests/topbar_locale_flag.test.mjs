import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appShell = readFileSync(resolve('src/components/AppShell.tsx'), 'utf8');

assert.doesNotMatch(
  appShell,
  /enterprise-flag-cn|中文\s*▾/,
  'Readdy top bar should not show a fake locale selector that has no real language-switch behavior',
);
assert.match(appShell, /通知/, 'Readdy top bar should reserve its utility area for working product actions');
assert.match(appShell, /账户|修改密码/, 'Readdy top bar should expose the real account menu');
