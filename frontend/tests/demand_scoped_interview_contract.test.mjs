import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const types = readSource('types/index.ts');
const api = readSource('lib/api.ts');
const records = readSource('lib/interviewRecords.ts');
const page = readSource('pages/InterviewListPage.tsx');
const assignment = readSource('components/interviewRecords/InterviewAssignmentPanel.tsx');
const feedback = readSource('components/interview/FeedbackForm.tsx');
const guide = readSource('components/interview/InterviewGuidePanel.tsx');
const myInterviews = readSource('components/interviewRecords/MyInterviewsPanel.tsx');
const pending = readSource('components/interviewRecords/PendingFeedbackPanel.tsx');
const aiScreen = readSource('pages/InterviewsPage.tsx');

assert.match(
  types,
  /interface InterviewAssignment[\s\S]*?demand_id:\s*number\s*\|\s*null;[\s\S]*?round_sequence:\s*number;[\s\S]*?is_primary:\s*boolean;/,
  'Interview assignments should carry demand identity, round sequence, and primary-interviewer responsibility',
);
assert.match(
  types,
  /interface InterviewFeedbackInput[\s\S]*?demand_id:\s*number;[\s\S]*?assignment_id\?:\s*number;/,
  'New feedback writes should require a demand and may bind to the exact assignment',
);
assert.match(
  api,
  /getInterviewGuide\(candidateId:\s*number,\s*demandId:\s*number,[\s\S]*?demand_id=\$\{demandId\}/,
  'Interview guides should use demand_id rather than selecting a job template',
);
assert.match(
  api,
  /listInterviewAssignments\(query[\s\S]*?demand_id[\s\S]*?candidate_id/,
  'Assignment reads should support demand and candidate deep-link filters',
);

assert.match(page, /searchParams\.get\('demand'\)/, 'The interview inbox should consume demand deep links');
assert.match(page, /api\.getDemandPipelineBoard/, 'Pending work should be derived from demand-scoped boards');
assert.doesNotMatch(page, /api\.getPipelineBoard\(/, 'The new interview workspace must not aggregate sibling demands by job');
assert.match(page, /demandId=\{selectedPending\.demand_id\}/, 'Guide and feedback actions should receive the selected demand');

assert.match(assignment, /RecruitmentDemand/, 'Scheduling should present concrete recruitment demands');
assert.match(assignment, /label="\u62db\u8058\u9700\u6c42"/, 'Scheduling should label the business object as a recruitment demand');
assert.match(assignment, /demand_id:\s*did/, 'New interview assignments should write demand_id');
assert.match(assignment, /round_sequence:/, 'Round sequence should be persisted on the task');
assert.match(assignment, /is_primary:/, 'Primary or supporting interviewer responsibility should be explicit');
assert.match(assignment, /ROUND_SEQUENCE_BY_ROUND/, 'Selecting 一面/二面/终面 should keep its numeric round sequence aligned');
assert.doesNotMatch(assignment, /job_id:\s*jid/, 'New assignment writes should not be job-only');

assert.match(feedback, /demand_id:\s*demandId/, 'Feedback should be submitted to its recruitment demand');
assert.match(feedback, /assignment_id:\s*assignmentId/, 'Feedback should target the exact assigned task');
assert.doesNotMatch(feedback, /api\.movePipeline/, 'Feedback must never advance or reject the candidate');
assert.doesNotMatch(feedback, /\u63d0\u4ea4\u5e76\u63a8\u8fdb|\u63d0\u4ea4\u5e76\u6dd8\u6c70/, 'Feedback UI must not combine feedback with an HR decision');
assert.match(feedback, /\u5f85 HR \u786e\u8ba4\u4e0b\u4e00\u6b65/, 'Primary feedback should clearly hand the next decision back to HR');
assert.match(feedback, /本轮反馈建议/, 'The form should distinguish an interviewer recommendation from the HR workflow decision');
assert.doesNotMatch(feedback, /label="是否通过"/, 'The feedback field must not imply that it directly decides the candidate outcome');
assert.match(guide, /demandId/, 'Interview guide should receive demand context');

assert.match(myInterviews, /item\.is_primary/, 'My Interviews should identify primary versus supporting responsibility');
assert.match(myInterviews, /item\.round_sequence/, 'My Interviews should show the internal round sequence');
assert.match(records, /round_1', label: '一面'/, 'The first internal task should use the business label 一面');
assert.match(records, /round_2', label: '二面'/, 'The second internal task should use the business label 二面');
assert.match(records, /round_3', label: '终面'/, 'The third internal task should use the business label 终面');
assert.doesNotMatch(
  records.match(/INTERVIEW_ROUNDS[\s\S]*?\];/)?.[0] ?? '',
  /technical|business|hr|interview_first|interview_second|interview_final/,
  'New scheduling choices should stay to 一面/二面/终面/加面 while legacy round values remain read-compatible',
);
assert.match(pending, /\?demand=\$\{item\.demand_id\}/, 'Pending tasks should deep-link back to the exact demand pipeline');
assert.match(records, /demandId:/, 'Interview filters and pending work should be keyed by demand');

assert.match(aiScreen, /api\.listDemands/, 'AI pre-screen setup should select a recruitment demand');
assert.match(aiScreen, /demand_id:\s*demandId/, 'AI pre-screen writes should carry demand_id');
assert.doesNotMatch(aiScreen, /api\.listJobs\(/, 'AI pre-screen setup should not ask users to choose only a job template');
