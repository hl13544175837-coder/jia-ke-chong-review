import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { md5 } from './md5';

export type CompanyRole = 'admin' | 'manager' | 'recruiter' | 'interviewer';

export interface CompanyLoginResult {
  token: string;
  user_id: number;
  role: CompanyRole;
  name: string;
}

interface GatewayEnvelope<T> {
  code?: number;
  msg?: string;
  data?: T;
  succ?: boolean;
  fail?: boolean;
}

interface GatewayUserInfo {
  empName?: string | null;
  nickname?: string | null;
  ymEmpCode?: string | null;
  yhUserCode?: string | null;
}

interface BackendIdentity {
  id: number;
  name: string;
  role: CompanyRole;
}

interface CompanySession extends CompanyLoginResult {
  empCode: string;
}

interface CompanyAuthValue {
  token: string | null;
  role: CompanyRole | null;
  name: string | null;
  userId: number | null;
  empCode: string | null;
  isAuthenticated: boolean;
  login: (result: CompanyLoginResult) => void;
  logout: () => void;
  markSessionExpired: () => void;
}

export const TOKEN_KEY = 'hireinsight_token';
export const EMP_CODE_KEY = 'hireinsight_emp_code';
const NAME_KEY = 'hireinsight_name';
const ROLE_KEY = 'hireinsight_role';
const USER_ID_KEY = 'hireinsight_user_id';
const VALID_ROLES: CompanyRole[] = ['admin', 'manager', 'recruiter', 'interviewer'];

const OAUTH_BASE = ((import.meta.env.VITE_OAUTH_BASE_URL ?? '/pgs/oauth') as string)
  .trim()
  .replace(/\/+$/, '') || '/pgs/oauth';
const API_BASE = ((import.meta.env.VITE_API_BASE_URL ?? '/zhipin-server/api') as string)
  .trim()
  .replace(/\/+$/, '') || '/zhipin-server/api';

export class CompanyAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CompanyAuthError';
    this.status = status;
  }
}

function ensureGatewaySuccess<T>(
  body: GatewayEnvelope<T>,
  status: number,
  fallback: string,
): T {
  if (body?.succ === true || body?.code === 1) {
    return body.data ?? ({} as T);
  }
  throw new CompanyAuthError(status, body?.msg || fallback);
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

async function gatewayLogin(account: string, password: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${OAUTH_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password: md5(password) }),
    });
  } catch (error) {
    throw new CompanyAuthError(0, `网络错误：${(error as Error).message}`);
  }

  const body = await readJson<GatewayEnvelope<{ token?: string }>>(response);
  const data = ensureGatewaySuccess(body, response.status || 401, '账号或密码错误');
  if (!data.token) {
    throw new CompanyAuthError(401, '登录响应缺少 token，请联系系统管理员');
  }
  return data.token;
}

