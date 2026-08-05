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
