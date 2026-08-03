import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => {
  const target = path.join(root, file);
  return existsSync(target) ? readFileSync(target, 'utf8') : '';
};

const types = read('src/features/interviews/types.ts');
const api = read('src/features/interviews/api.ts');
const interviewerPage = read('src/pages/interviewer/interviews/page.tsx');
const interviewerDrawer = read('src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx');
const requestModal = read('src/pages/interviewer/interviews/components/RescheduleRequestModal.tsx');
const recruiterPage = `${read('src/pages/interviews/page.tsx')}\n${read('src/features/interviews/components/RecruiterInterviewOverlays.tsx')}`;
const recruiterPanel = read('src/pages/interviews/components/RescheduleRequestPanel.tsx');
const scheduleModal = read('src/features/interviews/components/ScheduleInterviewModal.tsx');
const router = read('src/router/config.tsx');

test('本地接口类型覆盖申请、处理、历史和取消后替代任务', () => {
  assert.match(types, /interface InterviewRescheduleRequest/);
  assert.match(types, /'pending'\s*\|\s*'approved'\s*\|\s*'rejected'\s*\|\s*'waiting_reassignment'\s*\|\s*'resolved'/);
  assert.match(api, /requestReschedule\(/);
  assert.match(api, /listRescheduleHistory\(/);
  assert.match(api, /processRescheduleRequest\(/);
  assert.match(api, /createReplacementAssignment\(/);
  assert.match(api, /reschedule-requests/);
});

test('面试官在现有详情里申请改约，待确认时原安排仍然有效', () => {
  assert.notEqual(requestModal, '', '缺少面试官改约弹窗');
  assert.match(requestModal, /申请改约/);
  assert.match(requestModal, /改约原因/);
  assert.match(requestModal, /建议时间 1/);
  assert.match(requestModal, /建议时间 2/);
  assert.match(requestModal, /proposed_times/);
  assert.match(requestModal, /minimumInterviewTime/);
  assert.match(interviewerDrawer, /申请改约/);
  assert.match(interviewerDrawer, /当前安排仍然有效/);
  assert.match(interviewerDrawer, /排期变更记录/);
  assert.match(interviewerPage, /interviewsApi\.requestReschedule/);
  assert.match(interviewerPage, /RescheduleRequestModal/);
});

test('招聘专员在现有面试详情处理，不新增改约页面', () => {
  assert.notEqual(recruiterPanel, '', '缺少招聘专员改约处理面板');
  assert.match(recruiterPanel, /待确认的改约申请/);
  assert.match(recruiterPanel, /按建议时间调整/);
  assert.match(recruiterPanel, /拒绝申请/);
  assert.match(recruiterPanel, /取消并等待重新安排/);
  assert.match(recruiterPage, /processRescheduleRequest/);
  assert.match(recruiterPage, /waiting_reassignment/);
  assert.match(recruiterPage, /createReplacementAssignment/);
  assert.doesNotMatch(router, /reschedule/i);
});

test('招聘专员直接调整必须填写原因并继续使用原排期弹窗', () => {
  assert.match(scheduleModal, /调整原因/);
  assert.match(scheduleModal, /change_reason/);
  assert.match(scheduleModal, /editing[\s\S]*changeReason\.trim\(\)/);
  assert.match(recruiterPage, /<ScheduleInterviewModal/);
  assert.match(recruiterPage, /rescheduleRequestId/);
});

test('弹窗和抽屉均有关闭保护，避免残留遮罩阻断其他页面', () => {
  assert.match(requestModal, /role="dialog"/);
  assert.match(requestModal, /aria-modal="true"/);
  assert.match(requestModal, /onMouseDown=\{saving \? undefined : onClose\}/);
  assert.match(interviewerPage, /escapeDisabled=\{feedbackAssignment !== null \|\| rescheduleAssignment !== null\}/);
});
