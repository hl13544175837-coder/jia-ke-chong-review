import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { VALID_COMPANY_ROLES, type CompanyRole } from './gatewayRoles';
import {
  CompanyAuthError,
  createCompanyAuthGateway,
  type CompanyLoginResult,
  type CompanySession,
} from './companyAuthGateway';

export type { CompanyRole } from './gatewayRoles';
export { CompanyAuthError } from './companyAuthGateway';
export type { CompanyLoginResult } from './companyAuthGateway';

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
const ENV_ROLE = ((import.meta.env.VITE_DEFAULT_ROLE ?? 'recruiter') as string).trim();
const GATEWAY_ROLE_MAP = ((import.meta.env.VITE_GATEWAY_ROLE_MAP ?? '') as string).trim();
const OAUTH_BASE = ((import.meta.env.VITE_OAUTH_BASE_URL ?? '/pgs/oauth') as string)
  .trim()
  .replace(/\/+$/, '') || '/pgs/oauth';
const API_BASE = ((import.meta.env.VITE_API_BASE_URL ?? '/api') as string)
  .trim()
  .replace(/\/+$/, '') || '/api';
const PERMISSION_CLIENT_ID = ((import.meta.env.VITE_PERMISSION_CLIENT_ID ?? 'zhipin') as string)
  .trim() || 'zhipin';
const companyAuthGateway = createCompanyAuthGateway({
  oauthBase: OAUTH_BASE,
  apiBase: API_BASE,
  permissionClientId: PERMISSION_CLIENT_ID,
  gatewayRoleMap: GATEWAY_ROLE_MAP,
  fallbackRole: ENV_ROLE,
});

// eslint-disable-next-line react-refresh/only-export-components
export async function loginViaCompanyGateway(
  account: string,
  password: string,
): Promise<CompanyLoginResult> {
  const { empCode, ...result } = await companyAuthGateway.login(account, password);
  localStorage.setItem(EMP_CODE_KEY, empCode);
  return result;
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
    || !VALID_COMPANY_ROLES.includes(role)
    || (userId !== null && (!Number.isInteger(userId) || userId <= 0))
  ) {
    clearStoredSession();
    return null;
  }
  return { token, empCode, name, role, user_id: userId };
}

const CompanyAuthContext = createContext<CompanyAuthValue | undefined>(undefined);

export function CompanyAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CompanySession | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const storedSession = loadStoredSession();
    if (!storedSession) {
      setRestoringSession(false);
      return undefined;
    }

    let cancelled = false;
    const restore = async () => {
      try {
        const restoredSession = await companyAuthGateway.revalidate(storedSession);
        if (cancelled) return;
        localStorage.setItem(ROLE_KEY, restoredSession.role);
        localStorage.setItem(USER_ID_KEY, String(restoredSession.user_id));
        setSession(restoredSession);
      } catch {
        if (cancelled) return;
        clearStoredSession();
        setSession(null);
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

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
      {restoringSession ? (
        <div className="flex min-h-screen items-center justify-center text-sm text-foreground-500">
          正在确认账号权限...
        </div>
      ) : children}
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
