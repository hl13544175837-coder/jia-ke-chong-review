import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const candidateModal = readSource('features/demands/components/CandidateSelectionModal.tsx');
const demandCreateModal = readSource('features/demands/components/DemandCreateModal.tsx');
const demandDetailPage = readSource('features/demands/pages/DemandDetailPage.tsx');
const demandTable = readSource('features/demands/components/DemandTable.tsx');
const demandsPage = readSource('features/demands/pages/DemandsPage.tsx');
const pipelinePage = readSource('pages/PipelinePage.tsx');
const pipelineCandidatePanel = readSource('components/pipeline/PipelineCandidatePanel.tsx');
const pipelineInsights = readSource('lib/pipelineInsights.ts');

assert.match(candidateModal, /提交业务评审/, 'Candidate selection should expose the business-review branch');
assert.match(candidateModal, /线下已通过，去安排面试/, 'Candidate selection should expose the offline-pass shortcut');
assert.match(candidateModal, /线下确认方式/, 'Offline pass should collect how the review was confirmed');
assert.match(candidateModal, /offlineReviewMethod/, 'Offline pass should persist its confirmation context');
assert.match(candidateModal, /仅加入岗位人选池/, 'Candidate selection should keep a no-review holding action');
assert.match(candidateModal, /business_review/, 'Business-review action should persist the real pipeline stage');
assert.match(candidateModal, /stage:\s*'interview'/, 'Offline pass should persist the interview stage');
assert.doesNotMatch(candidateModal, /stageMock|isDemoDemand/, 'Candidate selection must not invent stage or demo behavior');
assert.doesNotMatch(candidateModal, /张敏|李华/, 'Candidate filters must not hard-code owner names');
assert.doesNotMatch(candidateModal, /MoreVertical/, 'Candidate rows must not show a dead more-actions button');

assert.match(demandCreateModal, /用人负责人（默认面试官）/, 'Demand creation should use the confirmed business role name');
assert.match(demandCreateModal, /selectedInterviewer/, 'Demand creation should derive the owner name from the selected interviewer');
assert.match(demandDetailPage, /用人负责人（默认面试官）/, 'Demand detail should present the confirmed single business role');
assert.doesNotMatch(demandDetailPage, /RecruitmentManagementTabs/, 'A single demand view should not render a redundant tab strip');
assert.doesNotMatch(demandTable, /MoreHorizontal/, 'Demand rows must not show a dead more-actions button');
assert.match(demandsPage, /query\.stage_focus/, 'Stage filtering must trigger a real demand-list reload');

assert.doesNotMatch(pipelinePage, /DEMO_INTERVIEW_CANDIDATES|DEMO_ASSIGNMENTS/, 'Pipeline must show a real empty state instead of demo candidates');
assert.doesNotMatch(pipelinePage, /candidate\.candidate_id\s*%/, 'Candidate details must not be generated from an ID');
assert.doesNotMatch(pipelinePage, /已发送反馈提醒|已记录面试完成|已记录面试未进行/, 'Pipeline actions must not report fake success');
assert.match(pipelinePage, /cancelInterviewAssignment/, 'Interview cancellation should call the existing real endpoint');
assert.match(pipelinePage, /\/candidates\/\$\{candidate\.candidate_id\}/, 'Candidate names should open the real candidate detail');
assert.match(pipelinePage, /\/demands\/\$\{effectiveDemand\.id\}/, 'Job names should open the real demand detail');
assert.match(pipelinePage, /CandidateFlowDrawer/, 'View-flow actions should open a drawer without losing list filters');
assert.match(pipelinePage, /<PipelineCandidatePanel/, 'The flow drawer should use the real pipeline action panel');
assert.match(pipelinePage, /handleMoveCandidate[\s\S]*api\.movePipeline/, 'Flow updates should call the real pipeline endpoint');
assert.match(pipelinePage, /candidate\.stage !== 'interview'[\s\S]*等待流程推进/, 'Interview scheduling must stay unavailable before business approval');
assert.match(pipelinePage, /candidate\.stage === 'interview'[\s\S]*未进入面试/, 'Non-interview candidates must not be labeled as first-round interviews');
assert.match(pipelineCandidatePanel, /业务通过，去安排面试/, 'Business review should expose the confirmed pass action');
assert.match(pipelineCandidatePanel, /业务不通过：不合适/, 'Business rejection should persist the confirmed default reason');
assert.match(pipelineCandidatePanel, /stage === 'pending'[\s\S]*move\('business_review'\)[\s\S]*提交业务评审/, 'A pooled candidate should proceed directly to business review');
assert.match(pipelineCandidatePanel, /enter_talent_pool:\s*true/, 'A rejected candidate should remain available in the resume library');
assert.match(pipelineCandidatePanel, /api\.transferPipeline/, 'The flow drawer should keep the real cross-demand transfer action');
assert.doesNotMatch(pipelineCandidatePanel, /AI 建议/, 'Rule-based guidance must not be presented as AI output');
assert.match(pipelineInsights, /pending:\s*'business_review'/, 'All shared flow entry points should send pooled candidates to business review');
assert.doesNotMatch(pipelineInsights, /用人经理/, 'The confirmed business role name should be used consistently');
