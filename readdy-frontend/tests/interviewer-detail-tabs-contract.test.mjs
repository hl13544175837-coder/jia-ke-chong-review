import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const drawerPath = path.join(
  root,
  'src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx',
);
const drawerSource = fs.existsSync(drawerPath) ? fs.readFileSync(drawerPath, 'utf8') : '';
const pageSource = fs.readFileSync(
  path.join(root, 'src/pages/interviewer/interviews/page.tsx'),
  'utf8',
);
const journeySource = fs.readFileSync(
  path.join(root, 'src/components/candidates/CandidateJourneySummary.tsx'),
  'utf8',
);
const detailTabsSource = fs.readFileSync(
  path.join(root, 'src/features/candidates/components/CandidateDetailTabs.tsx'),
  'utf8',
);
const actionBarSource = fs.readFileSync(
  path.join(root, 'src/components/ui/DetailActionBar.tsx'),
  'utf8',
);

test('面试详情统一为面试信息、候选人简历和面试评价三个页签', () => {
  assert.notEqual(drawerSource, '', '详情抽屉组件尚未创建');
  const tabLabels = [...detailTabsSource.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(tabLabels, ['面试信息', '候选人简历', '面试评价']);
  assert.match(drawerSource, /CandidateDetailWorkspace/);
  assert.match(detailTabsSource, /role="tablist"/);
  assert.match(detailTabsSource, /role="tab"/);
  assert.match(detailTabsSource, /aria-selected=\{value === tab\.key\}/);
});

test('页签切换只改本地状态，不触发详情接口重新请求', () => {
  assert.match(drawerSource, /onChange=\{setActiveTab\}/);
  assert.match(detailTabsSource, /onClick=\{\(\) => onChange\(tab\.key\)\}/);
  assert.doesNotMatch(drawerSource, /candidatesApi|interviewsApi|demandsApi|businessReviewsApi/);
  assert.match(pageSource, /<InterviewerInterviewDetailDrawer/);
});

test('详情支持 Escape 和中文关闭按钮', () => {
  assert.match(drawerSource, /useOverlayLifecycle/);
  assert.match(drawerSource, /canClose: !escapeDisabled/);
  assert.match(drawerSource, /initialFocusRef: drawerRef/);
  assert.doesNotMatch(drawerSource, /window\.addEventListener\('keydown'/);
  assert.match(drawerSource, /aria-label="关闭面试详情"/);
  assert.match(pageSource, /escapeDisabled=\{feedbackAssignment !== null \|\| rescheduleAssignment !== null\}/);
});

test('面试官的面试评价页只显示获授权评价，不展示 Offer 和 HR 流程区块', () => {
  assert.match(drawerSource, /<CandidateJourneySummary journey=\{journey\} interviewOnly/);
  assert.match(journeySource, /interviewOnly/);
  assert.match(journeySource, /!interviewOnly/);
});

test('固定底部操作区只显示规定的任务动作', () => {
  assert.match(drawerSource, /data-ui="interview-detail-sticky-actions"/);
  assert.match(drawerSource, /DetailActionBar/);
  assert.match(actionBarSource, /sticky bottom-0/);
  const allowedActions = [
    '面试尚未开始',
    '确认已面试并填写评价',
    '填写评价',
    '修改评价',
  ];
  for (const action of allowedActions) assert.match(drawerSource, new RegExp(action));
  assert.doesNotMatch(drawerSource, /当前状态不可填写|请等待招聘专员确认/);
  assert.match(drawerSource, /if \(assignment\.feedback_submitted\) return '已完成'/);
});

test('历史轮次状态不显示后端英文值', () => {
  assert.match(journeySource, /item\.status === 'completed'/);
  assert.match(journeySource, /'已完成'/);
});

test('详情加载失败保留原错误并可重新加载', () => {
  assert.match(drawerSource, /detailError/);
  assert.match(drawerSource, /onRetry/);
  assert.match(drawerSource, />重新加载</);
  assert.match(pageSource, /onRetry=\{\(\) => void openDetail\(selected, false\)\}/);
});

test('页面接线保留确认面试、确认错误、结构化评价和评价隔离数据', () => {
  assert.match(pageSource, /confirmAndStartFeedback/);
  assert.match(pageSource, /confirmationError/);
  assert.match(pageSource, /SimpleFeedbackModal/);
  assert.match(pageSource, /selectedJourney/);
  assert.match(pageSource, /journeyError/);
  assert.match(pageSource, /onConfirmAndStartFeedback/);
  assert.match(pageSource, /onStartFeedback/);
});
