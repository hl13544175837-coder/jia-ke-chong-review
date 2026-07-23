import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(srcRoot, path), 'utf8');

const routes = read('features/demands/routes.tsx');
const page = read('features/demands/pages/DemandsPage.tsx');
const createModal = read('features/demands/components/DemandCreateModal.tsx');
const table = read('features/demands/components/DemandTable.tsx');
const detail = read('features/demands/pages/DemandDetailPage.tsx');

assert.match(routes, /path:\s*'\/demands\/:id'/, 'Demand detail route should be registered');
assert.match(page, /DemandCreateModal/, 'Demand creation should use the current scrollable modal');
assert.match(page, /DemandTable/, 'Demand results should use the operational table');
assert.match(page, /submitGuardRef\.current/, 'A synchronous guard should prevent double creation');
assert.match(page, /STATUS_TABS[\s\S]*需求待确认[\s\S]*招聘中[\s\S]*已完成[\s\S]*已关闭/, 'Demand status tabs should be actionable');
assert.match(page, /query\.stage_focus/, 'Stage-focused jumps should reload the real demand list');

for (const label of ['职位名称', '所属部门', '招聘城市', 'HC 人数', '招聘负责人', '用人负责人（默认面试官）', '招聘起始日期', '截止日期']) {
  assert.match(createModal, new RegExp(label), `${label} should be present in demand creation`);
}
assert.match(createModal, /max-h-\[88vh\][\s\S]*overflow-hidden/, 'The modal should remain inside the viewport');
assert.match(createModal, /overflow-y-auto/, 'Long demand forms should scroll smoothly inside the modal');

assert.match(table, /搜索需求编号、职位或负责人/, 'Demand search should update a real query');
assert.match(table, /department[\s\S]*city/, 'Department and city filters should update query fields');
assert.match(table, /owner_hr_id/, 'Owner filters should update the backend query');
assert.match(table, /stage_focus/, 'Stage filters should update the backend query');
assert.match(table, /status:\s*'active'/, 'Status filters should update the backend query');
assert.match(table, /demand=\$\{demand\.id\}&stage=/, 'Stage drill-downs should preserve demand context');
assert.match(table, /\/demands\/\$\{demand\.id\}/, 'Job names should open demand detail');

assert.match(detail, /需求事实/, 'Demand detail should show demand facts');
assert.match(detail, /招聘进度/, 'Demand detail should show progress');
assert.match(detail, /责任与卡点/, 'Demand detail should show ownership and blockers');
assert.match(detail, /completion_suggested/, 'Demand detail should show the HC completion prompt');
assert.match(detail, /DemandActionDialog/, 'Lifecycle actions should use a real confirmation dialog');
