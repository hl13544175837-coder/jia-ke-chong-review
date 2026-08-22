import type {
  TalentMapOrganization,
  TalentMapOrganizationDepartment,
  TalentMapOrganizationDepartmentDraft,
  TalentMapOrganizationRoleDraft,
  TalentMapPerson,
} from '@/features/talentMaps/types';

export interface OrganizationRole {
  title: string;
  people: TalentMapPerson[];
}

export interface OrganizationDepartment {
  name: string;
  roles: OrganizationRole[];
  /** 子部门（支持多级树，叶子部门承载岗位） */
  children: OrganizationDepartment[];
}

export interface OrganizationRoleDraft {
  source_title: string;
  title: string;
}

export interface OrganizationDepartmentDraft {
  source_name: string;
  name: string;
  roles: OrganizationRoleDraft[];
  children: OrganizationDepartmentDraft[];
}

export const DEFAULT_DEPARTMENT_NAME = '未分部门';
export const DEFAULT_ROLE_NAME = '待补充岗位';

export interface CompanyPeopleSummary {
  total: number;
  confirmed: number;
  contacting: number;
  pending: number;
}

export function summarizeCompanyPeople(
  people: Array<Pick<TalentMapPerson, 'company_id' | 'contact_status'>>,
  companyId: number,
): CompanyPeopleSummary {
  return people.reduce<CompanyPeopleSummary>((summary, person) => {
    if (person.company_id !== companyId) return summary;
    summary.total += 1;
    if (person.contact_status === '已确认') summary.confirmed += 1;
    else if (person.contact_status === '沟通中') summary.contacting += 1;
    else summary.pending += 1;
    return summary;
  }, { total: 0, confirmed: 0, contacting: 0, pending: 0 });
}

function departmentName(value?: string) {
  return value?.trim() || DEFAULT_DEPARTMENT_NAME;
}

function roleName(value?: string) {
  return value?.trim() || DEFAULT_ROLE_NAME;
}

/** board_json 中保存的部门：{ name, roles: string[], children?: [...] } */
type SavedDepartment = TalentMapOrganizationDepartment;

function normalizeSavedDepartment(department: SavedDepartment): SavedDepartment {
  const roles = [...new Set((department.roles ?? []).filter((role) => typeof role === 'string').map(roleName))];
  const children = Array.isArray(department.children)
    ? department.children
        .filter((child) => child && typeof child.name === 'string')
        .map(normalizeSavedDepartment)
    : [];
  return {
    name: departmentName(department.name),
    roles,
    ...(children.length > 0 ? { children } : {}),
  };
}

export function organizationFromBoard(boardJson: unknown, companyId: number | null): TalentMapOrganization {
  if (!boardJson || typeof boardJson !== 'object' || companyId == null) return { departments: [] };
  const board = boardJson as { organization?: Record<string, TalentMapOrganization> };
  const candidate = board.organization?.[String(companyId)];
  if (!candidate || !Array.isArray(candidate.departments)) return { departments: [] };
  return {
    departments: candidate.departments
      .filter((department) => department && typeof department.name === 'string')
      .map(normalizeSavedDepartment),
  };
}

/** 将手工配置的空组织结构和实际人才合并，人才永远不会因配置变化而丢失。 */
export function buildOrganization(
  people: TalentMapPerson[],
  saved: TalentMapOrganization = { departments: [] },
): OrganizationDepartment[] {
  // 1) 用保存的配置搭树骨架：空部门/空岗位也会保留
  const buildNode = (savedDepartment: SavedDepartment): OrganizationDepartment => ({
    name: departmentName(savedDepartment.name),
    roles: [...new Set((savedDepartment.roles ?? []).map(roleName))].map((title) => ({ title, people: [] })),
    children: (savedDepartment.children ?? []).map(buildNode),
  });
  const tree: OrganizationDepartment[] = (saved.departments ?? []).map(buildNode);

  // 2) 人才归位：按部门名在整棵树中找第一个同名部门（先父后子），找不到则挂到顶层新部门
  const findDepartment = (name: string): OrganizationDepartment | null => {
    const stack = [...tree];
    while (stack.length > 0) {
      const node = stack.shift()!;
      if (node.name === name) return node;
      stack.push(...node.children);
    }
    return null;
  };

  for (const person of people) {
    const deptName = departmentName(person.department);
    const roleTitle = roleName(person.title);
    let node = findDepartment(deptName);
    if (!node) {
      node = { name: deptName, roles: [], children: [] };
      tree.push(node);
    }
    let role = node.roles.find((item) => item.title === roleTitle);
    if (!role) {
      role = { title: roleTitle, people: [] };
      node.roles.push(role);
    }
    role.people.push(person);
  }

  // 3) 按中文排序（部门、岗位，子部门递归）
  const sortTree = (nodes: OrganizationDepartment[]) => {
    nodes.sort((left, right) => left.name.localeCompare(right.name, 'zh'));
    for (const node of nodes) {
      node.roles.sort((left, right) => left.title.localeCompare(right.title, 'zh'));
      sortTree(node.children);
    }
  };
  sortTree(tree);

  return tree;
}