async function gatewayProfile(token: string): Promise<{ name: string; empCode: string }> {
  let response: Response;
  try {
    response = await fetch(`${OAUTH_BASE}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    throw new CompanyAuthError(0, `网络错误：${(error as Error).message}`);
  }

  const body = await readJson<GatewayEnvelope<{ userInfo?: GatewayUserInfo }>>(response);
  const data = ensureGatewaySuccess(body, response.status, '获取公司用户信息失败');
  const info = data.userInfo ?? {};
  const empCode = info.ymEmpCode || info.yhUserCode || '';
  const name = info.empName || info.nickname || info.yhUserCode || info.ymEmpCode || '用户';
  if (!empCode) {
    throw new CompanyAuthError(502, '公司账号缺少工号，请联系系统管理员');
  }
  return { name, empCode };
}

async function backendIdentity(token: string, empCode: string): Promise<BackendIdentity> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Emp-Code': empCode,
      },
    });
  } catch (error) {
    throw new CompanyAuthError(0, `网络错误：${(error as Error).message}`);
  }

  const body = await readJson<Partial<BackendIdentity> & { error?: string }>(response);
  if (!response.ok) {
    throw new CompanyAuthError(response.status, body.error || '获取智聘账号权限失败');
  }
  if (
    typeof body.id !== 'number'
    || !body.name
    || !body.role
    || !VALID_ROLES.includes(body.role)
  ) {
    throw new CompanyAuthError(502, '智聘账号信息不完整，请联系管理员');
  }
  return body as BackendIdentity;
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loginViaCompanyGateway(
  account: string,
  password: string,
): Promise<CompanyLoginResult> {
  const token = await gatewayLogin(account, password);
  const { empCode } = await gatewayProfile(token);
  const identity = await backendIdentity(token, empCode);
  localStorage.setItem(EMP_CODE_KEY, empCode);
  return {
    token,
    user_id: identity.id,
    role: identity.role,
    name: identity.name,
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function companyAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem(TOKEN_KEY);
  const empCode = localStorage.getItem(EMP_CODE_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (empCode) headers['X-Emp-Code'] = empCode;
  return headers;
}

function clearStoredSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMP_CODE_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

function loadStoredSession(): CompanySession | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const empCode = localStorage.getItem(EMP_CODE_KEY);
  const name = localStorage.getItem(NAME_KEY);
  const role = localStorage.getItem(ROLE_KEY) as CompanyRole | null;
  const userId = Number(localStorage.getItem(USER_ID_KEY));
  if (
    !token
    || !empCode
    || !name
    || !role
    || !VALID_ROLES.includes(role)
    || !Number.isInteger(userId)
    || userId <= 0
  ) {
    clearStoredSession();
    return null;
  }
  return { token, empCode, name, role, user_id: userId };
}

const CompanyAuthContext = createContext<CompanyAuthValue | undefined>(undefined);

export function CompanyAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CompanySession | null>(() => loadStoredSession());
  const [sessionExpired, setSessionExpired] = useState(false);

  const value = useMemo<CompanyAuthValue>(() => ({
    token: session?.token ?? null,
    role: session?.role ?? null,
    name: session?.name ?? null,
    userId: session?.user_id ?? null,
    empCode: session?.empCode ?? null,
    isAuthenticated: Boolean(session),
    login: (result) => {
      const empCode = localStorage.getItem(EMP_CODE_KEY) || '';
      localStorage.setItem(TOKEN_KEY, result.token);
      localStorage.setItem(NAME_KEY, result.name);
      localStorage.setItem(ROLE_KEY, result.role);
      localStorage.setItem(USER_ID_KEY, String(result.user_id));
      setSession({ ...result, empCode });
      setSessionExpired(false);
    },
    logout: () => {
      clearStoredSession();
      setSession(null);
      setSessionExpired(false);
    },
    markSessionExpired: () => setSessionExpired(true),
  }), [session]);

  return (
    <CompanyAuthContext.Provider value={value}>
      {children}
      {sessionExpired && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground-900/40 px-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-session-expired-title"
            className="w-full max-w-sm rounded-lg border border-background-200 bg-white p-5 shadow-xl"
          >
            <h2 id="company-session-expired-title" className="text-base font-semibold text-foreground-900">
              登录状态已失效
            </h2>
            <p className="mt-2 text-sm text-foreground-500">
              公司登录已过期或在别处失效，请重新登录。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSessionExpired(false)}
                className="rounded-lg border border-background-300 px-4 py-2 text-sm text-foreground-600 hover:bg-background-50"
              >
                稍后
              </button>
              <button
                type="button"
                onClick={value.logout}
                className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                重新登录
              </button>
            </div>
          </div>
        </div>
      )}
    </CompanyAuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCompanyAuth(): CompanyAuthValue {
  const value = useContext(CompanyAuthContext);
  if (!value) {
    throw new Error('useCompanyAuth must be used within CompanyAuthProvider');
  }
  return value;
}
