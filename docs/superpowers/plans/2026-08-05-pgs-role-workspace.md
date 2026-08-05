# PGS Role Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PGS 工作台菜单决定智聘角色页面，同时由后端真实用户继续决定数据范围，并用李四 `100002` 的面试官配置完成第一轮验收。

**Architecture:** 新增一个无 UI、无网络依赖的权限模型，统一提取 PGS 菜单编码并解析唯一工作台角色。公司登录流程在进入页面前读取 PGS 菜单和后端 `/auth/me`，发现两边角色不一致就阻断；菜单 Provider 负责后续入口过滤和失败重试，后端 RBAC 继续作为数据权限最终边界。

**Tech Stack:** React 19、TypeScript 5.8、Vite、Node test/tsx、Flask、SQLAlchemy、pytest。

---

## 文件边界

- 新建 `readdy-frontend/src/auth/companyPermissionModel.ts`：纯函数，负责菜单编码收集、工作台角色解析和冲突错误。
- 修改 `readdy-frontend/src/auth/companyAuth.tsx`：登录时读取菜单、读取后端当前用户并校验角色一致。
- 修改 `readdy-frontend/src/auth/companyPermissions.tsx`：复用权限模型，权限接口失败时明确阻断并允许重试。
- 修改 `readdy-frontend/src/components/feature/MainLayout.tsx`：真正用 PGS 菜单编码过滤侧边栏。
- 新建 `readdy-frontend/tests/company-workspace-role.test.mjs`：纯函数行为测试。
- 修改 `readdy-frontend/tests/company-gateway-role-map.test.mjs`：登录接线与失败关闭契约测试。
- 修改 `backend/tests/test_interview_loop.py`：两名面试官同页面、不同数据的回归证据。
- 修改 `RUNNING.md`、`DEPLOYMENT.md`：同步菜单编码、双重配置和验收步骤。

### Task 1：解析 PGS 工作台菜单角色

**Files:**
- Create: `readdy-frontend/src/auth/companyPermissionModel.ts`
- Create: `readdy-frontend/tests/company-workspace-role.test.mjs`

- [ ] **Step 1: 先写失败测试**

测试用 `jiti` 导入 TypeScript，覆盖嵌套菜单、按钮资源、单一角色、无角色和重复角色：

```js
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
```

- [ ] **Step 2: 运行并确认因文件不存在而失败**

Run: `cd readdy-frontend && ./node_modules/.bin/tsx --test tests/company-workspace-role.test.mjs`

Expected: FAIL，错误包含 `companyPermissionModel.ts` 不存在或无法导入。

- [ ] **Step 3: 写最小实现**

```ts
import type { CompanyRole } from './gatewayRoles';

export interface CompanyMenuNode {
  code?: string;
  children?: CompanyMenuNode[] | null;
  resourceInfo?: CompanyMenuNode[] | null;
}

export const WORKSPACE_ROLE_BY_MENU_CODE: Readonly<Record<string, CompanyRole>> = {
  dashboard_recruiter: 'recruiter',
  dashboard_interviewer: 'interviewer',
};

export class WorkspaceRoleConflictError extends Error {
  constructor(readonly roles: CompanyRole[]) {
    super(`账号配置了多个工作台角色：${roles.join('、')}`);
    this.name = 'WorkspaceRoleConflictError';
  }
}

export function collectCompanyPermissionCodes(nodes: CompanyMenuNode[] | null | undefined) {
  const menuCodes = new Set<string>();
  const buttonCodes = new Set<string>();
  const visit = (items: CompanyMenuNode[] | null | undefined) => {
    for (const node of items ?? []) {
      if (node.code) menuCodes.add(node.code.trim());
      for (const resource of node.resourceInfo ?? []) {
        if (resource.code) buttonCodes.add(resource.code.trim());
      }
      visit(node.children);
    }
  };
  visit(nodes);
  return { menuCodes, buttonCodes };
}

export function resolveWorkspaceRole(menuCodes: Iterable<string>): CompanyRole | null {
  const roles = [...new Set([...menuCodes]
    .map((code) => WORKSPACE_ROLE_BY_MENU_CODE[code])
    .filter((role): role is CompanyRole => Boolean(role)))];
  if (roles.length > 1) throw new WorkspaceRoleConflictError(roles);
  return roles[0] ?? null;
}
```

