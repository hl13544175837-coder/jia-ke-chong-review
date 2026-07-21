import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(join(__dirname, '../src/components/AppShell.tsx'), 'utf8');

assert.match(shell, /data-ui="readdy-shell"/, '登录后的应用外壳应使用 Readdy 设计');
assert.match(shell, /智聘/, '侧边栏应显示智聘品牌');
assert.match(shell, /useAuth/, '外壳应读取真实登录用户和角色');
assert.match(shell, /usePermissions/, '外壳应继续使用公司菜单权限');
assert.match(shell, /api\.getNotifications/, '通知下拉应读取真实后端通知');
assert.match(shell, /api\.markNotificationsRead/, '通知已读操作应写入真实后端');
assert.doesNotMatch(shell, /zhipin-current-role|setCurrentRole|ROLE_KEY/, '正式外壳不能保留 Readdy 的角色切换器');
assert.doesNotMatch(shell, /@\/mocks|mocks\/notifications/, '正式外壳不能读取 Readdy mock 通知');

console.log('readdy_shell_contract: OK');
