import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });

test('每家公司的进度只统计自己的全部人才', async () => {
  const helperPath = new URL('../src/pages/talent-map/organization.ts', import.meta.url);
  const { summarizeCompanyPeople } = await jiti.import(helperPath.href);
  const people = [
    { company_id: 11, contact_status: '已确认' },
    { company_id: 11, contact_status: '沟通中' },
    { company_id: 12, contact_status: '待联系' },
    { company_id: 12, contact_status: '未接触' },
  ];

  assert.deepEqual(summarizeCompanyPeople(people, 11), {
    total: 2,
    confirmed: 1,
    contacting: 1,
    pending: 0,
  });
  assert.deepEqual(summarizeCompanyPeople(people, 12), {
    total: 2,
    confirmed: 0,
    contacting: 0,
    pending: 2,
  });
});

test('公司切换进度基于全部人才并使用紧凑工作区', async () => {
  const source = await readFile(new URL('../src/pages/talent-map/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /summarizeCompanyPeople\(allPeople, company\.id\)/);
  assert.doesNotMatch(source, /companyPeople\.filter\(\(p\) => p\.company_id === company\.id\)/);
  assert.match(source, /data-ui="talent-map-workspace-header"/);
  assert.match(source, /data-ui="talent-map-department-list"/);
  assert.match(source, /新增第一家公司/);
});
