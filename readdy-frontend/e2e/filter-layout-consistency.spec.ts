import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/login';

test('候选人筛选在桌面和窄屏保持等宽紧凑且不重复', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'recruiter');
  await page.goto('/candidates');

  const panel = page.getByLabel('候选人补充筛选');
  await expect(panel).toBeVisible();
  const controls = panel.locator('input, select');
  await expect(controls).toHaveCount(7);

  const boxes = await controls.evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(Math.max(...boxes.map((box) => box.width)) - Math.min(...boxes.map((box) => box.width))).toBeLessThanOrEqual(2);
  expect(Math.max(...boxes.map((box) => box.height)) - Math.min(...boxes.map((box) => box.height))).toBeLessThanOrEqual(2);

  const headers = page.locator('thead th');
  await expect(headers.filter({ hasText: '学历' })).toBeVisible();
  await expect(headers.filter({ hasText: '意向城市' })).toBeVisible();
  await expect(headers.filter({ hasText: '核心技能' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '全部候选人' })).toBeVisible();

  await page.setViewportSize({ width: 520, height: 900 });
  await expect(panel).toBeVisible();
  const overflow = await panel.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
