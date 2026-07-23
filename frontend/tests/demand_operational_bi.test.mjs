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
  'The Offer page should still sync visible demands newest first for context',
);
assert.doesNotMatch(
  biPage,
  /api\.biOverview|api\.biStaff|HR 绩效|团队均转化率/,
  'The Offer workspace should not use personal performance comparison modules',
);
assert.doesNotMatch(biPage, /<h1[\s\S]*Offer 管理|管理 Offer 审批、发放与候选人回复/, 'Offer management should not keep redundant page title copy');
assert.match(biPage, /STATUS_TABS[\s\S]*待提交[\s\S]*审批中[\s\S]*待发放[\s\S]*待回复[\s\S]*待入职[\s\S]*已结束/, 'Offer status tabs should mirror the management flow');
assert.match(biPage, /MOCK_OFFERS/, 'Offer management should include demo data for presentation');
assert.match(biPage, /发起 Offer/, 'Offer management should expose a create action');
assert.match(biPage, /OfferHeaderFilter[\s\S]*候选人[\s\S]*应聘岗位[\s\S]*薪酬 \/ 入职日期[\s\S]*当前进度[\s\S]*最新动态/, 'Offer table headers should open filter menus');
assert.match(biPage, /to=\{`\/candidates\/\$\{row\.candidateId\}`\}/, 'Offer candidate names should link to candidate profiles');
assert.match(
  biPage,
  /候选人[\s\S]*应聘岗位[\s\S]*薪酬 \/ 入职日期[\s\S]*当前进度[\s\S]*最新动态[\s\S]*操作/,
  'Offer management should render the requested table columns',
);
