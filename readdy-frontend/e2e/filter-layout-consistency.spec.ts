import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/login';

test('候选人普通筛选紧凑可收起且绿色状态分类始终位于下方', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'recruiter');
  await page.goto('/candidates');

  const filters = page.getByLabel('候选人普通筛选', { exact: true });
  const search = page.getByRole('searchbox', { name: '精确搜索候选人' });
  const scope = page.getByRole('tab', { name: '全部候选人' });
  await expect(filters).toBeVisible();
  await expect(search).toBeVisible();
  await expect(scope).toBeVisible();

  const searchBox = await search.boundingBox();
  const scopeBox = await scope.boundingBox();
  expect(searchBox?.width).toBeCloseTo(160, 0);
  expect(searchBox?.height).toBeCloseTo(36, 0);
  expect((searchBox?.y ?? 0) + (searchBox?.height ?? 0)).toBeLessThan(scopeBox?.y ?? 0);

  const headers = page.locator('thead th');
  await expect(headers.filter({ hasText: '学历' })).toBeVisible();
  await expect(headers.filter({ hasText: '意向城市' })).toBeVisible();
  await expect(headers.filter({ hasText: '核心技能' })).toHaveCount(0);

  await search.fill('测试');
  await filters.getByRole('button', { name: '收起筛选' }).click();
  await expect(search).toBeHidden();
  await expect(scope).toBeVisible();
  await expect(filters.getByRole('button', { name: '展开筛选（1项）' })).toBeVisible();
  await filters.getByRole('button', { name: '展开筛选（1项）' }).click();
  await expect(search).toBeVisible();

  await page.setViewportSize({ width: 520, height: 900 });
  await expect(filters).toBeVisible();
  const overflow = await filters.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('招聘需求普通筛选位于绿色状态分类和表格上方', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'recruiter');
  await page.goto('/jobs');

  const filters = page.getByLabel('招聘需求查询条件', { exact: true });
  const tabs = page.getByRole('tablist', { name: '招聘需求状态' });
  await expect(filters).toBeVisible();
  await expect(tabs).toBeVisible();

  const filterBox = await filters.boundingBox();
  const tabsBox = await tabs.boundingBox();
  expect((filterBox?.y ?? 0) + (filterBox?.height ?? 0)).toBeLessThan(tabsBox?.y ?? 0);

  await filters.getByRole('button', { name: '收起筛选' }).click();
  await expect(filters.getByRole('button', { name: '展开筛选' })).toBeVisible();
  await expect(tabs).toBeVisible();
});
