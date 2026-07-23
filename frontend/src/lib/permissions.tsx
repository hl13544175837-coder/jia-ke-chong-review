// 网关菜单/按钮权限接入。
//
// 网关模式登录后拉取菜单树并拍平成 menuCodes/buttonCodes；
// 本地模式只依赖后端 RBAC，避免把本地 JWT 发送给企业网关。
// 组件用 hasMenu(code)/hasButton(code) 或 <Can code> 控制显示隐藏。
//
// 安全默认（fail-open）：在权限「就绪」之前（尚未加载 / 加载失败），hasMenu/hasButton
// 一律返回 true，避免联调期或网关抖动把菜单和按钮误隐藏。一旦成功加载，才按 code 生效。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authHeaders } from './api';
import { LOGIN_PROVIDER } from './authMode';

// 权限接口在网关 OAuth 前缀下（与登录/profile 同源），clientId 标识当前应用。
const OAUTH_BASE = ((import.meta.env.VITE_OAUTH_BASE_URL ?? '/pgs/oauth') as string)
  .trim()
  .replace(/\/+$/, '') || '/pgs/oauth';
const CLIENT_ID = ((import.meta.env.VITE_PERMISSION_CLIENT_ID ?? 'zhipin') as string).trim() || 'zhipin';

export interface MenuNode {
  id?: string;
  code: string;
  name: string;
  url?: string;
  icon?: string;
  mtype?: number;
  menuOrder?: number;
  hideMenu?: boolean;
  children?: MenuNode[] | null;
  resourceInfo?: MenuNode[] | null;
}

function collectCodes(
  nodes: MenuNode[] | null | undefined,
  menuCodes: Set<string>,
  buttonCodes: Set<string>,
): void {
  for (const node of nodes ?? []) {
    if (node?.code) menuCodes.add(node.code);
    for (const res of node?.resourceInfo ?? []) {
      if (res?.code) buttonCodes.add(res.code);
    }
    collectCodes(node?.children, menuCodes, buttonCodes);
  }
}

async function fetchCurrentUserMenu(): Promise<{
  menuCodes: Set<string>;
  buttonCodes: Set<string>;
  tree: MenuNode[];
}> {
  const url = `${OAUTH_BASE}/api/queryCurrentUserMenu?clientId=${encodeURIComponent(CLIENT_ID)}`;
  const resp = await fetch(url, { headers: authHeaders(), method: 'POST' });
  const body = (await resp.json().catch(() => ({}))) as {
    code?: number;
    succ?: boolean;
    data?: MenuNode[];
  };
  const tree = body?.succ === true || body?.code === 1 ? body.data ?? [] : [];
  const menuCodes = new Set<string>();
  const buttonCodes = new Set<string>();
  collectCodes(tree, menuCodes, buttonCodes);
  return { menuCodes, buttonCodes, tree };
}

interface PermissionsValue {
  ready: boolean; // 是否已成功加载过权限
  settled: boolean; // 首次权限请求是否已结束（成功或失败）
  loading: boolean;
  menuCodes: Set<string>;
  buttonCodes: Set<string>;
  tree: MenuNode[];
  hasMenu: (code?: string | null) => boolean;
  hasButton: (code?: string | null) => boolean;
  reload: () => void;
}

const EMPTY = {
  ready: false,
  settled: false,
  loading: false,
  menuCodes: new Set<string>(),
  buttonCodes: new Set<string>(),
  tree: [] as MenuNode[],
};

const PermissionsContext = createContext<PermissionsValue | undefined>(undefined);

export function PermissionsProvider({
  authed,
  children,
}: {
  authed: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async () => {
    if (LOGIN_PROVIDER === 'local') {
      // 本地角色由后端 RBAC 决定，不能把本地 JWT 发送给企业网关或等待不存在的菜单树。
      setState({ ...EMPTY, settled: true });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    try {
      const { menuCodes, buttonCodes, tree } = await fetchCurrentUserMenu();
      setState({ ready: true, settled: true, loading: false, menuCodes, buttonCodes, tree });
      if (import.meta.env.DEV) {
        // 联调辅助：打印 zhipin 实际返回的菜单/按钮 code，便于对齐前端 gating。

        console.info('[permissions] menuCodes=', [...menuCodes], 'buttonCodes=', [...buttonCodes]);
      }
    } catch {
      // 失败也标记 settled，避免一直卡加载；hasMenu/hasButton 走 fail-open 全显示。
      setState({ ...EMPTY, settled: true });
    }
  }, []);

  useEffect(() => {
    if (authed) {
      load();
    } else {
      setState(EMPTY);
    }
  }, [authed, load]);

  const value = useMemo<PermissionsValue>(() => {
    const hasMenu = (code?: string | null) => !state.ready || !code || state.menuCodes.has(code);
    const hasButton = (code?: string | null) =>
      !state.ready || !code || state.buttonCodes.has(code);
    return { ...state, hasMenu, hasButton, reload: load };
  }, [state, load]);

  // 进入应用（已登录）但首个菜单请求还没结束时，先显示加载、不渲染路由/菜单，
  // 等菜单数据就绪后一次性渲染，避免菜单先全显示再被过滤造成的闪动。
  const gate = authed && !state.settled;

  return (
    <PermissionsContext.Provider value={value}>
      {gate ? (
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          加载中…
        </div>
      ) : (
        children
      )}
    </PermissionsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePermissions(): PermissionsValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return ctx;
}

// 按钮权限公共方法：组件里判断某个按钮 code 是否可见/可用。
//   const canExport = useCan('candidate_EXPORT');
//   {canExport && <Button>导出</Button>}   或  <Button disabled={!canExport}>导出</Button>
// 未配 code 或权限未就绪时返回 true（fail-open）。
// eslint-disable-next-line react-refresh/only-export-components
export function useCan(code?: string | null): boolean {
  return usePermissions().hasButton(code);
}

// 按钮/资源级权限门：有 code 权限才渲染 children（fail-open 见上）。
export function Can({
  code,
  children,
  fallback = null,
}: {
  code?: string | null;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasButton } = usePermissions();
  return <>{hasButton(code) ? children : fallback}</>;
}
