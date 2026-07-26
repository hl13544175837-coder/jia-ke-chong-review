import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(appRoot, path), 'utf8');

const viteConfig = read('frontend/vite.isolated.config.ts');
assert.match(viteConfig, /loadEnv/);
assert.match(viteConfig, /LOCAL_BACKEND_PROXY_TARGET/);
assert.match(viteConfig, /LOCAL_OAUTH_PROXY_TARGET/);
assert.match(viteConfig, /VITE_ALLOW_LAN/);

const commonScript = read('scripts/isolated-demo-common.sh');
assert.match(commonScript, /BACKEND_PORT=5010/);
assert.match(commonScript, /OAUTH_PORT=5110/);
assert.match(commonScript, /FRONTEND_PORT=5190/);
assert.doesNotMatch(commonScript, /OPERATIONS_PORT|OPERATIONS_FRONTEND_PID_FILE/, '本地只保留 5190 主产品');
assert.match(commonScript, /RUNTIME_ROOT=.*ISOLATION_ROOT.*runtime/);
assert.match(commonScript, /zhipin-demo\.db/);

const startScript = read('scripts/start-isolated-demo.sh');
assert.match(startScript, /seed_dev\.py/);
assert.match(startScript, /COMPANY_API_PROXY_TARGET/);
assert.match(startScript, /COMPANY_GATEWAY_PROXY_TARGET/);
assert.match(startScript, /VITE_API_BASE_URL=\/api/);
assert.match(startScript, /VITE_OAUTH_BASE_URL=\/pgs\/oauth/);
assert.match(startScript, /cd "\$APP_ROOT\/readdy-frontend"/);
assert.doesNotMatch(startScript, /OPERATIONS_PORT|cd "\$APP_ROOT\/frontend"/, '启动脚本不得再打开旧前端');
assert.match(startScript, /READDY_VITE_BIN/);
assert.doesNotMatch(startScript, /rm\s+-rf/);

const stopScript = read('scripts/stop-isolated-demo.sh');
assert.match(stopScript, /stop_service/);
assert.doesNotMatch(stopScript, /pkill/);
assert.doesNotMatch(stopScript, /rm\s+-rf/);

const serveScript = read('scripts/serve-isolated-demo.sh');
assert.match(serveScript, /start-isolated-demo\.sh/);
assert.match(serveScript, /stop-isolated-demo\.sh/);
assert.match(
  serveScript,
  /READDY_AUTH_MODE="\$\{READDY_AUTH_MODE:-local\}"/,
  '长期本地运行必须默认使用隔离登录桥，公司模式仍可显式覆盖',
);
assert.doesNotMatch(serveScript, /pkill|rm\s+-rf/);

const checkScript = read('scripts/check-isolated-demo.sh');
assert.match(checkScript, /api\/health/);
assert.match(checkScript, /5190/);
assert.doesNotMatch(checkScript, /5192/, '健康检查只验收 5190 主产品');
assert.doesNotMatch(checkScript, /\$(?:label|url)[：）]/);

for (const script of [commonScript, startScript, stopScript, serveScript, checkScript]) {
  assert.doesNotMatch(script, /\$[A-Za-z_][A-Za-z0-9_]*[：，（）。]/);
}

console.log('isolated runtime contract passed');
