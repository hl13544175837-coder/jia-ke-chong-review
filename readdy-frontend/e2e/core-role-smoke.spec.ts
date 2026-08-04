import { expect, test } from '@playwright/test';
import { loginAs, type TestRole } from './helpers/login';

const roleCases: Array<{
  role: TestRole;
  home: string;
  expectedNavigation: string;
}> = [
  { role: 'recruiter', home: '/dashboard', expectedNavigation: '简历库' },
  { role: 'manager', home: '/dashboard', expectedNavigation: '需求审批' },
  { role: 'interviewer', home: '/interviewer/dashboard', expectedNavigation: '我的面试' },
  { role: 'director', home: '/director/cockpit', expectedNavigation: '管理驾驶舱' },
  { role: 'admin', home: '/dashboard', expectedNavigation: '系统设置' },
];

for (const roleCase of roleCases) {
  test(`@smoke ${roleCase.role} 可以进入自己的真实工作入口`, async ({ page }) => {
    await loginAs(page, roleCase.role);
    await page.goto(roleCase.home);
    await expect(page).toHaveURL(new RegExp(`${roleCase.home.replace('/', '\\/')}(?:\\?|$)`));
    await expect(page.getByText(roleCase.expectedNavigation, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('页面加载失败', { exact: true })).toHaveCount(0);
  });
}
