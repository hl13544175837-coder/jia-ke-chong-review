import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(__dirname, '../src/App.tsx'), 'utf8');
const nav = readFileSync(join(__dirname, '../src/lib/nav.ts'), 'utf8');

for (const path of ['/dashboard', '/kanban', '/analytics', '/ai-assistant', '/settings']) {
  assert.ok(app.includes(`path="${path}"`), `正式路由应兼容 Readdy 路径 ${path}`);
}
assert.match(app, /path="\/kanban"[\s\S]*allow=\{\['recruiter', 'manager', 'admin'\]\}/, '进度看板别名必须保留 HR 角色守卫');
assert.match(app, /path="\/analytics"[\s\S]*allow=\{\['manager', 'admin'\]\}/, '分析看板别名必须只允许 manager/admin');
assert.match(app, /path="\/settings"[\s\S]*allow=\{\['admin'\]\}/, '设置别名必须只允许 admin');
assert.match(nav, /return '\/dashboard'/, '真实登录后应落到 Readdy 工作台路径');

console.log('readdy_route_contract: OK');
