import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('人才地图提供独立的「地图视图」入口', () => {
  const page = read('src/pages/talent-map/page.tsx');
  const tree = read('src/pages/talent-map/components/CompanyTreeMap.tsx');

  assert.match(page, /地图视图/);
  assert.match(page, /CompanyTreeMap/);
  assert.match(tree, /公司 → 部门 → 岗位 → 候选人/);
});

test('地图视图是纵向树：公司在下级之上，部门可折叠，节点可编辑', () => {
  const tree = read('src/pages/talent-map/components/CompanyTreeMap.tsx');

  assert.match(tree, /折叠|展开|收起/);
  assert.match(tree, /新增部门/);
  assert.match(tree, /新增岗位/);
  assert.match(tree, /改名/);
  assert.match(tree, /删除部门/);
  assert.match(tree, /删除岗位/);
  assert.match(tree, /录入人才/);
  assert.match(tree, /保存组织结构/);
});
