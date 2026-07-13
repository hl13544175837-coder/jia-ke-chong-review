// 契约测试：接入网关菜单/按钮权限（queryCurrentUserMenu），fail-open + 导航/按钮门。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const read = (p) => readFileSync(join(srcRoot, p), 'utf8');

// 权限模块：拉菜单、拍平 code、fail-open、Can 组件
const perm = read('lib/permissions.tsx');
assert.ok(perm.includes('queryCurrentUserMenu'), '应调用 queryCurrentUserMenu');
assert.ok(perm.includes('clientId'), '应带 clientId 参数');
assert.ok(perm.includes('resourceInfo'), '应从 resourceInfo 收集按钮 code');
assert.ok(perm.includes('export function usePermissions'), '应导出 usePermissions');
assert.ok(perm.includes('export function Can'), '应导出 Can 按钮门组件');
assert.ok(perm.includes('export function PermissionsProvider'), '应导出 PermissionsProvider');
// fail-open：未就绪时 hasMenu/hasButton 返回 true
assert.ok(perm.includes('!state.ready'), 'hasMenu/hasButton 应在未就绪时 fail-open');

// App 挂载 PermissionsProvider（登录后加载）
const app = read('App.tsx');
assert.ok(app.includes('PermissionsProvider'), 'App 应挂载 PermissionsProvider');
assert.ok(app.includes('authed={isAuthenticated}'), 'PermissionsProvider 应在登录后加载');

// 导航按网关菜单 code 过滤
const shell = read('components/AppShell.tsx');
assert.ok(shell.includes('usePermissions'), 'AppShell 应使用 usePermissions');
assert.ok(shell.includes('hasMenu'), '导航应按 hasMenu 过滤');
assert.ok(read('lib/nav.ts').includes('menuCode'), 'NavItem 应支持 menuCode');

console.log('gateway_permissions_contract: OK');
