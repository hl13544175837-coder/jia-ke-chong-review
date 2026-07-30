import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('桌面端只读详情只遮内容区，保留左侧菜单和顶部账号区', () => {
  const layout = read('src/components/feature/MainLayout.tsx');
  const sources = [
    read('src/components/ui/ReadOnlyDetailDrawer.tsx'),
    read('src/pages/interviewer/screening/page.tsx'),
    read('src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx'),
    read('src/pages/kanban/page.tsx'),
  ];

  assert.match(layout, /--workspace-sidebar-width/);
  sources.forEach((source) => {
    assert.match(source, /workspace-detail-backdrop/);
    assert.match(source, /workspace-detail-panel/);
  });
});

test('只读详情不再声明为全屏模态框，真正提交弹窗仍保持模态', () => {
  const sharedDrawer = read('src/components/ui/ReadOnlyDetailDrawer.tsx');
  const screening = read('src/pages/interviewer/screening/page.tsx');
  const interviewDrawer = read('src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx');
  const feedbackModal = read('src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx');

  assert.doesNotMatch(sharedDrawer, /aria-modal="true"/);
  assert.doesNotMatch(screening, /aria-modal="true"/);
  assert.doesNotMatch(interviewDrawer, /aria-modal="true"/);
  assert.match(feedbackModal, /aria-modal="true"/);
});
