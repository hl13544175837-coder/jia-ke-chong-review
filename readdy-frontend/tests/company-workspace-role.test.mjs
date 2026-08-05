import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve(import.meta.dirname, '../src') },
});
const {
  collectCompanyPermissionCodes,
  resolveAlignedCompanyRole,
  resolveWorkspaceRole,
  WorkspaceRoleConflictError,
} = await jiti.import('../src/auth/companyPermissionModel.ts');

test('从嵌套 PGS 菜单识别面试官工作台', () => {
  const permissions = collectCompanyPermissionCodes([{
    code: 'index',
    children: [{ code: 'dashboard_interviewer' }],
    resourceInfo: [{ code: 'interview_feedback_submit' }],
  }]);

  assert.equal(resolveWorkspaceRole(permissions.menuCodes), 'interviewer');
  assert.equal(permissions.buttonCodes.has('interview_feedback_submit'), true);
});

test('五类公司角色都能从各自的 PGS 工作台菜单识别', () => {
  const cases = [
    ['dashboard_admin', 'admin'],
    ['dashboard_manager', 'manager'],
    ['dashboard_recruiter', 'recruiter'],
    ['dashboard_interviewer', 'interviewer'],
    ['dashboard_hr_director', 'hr_director'],
  ];

  for (const [menuCode, expectedRole] of cases) {
    assert.equal(resolveWorkspaceRole(new Set([menuCode])), expectedRole);
  }
});

test('没有角色工作台标记时返回 null', () => {
  assert.equal(resolveWorkspaceRole(new Set(['index', 'interviews'])), null);
});

test('同时配置两个工作台角色时拒绝静默选一个', () => {
  assert.throws(
    () => resolveWorkspaceRole(new Set(['dashboard_recruiter', 'dashboard_interviewer'])),
    WorkspaceRoleConflictError,
  );
});

test('没有工作台标记时采用后端真实角色', () => {
  assert.equal(
    resolveAlignedCompanyRole(null, 'recruiter', 'admin'),
    'admin',
  );
});

test('工作台角色、回退角色与后端一致时返回最终角色', () => {
  assert.equal(
    resolveAlignedCompanyRole('interviewer', 'recruiter', 'interviewer'),
    'interviewer',
  );
  assert.equal(
    resolveAlignedCompanyRole(null, 'recruiter', 'recruiter'),
    'recruiter',
  );
});
