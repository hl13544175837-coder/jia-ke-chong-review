import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const reminderModulePath = path.join(
  root,
  'src/features/interviews/localReminders.ts',
);
const dashboardPath = path.join(
  root,
  'src/pages/interviewer/dashboard/page.tsx',
);

function assignment(overrides = {}) {
  return {
    id: 1,
    status: 'scheduled',
    scheduled_at: '2026-07-30T10:00:00Z',
    feedback_submitted: false,
    ...overrides,
  };
}

test('本地面试提醒按互斥规则分类，并覆盖两小时边界', async () => {
  const { localReminderKind } = await import(pathToFileURL(reminderModulePath));
  const now = new Date('2026-07-30T10:00:00Z');

  assert.equal(localReminderKind(assignment({
    status: 'awaiting_feedback',
    scheduled_at: '2026-07-31T10:00:00Z',
  }), now), 'needs_feedback');
  assert.equal(localReminderKind(assignment({
    status: 'awaiting_feedback',
    feedback_submitted: true,
  }), now), null);
  assert.equal(localReminderKind(assignment({
    scheduled_at: '2026-07-30T09:59:59Z',
  }), now), 'needs_confirmation');
  assert.equal(localReminderKind(assignment({
    scheduled_at: '2026-07-30T10:00:01Z',
  }), now), 'starting_soon');
  assert.equal(localReminderKind(assignment({
    scheduled_at: '2026-07-30T12:00:00Z',
  }), now), 'starting_soon');
  assert.equal(localReminderKind(assignment({
    scheduled_at: '2026-07-30T12:00:01Z',
  }), now), null);
  assert.equal(localReminderKind(assignment({ status: 'completed' }), now), null);
  assert.equal(localReminderKind(assignment({ scheduled_at: null }), now), null);
});

test('工作台按紧急程度展示，并深链到具体面试任务', () => {
  const source = fs.readFileSync(dashboardPath, 'utf8');

  assert.match(source, /needs_feedback:\s*0/);
  assert.match(source, /needs_confirmation:\s*1/);
  assert.match(source, /starting_soon:\s*2/);
  assert.match(source, /待评价/);
  assert.match(source, /超时待确认/);
  assert.match(source, /两小时内开始/);
  assert.match(source, /其他任务/);
  assert.match(source, /assignment=\$\{item\.id\}/);
});

test('面试接口失败时不显示为零或空任务，并保留刷新入口', () => {
  const source = fs.readFileSync(dashboardPath, 'utf8');

  assert.match(source, /interviewLoadFailed/);
  assert.match(source, /loading \|\| interviewLoadFailed/);
  assert.match(source, /!interviewLoadFailed/);
  assert.match(source, /\/>刷新/);
  assert.match(source, /当前没有需要立即处理的面试/);
});