- [ ] **Step 4: 跑测试和类型检查**

Run: `cd readdy-frontend && ./node_modules/.bin/tsx --test tests/company-workspace-role.test.mjs && npm run type-check`

Expected: 新测试全部 PASS，类型检查退出码 0。

- [ ] **Step 5: 提交**

```bash
git add readdy-frontend/src/auth/companyPermissionModel.ts readdy-frontend/tests/company-workspace-role.test.mjs
git commit -m "feat: resolve product role from PGS workspace menus"
```

### Task 2：登录时校验 PGS 页面角色与后端真实角色

**Files:**
- Modify: `readdy-frontend/src/auth/companyAuth.tsx`
- Modify: `readdy-frontend/tests/company-gateway-role-map.test.mjs`

- [ ] **Step 1: 先扩展契约测试并确认失败**

新增断言，要求登录流程调用 `queryCurrentUserMenu`、解析 `resolveWorkspaceRole`、调用 `/auth/me`，并在角色不一致时出现大白话错误：

```js
assert.match(auth, /queryCurrentUserMenu/);
assert.match(auth, /resolveWorkspaceRole/);
assert.match(auth, /\/auth\/me/);
assert.match(auth, /PGS 工作台角色/);
assert.match(auth, /后端角色/);
```

Run: `cd readdy-frontend && ./node_modules/.bin/tsx --test tests/company-gateway-role-map.test.mjs`

Expected: FAIL，缺少菜单角色和后端角色校验。

- [ ] **Step 2: 实现登录接线**

在 `companyAuth.tsx` 中：

1. `gatewayProfile` 返回真实姓名、工号和网关 profile 的可选角色，不提前结束角色判断。
2. 新增 `gatewayMenuRole(token)`，POST `queryCurrentUserMenu?clientId=zhipin`，调用 `collectCompanyPermissionCodes` 和 `resolveWorkspaceRole`。
3. 新增 `backendProfile(token, empCode)`，GET `${API_BASE}/auth/me`，请求头同时带 `Authorization` 和 `X-Emp-Code`。
4. 角色取值为 `workspaceRole ?? resolveGatewayRole(...)`。
5. 工作台菜单角色存在且与 `/auth/me` 的角色不一致时抛出：`PGS 工作台角色为 interviewer，但后端角色为 recruiter，请同步角色配置后重试`。
6. `CompanyLoginResult.user_id` 使用后端用户 ID，页面显示名优先使用公司 profile 姓名。

- [ ] **Step 3: 跑契约、类型检查和构建**

Run: `cd readdy-frontend && ./node_modules/.bin/tsx --test tests/company-gateway-role-map.test.mjs && npm run type-check && npm run build`

Expected: 全部退出码 0。

- [ ] **Step 4: 提交**

```bash
git add readdy-frontend/src/auth/companyAuth.tsx readdy-frontend/tests/company-gateway-role-map.test.mjs
git commit -m "feat: align PGS workspace and backend roles at login"
```

### Task 3：菜单读取失败时关闭入口，并真实过滤侧边栏

**Files:**
- Modify: `readdy-frontend/src/auth/companyPermissions.tsx`
- Modify: `readdy-frontend/src/components/feature/MainLayout.tsx`
- Modify: `readdy-frontend/tests/company-gateway-role-map.test.mjs`

- [ ] **Step 1: 写失败契约**

```js
const permissions = read('src/auth/companyPermissions.tsx');
const layout = read('src/components/feature/MainLayout.tsx');
assert.match(permissions, /公司权限加载失败/);
assert.match(permissions, /重新加载权限/);
assert.doesNotMatch(permissions, /hasMenu:\s*\(code\)\s*=>\s*!state\.ready/);
assert.match(layout, /hasMenu/);
assert.match(layout, /item\.menuCode/);
```

Run: `cd readdy-frontend && ./node_modules/.bin/tsx --test tests/company-gateway-role-map.test.mjs`

Expected: FAIL，当前菜单过滤为失败时全部放行，侧边栏未调用 `hasMenu`。

- [ ] **Step 2: 复用纯权限模型并增加错误状态**

