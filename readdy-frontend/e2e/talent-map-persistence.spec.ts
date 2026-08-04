import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/login';

test('@talent-map 人才地图、公司和人选刷新后仍然存在', async ({ page }) => {
  const suffix = String(Date.now()).slice(-7);
  const mapName = `E2E地图${suffix}`;
  const companyName = `E2E公司${suffix}`;
  const personName = `E2E人选${suffix}`;

  await loginAs(page, 'recruiter');
  await page.goto('/talent-map');
  await expect(page.getByRole('heading', { name: '人才地图' })).toBeAttached();

  await page.getByRole('button', { name: '新增公司' }).click();
  await page.getByLabel('公司全称').fill(companyName);
  await page.getByLabel('公司简称').fill(companyName);
  await page.getByLabel('人才地图 / 行业').fill(mapName);
  await page.getByLabel('公司描述').fill('用于验证真实接口刷新持久化');
  await page.getByRole('button', { name: '创建公司' }).click();

  await expect(page.getByRole('button', { name: new RegExp(mapName) })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(companyName) })).toBeVisible();
  await page.getByTitle('添加顶层岗位').first().click();
  await page.getByLabel('岗位名称').fill('资深招聘专家');
  await page.getByLabel('人员姓名').fill(personName);
  await page.getByLabel('确认状态').selectOption('confirmed');
  await page.getByRole('button', { name: '创建岗位' }).click();
  await expect(page.getByText(personName, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: new RegExp(mapName) })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(companyName) })).toBeVisible();
  await expect(page.getByText(personName, { exact: true })).toBeVisible();
});
