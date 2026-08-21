import { md5 } from './md5';
import {
  resolveGatewayRole,
  VALID_COMPANY_ROLES,
  type CompanyRole,
} from './gatewayRoles';
import {
  collectCompanyPermissionCodes,
  resolveAlignedCompanyRole,
  resolveWorkspaceRole,
  type CompanyMenuNode,
} from './companyPermissionModel';

export interface CompanyLoginResult {
  token: string;
  user_id: number | null;
  role: CompanyRole;
  name: string;
}

export interface CompanySession extends CompanyLoginResult {
  empCode: string;
}

interface GatewayEnvelope<T> {
  code?: number;
  msg?: string;
  data?: T;
  succ?: boolean;
}

interface GatewayUserInfo {
  empName?: string | null;
  nickname?: string | null;
  ymEmpCode?: string | null;
  yhUserCode?: string | null;
  role?: CompanyRole | null;
}

interface CompanyAuthGatewayConfig {
  oauthBase: string;
  apiBase: string;
  permissionClientId: string;
  gatewayRoleMap: string;
  fallbackRole: unknown;
  fetcher?: typeof fetch;
}

/**
 * SIT 验收账号显示名。
 * PGS 同步用户姓名为只读（接口拒绝更新），前端按工号展示与菜单业务对应的名称，
 * 角色、菜单和数据范围仍由 PGS 菜单与后端工号映射决定，这里只影响登录后的显示名。
 */
const GATEWAY_DISPLAY_NAME_BY_EMP_CODE: Record<string, string> = {
  '100000': '贵磊',
  '100001': '洪通',
  '100002': '李亚辉',
  '100003': '王杰',
};

export class CompanyAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CompanyAuthError';
    this.status = status;
  }
}

function normalizeBase(value: string, fallback: string) {
  return value.trim().replace(/\/+$/, '') || fallback;
}

export function createCompanyAuthGateway(config: CompanyAuthGatewayConfig) {
  const oauthBase = normalizeBase(config.oauthBase, '/pgs/oauth');
  const apiBase = normalizeBase(config.apiBase, '/api');
  const permissionClientId = config.permissionClientId.trim() || 'zhipin';
  const fetcher = config.fetcher ?? fetch;

  const readJson = async <T,>(response: Response): Promise<T> => (
    await response.json().catch(() => ({}))
  ) as T;

  const ensureGatewaySuccess = <T,>(
    body: GatewayEnvelope<T>,
    status: number,
    fallback: string,
  ): T => {
    if (body?.succ === true || body?.code === 1) {
      return body.data ?? ({} as T);
    }
    throw new CompanyAuthError(status, body?.msg || fallback);
  };

  const gatewayLogin = async (account: string, password: string): Promise<string> => {
    let response: Response;
    try {
      response = await fetcher(`${oauthBase}/login`, {
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
  };

  const gatewayProfile = async (token: string) => {
    let response: Response;
    try {
      response = await fetcher(`${oauthBase}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      throw new CompanyAuthError(0, `网络错误：${(error as Error).message}`);
    }

    const body = await readJson<GatewayEnvelope<{ userInfo?: GatewayUserInfo }>>(response);
    const data = ensureGatewaySuccess(body, response.status, '获取公司用户信息失败');
    const info = data.userInfo ?? {};
    const empCode = info.ymEmpCode || info.yhUserCode || '';
    const rawName = info.empName || info.nickname || info.yhUserCode || info.ymEmpCode || '用户';
    const name = GATEWAY_DISPLAY_NAME_BY_EMP_CODE[empCode] ?? rawName;
    if (!empCode) {
      throw new CompanyAuthError(502, '公司账号缺少工号，请联系系统管理员');
    }
    return { name, empCode, profileRole: info.role };
  };

  const gatewayMenuRole = async (token: string): Promise<CompanyRole | null> => {
    let response: Response;
    try {
      response = await fetcher(
        `${oauthBase}/api/queryCurrentUserMenu?clientId=${encodeURIComponent(permissionClientId)}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      throw new CompanyAuthError(0, `公司权限加载失败：${(error as Error).message}`);
    }

    const body = await readJson<GatewayEnvelope<CompanyMenuNode[]>>(response);
    const menuTree = ensureGatewaySuccess(
      body,
      response.status,
      '公司权限加载失败，请稍后重试',
    );
    return resolveWorkspaceRole(collectCompanyPermissionCodes(menuTree).menuCodes);
  };

  const backendProfile = async (token: string, empCode: string) => {
    let response: Response;
    try {
      response = await fetcher(`${apiBase}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Emp-Code': empCode,
        },
      });
    } catch (error) {
      throw new CompanyAuthError(0, `业务权限校验失败：${(error as Error).message}`);
    }

    const body = await readJson<{ id?: unknown; role?: unknown; error?: string }>(response);
    if (!response.ok) {
      throw new CompanyAuthError(
        response.status,
        body.error || `业务权限校验失败（HTTP ${response.status}）`,
      );
    }
    const id = Number(body.id);
    const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : '';
    if (!Number.isSafeInteger(id) || id <= 0 || !VALID_COMPANY_ROLES.includes(role as CompanyRole)) {
      throw new CompanyAuthError(502, '后端返回的账号角色无效，请联系系统管理员');
    }
    return { id, role: role as CompanyRole };
  };

  const resolveSession = async (
    token: string,
    empCode: string,
    fallbackRole: CompanyRole,
  ) => {
    const [workspaceRole, backendUser] = await Promise.all([
      gatewayMenuRole(token),
      backendProfile(token, empCode),
    ]);
    return {
      role: resolveAlignedCompanyRole(workspaceRole, fallbackRole, backendUser.role),
      userId: backendUser.id,
    };
  };

  return {
    async login(account: string, password: string): Promise<CompanySession> {
      const token = await gatewayLogin(account, password);
      const { name, empCode, profileRole } = await gatewayProfile(token);
      const fallbackRole = resolveGatewayRole(
        empCode,
        profileRole,
        config.gatewayRoleMap,
        config.fallbackRole,
      );
      const resolved = await resolveSession(token, empCode, fallbackRole);
      return {
        token,
        empCode,
        user_id: resolved.userId,
        role: resolved.role,
        name,
      };
    },

    async revalidate(session: CompanySession): Promise<CompanySession> {
      const resolved = await resolveSession(session.token, session.empCode, session.role);
      return {
        ...session,
        name: GATEWAY_DISPLAY_NAME_BY_EMP_CODE[session.empCode] ?? session.name,
        user_id: resolved.userId,
        role: resolved.role,
      };
    },
  };
}
