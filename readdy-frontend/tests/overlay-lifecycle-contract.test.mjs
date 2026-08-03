import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const hookPath = 'src/components/ui/useOverlayLifecycle.ts';
const coreOverlays = [
  'src/components/feature/ResumeUploadModal.tsx',
  'src/components/ui/ReadOnlyDetailDrawer.tsx',
  'src/features/interviews/components/ScheduleInterviewModal.tsx',
  'src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx',
  'src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx',
  'src/pages/interviewer/interviews/components/RescheduleRequestModal.tsx',
  'src/pages/offers/components/OfferDetailDrawer.tsx',
  'src/pages/offers/components/CreateOfferModal.tsx',
];

test('公共弹层生命周期统一处理 Escape、背景滚动和焦点恢复', () => {
  assert.equal(existsSync(path.join(root, hookPath)), true, '缺少统一弹层生命周期');
  const hook = read(hookPath);

  assert.match(hook, /event\.key === 'Escape'/);
  assert.match(hook, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(hook, /previousOverflow/);
  assert.match(hook, /previousActiveElement/);
  assert.match(hook, /requestAnimationFrame/);
  assert.match(hook, /removeEventListener\('keydown'/);
});

test('核心弹窗和抽屉共用生命周期且不再各自注册 Escape 监听', () => {
  coreOverlays.forEach((file) => {
    const source = read(file);
    assert.match(source, /useOverlayLifecycle/, file);
    assert.doesNotMatch(source, /window\.addEventListener\('keydown'/, file);
    assert.match(source, /tabIndex=\{-1\}/, file);
  });
});

test('提交中的弹窗禁止通过 Escape 关闭，普通详情允许关闭', () => {
  const schedule = read('src/features/interviews/components/ScheduleInterviewModal.tsx');
  const feedback = read('src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx');
  const reschedule = read('src/pages/interviewer/interviews/components/RescheduleRequestModal.tsx');
  const createOffer = read('src/pages/offers/components/CreateOfferModal.tsx');
  const offerDetail = read('src/pages/offers/components/OfferDetailDrawer.tsx');
  const interviewerDetail = read('src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx');

  [schedule, feedback, reschedule, createOffer, offerDetail].forEach((source) => {
    assert.match(source, /canClose: ![a-zA-Z]+/);
  });
  assert.match(interviewerDetail, /canClose: !escapeDisabled/);
});
