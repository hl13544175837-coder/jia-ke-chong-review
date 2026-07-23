import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(srcRoot, path), 'utf8');

const pipelinePage = read('pages/PipelinePage.tsx');
const candidatePanel = read('components/pipeline/PipelineCandidatePanel.tsx');
const addToPipeline = read('components/pipeline/AddToPipeline.tsx');

assert.match(pipelinePage, /showAddToPipeline/, 'Adding candidates should open without leaving the current demand');
assert.match(pipelinePage, /添加候选人/, 'Interview management should expose the add-candidate action');
assert.match(
  pipelinePage,
  /HeaderFilter[\s\S]*候选人[\s\S]*应聘岗位[\s\S]*城市[\s\S]*部门[\s\S]*面试轮次[\s\S]*面试安排[\s\S]*操作/,
  'Every visible table filter should be interactive',
);
assert.match(pipelinePage, /InterviewAdjustModal/, 'Scheduling and cancellation should use a scrollable modal');
assert.match(pipelinePage, /cancelInterviewAssignment/, 'Cancel interview should call the real endpoint');
assert.match(pipelinePage, /CandidateFlowDrawer/, 'View flow should open an in-context drawer');
assert.match(pipelinePage, /<PipelineCandidatePanel/, 'The drawer should expose real workflow actions');
assert.match(pipelinePage, /candidate\.stage !== 'interview'[\s\S]*等待流程推进/, 'Pre-interview candidates must not be schedulable');
assert.doesNotMatch(
  pipelinePage,
  /更多操作已打开|已切换到日历视图预览|处理结果入口已打开|已发送反馈提醒|已记录面试完成|已记录面试未进行/,
  'Ordinary clicks must not use placeholder success messages',
);

assert.match(candidatePanel, /业务通过，去安排面试/, 'Business approval should enter interview scheduling');
assert.match(candidatePanel, /业务不通过：不合适/, 'Business rejection should use the confirmed reason');
assert.match(candidatePanel, /api\.transferPipeline/, 'Cross-demand transfer should call its transactional endpoint');
assert.match(addToPipeline, /onClose\?:/, 'The add-candidate panel should remain dismissible');
