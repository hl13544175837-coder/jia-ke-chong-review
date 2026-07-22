import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

assert.ok(
  existsSync(join(srcRoot, 'features/demands/index.ts')),
  'Demand management should live in its own sidebar feature module',
);

const registry = readSource('app/featureRegistry.ts');
assert.match(registry, /demandsFeature/, 'Feature registry should include demand management');

const nav = readSource('features/demands/nav.ts');
assert.match(nav, /label:\s*'招聘管理'/, 'Demand feature should expose the consolidated recruitment sidebar entry');
assert.match(nav, /\/demands/, 'Recruitment nav should still land on the demand list first');
assert.match(nav, /activePaths:\s*\[[\s\S]*'\/jobs'[\s\S]*\]/, 'Recruitment nav should stay active on job portrait pages');

const demandFeature = readSource('features/demands/index.ts');
assert.match(
  demandFeature,
  /topLevelPaths:\s*\[[\s\S]*['"]\/demands['"][\s\S]*['"]\/talent-map['"][\s\S]*\]/,
  'Recruitment demands and the now-connected talent map should be top-level workspaces',
);

const routes = readSource('features/demands/routes.tsx');
assert.match(routes, /path:\s*'\/demands'/, 'Demand feature should register the list route');
assert.match(routes, /path:\s*'\/demands\/:id'/, 'Demand feature should register the detail route');

const api = readSource('features/demands/api.ts');
assert.match(api, /listDemands/, 'Demand API wrapper should list demands');
assert.match(api, /createDemand/, 'Demand API wrapper should create demands');
assert.match(api, /closeDemand/, 'Demand API wrapper should close demands');
assert.match(api, /downgradeDemand/, 'Demand API wrapper should downgrade demand priority');
assert.match(api, /restoreDemand/, 'Demand API wrapper should restore closed demands');

const types = readSource('types/index.ts');
assert.match(types, /interface RecruitmentDemand/, 'Shared types should expose RecruitmentDemand');
assert.match(types, /business_review_count/, 'Demand metrics should expose business feedback backlog');

const page = readSource('features/demands/pages/DemandsPage.tsx');
const form = readSource('features/demands/components/DemandForm.tsx');
const filters = readSource('features/demands/components/DemandFilters.tsx');
const table = readSource('features/demands/components/DemandTable.tsx');
const recruitmentTabs = readSource('components/recruitment/RecruitmentManagementTabs.tsx');
assert.match(page, /招聘需求/, 'Demand page should identify the concrete recruitment unit');
assert.match(page, /RecruitmentManagementTabs/, 'Demand page should reuse the shared recruitment tabs');
assert.match(recruitmentTabs, /用人需求/, 'Recruitment tabs should expose the demand tab label');
assert.doesNotMatch(recruitmentTabs, /岗位画像/, 'Job templates should remain a contextual capability');
assert.match(recruitmentTabs, /人才地图/, 'The real talent map should be reachable from recruitment tabs');
assert.match(form, /提需求日期/, 'Demand form should capture when business raised the request');
assert.match(form, /HR 接手日期/, 'Demand form may capture when HR accepted the request');
assert.match(filters, /最新创建在前/, 'Demand list should default to newest-first sorting');
assert.match(table, /<table/, 'Demand list should be a scannable table rather than cards');
assert.match(table, /kind: 'stage'/, 'Demand metrics should drill into scoped candidates without leaving the list');
