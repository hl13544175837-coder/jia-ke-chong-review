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

assert.match(
  types,
  /interface BiManagerAlert/,
  'BI overview should expose manager-facing action alerts in the shared API type',
);

assert.match(
  types,
  /alerts:\s*BiManagerAlert\[\]/,
  'BiOverview should include alerts so the dashboard can reuse the existing BI endpoint',
);

assert.match(
  types,
  /interviewer_id\?:\s*number\s*\|\s*null/,
  'Pending-feedback alerts should preserve the interviewer who must act',
);

assert.match(
  types,
  /interviewer_name\?:\s*string\s*\|\s*null/,
  'Pending-feedback alerts should preserve the interviewer display name',
);

assert.match(
  dashboard,
  /管理提醒/,
  'Manager dashboard should show a plain-language alerts section',
);

assert.match(
  dashboard,
  /action_path/,
  'Alerts should link managers directly to the workflow item that needs attention',
);

assert.match(
  dashboard,
  /stale_pipeline|pending_interview_feedback/,
  'Dashboard should understand stale pipeline and missing feedback alert types',
);

assert.match(
  dashboard,
  /no_active_candidates/,
  'Dashboard should explain an open demand whose candidates are all in terminal stages',
);

assert.match(
  dashboard,
  /demands[\s\S]*filter\(\(item\) =>[\s\S]*pending[\s\S]*active[\s\S]*reduce/,
  'Manager outstanding-feedback totals should exclude closed demand details',
);

assert.match(
  dashboard,
  /应补反馈面试官/,
  'Missing-feedback alerts should identify the interviewer who must submit feedback',
);

assert.match(
  dashboard,
  /协同负责人/,
  'Missing-feedback alerts should separately identify the Demand coordination owner',
);
