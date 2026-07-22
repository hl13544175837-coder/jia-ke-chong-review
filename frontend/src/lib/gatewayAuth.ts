// 网关 OAuth 登录（替代原后端 /api/auth/login）。
//
// 流程：账号 + 密码(前端 MD5) → POST /pgs/oauth/login 拿不透明 token →
//       GET /pgs/oauth/api/profile 拿姓名 → 组装会话（角色暂用默认值）。
//
// 说明：
// - 网关 token 不是 JWT，前端不解码；过期由后端 401 触发登出（见 api.ts / auth.tsx）。
// - profile 不返回应用角色，暂用 VITE_DEFAULT_ROLE 兜底联调；后续应改由
//   后端 /zhipin-server/api/auth/me 按工号映射真实角色。
// - 登录后业务接口带同一个 Bearer token，网关鉴权后透传身份给后端。

import { ApiError, api, clearEmpCode, setEmpCode } from './api';
import { md5 } from './md5';
import type { LoginResponse, Role } from '../types';

// 网关 OAuth 前缀。本地默认 '/pgs/oauth'（Vite 代理，见 vite.config.ts）；
// 部署时由 frontend/Dockerfile 的 VITE_OAUTH_BASE_URL 注入网关绝对地址。
const OAUTH_BASE = ((import.meta.env.VITE_OAUTH_BASE_URL ?? '/pgs/oauth') as string)
  .trim()
  .replace(/\/+$/, '') || '/pgs/oauth';

const LOGIN_PROVIDER = ((import.meta.env.VITE_LOGIN_PROVIDER ?? 'gateway') as string).trim();

// 临时默认角色（联调用）。profile 无角色，先统一给一个角色驱动菜单；
// 上真实权限前改为后端 /auth/me 返回。可用 VITE_DEFAULT_ROLE 覆盖。
const VALID_ROLES: Role[] = ['admin', 'manager', 'recruiter', 'interviewer'];
const ENV_ROLE = ((import.meta.env.VITE_DEFAULT_ROLE ?? 'admin') as string).trim();
const DEFAULT_ROLE: Role = (VALID_ROLES as string[]).includes(ENV_ROLE)
  ? (ENV_ROLE as Role)
  : 'admin';

// 网关统一响应包：{ code, msg, data, succ, fail }
interface GatewayEnvelope<T> {
  code?: number;
  msg?: string;
  data?: T;
  succ?: boolean;
  fail?: boolean;
}

function ensureSucc<T>(body: GatewayEnvelope<T>, httpStatus: number, fallback: string): T {
  // 业务失败时 HTTP 可能仍是 200，必须看 succ / code，不能只看 resp.ok。
  if (body?.succ === true || body?.code === 1) {
    return (body.data ?? ({} as T));
  }
  throw new ApiError(httpStatus, body?.msg || fallback, body?.code ? String(body.code) : undefined);
}

async function postJson<T>(url: string, payload: unknown): Promise<GatewayEnvelope<T>> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new ApiError(0, `网络错误：${(err as Error).message}`);
  }
  return (await resp.json().catch(() => ({}))) as GatewayEnvelope<T>;
}

// 登录 → 返回不透明 token
async function gatewayLogin(account: string, password: string): Promise<string> {
  const body = await postJson<{ token?: string }>(`${OAUTH_BASE}/login`, {
    account,
    password: md5(password),
  });
  const data = ensureSucc(body, 401, '账号或密码错误');
  const token = data?.token;
  if (!token) {
    throw new ApiError(401, '登录响应缺少 token（请核对网关返回结构）');
  }
  return token;
}

interface GatewayUserInfo {
  empName?: string | null;
  nickname?: string | null;
  ymEmpCode?: string | null;
  yhUserCode?: string | null;
}

// 用 token 拉取用户信息（姓名 + 网关工号）
async function gatewayProfile(token: string): Promise<{ name: string; empCode: string }> {
  let resp: Response;
  try {
    resp = await fetch(`${OAUTH_BASE}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new ApiError(0, `网络错误：${(err as Error).message}`);
  }
  const body = (await resp.json().catch(() => ({}))) as GatewayEnvelope<{
    userInfo?: GatewayUserInfo;
  }>;
  const data = ensureSucc(body, resp.status, '获取用户信息失败');
  const info = data?.userInfo ?? {};
  const name = info.empName || info.nickname || info.yhUserCode || info.ymEmpCode || '用户';
  const empCode = info.ymEmpCode || info.yhUserCode || '';
  return { name, empCode };
}

// 对外：走网关完成登录，返回与原 LoginResponse 相同的会话结构。
// 同时把网关工号存起来（随每个业务请求发给后端做当前用户身份）。
export async function loginViaGateway(account: string, password: string): Promise<LoginResponse> {
  const token = await gatewayLogin(account, password);
  const { name, empCode } = await gatewayProfile(token);
  if (empCode) setEmpCode(empCode);
  return { token, role: DEFAULT_ROLE, name };
}

export async function loginWithConfiguredAuth(
  account: string,
  password: string,
): Promise<LoginResponse> {
  if (LOGIN_PROVIDER === 'local') {
    // 本地全容器环境没有企业网关，显式模式避免把演示账号误发到外部 OAuth。
    clearEmpCode();
    return api.login({ email: account, password });
  }
  return loginViaGateway(account, password);
}
