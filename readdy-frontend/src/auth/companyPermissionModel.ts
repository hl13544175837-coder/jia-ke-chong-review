import type { CompanyRole } from './gatewayRoles';

export interface CompanyMenuNode {
  code?: string;
  children?: CompanyMenuNode[] | null;
  resourceInfo?: CompanyMenuNode[] | null;
}

export const WORKSPACE_ROLE_BY_MENU_CODE: Readonly<Record<string, CompanyRole>> = {
  dashboard_admin: 'admin',
  dashboard_manager: 'manager',
  dashboard_recruiter: 'recruiter',
  dashboard_interviewer: 'interviewer',
  dashboard_hr_director: 'hr_director',
};

export class WorkspaceRoleConflictError extends Error {
  roles: CompanyRole[];

  constructor(roles: CompanyRole[]) {
    super(`账号配置了多个工作台角色：${roles.join('、')}`);
    this.name = 'WorkspaceRoleConflictError';
    this.roles = roles;
  }
}

export class CompanyRoleMismatchError extends Error {
  expectedRole: CompanyRole;
  backendRole: CompanyRole;

  constructor(
    expectedRole: CompanyRole,
    backendRole: CompanyRole,
    source: 'PGS 工作台角色' | '前端回退角色',
  ) {
    super(`${source}为 ${expectedRole}，但后端角色为 ${backendRole}，请同步角色配置后重试`);
    this.name = 'CompanyRoleMismatchError';
    this.expectedRole = expectedRole;
    this.backendRole = backendRole;
  }
}

export function collectCompanyPermissionCodes(
  nodes: CompanyMenuNode[] | null | undefined,
): { menuCodes: Set<string>; buttonCodes: Set<string> } {
  const menuCodes = new Set<string>();
  const buttonCodes = new Set<string>();

  const visit = (items: CompanyMenuNode[] | null | undefined) => {
    for (const node of items ?? []) {
      const menuCode = node.code?.trim();
      if (menuCode) menuCodes.add(menuCode);
      for (const resource of node.resourceInfo ?? []) {
        const buttonCode = resource.code?.trim();
        if (buttonCode) buttonCodes.add(buttonCode);
      }
      visit(node.children);
    }
  };

  visit(nodes);
  return { menuCodes, buttonCodes };
}

export function resolveWorkspaceRole(menuCodes: Iterable<string>): CompanyRole | null {
  const roles = [...new Set(
    [...menuCodes]
      .map((code) => WORKSPACE_ROLE_BY_MENU_CODE[code])
      .filter((role): role is CompanyRole => Boolean(role)),
  )];
  if (roles.length > 1) throw new WorkspaceRoleConflictError(roles);
  return roles[0] ?? null;
}

export function resolveAlignedCompanyRole(
  workspaceRole: CompanyRole | null,
  _fallbackRole: CompanyRole,
  backendRole: CompanyRole,
): CompanyRole {
  if (!workspaceRole) return backendRole;
  if (workspaceRole !== backendRole) {
    throw new CompanyRoleMismatchError(
      workspaceRole,
      backendRole,
      'PGS 工作台角色',
    );
  }
  return workspaceRole;
}
