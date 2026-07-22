import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const biPage = readSource('pages/BiPage.tsx');
const types = readSource('types/index.ts');
const api = readSource('lib/api.ts');

assert.match(
  types,
  /interface BiDemandOperationalMetrics/,
  'The frontend should type the demand-scoped operational BI response',
);
assert.match(
  types,
  /purpose:\s*'operational_collaboration'/,
  'Demand BI should carry the non-performance purpose contract',
);
assert.match(
  types,
  /transferred\?:\s*number/,
  'Demand funnel should keep transferred separate from rejected',
);
assert.match(types, /stage_age:\s*BiDemandStageAge\[\]/, 'Demand BI should type stage-age facts');
assert.match(
  types,
  /outstanding_feedback:\s*BiDemandOutstandingFeedback/,
  'Demand BI should type outstanding interview feedback',
);
assert.match(types, /offers:\s*BiDemandOffers/, 'Demand BI should type Offer facts');
assert.match(types, /hc:\s*BiDemandHc/, 'Demand BI should type HC progress');
assert.match(
  types,
  /current_responsibility:\s*BiDemandCurrentResponsibility/,
  'Demand BI should type the current owner coordination view',
);

assert.match(
  api,
  /biDemand\(demandId:\s*number\):\s*Promise<BiDemandOperationalMetrics>[\s\S]*`\/bi\/demand\/\$\{demandId\}`/,
  'The API client should call GET /bi/demand/:id',
);
assert.match(
  biPage,
  /api\.listDemands\([\s\S]*created_at_desc/,
  'The BI page should load visible demands newest first for explicit selection',
);
assert.match(
  biPage,
  /api\.biDemand\(demandId\)/,
  'The BI page should read one selected demand instead of a job/team aggregate',
);
assert.match(biPage, /title="进度看板"/, 'The page should use the operational navigation name');
assert.match(biPage, /选择招聘需求/, 'The page should make the Demand selector explicit');
assert.match(
  biPage,
  /仅用于进度、卡点和当前责任协同，不用于绩效考核/,
  'The phase-one non-performance boundary should be visible',
);
assert.match(biPage, /已淘汰/, 'Rejected candidates should remain visible');
assert.match(biPage, /已转出/, 'Transferred candidates should be shown separately');
assert.match(
  biPage,
  /`\/kanban\?demand=\$\{demandId\}&stage=\$\{stage\.key\}`/,
  'Every funnel number should drill into the selected demand and stage',
);
assert.match(
  biPage,
  /`\/interviews\?demand=\$\{demandId\}`/,
  'Outstanding feedback should drill into demand-scoped interview tasks',
);
assert.match(biPage, /暂无招聘需求/, 'No-demand state should explain why no report is shown');
assert.match(
  biPage,
  /还没有候选人流程事实/,
  'A demand without facts should show guidance rather than zero KPI placeholders',
);
assert.doesNotMatch(
  biPage,
  /api\.biOverview|api\.biStaff|HR 绩效|团队均转化率/,
  'The demand BI workspace should stop using personal performance comparison modules',
);