`CompanyPermissionsProvider` 使用 `collectCompanyPermissionCodes`；请求失败或业务返回失败时保存错误文案并渲染“公司权限加载失败”页面，只提供“重新加载权限”和“退出登录”。`hasMenu` 改为仅在成功读取后按编码返回 true。

- [ ] **Step 3: 过滤导航入口**

`MainLayout` 从 `useCompanyPermissions()` 取得 `hasMenu`，角色菜单改为：

```ts
const navItems = roleNavItems.filter(
  (item) => item.roles.includes(currentRole) && hasMenu(item.menuCode),
);
const visibleBottomNavItems = bottomNavItems.filter(
  (item) => item.roles.includes(currentRole) && hasMenu(item.menuCode),
);
```

- [ ] **Step 4: 跑前端门禁**

Run: `cd readdy-frontend && npm run test:contract && npm run type-check && npm run lint && npm run build`

Expected: contract 0 失败、type-check/lint/build 退出码均为 0。

- [ ] **Step 5: 提交**

```bash
git add readdy-frontend/src/auth/companyPermissions.tsx readdy-frontend/src/components/feature/MainLayout.tsx readdy-frontend/tests/company-gateway-role-map.test.mjs
git commit -m "fix: enforce PGS menus in the product navigation"
```

### Task 4：证明不同面试官使用同页面但数据不串

**Files:**
- Modify: `backend/tests/test_interview_loop.py`

- [ ] **Step 1: 新增双面试官回归测试**

创建两个 `interviewer` 用户、两个候选人和两条 assignment，分别提交反馈；两个账号各自 GET `/api/interviews`，断言返回的 `interviewer_id` 只有自己。

- [ ] **Step 2: 运行测试**

Run: `cd backend && ../.venv/bin/pytest tests/test_interview_loop.py -q`

Expected: PASS；若新增测试直接通过，说明现有后端已满足数据隔离，本轮只补证据，不改服务代码。若失败，先保留失败输出，再只在 `backend/app/api/interview_queries.py` 的 interviewer 查询范围修复。

- [ ] **Step 3: 运行相关权限回归**

Run: `cd backend && ../.venv/bin/pytest tests/test_gateway_trial_roles.py tests/test_interview_loop.py tests/test_interview_feedback_editing.py tests/test_demand_approval.py -q`

Expected: 0 failed。

- [ ] **Step 4: 提交**

```bash
git add backend/tests/test_interview_loop.py backend/app/api/interview_queries.py
git commit -m "test: prove interviewer account data isolation"
```

只 stage 实际变更文件；如果服务代码未改，不得把它加入提交。

### Task 5：同步运行和部署说明

**Files:**
- Modify: `RUNNING.md`
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1: 写清三方一致配置**

文档加入首轮示例：PGS `dashboard_interviewer`、前端 `VITE_GATEWAY_ROLE_MAP=100002:interviewer`、后端 `AUTH_GATEWAY_ROLE_MAP=100002:interviewer`，并说明 PGS 决定页面、后端决定数据。

- [ ] **Step 2: 写现场验收步骤**

记录李四登录落到 `/interviewer/dashboard`、`/api/auth/me` 为 `interviewer`、第二面试官反向隔离、无权路由/API 返回拒绝，以及配置不一致时的错误处理。

- [ ] **Step 3: 检查并提交**

Run: `git diff --check -- RUNNING.md DEPLOYMENT.md`

Expected: 退出码 0。

```bash
git add RUNNING.md DEPLOYMENT.md
git commit -m "docs: document PGS role workspace rollout"
```

### Task 6：最终统一门禁

**Files:**
- Verify only

- [ ] **Step 1: 运行项目 Test/SIT 门禁**

Run: `./scripts/check-sit-release.sh`

Expected: 脚本退出码 0；若公司网络或平台证据缺失，只能报告具体未验证项，不能把本地通过描述成 SIT 已生效。

- [ ] **Step 2: 核对改动边界**

Run: `git status --short && git diff HEAD^ --stat`

Expected: 不包含用户原有 `docs/verification/2026-08-04-requirements-summary/`，不包含真实密钥、数据库或构建产物。

- [ ] **Step 3: 形成交接**

交付必须分别说明：代码已完成什么、本地测试证明什么、PGS/Apollo/Libra 还需要用户或现场完成什么；不得宣称测试环境已经生效，直到真人登录和接口证据齐全。
