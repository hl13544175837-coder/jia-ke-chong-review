import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.LOCAL_OAUTH_BRIDGE_PORT || 5100);
const backendBase = (process.env.LOCAL_OAUTH_BACKEND_BASE || 'http://localhost:5001/api').replace(/\/+$/, '');
const allowedOrigin = process.env.LOCAL_OAUTH_FRONTEND_ORIGIN || 'http://127.0.0.1:5174';
const demoPassword = 'Zhipin2026';
const demoPasswordMd5 = createHash('md5').update(demoPassword).digest('hex');

const accountEmails = new Map([
  ['admin01', 'admin01@mvp.local'],
  ['manager01', 'manager01@mvp.local'],
  ['lead01', 'lead01@mvp.local'],
  ['hr01', 'hr01@mvp.local'],
  ['hr02', 'hr02@mvp.local'],
  ['hr03', 'hr03@mvp.local'],
  ['interviewer01', 'interviewer01@mvp.local'],
]);

const localMenuTree = [
  { code: 'index', name: '工作台' },
  { code: 'candidates', name: '简历库' },
  { code: 'demands', name: '招聘管理' },
  { code: 'pipeline', name: '候选人流程' },
  { code: 'interviews', name: '面试管理' },
  { code: 'bi', name: '进度看板' },
  { code: 'agent', name: 'AI 助手' },
  { code: 'agentLogs', name: 'AI 调用日志' },
  { code: 'settings', name: '系统设置' },
];

function corsHeaders() {
  return {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, corsHeaders());
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('request_too_large');
  }
  return JSON.parse(raw || '{}');
}

async function login(request, response) {
  const body = await readJson(request);
  const account = String(body.account || '').trim();
  const email = accountEmails.get(account);
  if (!email || body.password !== demoPasswordMd5) {
    sendJson(response, 200, { code: 0, fail: true, msg: '本地试用账号或密码错误' });
    return;
  }

  const backendResponse = await fetch(`${backendBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: demoPassword }),
  });
  const backendBody = await backendResponse.json().catch(() => ({}));
  if (!backendResponse.ok || !backendBody.token) {
    sendJson(response, 200, {
      code: 0,
      fail: true,
      msg: backendBody.error || '本地后端登录失败，请确认已运行 seed_dev.py',
    });
    return;
  }

  sendJson(response, 200, { code: 1, succ: true, data: { token: backendBody.token } });
}

async function profile(request, response) {
  const authorization = request.headers.authorization || '';
  const backendResponse = await fetch(`${backendBase}/auth/me`, {
    headers: { Authorization: authorization },
  });
  const user = await backendResponse.json().catch(() => ({}));
  if (!backendResponse.ok || !user.email) {
    sendJson(response, 200, { code: 0, fail: true, msg: user.error || '本地登录状态无效' });
    return;
  }

  const account = [...accountEmails.entries()].find(([, email]) => email === user.email)?.[0];
  if (!account) {
    sendJson(response, 200, { code: 0, fail: true, msg: '该账号不在本地试用账号清单中' });
    return;
  }

  sendJson(response, 200, {
    code: 1,
    succ: true,
    data: {
      userInfo: {
        empName: user.name,
        ymEmpCode: account,
      },
    },
  });
}

async function menu(request, response, url) {
  if (url.searchParams.get('clientId') !== 'zhipin') {
    sendJson(response, 200, { code: 0, fail: true, msg: '本地权限应用标识无效' });
    return;
  }

  const authorization = request.headers.authorization || '';
  const backendResponse = await fetch(`${backendBase}/auth/me`, {
    headers: { Authorization: authorization },
  });
  const user = await backendResponse.json().catch(() => ({}));
  if (!backendResponse.ok || !user.email) {
    sendJson(response, 200, { code: 0, fail: true, msg: user.error || '本地登录状态无效' });
    return;
  }

  sendJson(response, 200, { code: 1, succ: true, data: localMenuTree });
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'POST' && url.pathname === '/pgs/oauth/login') {
      await login(request, response);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/pgs/oauth/api/profile') {
      await profile(request, response);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/pgs/oauth/api/queryCurrentUserMenu') {
      await menu(request, response, url);
      return;
    }
    sendJson(response, 404, { code: 0, fail: true, msg: 'Not found' });
  } catch (error) {
    const message = error instanceof Error && error.message === 'request_too_large'
      ? '请求过大'
      : '本地登录桥连接后端失败';
    sendJson(response, 502, { code: 0, fail: true, msg: message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local OAuth bridge: http://localhost:${port}/pgs/oauth`);
  console.log(`Allowed frontend origin: ${allowedOrigin}`);
  console.log(`Backend API: ${backendBase}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