export function organizationDraft(tree: OrganizationDepartment[]): OrganizationDepartmentDraft[] {
  return tree.map((department) => ({
    source_name: department.name,
    name: department.name,
    roles: department.roles.map((role) => ({ source_title: role.title, title: role.title })),
    children: organizationDraft(department.children),
  }));
}

/** 扁平化收集整棵部门树（含所有层级），供统计/查找使用。 */
export function allDepartments(departments: OrganizationDepartment[]): OrganizationDepartment[] {
  const collected: OrganizationDepartment[] = [];
  for (const department of departments) {
    collected.push(department);
    collected.push(...allDepartments(department.children));
  }
  return collected;
}

/** 递归统计某个部门的岗位数与人数（含子部门）。 */
export function summarizeDepartment(department: OrganizationDepartment): { roles: number; people: number } {
  let roles = department.roles.length;
  let people = department.roles.reduce((sum, role) => sum + role.people.length, 0);
  for (const child of department.children) {
    const childSummary = summarizeDepartment(child);
    roles += childSummary.roles;
    people += childSummary.people;
  }
  return { roles, people };
}

/* ---------- 部门草稿树（多级）的不可变编辑工具：地图视图 / 组织架构编辑共用 ---------- */

export type DepartmentDraftNode = TalentMapOrganizationDepartmentDraft;
export type RoleDraftNode = TalentMapOrganizationRoleDraft;

export function emptyRoleDraft(): RoleDraftNode {
  return { source_title: '', title: '' };
}

export function emptyDepartmentDraft(): DepartmentDraftNode {
  return { source_name: '', name: '', roles: [] };
}

/** 读取树中指定路径（children 索引链）的草稿部门节点。 */
export function draftNodeAt(list: DepartmentDraftNode[], path: number[]): DepartmentDraftNode | undefined {
  let current = list[path[0]];
  for (let i = 1; i < path.length && current; i += 1) {
    current = (current.children ?? [])[path[i]];
  }
  return current;
}

/** 不可变地更新树中指定路径的部门节点。 */
export function updateDraftAt(
  list: DepartmentDraftNode[],
  path: number[],
  patch: Partial<DepartmentDraftNode>,
): DepartmentDraftNode[] {
  return list.map((item, index) => {
    if (index !== path[0]) return item;
    if (path.length === 1) return { ...item, ...patch };
    return { ...item, children: updateDraftAt(item.children ?? [], path.slice(1), patch) };
  });
}

/** 不可变地在指定路径部门下插入一个子部门（path 指向父部门）。 */
export function insertDraftChild(
  list: DepartmentDraftNode[],
  path: number[],
  node: DepartmentDraftNode,
): DepartmentDraftNode[] {
  if (path.length === 1) {
    return [...list.slice(0, path[0] + 1), node, ...list.slice(path[0] + 1)];
  }
  return list.map((item, index) => (
    index === path[0]
      ? { ...item, children: insertDraftChild(item.children ?? [], path.slice(1), node) }
      : item
  ));
}

/** 不可变地删除树中指定路径的部门节点。 */
export function removeDraftAt(list: DepartmentDraftNode[], path: number[]): DepartmentDraftNode[] {
  if (path.length === 1) {
    return list.filter((_, index) => index !== path[0]);
  }
  return list.map((item, index) => (
    index === path[0] && item.children
      ? { ...item, children: removeDraftAt(item.children, path.slice(1)) }
      : item
  ));
}

/** 不可变地删除指定路径部门下的某个岗位。 */
export function removeRoleDraftAt(
  list: DepartmentDraftNode[],
  path: number[],
  roleIndex: number,
): DepartmentDraftNode[] {
  return list.map((item, index) => {
    if (index !== path[0]) return item;
    if (path.length === 1) {
      return { ...item, roles: item.roles.filter((_, j) => j !== roleIndex) };
    }
    return { ...item, children: removeRoleDraftAt(item.children ?? [], path.slice(1), roleIndex) };
  });
}

/** 递归统计草稿树中的部门数（含空部门名节点？仅统计具名部门需先清理）。 */
export function countDraftDepartments(list: DepartmentDraftNode[]): number {
  return list.reduce((sum, item) => sum + 1 + countDraftDepartments(item.children ?? []), 0);
}

/** 递归统计草稿树中的岗位数（只统计已填名称的岗位）。 */
export function countDraftRoles(list: DepartmentDraftNode[]): number {
  return list.reduce(
    (sum, item) =>
      sum
      + item.roles.filter((role) => role.title.trim()).length
      + countDraftRoles(item.children ?? []),
    0,
  );
}

/** 保存前递归清理草稿树：去掉空部门名、空岗位名；未命名子部门整支丢弃。 */
export function cleanOrganizationDraft(list: DepartmentDraftNode[]): DepartmentDraftNode[] {
  const cleanNode = (department: DepartmentDraftNode): DepartmentDraftNode => ({
    source_name: department.source_name,
    name: department.name.trim(),
    roles: department.roles
      .filter((role) => role.title.trim())
      .map((role) => ({ source_title: role.source_title, title: role.title.trim() })),
    ...(department.children && department.children.some((child) => child.name.trim())
      ? { children: department.children.filter((child) => child.name.trim()).map(cleanNode) }
      : {}),
  });
  return list.map(cleanNode).filter((department) => department.name);
}