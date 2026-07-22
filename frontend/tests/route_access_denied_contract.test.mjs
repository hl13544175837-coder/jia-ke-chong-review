import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const readSource = (path) => readFileSync(join(srcRoot, path), 'utf8');

const accessDeniedPath = join(srcRoot, 'pages/AccessDeniedPage.tsx');
assert.ok(
  existsSync(accessDeniedPath),
  '已登录用户直达无权限路由时，必须有专门的拒绝访问页，而不是静默跳转',
);

const app = readSource('App.tsx');
const page = readSource('pages/AccessDeniedPage.tsx');

assert.match(app, /import \{ AccessDeniedPage \} from '\.\/pages\/AccessDeniedPage';/);
assert.match(
  app,
  /function RequireRole[\s\S]*?const location = useLocation\(\)[\s\S]*?return <AccessDeniedPage currentRole=\{role\} allowedRoles=\{allow\} requestedPath=\{location\.pathname\} \/>;/,
  '角色不匹配时必须原地渲染拒绝页，并传入原请求路径',
);
assert.doesNotMatch(
  app,
  /function RequireRole[\s\S]*?return <Navigate to=\{defaultRouteForRole\(\)\}/,
  '角色不匹配不得静默跳回工作台',
);
assert.match(page, /无权访问/);
assert.match(page, /当前角色/);
assert.match(page, /允许角色/);
assert.match(page, /返回工作台/);
assert.match(page, /useNavigate/);
assert.match(page, /onClick=\{\(\) => navigate\(defaultRouteForRole\(\)\)\}/);
assert.doesNotMatch(
  page,
  /<Link[\s\S]*?<Button/,
  '返回工作台不能把 button 嵌套在 link 中，避免无效的交互元素结构',
);

console.log('route_access_denied_contract: OK');
