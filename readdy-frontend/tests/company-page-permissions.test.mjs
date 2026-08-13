import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createJiti } from 'jiti';

const root = path.resolve(import.meta.dirname, '..');
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve(root, 'src') },
});

const { requiredMenuCodeForPath } = await jiti.import(
  '../src/auth/companyPagePermissions.ts',
);

test('受保护地址统一映射到公司菜单权限', () => {
  const cases = [
    ['/dashboard', 'index'],
    ['/interviewer/dashboard', 'index'],
    ['/interviews', 'interviews'],
    ['/interviewer/interviews', 'interviews'],
    ['/interviewer/screening', 'interviews'],
    ['/jobs', 'demands'],
    ['/interviewer/jobs', 'demands'],
    ['/online-resumes', 'candidates'],
    ['/candidates', 'candidates'],
    ['/talent-map', 'candidates'],
    ['/kanban', 'pipeline'],
    ['/offers', 'pipeline'],
    ['/analytics', 'bi'],
    ['/settings', 'settings'],
    ['/unknown', null],
  ];

  for (const [url, menuCode] of cases) {
    assert.equal(requiredMenuCodeForPath(url), menuCode);
  }
});
