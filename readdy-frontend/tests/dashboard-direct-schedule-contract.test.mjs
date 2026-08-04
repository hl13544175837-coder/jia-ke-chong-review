import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('工作台安排面试继续进入待安排筛选', () => {
  const dashboard = read('src/pages/dashboard/page.tsx');

  assert.match(dashboard, /navigate\('\/interviews\?status=unassigned&from=dashboard'\)/);
});

test('只有一条待安排任务时自动打开一次且刷新不重复打开', () => {
  const interviews = read('src/pages/interviews/page.tsx');

  assert.match(interviews, /const handledDashboardSchedule = useRef\(false\)/);
  assert.match(interviews, /const dashboardScheduleHandledInUrl = searchParams\.get\('quickSchedule'\) === 'handled'/);
  assert.match(interviews, /handledDashboardSchedule\.current/);
  assert.match(interviews, /visibleRows\.length !== 1/);
  assert.match(interviews, /setScheduleRow\(visibleRows\[0\]\)/);
  assert.match(interviews, /next\.set\('quickSchedule', 'handled'\)/);
  assert.doesNotMatch(interviews, /next\.delete\('from'\)/);
});

test('多条任务保留列表，零条任务给出明确提示', () => {
  const interviews = read('src/pages/interviews/page.tsx');

  assert.match(interviews, /当前没有待安排面试/);
  assert.match(interviews, /fromDashboard && activeTab === 'unassigned'/);
});

test('工作台把待安排和待确认已面试直接列为候选人待办', () => {
  const summary = read('src/pages/dashboard/summary.ts');
  const dashboard = read('src/pages/dashboard/page.tsx');

  assert.match(summary, /unassignedInterviews/);
  assert.match(summary, /waitingConfirmation/);
  assert.match(dashboard, /待安排面试/);
  assert.match(dashboard, /待确认已面试/);
  assert.match(dashboard, /status=unassigned/);
  assert.match(dashboard, /status=scheduled/);
});
