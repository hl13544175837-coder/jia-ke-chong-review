import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('公共行菜单负责视口定位、关闭行为和键盘语义', () => {
  const path = new URL('../src/components/ui/RowActionMenu.tsx', import.meta.url);
  assert.ok(existsSync(path), '应提供公共 RowActionMenu 组件');
  const source = read('src/components/ui/RowActionMenu.tsx');

  assert.match(source, /createPortal/);
  assert.match(source, /position: 'fixed'/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /role="menu"/);
  assert.match(source, /role="menuitem"/);
  assert.match(source, /Escape/);
  assert.match(source, /pointerdown/);
  assert.match(source, /danger/);
});

test('招聘需求主操作和菜单按状态去重并限制负责人转派权限', async () => {
  const path = new URL('../src/pages/jobs/rowActions.ts', import.meta.url);
  assert.ok(existsSync(path), '应提供招聘需求行操作策略');
  const { buildDemandRowActions } = await import(path.href);
  const makeRow = ({ statusCode = 'active', remainingHeadcount = 1, approvalStatus = 'approved' } = {}) => ({
    id: '1',
    statusCode,
    remainingHeadcount,
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

  const recruiter = buildDemandRowActions(makeRow(), 'recruiter');
  assert.ok(!recruiter.menu.includes('reassign_owner'));
});

test('招聘需求列表使用公共菜单并移除旧的单项状态菜单', () => {
  const table = read('src/pages/jobs/components/RequisitionTable.tsx');
  assert.match(table, /RowActionMenu/);
  assert.doesNotMatch(table, /statusExtraActions/);
  assert.doesNotMatch(table, /statusTransitions/);
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
});

test('面试列表使用公共菜单', () => {
  const table = read('src/pages/interviews/components/InterviewManagementTable.tsx');
  assert.match(table, /RowActionMenu/);
  assert.match(table, /查看候选人简历/);
  assert.match(table, /取消面试/);
});

test('简历库把查看、收藏和流程记录收入统一菜单', () => {
  const table = read('src/features/candidates/components/library/CandidateLibraryTable.tsx');
  assert.match(table, /RowActionMenu/);
  assert.match(table, /查看候选人简历/);
  assert.match(table, /查看流程记录/);
  assert.match(table, /candidate\.is_favorite \? '取消收藏' : '收藏'/);
  assert.doesNotMatch(table, /<Star/);
  assert.doesNotMatch(table, /<Eye/);
});

test('Offer 列表保留 OA 主操作，菜单只提供真实业务导航', () => {
  const table = read('src/pages/offers/components/OfferTable.tsx');
  assert.match(table, /RowActionMenu/);
  assert.match(table, /查看候选人简历/);
  assert.match(table, /查看招聘需求/);
  assert.match(table, /查看招聘流程/);
  assert.match(table, /查看已完成面试/);
  assert.match(table, /登记 OA 结果/);
});
