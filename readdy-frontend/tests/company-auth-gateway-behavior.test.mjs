import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve(import.meta.dirname, '../src') },
});
const { createCompanyAuthGateway } = await jiti.import(
  '../src/auth/companyAuthGateway.ts',
);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function gatewayScenario({ menuCodes, backendRole, backendStatus = 200 }) {
  const requests = [];
  const fetcher = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/login')) {
      return jsonResponse({ code: 1, succ: true, data: { token: 'company-token' } });
    }
    if (url.endsWith('/api/profile')) {
      return jsonResponse({
        code: 1,
        succ: true,
        data: { userInfo: { empName: '李四', ymEmpCode: '100002' } },
      });
    }
    if (url.includes('queryCurrentUserMenu')) {
      return jsonResponse({
        code: 1,
        succ: true,
        data: [{ code: 'index', children: menuCodes.map((code) => ({ code })) }],
      });
    }
    if (url.endsWith('/api/auth/me')) {
      return jsonResponse(
        backendStatus === 200
          ? { id: 42, role: backendRole, name: '100002' }
          : { error: '账号已停用' },
        backendStatus,
      );
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const gateway = createCompanyAuthGateway({
    oauthBase: '/pgs/oauth',
    apiBase: '/api',
    permissionClientId: 'zhipin',
    gatewayRoleMap: '',
    fallbackRole: 'recruiter',
    fetcher,
  });
  return { gateway, requests };
}

test('真实 PGS 菜单和后端角色一致时返回后端用户身份', async () => {
  const { gateway, requests } = gatewayScenario({
    menuCodes: ['dashboard_interviewer'],
    backendRole: 'interviewer',
  });

  const result = await gateway.login('lisi', 'password');

  assert.deepEqual(result, {
    token: 'company-token',
    empCode: '100002',
    user_id: 42,
    role: 'interviewer',
    name: '李四',
  });
  const backendRequest = requests.find(({ url }) => url.endsWith('/api/auth/me'));
  assert.equal(backendRequest.init.headers['X-Emp-Code'], '100002');
  assert.equal(backendRequest.init.headers.Authorization, 'Bearer company-token');
});

test('没有工作台标记但回退角色与后端不一致时拒绝登录', async () => {
  const { gateway } = gatewayScenario({ menuCodes: [], backendRole: 'interviewer' });

  await assert.rejects(
    () => gateway.login('lisi', 'password'),
    /前端回退角色为 recruiter，但后端角色为 interviewer/,
  );
});

test('PGS 工作台角色与后端不一致时拒绝登录', async () => {
  const { gateway } = gatewayScenario({
    menuCodes: ['dashboard_interviewer'],
    backendRole: 'recruiter',
  });

  await assert.rejects(
    () => gateway.login('lisi', 'password'),
    /PGS 工作台角色为 interviewer，但后端角色为 recruiter/,
  );
});

test('恢复旧登录状态时重新读取菜单和后端角色', async () => {
  const { gateway } = gatewayScenario({
    menuCodes: ['dashboard_interviewer'],
    backendRole: 'interviewer',
  });

  const restored = await gateway.revalidate({
    token: 'company-token',
    empCode: '100002',
    user_id: 7,
    role: 'recruiter',
    name: '李四',
  });

  assert.equal(restored.role, 'interviewer');
  assert.equal(restored.user_id, 42);
});

test('恢复旧登录状态遇到后端拒绝时不保留旧身份', async () => {
  const { gateway } = gatewayScenario({
    menuCodes: ['dashboard_interviewer'],
    backendRole: 'interviewer',
    backendStatus: 403,
  });

  await assert.rejects(
    () => gateway.revalidate({
      token: 'company-token',
      empCode: '100002',
      user_id: 7,
      role: 'interviewer',
      name: '李四',
    }),
    /账号已停用/,
  );
});
