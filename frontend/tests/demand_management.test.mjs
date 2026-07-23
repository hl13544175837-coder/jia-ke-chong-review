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
  /topLevelPaths:\s*\[['"]\/demands['"]\]/,
  'Only recruitment demands should occupy the top-level recruitment entry',
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
const createModal = readSource('features/demands/components/DemandCreateModal.tsx');
const candidateModal = readSource('features/demands/components/CandidateSelectionModal.tsx');
const recruitmentTabs = readSource('components/recruitment/RecruitmentManagementTabs.tsx');
assert.match(page, /招聘需求/, 'Demand page should identify the concrete recruitment unit');
assert.doesNotMatch(page, /RecruitmentManagementTabs/, 'Demand page should remove the old recruitment tab strip');
assert.match(page, /STATUS_TABS/, 'Demand page should expose the new status toolbar');
assert.match(page, /DemandCreateModal/, 'Demand page should create demands through a modal');
assert.match(page, /CandidateSelectionModal/, 'Demand page should select candidates through a modal');
assert.match(recruitmentTabs, /用人需求/, 'Recruitment tabs should expose the demand tab label');
assert.doesNotMatch(recruitmentTabs, /岗位画像|人才地图/, 'Template and placeholder modules should not occupy trial tabs');
assert.match(form, /提需求日期/, 'Demand form should capture when business raised the request');
assert.match(form, /HR 接手日期/, 'Demand form may capture when HR accepted the request');
assert.match(filters, /最新创建在前/, 'Demand list should default to newest-first sorting');
assert.match(table, /<table/, 'Demand list should be a scannable table rather than cards');
assert.match(table, /demand=\$\{demand\.id\}/, 'Demand metrics should drill into scoped candidates');
assert.match(table, /onSelectCandidates/, 'Demand rows should open candidate selection directly');
assert.match(createModal, /job_title/, 'Create-demand modal should support direct job-title input instead of only existing templates');
assert.match(createModal, /jd_text/, 'Create-demand modal should submit a JD text body');
assert.match(candidateModal, /searchCandidates/, 'Candidate selection modal should use real resume-library data');
assert.match(candidateModal, /uploadResumes/, 'Candidate selection modal should open file import and upload resumes');
assert.match(candidateModal, /更多筛选/, 'Candidate selection modal should expose expanded filters');
