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
  'components/pipeline/RejectionDispositionForm.tsx',
  'components/pipeline/OfferDrawer.tsx',
  'components/interviewRecords/InterviewAssignmentPanel.tsx',
  'components/interviewRecords/MyInterviewsPanel.tsx',
  'components/interview/InterviewGuidePanel.tsx',
  'components/candidate/DecisionSummaryPanel.tsx',
  'pages/PublicInterviewAccessPage.tsx',
].forEach((path) => {
  assert.ok(existsSync(join(srcRoot, path)), `${path} should exist`);
});

const uploadPage = readSource('pages/UploadPage.tsx');
assert.match(uploadPage, /来源信息/);
assert.match(uploadPage, /source_channel/);
assert.doesNotMatch(uploadPage, /target_job_id/);
assert.doesNotMatch(uploadPage, /上传批次/);

const candidatesPage = readSource('features/candidates/pages/CandidatesPage.tsx');
assert.match(candidatesPage, /来源渠道/);
assert.match(candidatesPage, /目标岗位/);

const candidateProfile = readSource('features/candidates/pages/CandidateProfilePage.tsx');
assert.match(candidateProfile, /来源信息/);
assert.match(candidateProfile, /招聘进展/);

const candidateCard = readSource('components/pipeline/CandidateCard.tsx');
assert.match(candidateCard, /RejectionDispositionForm/);
assert.match(candidateCard, /OfferDrawer/);
assert.match(candidateCard, /Offer 信息/);

const api = readSource('lib/api.ts');
assert.match(api, /saveOfferRecord/);
assert.match(api, /getOfferRecord/);
assert.match(api, /createInterviewAssignment/);
assert.match(api, /cancelInterviewAssignment/);
assert.match(api, /listInterviewAssignments/);
assert.match(api, /listInterviewers/);
assert.match(api, /getInterviewGuide/);
assert.match(api, /respondInterviewAssignment/);
assert.match(api, /retryInterviewAssignmentNotification/);
assert.match(api, /getPublicInterviewAccess/);
assert.match(api, /submitPublicInterviewFeedback/);
assert.match(api, /includeAuth:\s*false/);

const interviewPage = readSource('pages/InterviewListPage.tsx');
assert.match(interviewPage, /InterviewAssignmentPanel/);
assert.match(interviewPage, /MyInterviewsPanel/);
assert.match(interviewPage, /InterviewGuidePanel/);
assert.match(interviewPage, /api\.listInterviewAssignments/);

const assignmentPanel = readSource('components/interviewRecords/InterviewAssignmentPanel.tsx');
assert.match(assignmentPanel, /安排面试/);
assert.match(assignmentPanel, /面试官/);
assert.match(assignmentPanel, /会议链接/);
assert.match(assignmentPanel, /取消安排/);
assert.match(assignmentPanel, /api\.cancelInterviewAssignment/);
assert.match(assignmentPanel, /企微通知已发送/);
assert.match(assignmentPanel, /重发企微通知/);
assert.match(assignmentPanel, /response_reason/);

const myInterviewsPanel = readSource('components/interviewRecords/MyInterviewsPanel.tsx');
assert.match(myInterviewsPanel, /我的面试/);
assert.match(myInterviewsPanel, /超时待反馈/);
assert.match(myInterviewsPanel, /确认参加/);
assert.match(myInterviewsPanel, /无法参加/);
assert.match(myInterviewsPanel, /response_status === 'accepted'/);

const publicInterviewAccess = readSource('pages/PublicInterviewAccessPage.tsx');
assert.match(publicInterviewAccess, /此链接仅能处理这一条面试任务/);
assert.match(publicInterviewAccess, /api\.respondPublicInterviewAccess/);
assert.match(publicInterviewAccess, /api\.submitPublicInterviewFeedback/);
assert.match(publicInterviewAccess, /填写评分和评价/);

const app = readSource('App.tsx');
assert.match(app, /path="\/interview-access" element=\{<PublicInterviewAccessPage \/>\}/);

const packageJson = readFileSync(join(__dirname, '../package.json'), 'utf8');
assert.match(packageJson, /@rolldown\/binding-linux-x64-musl/);
assert.match(packageJson, /lightningcss-linux-x64-musl/);

const feedbackForm = readSource('components/interview/FeedbackForm.tsx');
assert.match(feedbackForm, /评价维度/);
assert.match(feedbackForm, /专业能力/);
assert.match(feedbackForm, /evaluation/);

const guidePanel = readSource('components/interview/InterviewGuidePanel.tsx');
assert.match(guidePanel, /追问参考/);
assert.match(guidePanel, /建议追问/);

const progress = readSource('components/candidate/PipelineProgress.tsx');
assert.match(progress, /DecisionSummaryPanel/);
assert.match(progress, /InterviewGuidePanel/);
