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

test('没有角色工作台标记时返回 null', () => {
  assert.equal(resolveWorkspaceRole(new Set(['index', 'interviews'])), null);
});

test('同时配置两个工作台角色时拒绝静默选一个', () => {
  assert.throws(
    () => resolveWorkspaceRole(new Set(['dashboard_recruiter', 'dashboard_interviewer'])),
    WorkspaceRoleConflictError,
  );
});
