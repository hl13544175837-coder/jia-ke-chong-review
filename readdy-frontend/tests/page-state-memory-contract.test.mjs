import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('主导航记住面试官工作页和招聘看板，但不带回已经关闭的详情', async () => {
  const moduleUrl = pathToFileURL(path.join(root, 'src/features/navigation/pageMemory.ts'));
  const { memoryKeyForPath, safeRememberedHref } = await import(moduleUrl);

  assert.equal(memoryKeyForPath('/interviewer/jobs'), '/interviewer/jobs');
  assert.equal(memoryKeyForPath('/interviewer/screening'), '/interviewer/screening');
  assert.equal(memoryKeyForPath('/interviewer/interviews'), '/interviewer/interviews');
  assert.equal(memoryKeyForPath('/kanban'), '/kanban');

  assert.equal(
    safeRememberedHref('/interviewer/jobs', '/interviewer/jobs?tab=approved&demand=17'),
    '/interviewer/jobs?tab=approved',
  );
  assert.equal(
    safeRememberedHref('/interviewer/screening', '/interviewer/screening?tab=approved&q=java&job=后端工程师&department=技术部&city=上海&demand=17&task=32'),
    '/interviewer/screening?tab=approved&q=java&job=%E5%90%8E%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%88&department=%E6%8A%80%E6%9C%AF%E9%83%A8&city=%E4%B8%8A%E6%B5%B7&demand=17',
  );
  assert.equal(
    safeRememberedHref('/interviewer/interviews', '/interviewer/interviews?tab=completed&q=java&job=后端工程师&department=技术部&date=2026-08-03&candidate=8&assignment=12&demand=17'),
    '/interviewer/interviews?tab=completed&q=java&job=%E5%90%8E%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%88&department=%E6%8A%80%E6%9C%AF%E9%83%A8&date=2026-08-03',
  );
  assert.equal(
    safeRememberedHref('/kanban', '/kanban?demand=17&detailCandidate=8&candidate=8&target=rejected'),
    '/kanban?demand=17',
  );
});

test('招聘专员页面只恢复筛选条件，不重新弹出旧详情或操作弹窗', async () => {
  const moduleUrl = pathToFileURL(path.join(root, 'src/features/navigation/pageMemory.ts'));
  const { safeRememberedHref } = await import(moduleUrl);

  assert.equal(
    safeRememberedHref('/jobs', '/jobs?tab=approved&q=java&demand=17'),
    '/jobs?tab=approved&q=java',
  );
  assert.equal(
    safeRememberedHref('/candidates', '/candidates?scope=all&q=java&candidate=8'),
    '/candidates?scope=all&q=java',
  );
  assert.equal(
    safeRememberedHref('/interviews', '/interviews?status=awaiting_feedback&candidate=8&assignment=12&schedule=1&quickSchedule=1&from=dashboard'),
    '/interviews?status=awaiting_feedback',
  );
  assert.equal(
    safeRememberedHref('/offers', '/offers?demand=17&candidate=8&from=jobs&tab=pending&q=java&offer=3'),
    '/offers?demand=17&tab=pending&q=java',
  );
});

test('数据看板和总监页面恢复滚动位置但不重新打开旧下钻详情', async () => {
  const moduleUrl = pathToFileURL(path.join(root, 'src/features/navigation/pageMemory.ts'));
  const { memoryKeyForPath, safeRememberedHref } = await import(moduleUrl);

  assert.equal(memoryKeyForPath('/dashboard'), '/dashboard');
  assert.equal(memoryKeyForPath('/analytics'), '/analytics');
  assert.equal(memoryKeyForPath('/director/cockpit'), '/director/cockpit');
  assert.equal(memoryKeyForPath('/director/progress'), '/director/progress');
  assert.equal(memoryKeyForPath('/director/insights'), '/director/insights');
  assert.equal(memoryKeyForPath('/director/approvals'), '/director/approvals');

  assert.equal(
    safeRememberedHref('/analytics', '/analytics?insight=remaining-hc'),
    '/analytics',
  );
  assert.equal(
    safeRememberedHref('/director/progress', '/director/progress?position=demand-17'),
    '/director/progress',
  );
});

test('三个面试官页面把页签和搜索写入地址，并在关闭时清理详情编号', () => {
  const jobs = read('src/pages/interviewer/jobs/page.tsx');
  const screening = read('src/pages/interviewer/screening/page.tsx');
  const interviews = read('src/pages/interviewer/interviews/page.tsx');

  assert.match(jobs, /searchParams\.get\('tab'\)/);
  assert.match(jobs, /next\.set\('tab'/);
  assert.match(jobs, /next\.delete\('demand'\)/);

  assert.match(screening, /searchParams\.get\('tab'\)/);
  assert.match(screening, /next\.set\('tab'/);
  assert.match(screening, /next\.set\('task'/);
  assert.match(screening, /next\.delete\('task'\)/);

  assert.match(interviews, /searchParams\.get\('tab'\)/);
  assert.match(interviews, /searchParams\.get\('q'\)/);
  assert.match(interviews, /next\.set\('tab'/);
  assert.match(interviews, /next\.set\('q'/);
  assert.match(interviews, /next\.delete\('candidate'\)/);
  assert.match(interviews, /next\.delete\('assignment'\)/);
});

test('招聘看板从基础地址重新进入时恢复本次登录最后选择的需求', () => {
  const kanban = read('src/pages/kanban/page.tsx');

  assert.match(kanban, /KANBAN_DEMAND_MEMORY_KEY/);
  assert.match(kanban, /sessionStorage\.getItem\(KANBAN_DEMAND_MEMORY_KEY\)/);
  assert.match(kanban, /sessionStorage\.setItem\(KANBAN_DEMAND_MEMORY_KEY/);
  assert.match(kanban, /requestedDemandId \?\?/);
});
