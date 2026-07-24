import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const sha256 = (relativePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(root, relativePath)))
  .digest('hex');

const frozenFiles = {
  'frontend/src/pages/LoginPage.tsx': '40e5ef1368238f12db72b9d646a4e99ffbec172783329b89b112e014fec2664c',
  'frontend/vite.config.ts': '5153e4523175f02fafddbe97d2e4ce87b9155b2e9eaaffbaa47dabbe37512f87',
  'frontend/src/lib/gatewayAuth.ts': '176e12a6276d6641ed045d3bd9103fe7910ac413416ae7b9608b7dca6930e8eb',
  'frontend/src/lib/auth.tsx': 'da5584d5d39bb8c9c1ebafb9cf77a50791362321d663cf1520f6640675e67278',
  'frontend/src/lib/api.ts': '6047e575696407331928b00a04ac7493e2400de2c37c565048f08365890a65a6',
  'frontend/src/lib/permissions.tsx': 'ddb09a04aee99fc3c6bb898d4db32d4f3aadc0217e42ccffddc17ff9645d8468',
  'backend/apollo_config.py': '82ad2752d02eb69ee4ad96303b0ffbd0a5c5eb5abae84b76138b4ca1220dd5df',
  'backend/app/services/third_party_service.py': 'b1f07440a34652a54af5153497ada615aeeb6b61ba4c2fb0f1985f4f9134368e',
  'backend/app/middleware/auth.py': 'b70a8fa9be25d4e3689207a5fff96c2ec7826a3faefa3466645ff72cd341d641',
  'backend/app/api/auth.py': '34cbc040ad2dfdf6ea45c83dc0bec0fe361b11553bb835d47c052bb0dd3316d0',
};

for (const [relativePath, expectedHash] of Object.entries(frozenFiles)) {
  assert.equal(sha256(relativePath), expectedHash, `${relativePath} 是公司冻结安全文件，不允许静默修改`);
}

assert.equal(
  sha256('readdy-frontend/src/auth/md5.ts'),
  sha256('frontend/src/lib/md5.ts'),
  '5190 必须逐字复用公司已经验证的 MD5 实现',
);

const login = read('readdy-frontend/src/pages/login/page.tsx');
assert.doesNotMatch(login, /setTimeout\s*\(/, '5190 禁止 Readdy 定时器假登录');
assert.match(login, /loginViaCompanyGateway/, '5190 登录必须调用公司网关链路');
assert.match(login, /公司账号/, '登录页必须保留公司账号口径');
assert.doesNotMatch(login, /type="email"/, '公司账号不能被强制限制为邮箱');

const companyAuth = read('readdy-frontend/src/auth/companyAuth.tsx');
assert.match(companyAuth, /\/pgs\/oauth/, '必须保留公司 OAuth 前缀');
assert.match(companyAuth, /md5\(password\)/, '密码必须沿用公司既定的前端 MD5 协议');
assert.match(companyAuth, /\/api\/profile/, '登录后必须读取公司网关 profile');
assert.match(companyAuth, /\/auth\/me/, '必须由后端 auth\/me 决定真实角色');
assert.match(companyAuth, /hireinsight_token/, '必须沿用公司 Token 存储键');
assert.match(companyAuth, /hireinsight_emp_code/, '必须沿用公司工号存储键');
assert.match(companyAuth, /Authorization.*Bearer/s, '业务请求必须保留 Bearer Token');
assert.match(companyAuth, /X-Emp-Code/, '业务请求必须保留 X-Emp-Code');

const permissions = read('readdy-frontend/src/auth/companyPermissions.tsx');
assert.match(permissions, /queryCurrentUserMenu/, '登录后必须加载公司菜单和按钮权限');
assert.match(permissions, /VITE_PERMISSION_CLIENT_ID/, '权限 clientId 必须可配置');
assert.match(permissions, /['"]zhipin['"]/, '权限 clientId 默认必须为 zhipin');

const app = read('readdy-frontend/src/App.tsx');
assert.match(app, /CompanyAuthProvider/, '5190 必须挂载公司会话 Provider');
assert.match(app, /CompanyPermissionsProvider/, '5190 必须挂载公司权限 Provider');

const routes = read('readdy-frontend/src/router/config.tsx');
assert.match(routes, /RequireCompanyAuth/, '业务路由必须有登录守卫');
assert.match(routes, /RequireCompanyRole/, '角色页面必须有真实角色守卫');

const layout = read('readdy-frontend/src/components/feature/MainLayout.tsx');
assert.match(layout, /useCompanyAuth/, '主壳必须读取公司真实会话');
assert.match(layout, /logout/, '主壳必须提供真实退出登录');
assert.doesNotMatch(layout, /切换角色/, '正式入口禁止 Readdy 假角色切换');
assert.doesNotMatch(layout, /zhipin-current-role/, '正式角色禁止从 localStorage 演示开关读取');

const vite = read('readdy-frontend/vite.config.ts');
assert.match(vite, /COMPANY_GATEWAY_PROXY_TARGET/, '5190 必须显式代理公司网关');
assert.match(vite, /['"]\/pgs['"]/, '5190 必须代理 OAuth 路径');
assert.match(vite, /['"]\/zhipin-server['"]/, '5190 必须代理公司业务 API 路径');

const start = read('scripts/start-isolated-demo.sh');
assert.match(start, /VITE_OAUTH_BASE_URL=\/pgs\/oauth/, '5190 启动必须使用公司 OAuth 路径');
assert.match(start, /VITE_API_BASE_URL=\/zhipin-server\/api/, '5190 启动必须使用公司业务 API 路径');
assert.doesNotMatch(start, /APOLLO_ENABLED=false/, '启动脚本不能强行关闭公司 Apollo');
assert.doesNotMatch(start, /JWT_SECRET=isolated-demo/, '启动脚本不能覆盖已有 JWT 密钥');
assert.doesNotMatch(start, /LLM_API_KEY="?\s*"?/, '启动脚本不能清空已有模型密钥');

const apollo = read('backend/apollo_config.py');
assert.match(apollo, /APOLLO_SECRET/, 'Apollo Secret 注入口必须保留');
assert.match(apollo, /appId.*zhipin|APP_ID\s*=\s*["']zhipin["']/s, 'Apollo appId 必须固定为 zhipin');

const thirdParty = read('backend/app/services/third_party_service.py');
assert.match(thirdParty, /MCP_SSO_TOKEN/, 'MCP SSO Token 注入口必须保留');
assert.match(thirdParty, /mcp\.sso\.token/, 'Apollo mcp.sso.token 注入口必须保留');
assert.match(thirdParty, /yhToken.*goToken.*omgToken/s, '公司三方 Token 交换字段必须保留');

console.log('readdy_company_security_contract: OK');
