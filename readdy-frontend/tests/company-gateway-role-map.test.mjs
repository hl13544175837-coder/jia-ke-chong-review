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
