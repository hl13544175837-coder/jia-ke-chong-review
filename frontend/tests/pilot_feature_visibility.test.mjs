import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const registry = readSource('app/featureRegistry.ts');
const tabs = readSource('components/recruitment/RecruitmentManagementTabs.tsx');
const demandsFeature = readSource('features/demands/index.ts');
const candidatesNav = readSource('features/candidates/nav.ts');
const nav = readSource('lib/nav.ts');
const dashboard = readSource('pages/DashboardPage.tsx');
const app = readSource('App.tsx');
const pilotEntrySources = [registry, tabs, demandsFeature, nav, dashboard, app].join('\n');

assert.doesNotMatch(
  registry,
  /bossFeature/,
  'BOSS should not be registered in the pilot navigation or route surface',
);
assert.match(
  candidatesNav,
  /to:\s*'\/talent-map'[\s\S]*label:\s*'人才地图'/,
  'Talent map should have a discoverable pilot entry',
);
assert.doesNotMatch(
  tabs,
  /(?:to:\s*'\/jobs'|label:\s*'岗位画像')/,
  'Job portraits should be contextual capability instead of a standalone recruitment tab',
);
assert.doesNotMatch(
  pilotEntrySources,
  /(?:to:\s*['"]\/oa(?:\/|['"])|path=['"]\/oa(?:\/|['"])|label:\s*['"]OA['"])/i,
  'OA should remain outside the pilot entry surface until it is usable',
);
assert.match(
  nav,
  /to:\s*'\/bi'[\s\S]*label:\s*'Offer 管理'/,
  'The former progress entry should be presented as Offer management in the pilot surface',
);
assert.match(
  dashboard,
  /不用于历史绩效、排名或奖金/,
  'Recruiter BI copy should state the phase-one non-performance boundary',
);
assert.doesNotMatch(
  pilotEntrySources,
  /(?:SHOW_BI|BI_ENABLED|VITE_[A-Z0-9_]*BI)/,
  'Pilot BI visibility must not be controlled by a temporary frontend global switch',
);
