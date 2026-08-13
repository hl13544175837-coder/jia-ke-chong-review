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

test('PGS 菜单可识别五类角色和嵌套按钮权限', () => {
  const permissions = collectCompanyPermissionCodes([{
    code: 'index',
    children: [{ code: 'dashboard_interviewer' }],
    resourceInfo: [{ code: 'interview_feedback_submit' }],
  }]);

  assert.equal(resolveWorkspaceRole(permissions.menuCodes), 'interviewer');
  assert.equal(permissions.buttonCodes.has('interview_feedback_submit'), true);
  for (const [menuCode, expectedRole] of [
    ['dashboard_admin', 'admin'],
    ['dashboard_manager', 'manager'],
    ['dashboard_recruiter', 'recruiter'],
    ['dashboard_interviewer', 'interviewer'],
    ['dashboard_hr_director', 'hr_director'],
  ]) {
    assert.equal(resolveWorkspaceRole(new Set([menuCode])), expectedRole);
  }
  assert.equal(resolveWorkspaceRole(new Set(['index', 'interviews'])), null);
});

test('同时配置两个工作台角色时拒绝静默选一个', () => {
  assert.throws(
    () => resolveWorkspaceRole(new Set(['dashboard_recruiter', 'dashboard_interviewer'])),
    WorkspaceRoleConflictError,
  );
});

test('角色对齐以真实后端身份为准且一致时放行', () => {
  for (const [workspaceRole, fallbackRole, backendRole, expected] of [
    [null, 'recruiter', 'admin', 'admin'],
    ['interviewer', 'recruiter', 'interviewer', 'interviewer'],
    [null, 'recruiter', 'recruiter', 'recruiter'],
  ]) {
    assert.equal(
      resolveAlignedCompanyRole(workspaceRole, fallbackRole, backendRole),
      expected,
    );
  }
});
