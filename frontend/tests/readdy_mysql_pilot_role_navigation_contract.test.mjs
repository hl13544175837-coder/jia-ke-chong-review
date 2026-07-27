import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const layout = read('readdy-frontend/src/components/feature/MainLayout.tsx');
const routes = read('readdy-frontend/src/router/config.tsx');
const productRole = read('readdy-frontend/src/auth/productRole.tsx');
const app = read('readdy-frontend/src/App.tsx');

function arrayBlock(source, name) {
  const match = source.match(new RegExp(`const ${name}[^=]*= \\[(.*?)\\n\\];`, 's'));
  assert.ok(match, `找不到 ${name} 导航配置`);
  return match[1];
}

function pathsIn(block) {
  return [...block.matchAll(/path:\s*'([^']+)'/g)].map((match) => match[1]);
}

const interviewerNavigation = arrayBlock(layout, 'interviewerNavItems');
assert.deepEqual(
  pathsIn(interviewerNavigation),
  [
    '/interviewer/dashboard',
    '/interviewer/jobs',
    '/interviewer/screening',
    '/interviewer/interviews',
  ],
  '业务角色左侧必须只显示工作台、招聘需求、待业务筛选、我的面试',
);

const hrNavigation = arrayBlock(layout, 'hrNavItems');
assert.deepEqual(
  pathsIn(hrNavigation),
  ['/dashboard', '/jobs', '/candidates', '/interviews', '/offers', '/talent-map'],
  '人才地图必须放在招聘专员侧栏最底部，即 Offer 后面',
);
for (const [routePath, label] of [
  ['/jobs', '需求审核'],
  ['/candidates', '候选人'],
  ['/talent-map', '人才地图'],
  ['/interviews', '面试管理'],
  ['/offers', 'Offer'],
]) {
  assert.match(hrNavigation, new RegExp(`path: '${routePath.replace('/', '\\/')}'.*label: '${label}'`), `HR 导航缺少${label}`);
}
assert.doesNotMatch(hrNavigation, /path: '\/kanban'.*label: '进度'/, 'HR 导航不应重复显示招聘进度');

assert.match(routes, /const hrRoles: ProductRole\[\] = \['recruiter', 'manager', 'admin'\]/, 'HR、主管和管理员必须共享试点管理路由');
for (const routePath of ['/jobs', '/candidates', '/talent-map', '/kanban', '/interviews', '/offers']) {
  assert.match(
    routes,
    new RegExp(`path: '${routePath.replace('/', '\\/')}'[\\s\\S]{0,160}allow=\\{hrRoles\\}`),
    `${routePath} 必须允许 HR、主管和管理员访问`,
  );
}

for (const routePath of [
  '/interviewer/dashboard',
  '/interviewer/jobs',
  '/interviewer/screening',
  '/interviewer/interviews',
]) {
  assert.match(
    routes,
    new RegExp(`path: '${routePath.replaceAll('/', '\\/')}'[\\s\\S]{0,180}allow=\\{interviewerRoles\\}`),
    `${routePath} 必须允许业务角色访问`,
  );
}
assert.doesNotMatch(routes, /path: '\/interviewer\/candidates'/, '业务角色不应再有冗余候选人进展路由');

assert.match(productRole, /export function RequireCompanyRole/, '角色守卫必须统一处理越权跳转');
assert.match(productRole, /<Navigate to=\{homePathForRole\(role\)\} replace/, '越权访问必须跳到当前角色默认页');
assert.match(productRole, /export function RoleHomeRedirect/, '隐藏模块必须复用角色首页跳转');
assert.match(routes, /import \{ RequireCompanyRole, RoleHomeRedirect \} from '@\/auth\/productRole'/, '路由必须使用会跳回角色首页的守卫');
assert.doesNotMatch(routes, /RequireCompanyRole[\s\S]*from '@\/auth\/companyGuards'/, '路由不能继续使用停留在无权页面的旧守卫');

assert.doesNotMatch(layout, /AI 助手|BOSS 自动化|KPI 标准/, '试点导航必须隐藏 AI、BOSS 自动化和 KPI 标准');
assert.doesNotMatch(routes, /AIAssistantPage|KpiStandardsPage/, '隐藏模块不能继续渲染旧页面');
for (const hiddenPath of ['/ai-assistant', '/kpi-standards']) {
  assert.match(
    routes,
    new RegExp(`path: '${hiddenPath}'[\\s\\S]{0,120}<RoleHomeRedirect \\/>`),
    `${hiddenPath} 直达时必须回到当前角色默认页`,
  );
}

assert.match(app, /<ProductRoleProvider>/, '应用必须挂载产品角色 Provider');
assert.match(app, /<CompanySecurityBoundary>/, '角色导航必须保留公司权限上下文');

assert.match(routes, /import \{ Navigate \} from 'react-router-dom'/, '旧工作台入口必须使用显式重定向');
assert.match(
  routes,
  /path: '\/dashboard\/interviews'[\s\S]{0,180}<Navigate to="\/interviews" replace \/>/,
  '旧面试入口必须重定向到真实面试工作台',
);
assert.match(
  routes,
  /path: '\/dashboard\/offers'[\s\S]{0,180}<Navigate to="\/offers" replace \/>/,
  '旧 Offer 入口必须重定向到真实 Offer 工作台',
);
assert.doesNotMatch(routes, /DashboardInterviewsPage|DashboardOffersPage/, '旧演示工作台不能继续挂载');
assert.doesNotMatch(layout, /setPreviewRole|previewEnabled|切换预览角色|本地预览/, '主界面不能提供与真实权限不一致的假角色切换');
assert.doesNotMatch(productRole, /PREVIEW_ROLE_KEY|VITE_ENABLE_ROLE_PREVIEW|setPreviewRole/, '角色上下文必须只使用真实登录账号');

console.log('readdy_mysql_pilot_role_navigation_contract: OK');
