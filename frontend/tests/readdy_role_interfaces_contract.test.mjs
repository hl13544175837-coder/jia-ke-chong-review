import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const roleModelPath = path.join(root, 'readdy-frontend/src/auth/productRole.tsx');

assert.ok(fs.existsSync(roleModelPath), '必须建立独立的五角色产品视角模型');

const roleModel = read('readdy-frontend/src/auth/productRole.tsx');
assert.match(roleModel, /VITE_ENABLE_ROLE_PREVIEW/, '本地角色预览必须由显式环境开关控制');
assert.match(roleModel, /import\.meta\.env\.DEV/, '角色预览必须限制在本地开发环境');
assert.match(roleModel, /assignedRole/, '必须区分公司实际角色和本地预览角色');
assert.match(roleModel, /setPreviewRole/, '本地验收必须可以切换产品角色视角');

const roleDefinitions = read('readdy-frontend/src/auth/productRoleModel.ts');
assert.match(roleDefinitions, /hr_director/, '必须恢复人力资源总监角色');

const app = read('readdy-frontend/src/App.tsx');
assert.match(app, /ProductRoleProvider/, '应用必须挂载产品角色 Provider');

const layout = read('readdy-frontend/src/components/feature/MainLayout.tsx');
assert.match(layout, /切换预览角色/, '本地验收账号菜单必须提供明确的角色预览入口');
assert.match(layout, /previewEnabled\s*&&/, '角色预览入口必须受本地开关保护');
assert.match(layout, /hr_director/, '主界面必须恢复人力资源总监菜单');
assert.match(layout, /roles:\s*\['admin'\]/, '系统管理员菜单必须保持独立');
assert.match(layout, /roles:\s*\['hr_director'\]/, '总监菜单必须只属于人力资源总监');
assert.match(layout, /roles:\s*\['interviewer'\]/, '面试官菜单必须保持独立');

const routes = read('readdy-frontend/src/router/config.tsx');
assert.match(routes, /directorRoles[^;]*\['hr_director'\]/, '总监路由必须只授权人力资源总监');
assert.doesNotMatch(
  routes,
  /const directorRoles[^;]*['"]admin['"]/,
  '系统管理员不能混入总监路由',
);
assert.match(
  routes,
  /path: '\/kanban',[\s\S]*?allow=\{hrRoles\}/,
  '进度看板必须授权招聘专员、主管和管理员',
);

const start = read('scripts/start-isolated-demo.sh');
assert.match(
  start,
  /VITE_ENABLE_ROLE_PREVIEW=true/,
  '隔离项目本地模式必须显式开启角色预览',
);

console.log('readdy_role_interfaces_contract: OK');
