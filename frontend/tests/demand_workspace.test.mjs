import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(root, path), 'utf8');

for (const file of [
  'features/demands/components/DemandForm.tsx',
  'features/demands/components/DemandTable.tsx',
  'features/demands/components/DemandCreateModal.tsx',
  'features/demands/pages/DemandDetailPage.tsx',
]) {
  assert.ok(existsSync(join(root, file)), `${file} should exist`);
}

const routes = read('features/demands/routes.tsx');
const page = read('features/demands/pages/DemandsPage.tsx');
const form = read('features/demands/components/DemandForm.tsx');
const table = read('features/demands/components/DemandTable.tsx');
const createModal = read('features/demands/components/DemandCreateModal.tsx');
const detail = read('features/demands/pages/DemandDetailPage.tsx');
const api = read('lib/api.ts');
const types = read('types/index.ts');
const input = read('components/ui/Input.tsx');

assert.match(routes, /path:\s*'\/demands\/:id'/, 'Demand detail route should be registered');
assert.match(page, /STATUS_TABS/, 'Demand list should expose status filters');
assert.match(page, /DemandTable/, 'Demand list should use a table instead of demand cards');
assert.doesNotMatch(page, /function DemandCard/, 'The list page should not render a card stream');
assert.match(page, /DemandCreateModal/, 'Demand creation should use the target-mode modal');
assert.match(page, /setCreateOpen\(false\)[\s\S]*demands\.reload\(\)/, 'Create success should close the modal and refresh the real list');
assert.match(page, /submitGuardRef\.current/, 'A synchronous guard should prevent double clicks');
assert.match(
  page,
  /const \[createOpen, setCreateOpen\] = useState\(false\)/,
  'Demand creation should stay closed until the user requests it',
);
assert.match(
  page,
  /open=\{createOpen\}/,
  'The create-demand modal should consume the explicit open state',
);
assert.match(
  createModal,
  /role="dialog"[\s\S]*aria-modal="true"/,
  'The create-demand modal should expose dialog semantics',
);

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

assert.match(page, /全部/, 'Status categories should include all demands');
assert.match(page, /招聘中/, 'Status categories should include active demands');
assert.match(page, /已完成/, 'Status categories should include filled demands');
assert.match(page, /已关闭/, 'Status categories should include closed demands');
assert.match(table, /query\.department/, 'Demand filters should support department');
assert.match(table, /query\.owner_hr_id/, 'Demand filters should support owner');

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
assert.match(detail, /RISK_LABELS/, 'Demand detail should translate risk codes into user-facing labels');
assert.match(detail, /risk_flags\.map\(riskLabel\)/, 'Risk flags should render through the label mapping');
assert.doesNotMatch(detail, /risk_flags\.join\(/, 'Technical risk codes should not be rendered directly');
assert.match(
  detail,
  /if \(state\.loading && !state\.data\)/,
  'Refreshing a demand after a dialog action should keep the existing page and focus target mounted',
);
assert.match(
  detail,
  /state\.error && state\.data/,
  'A failed refresh should be visible even when stale demand data is still mounted',
);
assert.match(
  detail,
  /操作已提交，但最新状态加载失败/,
  'The stale-data warning should explain that the mutation may have succeeded',
);
assert.match(
  detail,
  /onClick=\{state\.reload\}/,
  'A failed demand refresh should provide a direct retry action',
);
assert.match(
  detail,
  /const demandStateUncertain = state\.loading \|\| Boolean\(state\.error\)/,
  'Actions should share one guard while the latest demand state is loading or unknown',
);
assert.match(
  detail,
  /owners\.error[\s\S]*owners\.reload/,
  'A failed owner list should be explained separately and offer a retry',
);
assert.match(
  detail,
  /disabled=\{demandStateUncertain \|\| owners\.loading \|\| Boolean\(owners\.error\) \|\| !hasAlternativeOwner\}/,
  'Owner reassignment should stay unavailable until eligible owners are known',
);
assert.match(
  detail,
  /const hasAlternativeOwner = \(owners\.data \?\? \[\]\)\.some\(\(owner\) => owner\.id !== demand\.owner_hr_id\)/,
  'Reassignment should distinguish a true no-alternative state from a loaded owner list',
);
assert.match(
  detail,
  /暂无其他可转派招聘负责人/,
  'Managers should get a next-step explanation when no alternative recruiter exists',
);

assert.match(types, /interface DemandListQuery/, 'Demand list query type should be shared');
assert.match(types, /interface DemandListResponse/, 'Paginated response type should be shared');
assert.match(types, /owner_hr_id:\s*number/, 'Demand create input should require an owner');
assert.match(types, /city:\s*string/, 'Demand create input should require a city');
assert.match(api, /URLSearchParams/, 'Demand list API should serialize filters');
assert.match(api, /idempotencyKey/, 'Demand create should pass an idempotency key');
assert.match(api, /Idempotency-Key/, 'Request client should emit the idempotency header');
