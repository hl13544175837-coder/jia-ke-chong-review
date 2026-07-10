import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const sharedApi = readSource('lib/api.ts');
const demandApi = readSource('features/demands/api.ts');
const types = readSource('types/index.ts');
const page = readSource('features/demands/pages/DemandsPage.tsx');
const dashboard = readSource('pages/DashboardPage.tsx');

assert.match(
  sharedApi,
  /reassignDemandOwner[\s\S]*method:\s*'PATCH'/,
  'Shared API should expose the dedicated demand owner transfer command',
);
assert.match(
  demandApi,
  /reassignDemandOwner/,
  'Demand feature API should expose owner transfer without using generic update',
);
assert.match(types, /interface DemandOwnerTransferInput/, 'Types should model the owner transfer command');
assert.match(types, /close_reason:\s*string/, 'Closing a demand should require a reason at the type boundary');
assert.match(types, /downgrade_reason:\s*string/, 'Priority changes should require a reason at the type boundary');
assert.match(types, /interface DemandRestoreInput[\s\S]*note:\s*string/, 'Restoring should require a reason');

assert.match(page, /useAuth/, 'Demand page should read the current role');
assert.match(page, /listCandidateOwners/, 'Managers should load same-org active recruiter options');
assert.match(page, /role === 'manager'[\s\S]*role === 'admin'/, 'Only managers and admins should get transfer controls');
assert.match(page, /转派负责人/, 'Demand cards should expose an explicit owner transfer action');
assert.match(page, /当前负责人/, 'Demand cards should show who currently owns the demand');
assert.match(page, /reassignDemandOwner/, 'Demand page should call the dedicated owner transfer command');
assert.match(page, /downgradeDemand/, 'Priority changes should call the dedicated command endpoint');

assert.match(dashboard, /近 30 天当前负责盘子/, 'Recruiter BI should be labeled as a current ownership view');
assert.doesNotMatch(dashboard, /我的本月业绩/, 'Dashboard must not claim current-owner BI is historical monthly performance');
