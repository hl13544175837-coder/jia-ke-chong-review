import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const login = readFileSync(join(__dirname, '../src/pages/LoginPage.tsx'), 'utf8');

assert.match(login, /TalentFlow/, '登录页应使用 Readdy 最终视觉中的 TalentFlow 品牌');
assert.match(login, /可视化工作台/, '登录页应保留 Readdy 的产品价值说明');
assert.match(login, /智能简历解析/, '登录页应保留 Readdy 的简历能力说明');
assert.match(login, /多角色协作/, '登录页应保留 Readdy 的协作能力说明');
assert.match(login, /loginViaGateway/, 'Readdy 登录页必须继续调用公司网关登录');
assert.doesNotMatch(login, /setTimeout\s*\(/, '正式登录页不能使用 Readdy 的定时器假登录');
assert.doesNotMatch(login, /Supabase/, '正式登录页不能声称使用未接入的 Supabase 登录');

console.log('readdy_login_surface: OK');
