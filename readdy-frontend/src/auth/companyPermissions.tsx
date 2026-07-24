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

const OAUTH_BASE = ((import.meta.env.VITE_OAUTH_BASE_URL ?? '/pgs/oauth') as string)
  .trim()
  .replace(/\/+$/, '') || '/pgs/oauth';
const CLIENT_ID = ((import.meta.env.VITE_PERMISSION_CLIENT_ID ?? 'zhipin') as string)
  .trim() || 'zhipin';

interface MenuNode {
  code?: string;
  children?: MenuNode[] | null;
  resourceInfo?: MenuNode[] | null;
}

interface PermissionState {
  ready: boolean;
  settled: boolean;
  loading: boolean;
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
  menuCodes: new Set<string>(),
  buttonCodes: new Set<string>(),
});

function collectCodes(
  nodes: MenuNode[] | null | undefined,
  menuCodes: Set<string>,
  buttonCodes: Set<string>,
): void {
  for (const node of nodes ?? []) {
    if (node.code) menuCodes.add(node.code);
    for (const resource of node.resourceInfo ?? []) {
      if (resource.code) buttonCodes.add(resource.code);
    }
    collectCodes(node.children, menuCodes, buttonCodes);
  }
}

const CompanyPermissionsContext = createContext<CompanyPermissionsValue | undefined>(undefined);

export function CompanyPermissionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, markSessionExpired } = useCompanyAuth();
  const [state, setState] = useState<PermissionState>(() => emptyState());

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setState(emptyState());
      return;
    }
    setState((current) => ({ ...current, loading: true }));
    try {
      const response = await fetch(
        `${OAUTH_BASE}/api/queryCurrentUserMenu?clientId=${encodeURIComponent(CLIENT_ID)}`,
        { method: 'POST', headers: companyAuthHeaders() },
      );
      if (response.status === 401) {
        markSessionExpired();
        setState({ ...emptyState(), settled: true });
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        code?: number;
        succ?: boolean;
        data?: MenuNode[];
      };
      const tree = body.succ === true || body.code === 1 ? body.data ?? [] : [];
      const menuCodes = new Set<string>();
      const buttonCodes = new Set<string>();
      collectCodes(tree, menuCodes, buttonCodes);
      setState({ ready: true, settled: true, loading: false, menuCodes, buttonCodes });
    } catch {
      setState({ ...emptyState(), settled: true });
    }
  }, [isAuthenticated, markSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<CompanyPermissionsValue>(() => ({
    ...state,
    hasMenu: (code) => !state.ready || !code || state.menuCodes.has(code),
    hasButton: (code) => !state.ready || !code || state.buttonCodes.has(code),
    reload: () => void load(),
  }), [load, state]);

  const waitingForFirstLoad = isAuthenticated && !state.settled;

  return (
    <CompanyPermissionsContext.Provider value={value}>
      {waitingForFirstLoad ? (
        <div className="flex min-h-screen items-center justify-center text-sm text-foreground-500">
          正在加载公司权限...
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
