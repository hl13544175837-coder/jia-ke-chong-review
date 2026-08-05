import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/login';

async function verifyFirstRowMenu(page: Page) {
  const trigger = page.locator('[data-ui="row-action-menu-trigger"]:visible').first();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  const row = trigger.locator('xpath=ancestor::tr');
  const actionCell = row.locator('td').last();
  const primaryButtons = actionCell.locator('button:not([data-ui="row-action-menu-trigger"])');
  expect(await primaryButtons.count()).toBeLessThanOrEqual(1);

  const urlBefore = page.url();
  await trigger.click();
  const menu = page.locator('[data-ui="row-action-menu"]');
  await expect(menu).toBeVisible();
  expect(await menu.getByRole('menuitem').count()).toBeGreaterThan(0);
  expect(page.url()).toBe(urlBefore);

  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.press('Enter');
  await expect(page.locator('[data-ui="row-action-menu"]')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
}

test('招聘需求、简历库、面试和 Offer 统一为单主操作加三点菜单', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'recruiter');

  for (const path of ['/jobs', '/candidates', '/interviews', '/offers']) {
    await page.goto(path);
    await verifyFirstRowMenu(page);
  }

  await page.goto('/jobs');
  await page.locator('[data-ui="row-action-menu-trigger"]:visible').first().click();
  await page.getByRole('menuitem', { name: '编辑需求' }).click();
  await expect(page.getByRole('button', { name: '保存修改' })).toBeVisible();
  await page.getByRole('button', { name: '关闭需求详情' }).click();

  await page.goto('/offers');
  const trigger = page.locator('[data-ui="row-action-menu-trigger"]:visible').first();
  await trigger.click();
  const menu = page.locator('[data-ui="row-action-menu"]');
  await expect(menu).not.toContainText('自动发送');
  await expect(menu).not.toContainText('撤回 OA');
  await expect(menu).not.toContainText('同步 OA');
  await menu.getByRole('menuitem', { name: '查看候选人简历' }).click();
  await expect(page).toHaveURL(/detail=resume/);
  await expect(page.getByRole('tab', { name: '候选人简历' })).toHaveAttribute('aria-selected', 'true');
});

test('用户管理统一操作菜单且没有删除成员', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'admin');
  await page.goto('/settings');
  await page.getByRole('tab', { name: '用户管理' }).click();
  await verifyFirstRowMenu(page);

  const trigger = page.locator('[data-ui="row-action-menu-trigger"]:visible').first();
  await trigger.click();
  const menu = page.locator('[data-ui="row-action-menu"]');
  await expect(menu).toContainText('重置密码');
  await expect(menu).not.toContainText('删除成员');
});
