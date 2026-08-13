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

const recruiterCoreWorkspaces = [
  { path: '/jobs', heading: '招聘需求' },
  { path: '/candidates', heading: '简历库' },
  { path: '/kanban', heading: '招聘进度' },
  { path: '/interviews', heading: '面试管理' },
  { path: '/offers', heading: 'Offer 管理' },
  { path: '/analytics', heading: '数据看板' },
] as const;

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

  await page.getByRole('button', { name: /AI 招聘助手/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'AI 招聘助手' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('招聘需求')).toBeVisible();
  await expect(dialog.getByLabel('BOSS账号')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '生成授权指令' })).toBeDisabled();
  await dialog.getByRole('button', { name: '关闭' }).click();
  await expect(dialog).toHaveCount(0);
});

test('@smoke recruiter 六个核心工作区均可稳定打开', async ({ page }) => {
  await loginAs(page, 'recruiter');

  for (const workspace of recruiterCoreWorkspaces) {
    await page.goto(workspace.path);
    await expect(page).toHaveURL(new RegExp(`${workspace.path.replace('/', '\\/')}(?:\\?|$)`));
    await expect(page.getByRole('heading', { name: workspace.heading }).first()).toBeAttached();
    await expect(page.getByText('页面加载失败', { exact: true })).toHaveCount(0);
  }
});

test('@smoke 未登录不能直接进入受保护页面', async ({ page }) => {
  await page.goto('/offers');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test('@smoke recruiter 不能通过直输地址进入其他角色页面', async ({ page }) => {
  await loginAs(page, 'recruiter');
  for (const [forbiddenPath, forbiddenHeading] of [
    ['/settings', '系统设置'],
    ['/interviewer/dashboard', '面试官工作台'],
    ['/director/cockpit', '管理驾驶舱'],
  ] as const) {
    await page.goto(forbiddenPath);
    await expect.poll(async () => {
      const denied = await page.getByRole('heading', {
        name: /当前账号没有这个页面权限|无权访问此页面/,
      }).count();
      return new URL(page.url()).pathname === '/dashboard' || denied > 0;
    }).toBe(true);
    await expect(page.getByRole('heading', { name: forbiddenHeading })).toHaveCount(0);
  }
});
