// 网关 OAuth 登录（替代原后端 /api/auth/login）。
//
// 流程：账号 + 密码(前端 MD5) → POST /pgs/oauth/login 拿不透明 token →
//       GET /pgs/oauth/api/profile 拿工号 → GET /api/auth/me 拿真实用户与角色。
//
// 说明：
// - 网关 token 不是 JWT，前端不解码；过期由后端 401 触发登出（见 api.ts / auth.tsx）。
// - profile 不返回应用角色，必须由后端 /auth/me 按工号返回真实角色。
// - 登录后业务接口带同一个 Bearer token，网关鉴权后透传身份给后端。

import { ApiError, setEmpCode } from './api';
import { API_BASE } from './apiBase';
import { md5 } from './md5';
import type { LoginResponse, MeResponse, Role } from '../types';

// 网关 OAuth 前缀。本地默认 '/pgs/oauth'（Vite 代理，见 vite.config.ts）；
// 部署时由 frontend/Dockerfile 的 VITE_OAUTH_BASE_URL 注入网关绝对地址。
const OAUTH_BASE = ((import.meta.env.VITE_OAUTH_BASE_URL ?? '/pgs/oauth') as string)
  .trim()
  .replace(/\/+$/, '') || '/pgs/oauth';

const VALID_ROLES: Role[] = ['admin', 'manager', 'recruiter', 'interviewer'];

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

async function backendIdentity(token: string, empCode: string): Promise<MeResponse> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(empCode ? { 'X-Emp-Code': empCode } : {}),
      },
    });
  } catch (err) {
    throw new ApiError(0, `网络错误：${(err as Error).message}`);
  }

  const body = (await resp.json().catch(() => ({}))) as Partial<MeResponse> & {
    error?: string;
  };
  if (!resp.ok) {
    throw new ApiError(resp.status, body.error || '获取智聘账号权限失败');
  }
  if (
    typeof body.id !== 'number'
    || !body.name
    || !body.role
    || !VALID_ROLES.includes(body.role)
  ) {
    throw new ApiError(502, '智聘账号信息不完整，请联系管理员');
  }
  return body as MeResponse;
}

// 对外：走网关完成登录，返回与原 LoginResponse 相同的会话结构。
// 同时把网关工号存起来（随每个业务请求发给后端做当前用户身份）。
export async function loginViaGateway(account: string, password: string): Promise<LoginResponse> {
  const token = await gatewayLogin(account, password);
  const { empCode } = await gatewayProfile(token);
  const identity = await backendIdentity(token, empCode);
  if (empCode) setEmpCode(empCode);
  return {
    token,
    user_id: identity.id,
    role: identity.role,
    name: identity.name,
  };
}
