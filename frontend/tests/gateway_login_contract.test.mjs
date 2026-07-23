// 契约测试：默认登录走网关 OAuth，本地容器可显式切换后端认证。
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const read = (p) => readFileSync(join(srcRoot, p), 'utf8');

// 1) 统一 API 前缀由环境变量驱动
const apiBase = read('lib/apiBase.ts');
assert.ok(apiBase.includes('VITE_API_BASE_URL'), 'apiBase 应由 VITE_API_BASE_URL 决定');
assert.ok(apiBase.includes('API_BASE'), 'apiBase 应导出 API_BASE');

// 2) MD5 工具存在且导出
assert.ok(existsSync(join(srcRoot, 'lib/md5.ts')), 'md5.ts 应存在');
assert.ok(read('lib/md5.ts').includes('export function md5'), 'md5.ts 应导出 md5');

// 3) 网关登录模块：登录 + profile + 默认角色，密码 MD5，读 data.token
const gw = read('lib/gatewayAuth.ts');
const authMode = read('lib/authMode.ts');
assert.ok(gw.includes('/login'), '应 POST 网关 /login');
assert.ok(gw.includes('/api/profile'), '应 GET 网关 /api/profile');
assert.ok(gw.includes('md5(password)'), '密码应 MD5 后发送');
assert.ok(gw.includes('data?.token') || gw.includes('data.token'), 'token 应取自 data.token');
assert.ok(gw.includes('Bearer'), 'profile 应带 Bearer 鉴权');
assert.ok(gw.includes('VITE_OAUTH_BASE_URL'), 'OAuth 前缀应可配置');
assert.ok(gw.includes('VITE_DEFAULT_ROLE'), '默认角色应可配置');
assert.ok(gw.includes("from './authMode'"), '登录与权限模块应复用同一认证模式真源');
assert.ok(authMode.includes('VITE_LOGIN_PROVIDER'), '认证模式真源应读取构建配置');
assert.ok(authMode.includes("return 'local'"), '认证模式真源应显式识别本地模式');
assert.ok(gw.includes("LOGIN_PROVIDER === 'local'"), '本地模式应显式调用后端认证');
assert.ok(gw.includes('api.login({ email: account, password })'), '本地模式应复用统一登录 API');
assert.ok(gw.includes('succ') || gw.includes('code === 1'), '应按网关包 succ/code 判成败');

// 4) 登录页只采集账号，由配置化认证入口决定网关或本地后端
const loginPage = read('pages/LoginPage.tsx');
assert.ok(loginPage.includes('loginWithConfiguredAuth'), 'LoginPage 应调用配置化认证入口');
assert.ok(loginPage.includes('account'), 'LoginPage 应采集账号 account');
assert.ok(!loginPage.includes('api.login('), 'LoginPage 不应再直连后端 api.login');

// 5) 网关工号作为后端用户身份：登录存工号，业务请求统一带 X-Emp-Code
const apiSrc = read('lib/api.ts');
assert.ok(apiSrc.includes('X-Emp-Code'), 'authHeaders 应发送 X-Emp-Code 工号头');
assert.ok(apiSrc.includes('export function authHeaders'), 'api 应导出统一 authHeaders');
assert.ok(gw.includes('setEmpCode'), '登录应存网关工号');
assert.ok(gw.includes('ymEmpCode'), '工号应取自 profile 的 ymEmpCode');

console.log('gateway_login_contract: OK');
