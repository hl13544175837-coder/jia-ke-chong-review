import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/login';

const evidenceDir = resolve(
  process.cwd(),
  '..',
  'docs',
  'verification',
  '2026-08-04-technical-debt-decoupling',
  'screenshots',
);

mkdirSync(evidenceDir, { recursive: true });

async function capture(page: Page, name: string) {
  await expect(page.getByText('页面加载失败', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: resolve(evidenceDir, name), animations: 'disabled' });
}

test.describe.serial('技术债解耦验收截图', () => {
  test('@verification 招聘专员核心页面和统一详情', async ({ page }) => {
    await loginAs(page, 'recruiter');

    await page.goto('/jobs');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await capture(page, 'after-01-demand-list.png');
    await page.locator('tbody tr').first().locator('td').first().click();
    await expect(page.getByRole('dialog', { name: '招聘需求详情' })).toBeVisible();
    await capture(page, 'after-02-demand-detail.png');
    await page.getByRole('button', { name: '关闭需求详情' }).click();

    await page.goto('/candidates');
    await expect(page.getByRole('heading', { name: '简历库' })).toBeAttached();
    const candidateRow = page.getByRole('row').filter({ hasText: '谷杨' }).first();
    await candidateRow.locator('[data-ui="row-action-menu-trigger"]').click();
    await page.getByRole('menuitem', { name: '查看候选人详情' }).click();
    await expect(page.getByRole('tab', { name: '面试信息' })).toBeVisible();
    await capture(page, 'after-03-candidate-detail-top.png');
    await page.getByRole('tab', { name: '候选人简历' }).click();
    const candidateScroll = page.getByTestId('candidate-detail-scroll-panel');
    await expect(candidateScroll).toBeVisible();
    await candidateScroll.evaluate((node) => node.scrollTo(0, node.scrollHeight));
    await expect.poll(() => candidateScroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('[data-ui="detail-action-bar"]')).toBeVisible();
    await capture(page, 'after-04-candidate-detail-bottom.png');
    await page.getByRole('button', { name: '关闭简历详情' }).click();

    await page.goto('/interviews');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await capture(page, 'after-05-interview-list.png');
    await page.locator('tbody tr').first().click();
    await expect(page.getByRole('tab', { name: '面试信息' })).toBeVisible();
    await capture(page, 'after-06-interview-detail.png');
    await page.getByRole('button', { name: '关闭' }).last().click();

    await page.goto('/offers');
    await expect(page.getByRole('region', { name: 'Offer 查询条件' })).toBeVisible();
    await capture(page, 'after-07-offer-list.png');
    const firstOfferCandidate = page.locator('tbody tr td').first().getByRole('button');
    await expect(firstOfferCandidate).toBeVisible();
    await firstOfferCandidate.click();
    await expect(page.getByRole('tab', { name: '面试信息' })).toBeVisible();
    await capture(page, 'after-08-offer-candidate-detail.png');
    await page.getByRole('button', { name: /关闭/ }).last().click();

    await page.goto('/talent-map');
    await expect(page.getByRole('heading', { name: '人才地图' })).toBeAttached();
    await expect(page.getByRole('button', { name: '新增公司' })).toBeVisible();
    await capture(page, 'after-09-talent-map.png');
  });

  test('@verification 面试官筛选和面试详情', async ({ page }) => {
    await loginAs(page, 'interviewer');

    await page.goto('/interviewer/screening');
    await expect(page.getByRole('region', { name: '候选人筛选查询条件' })).toBeVisible();
    await capture(page, 'after-10-interviewer-screening.png');
    const screeningTask = page.locator('article button').first();
    await expect(screeningTask).toBeVisible();
    await screeningTask.click();
    await expect(page.getByText('业务筛选详情', { exact: true })).toBeVisible();
    await capture(page, 'after-11-interviewer-screening-detail.png');
    await page.getByRole('button', { name: '关闭详情' }).click();

    await page.goto('/interviewer/interviews');
    const assignments = page.locator('[data-ui="real-interviewer-assignments"]');
    await expect(assignments).toBeVisible();
    await capture(page, 'after-12-interviewer-interviews.png');
    const firstAssignment = assignments.locator('.divide-y > div button').first();
    await expect(firstAssignment).toBeVisible();
    await firstAssignment.click();
    await expect(page.getByRole('dialog', { name: '面试详情' })).toBeVisible();
    await capture(page, 'after-13-interviewer-interview-detail.png');
  });
});
