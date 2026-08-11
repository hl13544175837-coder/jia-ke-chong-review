import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildOrganization, organizationDraft } from '../src/pages/talent-map/organization.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('自定义空岗位会与已录入人才一起显示', () => {
  const tree = buildOrganization(
    [{ id: 1, department: '产品', title: '产品经理' }],
    { departments: [{ name: '产品', roles: ['产品经理', '产品运营'] }] },
  );

  assert.deepEqual(
    tree.map((item) => [item.name, item.roles.map((role) => [role.title, role.people.length])]),
    [['产品', [['产品经理', 1], ['产品运营', 0]]]],
  );
});

test('未录入人才的新部门也会保留在组织架构中', () => {
  const tree = buildOrganization([], { departments: [{ name: '技术中心', roles: ['后端工程师'] }] });

  assert.deepEqual(
    tree.map((item) => [item.name, item.roles.map((role) => role.title)]),
    [['技术中心', ['后端工程师']]],
  );
});

test('编辑草稿保留原名以便后端把改名同步到已有人员', () => {
  const draft = organizationDraft([{ name: '产品', roles: [{ title: '产品经理', people: [] }] }]);

  assert.deepEqual(draft, [{
    source_name: '产品',
    name: '产品',
    roles: [{ source_title: '产品经理', title: '产品经理' }],
  }]);
});

test('人才地图页面提供编辑组织架构入口和保存流程', () => {
  const page = read('src/pages/talent-map/page.tsx');
  const modal = read('src/pages/talent-map/components/OrganizationEditorModal.tsx');
  const api = read('src/features/talentMaps/api.ts');
  const workspace = read('src/features/talentMaps/useTalentMapWorkspace.ts');

  assert.match(page, /编辑组织架构/);
  assert.match(page, /OrganizationEditorModal/);
  assert.match(modal, /新增部门/);
  assert.match(modal, /新增岗位/);
  assert.match(modal, /保存组织结构/);
  assert.match(api, /\/talent-maps\/\$\{mapId\}\/organization/);
  assert.match(workspace, /updateOrganization/);
});
