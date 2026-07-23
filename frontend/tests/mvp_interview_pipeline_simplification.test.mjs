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
const stages = readSource('lib/pipelineStages.ts');
const insights = readSource('lib/pipelineInsights.ts');
const feedbackForm = readSource('components/interview/FeedbackForm.tsx');
const biPage = readSource('pages/BiPage.tsx');
const pipelinePage = readSource('pages/PipelinePage.tsx');

assert.match(types, /'interview'/, 'PipelineStage should include the single MVP interview stage');
assert.match(stages, /key:\s*'interview'[\s\S]*label:\s*'面试中'/, 'Pipeline stages should expose 面试中 as the main flow stage');
assert.doesNotMatch(stages, /key:\s*'interview_first'/, 'Main pipeline stages should not expose 一面 as a primary stage');
assert.doesNotMatch(stages, /key:\s*'interview_second'/, 'Main pipeline stages should not expose 二面 as a primary stage');
assert.doesNotMatch(stages, /key:\s*'interview_final'/, 'Main pipeline stages should not expose 终面 as a primary stage');

assert.match(insights, /business_review:\s*'interview'/, 'Business feedback should advance into the generic interview stage');
assert.match(insights, /interview:\s*'offer'/, 'The main next step from 面试中 should be Offer');

assert.match(feedbackForm, /round_1/, 'Interview feedback should keep concrete round records outside the main pipeline');
assert.match(feedbackForm, /一面/, 'Interview feedback should expose the approved first-round label');
assert.match(feedbackForm, /二面/, 'Interview feedback should expose the approved second-round label');
assert.match(feedbackForm, /终面/, 'Interview feedback should expose the approved final-round label');
assert.doesNotMatch(
  feedbackForm.match(/const ROUNDS[\s\S]*?\];/)?.[0] ?? '',
  /technical|business|hr/,
  'New feedback tasks should not expose legacy ad-hoc round categories',
);
assert.doesNotMatch(feedbackForm, /提交并推进 Offer/, 'Feedback should not silently combine round completion with the HR Offer decision');
assert.match(feedbackForm, /待 HR 确认下一步/, 'Primary feedback should explicitly return the next decision to HR');
assert.doesNotMatch(feedbackForm, /interview_second/, 'Feedback form should not force a passed first interview into a second interview');

assert.match(biPage, /发起 Offer/, 'The former BI page should now be the Offer management workspace');
assert.match(biPage, /待提交[\s\S]*审批中[\s\S]*待发放[\s\S]*待回复[\s\S]*待入职/, 'Offer management should show the Offer workflow states');
assert.doesNotMatch(biPage, /一面通过/, 'BI should not use fixed first-interview pass as a top-level KPI');
assert.doesNotMatch(biPage, /二面通过/, 'BI should not use fixed second-interview pass as a top-level KPI');

assert.match(
  pipelinePage,
  /面试管理[\s\S]*安排面试[\s\S]*调整面试/,
  'Pipeline page should now focus on the interview management workbench',
);
