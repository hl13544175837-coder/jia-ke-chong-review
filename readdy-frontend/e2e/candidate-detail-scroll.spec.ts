import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/login';

test('@smoke 长简历在详情内部滚动且右下角操作栏始终可见', async ({ page }) => {
  await loginAs(page, 'recruiter');
  await page.goto('/candidates');
  await expect(page.getByRole('heading', { name: '简历库' })).toBeAttached();

  const candidateRow = page.getByRole('row').filter({ hasText: '谷杨' }).first();
  await candidateRow.locator('[data-ui="row-action-menu-trigger"]').click();
  await page.getByRole('menuitem', { name: '编辑简历信息' }).click();
  await expect(page.getByRole('tab', { name: '候选人简历' })).toHaveAttribute('aria-selected', 'true');

  const scrollPanel = page.getByTestId('candidate-detail-scroll-panel');
  await expect(scrollPanel).toBeVisible();
  await expect(scrollPanel.getByRole('heading', { name: '个人概况' })).toBeVisible();
  const before = await scrollPanel.evaluate((node) => node.scrollTop);
  const dimensions = await scrollPanel.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

  await scrollPanel.evaluate((node) => node.scrollTo(0, node.scrollHeight));
  await expect.poll(() => scrollPanel.evaluate((node) => node.scrollTop)).toBeGreaterThan(before);
  await expect(page.locator('[data-ui="detail-action-bar"]')).toBeVisible();
});
