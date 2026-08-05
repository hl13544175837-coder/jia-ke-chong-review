import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('company gateway roles use an employee map and least-privilege fallback', () => {
  const roles = read('src/auth/gatewayRoles.ts');
  const auth = read('src/auth/companyAuth.tsx');

  assert.match(roles, /parseGatewayRoleMap/);
  assert.match(roles, /resolveGatewayRole/);
  assert.match(roles, /'recruiter'/);
  assert.match(roles, /toUpperCase\(\)/);
  assert.match(auth, /VITE_GATEWAY_ROLE_MAP/);
  assert.match(auth, /resolveGatewayRole\(empCode/);
  assert.doesNotMatch(auth, /VITE_DEFAULT_ROLE \?\? 'admin'/);
});

test('company login aligns the PGS workspace role with the backend role', () => {
  const auth = read('src/auth/companyAuth.tsx');

  assert.match(auth, /queryCurrentUserMenu/);
  assert.match(auth, /resolveWorkspaceRole/);
  assert.match(auth, /\/auth\/me/);
  assert.match(auth, /PGS 工作台角色/);
  assert.match(auth, /后端角色/);
});

test('company menu loading fails closed and filters the product navigation', () => {
  const permissions = read('src/auth/companyPermissions.tsx');
  const layout = read('src/components/feature/MainLayout.tsx');

  assert.match(permissions, /公司权限加载失败/);
  assert.match(permissions, /重新加载权限/);
  assert.doesNotMatch(permissions, /hasMenu:\s*\(code\)\s*=>\s*!state\.ready/);
  assert.match(layout, /hasMenu/);
  assert.match(layout, /hasMenu\(item\.menuCode\)/);
});
