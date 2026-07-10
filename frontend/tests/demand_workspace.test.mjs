import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(root, path), 'utf8');

for (const file of [
  'features/demands/components/DemandForm.tsx',
  'features/demands/components/DemandFilters.tsx',
  'features/demands/components/DemandTable.tsx',
  'features/demands/pages/DemandDetailPage.tsx',
]) {
  assert.ok(existsSync(join(root, file)), `${file} should exist`);
}

const routes = read('features/demands/routes.tsx');
const page = read('features/demands/pages/DemandsPage.tsx');
const form = read('features/demands/components/DemandForm.tsx');
const filters = read('features/demands/components/DemandFilters.tsx');
const table = read('features/demands/components/DemandTable.tsx');
const detail = read('features/demands/pages/DemandDetailPage.tsx');
const api = read('lib/api.ts');
const types = read('types/index.ts');
const input = read('components/ui/Input.tsx');

assert.match(routes, /path:\s*'\/demands\/:id'/, 'Demand detail route should be registered');
assert.match(page, /DemandFilters/, 'Demand list should use filters');
assert.match(page, /DemandTable/, 'Demand list should use a table instead of demand cards');
assert.doesNotMatch(page, /function DemandCard/, 'The list page should not render a card stream');
assert.match(page, /useNavigate/, 'Create success should navigate to detail');
assert.match(page, /navigate\(`\/demands\/\$\{created\.id\}`\)/, '201 should open the new demand');
assert.match(page, /submitGuardRef\.current/, 'A synchronous guard should prevent double clicks');

for (const label of [
  '职位 / JD',
  '用人部门',
  '招聘城市',
  'HC',
  '提需求日期',
  '用人负责人',
  '招聘负责人',
  '期望完成日期',
]) {
  assert.match(form, new RegExp(label.replace('/', '\\/')), `${label} should be visible`);
}
assert.match(form, /required/, 'Required fields should use native required semantics');
assert.match(input, /aria-required/, 'Shared Input should expose accessible required state');
assert.match(input, /text-danger-600[^]*\*/, 'Required Input labels should show a red star');

assert.match(filters, /全部/, 'Status categories should include all demands');
assert.match(filters, /招聘中/, 'Status categories should include active demands');
assert.match(filters, /暂停/, 'Status categories should include paused demands');
assert.match(filters, /已完成/, 'Status categories should include filled demands');
assert.match(filters, /已取消/, 'Status categories should include cancelled demands');
assert.match(filters, /department/, 'Demand filters should support department');
assert.match(filters, /owner_hr_id/, 'Demand filters should support owner');

assert.match(table, /<table/, 'Demand results should render as a table');
assert.match(table, /demand=\$\{demand\.id\}/, 'Stage drill-down should carry demand_id');
assert.match(table, /stage=/, 'Stage drill-down should carry the selected stage');
assert.match(table, /Pagination/, 'Demand results should paginate');
assert.match(table, /\/demands\/\$\{demand\.id\}/, 'Rows should link to demand detail');

assert.match(detail, /需求事实/, 'Detail page should show demand facts');
assert.match(detail, /招聘进度/, 'Detail page should show progress');
assert.match(detail, /责任与卡点/, 'Detail page should show responsibility and blockers');
assert.match(detail, /completion_suggested/, 'Detail page should surface HC completion prompt');
assert.match(detail, /\?demand=\$\{demand\.id\}/, 'Demand detail should deep-link matching into the selected demand');

assert.match(types, /interface DemandListQuery/, 'Demand list query type should be shared');
assert.match(types, /interface DemandListResponse/, 'Paginated response type should be shared');
assert.match(types, /owner_hr_id:\s*number/, 'Demand create input should require an owner');
assert.match(types, /city:\s*string/, 'Demand create input should require a city');
assert.match(api, /URLSearchParams/, 'Demand list API should serialize filters');
assert.match(api, /idempotencyKey/, 'Demand create should pass an idempotency key');
assert.match(api, /Idempotency-Key/, 'Request client should emit the idempotency header');
