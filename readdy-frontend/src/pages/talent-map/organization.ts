import type { TalentMapOrganization, TalentMapPerson } from '@/features/talentMaps/types';

export interface OrganizationRole {
  title: string;
  people: TalentMapPerson[];
}

export interface OrganizationDepartment {
  name: string;
  roles: OrganizationRole[];
}

export interface OrganizationRoleDraft {
  source_title: string;
  title: string;
}

export interface OrganizationDepartmentDraft {
  source_name: string;
  name: string;
  roles: OrganizationRoleDraft[];
}

export const DEFAULT_DEPARTMENT_NAME = '未分部门';
export const DEFAULT_ROLE_NAME = '待补充岗位';

function departmentName(value?: string) {
  return value?.trim() || DEFAULT_DEPARTMENT_NAME;
}

function roleName(value?: string) {
  return value?.trim() || DEFAULT_ROLE_NAME;
}

export function organizationFromBoard(boardJson: unknown, companyId: number | null): TalentMapOrganization {
  if (!boardJson || typeof boardJson !== 'object' || companyId == null) return { departments: [] };
  const board = boardJson as { organization?: Record<string, TalentMapOrganization> };
  const candidate = board.organization?.[String(companyId)];
  if (!candidate || !Array.isArray(candidate.departments)) return { departments: [] };
  return {
    departments: candidate.departments
      .filter((department) => department && typeof department.name === 'string')
      .map((department) => ({
        name: departmentName(department.name),
        roles: Array.isArray(department.roles)
          ? department.roles.filter((role) => typeof role === 'string').map((role) => roleName(role))
          : [],
      })),
  };
}

/** 将手工配置的空组织结构和实际人才合并，人才永远不会因配置变化而丢失。 */
export function buildOrganization(
  people: TalentMapPerson[],
  saved: TalentMapOrganization = { departments: [] },
): OrganizationDepartment[] {
  const departments = new Map<string, Map<string, TalentMapPerson[]>>();
  for (const department of saved.departments ?? []) {
    const name = departmentName(department.name);
    const roles = departments.get(name) ?? new Map<string, TalentMapPerson[]>();
    for (const role of department.roles ?? []) {
      const title = roleName(role);
      if (!roles.has(title)) roles.set(title, []);
    }
    departments.set(name, roles);
  }
  for (const person of people) {
    const name = departmentName(person.department);
    const title = roleName(person.title);
    const roles = departments.get(name) ?? new Map<string, TalentMapPerson[]>();
    const items = roles.get(title) ?? [];
    items.push(person);
    roles.set(title, items);
    departments.set(name, roles);
  }
  return [...departments.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'zh'))
    .map(([name, roles]) => ({
      name,
      roles: [...roles.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'zh'))
        .map(([title, people]) => ({ title, people })),
    }));
}

export function organizationDraft(tree: OrganizationDepartment[]): OrganizationDepartmentDraft[] {
  return tree.map((department) => ({
    source_name: department.name,
    name: department.name,
    roles: department.roles.map((role) => ({ source_title: role.title, title: role.title })),
  }));
}
