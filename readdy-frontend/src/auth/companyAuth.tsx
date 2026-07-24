import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { md5 } from './md5';

export type CompanyRole = 'admin' | 'manager' | 'recruiter' | 'interviewer';

export interface CompanyLoginResult {
  token: string;
  user_id: number | null;
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
  role?: CompanyRole | null;
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
const ENV_ROLE = ((import.meta.env.VITE_DEFAULT_ROLE ?? 'admin') as string).trim();
const DEFAULT_ROLE: CompanyRole = VALID_ROLES.includes(ENV_ROLE as CompanyRole)
  ? (ENV_ROLE as CompanyRole)
  : 'admin';

const OAUTH_BASE = ((import.meta.env.VITE_OAUTH_BASE_URL ?? '/pgs/oauth') as string)
  .trim()
  .replace(/\/+$/, '') || '/pgs/oauth';
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
  const succeeded = body.succ === true || body.code === 1;
  if (!succeeded && !body.msg) {
    throw new CompanyAuthError(
      response.status,
      response.ok
        ? '公司登录网关返回异常，请稍后重试或联系 IT 支持'
        : `公司登录网关连接失败（HTTP ${response.status}），请检查网关地址或公司网络`,
    );
  }
  const data = ensureGatewaySuccess(body, response.status, '公司登录未通过，请联系 IT 支持');
  if (!data.token) {
    throw new CompanyAuthError(401, '登录响应缺少 token，请联系系统管理员');
  }
  return data.token;
}

async function gatewayProfile(token: string): Promise<{
  name: string;
  empCode: string;
  role: CompanyRole;
}> {
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
  const role = info.role && VALID_ROLES.includes(info.role) ? info.role : DEFAULT_ROLE;
  if (!empCode) {
    throw new CompanyAuthError(502, '公司账号缺少工号，请联系系统管理员');
  }
  return { name, empCode, role };
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loginViaCompanyGateway(
  account: string,
  password: string,
): Promise<CompanyLoginResult> {
  const token = await gatewayLogin(account, password);
  const { name, empCode, role } = await gatewayProfile(token);
  const numericUserId = Number(empCode);
  localStorage.setItem(EMP_CODE_KEY, empCode);
  return {
    token,
    user_id: Number.isSafeInteger(numericUserId) && numericUserId > 0 ? numericUserId : null,
    role,
    name,
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
  const storedUserId = localStorage.getItem(USER_ID_KEY);
  const userId = storedUserId ? Number(storedUserId) : null;
  if (
    !token
    || !empCode
    || !name
    || !role
    || !VALID_ROLES.includes(role)
    || (userId !== null && (!Number.isInteger(userId) || userId <= 0))
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

  useEffect(() => {
    const handleUnauthorized = () => setSessionExpired(true);
    window.addEventListener('hireinsight:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('hireinsight:unauthorized', handleUnauthorized);
  }, []);

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
      if (result.user_id) {
        localStorage.setItem(USER_ID_KEY, String(result.user_id));
      } else {
        localStorage.removeItem(USER_ID_KEY);
      }
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
