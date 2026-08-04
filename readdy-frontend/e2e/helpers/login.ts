import { expect, type Page } from '@playwright/test';

export type TestRole = 'recruiter' | 'manager' | 'interviewer' | 'director' | 'admin';

const defaultAccounts: Record<TestRole, string> = {
  recruiter: 'hr01',
  manager: 'manager01',
  interviewer: 'interviewer01',
  director: 'director01',
  admin: 'admin01',
};

const accountVariables: Record<TestRole, string> = {
  recruiter: 'E2E_RECRUITER_USER',
  manager: 'E2E_MANAGER_USER',
  interviewer: 'E2E_INTERVIEWER_USER',
  director: 'E2E_DIRECTOR_USER',
  admin: 'E2E_ADMIN_USER',
};

const passwordVariables: Record<TestRole, string> = {
  recruiter: 'E2E_RECRUITER_PASSWORD',
  manager: 'E2E_MANAGER_PASSWORD',
  interviewer: 'E2E_INTERVIEWER_PASSWORD',
  director: 'E2E_DIRECTOR_PASSWORD',
  admin: 'E2E_ADMIN_PASSWORD',
};

function passwordFor(role: TestRole) {
  const password = process.env[passwordVariables[role]] || process.env.E2E_PASSWORD;
  if (!password) {
    throw new Error(`缺少 ${passwordVariables[role]} 或 E2E_PASSWORD，浏览器测试不会硬编码密码`);
  }
  return password;
}

export async function loginAs(page: Page, role: TestRole) {
  const account = process.env[accountVariables[role]] || defaultAccounts[role];
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel('公司账号').fill(account);
  await page.getByLabel('密码').fill(passwordFor(role));
  await page.getByRole('button', { name: '登 录' }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
}

