import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('人才录入弹窗可以直接输入新公司名，而不是只能从下拉选择', () => {
  const source = read('src/pages/talent-map/components/PersonEditModal.tsx');

  assert.match(source, /id="person-company"/);
  assert.match(source, /list="person-company-options"/);
  assert.match(source, /company_name: companyName/);
  // 只保留联系状态下拉，公司不再用 select
  assert.equal((source.match(/<select/g) || []).length, 1);
});

test('人才弹窗部门/岗位给出“可直接输入”的明确提示', () => {
  const source = read('src/pages/talent-map/components/PersonEditModal.tsx');

  assert.match(source, /可直接输入/);
});

test('人才地图公司卡片提供编辑公司入口并接好保存', () => {
  const page = read('src/pages/talent-map/page.tsx');
  const modal = read('src/pages/talent-map/components/CompanyEditModal.tsx');
  const workspace = read('src/features/talentMaps/useTalentMapWorkspace.ts');
  const types = read('src/features/talentMaps/types.ts');

  assert.match(page, /CompanyEditModal/);
  assert.match(page, /编辑公司/);
  assert.match(modal, /公司名称/);
  assert.match(workspace, /updateCompany/);
  assert.match(types, /company_name\?: string/);
});

test('简历库手动录入的部门、城市、来源可以打字，性别和学历保持选择', () => {
  const source = read('src/features/candidates/components/ImportResumeModal.tsx');

  assert.match(source, /list="import-dept-options"/);
  assert.match(source, /list="import-city-options"/);
  assert.match(source, /list="import-source-options"/);
  assert.equal((source.match(/<select/g) || []).length, 2);
});
