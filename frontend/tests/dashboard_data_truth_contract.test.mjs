import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const dashboard = readSource('pages/DashboardPage.tsx');
const types = readSource('types/index.ts');
const api = readSource('lib/api.ts');

assert.match(types, /interface BiOperationalWorkload/, 'Staff BI should type the current workload');
assert.match(types, /purpose:\s*'operational_collaboration'/, 'Dashboard BI types should carry purpose');
assert.match(types, /demands:\s*BiOverviewDemandSummary\[\]/, 'Overview should expose Demand rows');
assert.doesNotMatch(types, /interface BiStaffMember/, 'Retired personal performance types must be removed');

assert.match(dashboard, /errors:\s*DashboardErrors/, 'Dashboard hook should expose partition errors');
assert.match(dashboard, /reload:\s*\(\)\s*=>\s*void/, 'Dashboard hook should expose a retry action');
assert.match(dashboard, /数据暂不可用/, 'Failed sections should use an explicit unavailable state');
assert.match(dashboard, /重新加载/, 'Unavailable state should offer retry');
assert.match(dashboard, /loading=\{loading\}/, 'Section rendering should consume loading state');
assert.match(dashboard, /error=\{errors\.bi\}/, 'BI sections should receive the BI error state');
assert.match(dashboard, /biR\.status === 'rejected'/, 'Rejected BI requests must be recorded');
assert.match(dashboard, /candidatesR\.status === 'rejected'/, 'Rejected candidate requests must be recorded');
assert.doesNotMatch(dashboard, /RecruiterPerformancePanel|stats\.performance|conversionRate/, 'Dashboard must not revive performance/rate UI');
assert.match(dashboard, /当前工作盘子/, 'Recruiter metrics should be framed as current workload');
assert.match(dashboard, /不用于历史绩效/, 'Workload copy should state its non-performance boundary');

assert.match(api, /biOverview\(\):\s*Promise<BiOverview>/, 'Overview API should use the current contract without a days window');
assert.match(api, /biStaff\(hrId:\s*number\):\s*Promise<BiStaffDetail>/, 'Staff API should use the current workload contract');
