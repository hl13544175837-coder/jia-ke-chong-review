import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(srcRoot, path), 'utf8');

const types = read('types/index.ts');
const demandsPage = read('features/demands/pages/DemandsPage.tsx');
const createModal = read('features/demands/components/DemandCreateModal.tsx');
const demandDetail = read('features/demands/pages/DemandDetailPage.tsx');

assert.match(
  types,
  /interface RecruitmentDemand[\s\S]*default_interviewer_id:\s*number\s*\|\s*null;[\s\S]*default_interviewer_name:\s*string\s*\|\s*null;/,
  'Demand payloads should expose the saved business owner account',
);
assert.match(
  types,
  /interface RecruitmentDemandInput[\s\S]*default_interviewer_id\?:\s*number\s*\|\s*null;/,
  'Demand creation should submit the selected internal account ID',
);
assert.match(demandsPage, /api\.listInterviewers\(\)/, 'The demand page should load eligible internal interviewers');
assert.match(
  demandsPage,
  /interviewers=\{interviewers\.data\s*\?\?\s*\[\]\}/,
  'The create modal should receive the loaded interviewer options',
);
assert.match(
  demandsPage,
  /optionError=\{\(owners\.error \|\| interviewers\.error\)\?\.message \?\? null\}/,
  'Option failures must remain distinguishable from an empty list',
);
assert.match(
  demandsPage,
  /onReloadOptions=\{\(\) => \{[\s\S]*owners\.reload\(\);[\s\S]*interviewers\.reload\(\);/,
  'A failed option request should expose a real retry action',
);

assert.match(createModal, /用人负责人（默认面试官）/, 'The confirmed unified business role name should be visible');
assert.match(
  createModal,
  /if \(!selectedInterviewer\) errors\.default_interviewer_id = '请选择用人负责人'/,
  'A demand cannot be created without its business owner',
);
assert.match(
  createModal,
  /default_interviewer_id:\s*selectedInterviewer\.id[\s\S]*hiring_manager_name:\s*selectedInterviewer\.name/,
  'The account ID and display name must come from the same selected person',
);
assert.match(createModal, /ErrorState message=\{optionError\} onRetry=\{onReloadOptions\}/, 'The modal should retry failed options in place');
assert.doesNotMatch(createModal, /default_interviewer_id:\s*\d+/, 'The business owner must never be hard-coded');
assert.match(demandDetail, /用人负责人（默认面试官）/, 'Demand detail should use the same confirmed role name');
