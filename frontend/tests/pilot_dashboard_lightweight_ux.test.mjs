import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const dashboardPage = readSource('pages/DashboardPage.tsx');
const biPage = readSource('pages/BiPage.tsx');
const types = readSource('types/index.ts');
const pipelinePanel = readSource('components/pipeline/PipelineCandidatePanel.tsx');

assert.match(
  types,
  /performance\??:\s*BiStaffMember/,
  'Personal BI detail should expose the same public performance row used by manager BI',
);
assert.match(
  dashboardPage,
  /我的招聘进度/,
  'Recruiter dashboard should frame personal metrics as operational progress',
);
assert.doesNotMatch(
  dashboardPage,
  /我的本月业绩/,
  'Phase-one BI must not present operational data as formal performance',
);
assert.match(
  dashboardPage,
  /今日待办/,
  'Recruiter dashboard should show a lightweight daily follow-up panel',
);
assert.match(
  dashboardPage,
  /stats\.performance/,
  'Recruiter dashboard should consume the personal BI performance payload',
);
assert.match(
  dashboardPage,
  /feedback_pending/,
  'Recruiter dashboard should surface pending interview feedback as an urgent follow-up',
);
assert.match(
  dashboardPage,
  /推荐成功面试/,
  'Recruiter dashboard should use the generic interview-entry metric',
);
assert.doesNotMatch(
  biPage,
  /怎么看数据|指标口径|协同归属/,
  'BI header should stay focused on dashboard controls instead of carrying an extra reading-help entry',
);
assert.match(
  biPage,
  /选择招聘需求/,
  'BI page should use a concrete demand selector as its primary control',
);
assert.match(
  biPage,
  /Offer/,
  'BI page should still expose Offer metrics',
);
assert.match(
  biPage,
  /已入职/,
  'BI page should still expose onboarded metrics',
);
assert.doesNotMatch(
  biPage,
  /HR 绩效|团队均转化率/,
  'BI page should no longer present personal performance comparisons',
);
assert.match(
  pipelinePanel,
  /主流程状态/,
  'Candidate pipeline panel should remind users that interview details live outside the main stage flow',
);
