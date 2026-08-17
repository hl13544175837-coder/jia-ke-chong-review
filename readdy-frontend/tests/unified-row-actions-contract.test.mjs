import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

test('招聘需求主操作和菜单按状态去重并限制负责人转派权限', async () => {
  const path = new URL('../src/pages/jobs/rowActions.ts', import.meta.url);
  assert.ok(existsSync(path), '应提供招聘需求行操作策略');
  const { buildDemandRowActions } = await import(path.href);
  const makeRow = ({ statusCode = 'active', remainingHeadcount = 1, stageAll = 0, approvalStatus = 'approved' } = {}) => ({
    id: '1',
    statusCode,
    remainingHeadcount,
    stageAll,
    source: { approval_status: approvalStatus },
  });

  const active = buildDemandRowActions(makeRow(), 'admin');
  assert.equal(active.primary, 'select_candidates');
  assert.ok(active.menu.includes('mark_filled'));
  assert.ok(active.menu.includes('reassign_owner'));

  const full = buildDemandRowActions(makeRow({ remainingHeadcount: 0 }), 'admin');
  assert.equal(full.primary, 'mark_filled');
  assert.ok(!full.menu.includes('mark_filled'));

  const paused = buildDemandRowActions(makeRow({ statusCode: 'paused' }), 'admin');
  assert.equal(paused.primary, 'restore');
  assert.ok(!paused.menu.includes('restore'));

  for (const statusCode of ['filled', 'cancelled', 'closed']) {
    const terminalWithoutCandidates = buildDemandRowActions(makeRow({ statusCode, stageAll: 0 }), 'admin');
    assert.equal(terminalWithoutCandidates.primary, null, `${statusCode} 且无候选人不应跳转空的简历库`);
    assert.ok(!terminalWithoutCandidates.menu.includes('view_candidates'));

    const terminalWithCandidates = buildDemandRowActions(makeRow({ statusCode, stageAll: 1 }), 'admin');
    assert.equal(terminalWithCandidates.primary, 'view_candidates', `${statusCode} 有历史候选人时可查看`);
  }

  const recruiter = buildDemandRowActions(makeRow(), 'recruiter');
  assert.ok(!recruiter.menu.includes('reassign_owner'));
});

test('面试管理只保留一个主操作，其余真实入口进入菜单', async () => {
  const path = new URL('../src/pages/interviews/rowActions.ts', import.meta.url);
  assert.ok(existsSync(path), '应提供面试行操作策略');
  const { buildInterviewRowActions } = await import(path.href);
  const makeRow = (overrides = {}) => ({
    assignment_id: 9,
    assignment_status: 'scheduled',
    feedback_submitted: false,
    scheduled_at: '2026-08-06T10:00:00Z',
    reschedule_request: undefined,
    ...overrides,
  });

  const upcoming = buildInterviewRowActions(makeRow(), Date.parse('2026-08-05T10:00:00Z'));
  assert.equal(upcoming.primary, 'adjust_schedule');
  assert.ok(!upcoming.menu.includes('adjust_schedule'));
  assert.ok(upcoming.menu.includes('cancel_schedule'));

  const started = buildInterviewRowActions(makeRow(), Date.parse('2026-08-07T10:00:00Z'));
  assert.equal(started.primary, 'confirm_conducted');
  assert.ok(started.menu.includes('adjust_schedule'));

  const pending = buildInterviewRowActions(makeRow({ reschedule_request: { status: 'pending' } }));
  assert.equal(pending.primary, 'process_reschedule');

  const completed = buildInterviewRowActions(makeRow({ feedback_submitted: true }));
  assert.equal(completed.primary, 'view_feedback');

  const awaiting = buildInterviewRowActions(makeRow({ assignment_status: 'awaiting_feedback' }));
  assert.equal(awaiting.primary, 'remind_feedback');
  assert.ok(!awaiting.menu.includes('adjust_schedule'));
  assert.ok(!awaiting.menu.includes('cancel_schedule'));
});
