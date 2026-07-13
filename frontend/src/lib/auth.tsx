// Authentication context. Holds the current session (token, role, name),
// persists it to localStorage, and exposes login/logout helpers.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { JwtPayload, LoginResponse, Role } from '../types';
import { clearToken, getToken, setToken, setUnauthorizedHandler } from './api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

const NAME_KEY = 'hireinsight_name';
const ROLE_KEY = 'hireinsight_role';

interface Session {
  token: string;
  role: Role;
  name: string;
  userId: number | null;
}

interface AuthContextValue {
  token: string | null;
  role: Role | null;
  name: string | null;
  userId: number | null;
  isAuthenticated: boolean;
  login: (res: LoginResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Decode a JWT payload without verifying the signature (display/expiry only).
function decodeJwt(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 <= Date.now();
}

function loadSession(): Session | null {
  const token = getToken();
  if (!token || isExpired(token)) {
    // 清除过期/无效 token，避免后续 API 调用带无效 token 触发 401
    clearToken();
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(ROLE_KEY);
    return null;
  }
  const payload = decodeJwt(token);
  const userId = payload && typeof payload.user_id === 'number' ? payload.user_id : null;
  const role = (localStorage.getItem(ROLE_KEY) as Role | null) ?? null;
  const name = localStorage.getItem(NAME_KEY);
  if (!role || !name) {
    // Fall back to JWT payload role if cached values are missing.
    if (!payload) return null;
    return { token, role: payload.role, name: name ?? '', userId };
  }
  return { token, role, name, userId };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  // 401 后是否弹出“重新登录”确认框（确认后才跳转，不直接登出）。
  const [sessionExpired, setSessionExpired] = useState(false);

  // If the stored token is expired/invalid, clear it on mount.
  useEffect(() => {
    if (!session) {
      clearToken();
      localStorage.removeItem(NAME_KEY);
      localStorage.removeItem(ROLE_KEY);
    }
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: session?.token ?? null,
      role: session?.role ?? null,
      name: session?.name ?? null,
      userId: session?.userId ?? null,
      isAuthenticated: !!session,
      login: (res: LoginResponse) => {
        setToken(res.token);
        localStorage.setItem(NAME_KEY, res.name);
        localStorage.setItem(ROLE_KEY, res.role);
        const payload = decodeJwt(res.token);
        const userId =
          payload && typeof payload.user_id === 'number' ? payload.user_id : null;
        setSession({ token: res.token, role: res.role, name: res.name, userId });
      },
      logout: () => {
        clearToken();
        localStorage.removeItem(NAME_KEY);
        localStorage.removeItem(ROLE_KEY);
        setSession(null);
      },
    }),
    [session]
  );

  // 401 处理：不直接登出跳转，先弹确认框；用户确认后再登出并跳转登录页。
  // 用 ref 读当前会话，未登录（如登录页）时的偶发 401 不弹框。
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (sessionRef.current) setSessionExpired(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={sessionExpired}
        title="登录状态已失效"
        description="你的登录已过期或在别处失效，需要重新登录。"
        confirmLabel="重新登录"
        cancelLabel="稍后"
        onConfirm={() => {
          setSessionExpired(false);
          value.logout();
        }}
        onCancel={() => setSessionExpired(false)}
      />
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
