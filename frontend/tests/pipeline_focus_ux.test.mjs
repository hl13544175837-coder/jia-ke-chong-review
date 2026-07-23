import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const pipelinePage = readSource('pages/PipelinePage.tsx');
const addToPipeline = readSource('components/pipeline/AddToPipeline.tsx');

assert.doesNotMatch(
  pipelinePage,
  /查看流程说明/,
  'Interview management should not show the old explanatory disclosure at the top',
);

assert.match(
  pipelinePage,
  /showAddToPipeline/,
  'Pipeline page should gate the add-candidate panel behind a local disclosure state',
);

assert.match(
  pipelinePage,
  /添加候选人/,
  'Interview management should expose adding candidates from the demand workspace',
);

assert.match(
  pipelinePage,
  /HeaderFilter[\s\S]*候选人[\s\S]*应聘岗位[\s\S]*城市[\s\S]*部门[\s\S]*面试轮次[\s\S]*面试安排[\s\S]*操作/,
  'Interview management table should expose clickable header filters',
);

assert.match(
  pipelinePage,
  /InterviewAdjustModal/,
  'Interview management should open a modal for scheduling and adjusting interviews',
);

assert.match(
  pipelinePage,
  /管理流程[\s\S]*处理面试/,
  'Interview rows should expose workflow management and interview handling',
);
assert.match(
  pipelinePage,
  /PipelineCandidatePanel/,
  'Workflow management should reuse the server-backed candidate process panel',
);
assert.match(
  pipelinePage,
  /cancelInterviewAssignment/,
  'Interview cancellation should call the server-backed cancellation action',
);

assert.doesNotMatch(
  pipelinePage,
  /已发送反馈提醒|已记录面试完成|已记录面试未进行|更多操作已打开|已切换到日历视图预览|处理结果入口已打开/,
  'Interview management should not report success for actions that were not written to the backend',
);

assert.match(
  addToPipeline,
  /onClose\?:/,
  'Add-to-pipeline panel should remain dismissible after it is opened from the compact action',
);
