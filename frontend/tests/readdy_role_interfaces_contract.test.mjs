import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const roleModelPath = path.join(root, 'readdy-frontend/src/auth/productRole.tsx');

assert.ok(fs.existsSync(roleModelPath), '必须建立独立的五角色产品视角模型');

const roleModel = read('readdy-frontend/src/auth/productRole.tsx');
assert.match(roleModel, /useCompanyAuth/, '产品角色必须来自真实公司登录账号');
assert.doesNotMatch(roleModel, /VITE_ENABLE_ROLE_PREVIEW|PREVIEW_ROLE_KEY|setPreviewRole|assignedRole/, '不能再用本地预览角色替代真实权限');

const roleDefinitions = read('readdy-frontend/src/auth/productRoleModel.ts');
assert.match(roleDefinitions, /hr_director/, '必须恢复人力资源总监角色');

const app = read('readdy-frontend/src/App.tsx');
assert.match(app, /ProductRoleProvider/, '应用必须挂载产品角色 Provider');

const layout = read('readdy-frontend/src/components/feature/MainLayout.tsx');
assert.doesNotMatch(layout, /切换预览角色|previewEnabled|本地预览/, '账号菜单不能提供会造成 403 的假角色入口');
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
assert.doesNotMatch(
  start,
  /VITE_ENABLE_ROLE_PREVIEW/,
  '本地启动脚本不能重新开启假角色预览',
);

console.log('readdy_role_interfaces_contract: OK');
