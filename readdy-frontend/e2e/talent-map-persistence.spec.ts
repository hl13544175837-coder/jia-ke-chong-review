import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/login';

test('@talent-map 人才地图、公司和人选刷新后仍然存在', async ({ page }) => {
  const suffix = String(Date.now()).slice(-7);
  const companyName = `E2E公司${suffix}`;
  const personName = `E2E人选${suffix}`;

  await loginAs(page, 'recruiter');
  await page.goto('/talent-map');
  await expect(page.getByRole('heading', { name: '人才地图' })).toBeAttached();

  // 新增公司（新版表单：公司名称/所属行业/备注）
  await page.getByRole('button', { name: '新增公司' }).click();
  await page.getByLabel('公司名称').fill(companyName);
  await page.getByLabel('所属行业').fill('E2E测试行业');
  await page.getByRole('button', { name: '创建公司' }).click();

  // 新公司出现在公司 Tab
  await expect(page.getByRole('button', { name: new RegExp(companyName) })).toBeVisible();

  // 新公司无人才 → 空态手动录入第一位人才（新版入口）
  await page.getByRole('button', { name: '手动录入第一位人才' }).click();
  await page.getByLabel('姓名').fill(personName);
  await page.getByLabel('岗位').fill('资深招聘专家');
  await page.getByRole('button', { name: '录入人才' }).click();

  // 人才出现在组织树岗位卡片中（卡片显示岗位标题与"1 位已录入"）
  await expect(page.getByText('资深招聘专家', { exact: true })).toBeVisible();
  await expect(page.getByText('1 位已录入', { exact: true })).toBeVisible();

  // 刷新后数据仍存在（需先点选新建公司的 Tab，默认选中列表第一家）
  await page.reload();
  const companyTab = page.getByRole('button', { name: new RegExp(companyName) });
  await expect(companyTab).toBeVisible();
  await companyTab.click();
  await expect(page.getByText('资深招聘专家', { exact: true })).toBeVisible();
});

test('@talent-map 跨公司总览视图渲染统计与公司行', async ({ page }) => {
  await loginAs(page, 'recruiter');
  await page.goto('/talent-map');
  await expect(page.getByRole('heading', { name: '人才地图' })).toBeAttached();

  await page.getByRole('button', { name: '总览' }).click();
  await expect(page.getByText('目标公司', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('确认率', { exact: true })).toBeVisible();

  // 点击任一公司行 → 进入该公司视图（公司视图独有"状态："图例出现）
  const firstRow = page.getByRole('button').filter({ hasText: /E2E公司|云启科技|本地验收企业/ }).first();
  if (await firstRow.count() > 0) {
    await firstRow.click();
    await expect(page.getByText('状态：').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '总览' })).toBeVisible();
  }
});

test('@talent-map AI 导入向导可打开并列出简历库候选人', async ({ page }) => {
  await loginAs(page, 'recruiter');
  await page.goto('/talent-map');
  await expect(page.getByRole('heading', { name: '人才地图' })).toBeAttached();

  await page.getByRole('button', { name: 'AI 从简历库导入' }).first().click();
  await expect(page.getByText('选择简历候选人', { exact: false })).toBeVisible({ timeout: 10_000 });
});
