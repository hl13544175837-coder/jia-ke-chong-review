import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

[
  'components/interviewRecords/InterviewSummary.tsx',
  'components/interviewRecords/InterviewFilters.tsx',
  'components/interviewRecords/InterviewRecordsTable.tsx',
  'components/interviewRecords/InterviewRecordDrawer.tsx',
  'components/interviewRecords/PendingFeedbackPanel.tsx',
  'lib/interviewRecords.ts',
].forEach((path) => {
  assert.ok(existsSync(join(srcRoot, path)), `${path} should exist`);
});

const page = readSource('pages/InterviewListPage.tsx');
const nav = readSource('lib/nav.ts');
const workspace = readSource('lib/interviewRecords.ts');
const pendingPanel = readSource('components/interviewRecords/PendingFeedbackPanel.tsx');
const feedbackForm = readSource('components/interview/FeedbackForm.tsx');

assert.match(
  page,
  /useAuth/,
  'Interview records workspace should adapt its default view to the logged-in role',
);

assert.match(
  page,
  /api\.getDemandPipelineBoard/,
  'Interview records workspace should derive pending feedback from demand-scoped pipeline boards',
);

assert.match(
  workspace,
  /buildAssignedPendingFeedback/,
  'Interview workspace should derive interviewer pending feedback from real interview assignments',
);

assert.match(
  page,
  /buildAssignedPendingFeedback/,
  'Interview page should use assignment-based pending work for interviewer accounts',
);

assert.match(
  page,
  /role === 'interviewer'/,
  'Interview page should keep interviewer pending feedback scoped to assigned interviews',
);

assert.match(
  page,
  /PendingFeedbackPanel/,
  'Interview records workspace should show candidates in interview stages that still need feedback',
);

assert.match(
  page,
  /InterviewRecordDrawer/,
  'Interview records workspace should expose record details without leaving the page',
);

assert.match(
  nav,
  /label:\s*'我的面试'[\s\S]*roles:\s*\['interviewer'\]/,
  'Interviewers should see a personal interview inbox label without exposing a broad HR workbench',
);

assert.match(
  page,
  /FeedbackForm/,
  'Interview workspace should let users fill feedback directly from pending interview work',
);

assert.match(
  page,
  /selectedPending/,
  'Interview workspace should keep the selected pending interview in local state',
);

assert.match(
  page,
  /initialRound=\{selectedPending\.round\}/,
  'Inline feedback should default to the candidate current interview round',
);

assert.match(
  pendingPanel,
  /onStartFeedback/,
  'Pending feedback panel should expose a direct feedback action instead of only linking to the pipeline',
);

assert.match(
  pendingPanel,
  /填写反馈/,
  'Pending feedback cards should provide a visible direct feedback action',
);

assert.match(
  pendingPanel,
  /canOpenPipeline\??:\s*boolean/,
  'Pending feedback cards should know whether the current role may open the candidate pipeline',
);

assert.match(
  pendingPanel,
  /canOpenPipeline[\s\S]*`\/kanban\?demand=\$\{item\.demand_id\}&candidate=\$\{item\.candidate_id\}`[\s\S]*`\/candidates\/\$\{item\.candidate_id\}`/,
  'Pending feedback cards should preserve demand context while sending interviewers to candidate detail',
);

assert.match(
  page,
  /canOpenPipeline=\{!isInterviewer\}/,
  'Interview page should only expose pipeline links to roles that can open the pipeline',
);

assert.match(
  feedbackForm,
  /initialRound/,
  'Feedback form should accept an initial round from the current pipeline stage',
);

assert.match(
  feedbackForm,
  /demand_id:\s*demandId/,
  'Feedback form should submit feedback in the selected recruitment demand',
);

assert.doesNotMatch(
  feedbackForm,
  /api\.movePipeline/,
  'Feedback form must not advance the candidate automatically',
);

assert.doesNotMatch(
  feedbackForm,
  /提交并推进|提交并淘汰/,
  'Feedback form should leave advance or rejection to HR after feedback',
);

const filters = readSource('components/interviewRecords/InterviewFilters.tsx');
assert.match(filters, /候选人/);
assert.match(filters, /招聘需求/);
assert.match(filters, /面试官/);
assert.match(filters, /结果/);
assert.match(filters, /近 7 天/);
