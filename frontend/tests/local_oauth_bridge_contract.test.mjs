import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const bridgeUrl = new URL('../scripts/local-oauth-bridge.mjs', import.meta.url);
assert.equal(existsSync(bridgeUrl), true, '应提供不改公司鉴权代码的本地 OAuth 验收桥');
const bridge = readFileSync(bridgeUrl, 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(packageJson.scripts['dev:oauth-bridge'], 'node scripts/local-oauth-bridge.mjs');
assert.equal(
  packageJson.scripts['dev:local-acceptance'],
  'VITE_API_BASE_URL=/api VITE_OAUTH_BASE_URL=http://127.0.0.1:5100/pgs/oauth vite --host 127.0.0.1 --port 5174',
  '本地验收前端必须显式覆盖 .env.development，业务 API 不得串到远端 SIT',
);
assert.match(bridge, /127\.0\.0\.1/);
assert.match(bridge, /LOCAL_OAUTH_FRONTEND_ORIGIN/);
assert.match(
  bridge,
  /LOCAL_OAUTH_FRONTEND_ORIGIN \|\| 'http:\/\/127\.0\.0\.1:5174'/,
  '本地 OAuth CORS 必须允许实际验收地址 127.0.0.1:5174',
);
assert.match(bridge, /\/auth\/login/);
assert.match(bridge, /\/auth\/me/);
assert.match(bridge, /\/pgs\/oauth\/login/);
assert.match(bridge, /\/pgs\/oauth\/api\/profile/);
assert.match(bridge, /\/pgs\/oauth\/api\/queryCurrentUserMenu/);
for (const code of ['index', 'candidates', 'demands', 'pipeline', 'interviews', 'bi', 'agent', 'agentLogs', 'settings']) {
  assert.match(bridge, new RegExp(`['"]${code}['"]`), `本地权限菜单应包含 ${code}`);
}
assert.doesNotMatch(bridge, /console\.log\([^\n]*(token|password)/i, '不得把本地密码或 token 写入日志');

console.log('local OAuth bridge contract passed');
