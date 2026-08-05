import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { companyAuthHeaders, useCompanyAuth } from './companyAuth';
import {
  collectCompanyPermissionCodes,
  type CompanyMenuNode,
} from './companyPermissionModel';

const OAUTH_BASE = ((import.meta.env.VITE_OAUTH_BASE_URL ?? '/pgs/oauth') as string)
  .trim()
  .replace(/\/+$/, '') || '/pgs/oauth';
const CLIENT_ID = ((import.meta.env.VITE_PERMISSION_CLIENT_ID ?? 'zhipin') as string)
  .trim() || 'zhipin';

interface PermissionState {
  ready: boolean;
  settled: boolean;
  loading: boolean;
  error: string | null;
  menuCodes: Set<string>;
  buttonCodes: Set<string>;
}

interface CompanyPermissionsValue extends PermissionState {
  hasMenu: (code?: string | null) => boolean;
  hasButton: (code?: string | null) => boolean;
  reload: () => void;
}

const emptyState = (): PermissionState => ({
  ready: false,
  settled: false,
  loading: false,
  error: null,
  menuCodes: new Set<string>(),
  buttonCodes: new Set<string>(),
});

const CompanyPermissionsContext = createContext<CompanyPermissionsValue | undefined>(undefined);

export function CompanyPermissionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, logout, markSessionExpired } = useCompanyAuth();
  const [state, setState] = useState<PermissionState>(() => emptyState());

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setState(emptyState());
      return;
    }
    setState({ ...emptyState(), loading: true });
    try {
      const response = await fetch(
        `${OAUTH_BASE}/api/queryCurrentUserMenu?clientId=${encodeURIComponent(CLIENT_ID)}`,
        { method: 'POST', headers: companyAuthHeaders() },
      );
      if (response.status === 401) {
        markSessionExpired();
        setState({ ...emptyState(), settled: true, error: '公司登录状态已失效' });
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        code?: number;
        succ?: boolean;
        msg?: string;
        data?: CompanyMenuNode[];
      };
      if (body.succ !== true && body.code !== 1) {
        throw new Error(body.msg || '公司权限接口返回异常');
      }
      const { menuCodes, buttonCodes } = collectCompanyPermissionCodes(body.data ?? []);
      setState({
        ready: true,
        settled: true,
        loading: false,
        error: null,
        menuCodes,
        buttonCodes,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知错误';
      setState({
        ...emptyState(),
        settled: true,
        error: `公司权限加载失败：${detail}`,
      });
    }
  }, [isAuthenticated, markSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<CompanyPermissionsValue>(() => ({
    ...state,
    hasMenu: (code) => !code || (state.ready && state.menuCodes.has(code)),
    hasButton: (code) => !code || (state.ready && state.buttonCodes.has(code)),
    reload: () => void load(),
  }), [load, state]);

  const waitingForFirstLoad = isAuthenticated && !state.settled;
  const permissionLoadFailed = isAuthenticated && state.settled && Boolean(state.error);

  return (
    <CompanyPermissionsContext.Provider value={value}>
      {waitingForFirstLoad ? (
        <div className="flex min-h-screen items-center justify-center text-sm text-foreground-500">
          正在加载公司权限...
        </div>
      ) : permissionLoadFailed ? (
        <div className="flex min-h-screen items-center justify-center bg-background-50 px-6">
          <div className="w-full max-w-md rounded-lg border border-background-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-foreground-900">公司权限加载失败</h1>
            <p className="mt-2 text-sm text-foreground-500">{state.error}</p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                重新加载权限
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-background-300 px-4 py-2 text-sm text-foreground-600 hover:bg-background-50"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      ) : children}
    </CompanyPermissionsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCompanyPermissions(): CompanyPermissionsValue {
  const value = useContext(CompanyPermissionsContext);
  if (!value) {
    throw new Error('useCompanyPermissions must be used within CompanyPermissionsProvider');
  }
  return value;
}
