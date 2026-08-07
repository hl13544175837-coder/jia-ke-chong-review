import { expect, test } from '@playwright/test';
import { loginAs, type TestRole } from './helpers/login';

const roleCases: Array<{
  role: TestRole;
  home: string;
  expectedNavigation: string;
  corePath: string;
  coreHeading: string;
}> = [
  { role: 'recruiter', home: '/dashboard', expectedNavigation: '在线简历', corePath: '/candidates', coreHeading: '简历库' },
  { role: 'manager', home: '/dashboard', expectedNavigation: '需求审批', corePath: '/jobs', coreHeading: '招聘需求' },
  { role: 'interviewer', home: '/interviewer/dashboard', expectedNavigation: '我的面试', corePath: '/interviewer/interviews', coreHeading: '我的面试' },
  { role: 'director', home: '/director/cockpit', expectedNavigation: '管理驾驶舱', corePath: '/director/cockpit', coreHeading: '管理驾驶舱' },
  { role: 'admin', home: '/dashboard', expectedNavigation: '系统设置', corePath: '/settings', coreHeading: '系统设置' },
];

for (const roleCase of roleCases) {
  test(`@smoke ${roleCase.role} 可以进入自己的真实工作入口`, async ({ page }) => {
    await loginAs(page, roleCase.role);
    await page.goto(roleCase.home);
    await expect(page).toHaveURL(new RegExp(`${roleCase.home.replace('/', '\\/')}(?:\\?|$)`));
    await expect(page.getByText(roleCase.expectedNavigation, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('页面加载失败', { exact: true })).toHaveCount(0);

    await page.goto(roleCase.corePath);
    await expect(page).toHaveURL(new RegExp(`${roleCase.corePath.replace('/', '\\/')}(?:\\?|$)`));
    await expect(page.getByRole('heading', { name: roleCase.coreHeading }).first()).toBeAttached();
    await expect(page.getByText('页面加载失败', { exact: true })).toHaveCount(0);
  });
}

test('@smoke recruiter 可以打开在线简历库', async ({ page }) => {
  await loginAs(page, 'recruiter');
  await page.goto('/online-resumes');
  await expect(page).toHaveURL(/\/online-resumes(?:\?|$)/);
  await expect(page.getByRole('heading', { name: '在线简历' }).first()).toBeAttached();
  await expect(page.getByText('页面加载失败', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '连接 Agent' }).click();
  const dialog = page.getByRole('dialog', { name: '连接外部 Agent' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('招聘需求')).toBeVisible();
  await expect(dialog.getByLabel('BOSS账号')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '生成连接提示词' })).toBeDisabled();
  await dialog.getByRole('button', { name: '关闭' }).click();
  await expect(dialog).toHaveCount(0);
});
