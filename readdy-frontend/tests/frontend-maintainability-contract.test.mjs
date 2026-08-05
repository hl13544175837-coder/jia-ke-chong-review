import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const lineCount = (file) => read(file).split('\n').length;
const CANDIDATE_WORKSPACE_CEILING = 600;

test('候选人工作台把筛选、列表、导入和详情拆到候选人业务模块', () => {
  const page = read('src/pages/candidates/page.tsx');
  const workspace = read('src/features/candidates/components/CandidateLibraryWorkspace.tsx');
  const controller = read('src/features/candidates/library/useCandidateLibraryController.tsx');
  const detail = read('src/features/candidates/components/library/CandidateLibraryDetail.tsx');
  const overlays = read('src/features/candidates/components/library/CandidateLibraryOverlays.tsx');
  read('src/features/candidates/library.ts');
  read('src/features/candidates/components/CandidateLibraryWorkspace.tsx');
  read('src/features/candidates/components/CandidateUploadModal.tsx');
  read('src/features/candidates/components/CandidateDetailDrawer.tsx');
  read('src/features/candidates/components/library/CandidateLibraryFilters.tsx');
  read('src/features/candidates/components/library/CandidateLibraryTable.tsx');
  read('src/features/candidates/components/library/CandidateLibraryBulkActions.tsx');
  read('src/features/candidates/components/library/CandidateLibraryPagination.tsx');
  read('src/features/candidates/components/library/CandidateLibraryDetail.tsx');
  read('src/features/candidates/components/library/CandidateLibraryOverlays.tsx');
  read('src/features/candidates/library/useCandidateLibraryController.tsx');
  read('src/features/candidates/library/useCandidateLibraryData.ts');
  read('src/features/candidates/library/useCandidateLibraryFilters.ts');
  read('src/features/candidates/library/useCandidateDetail.ts');
  read('src/features/candidates/library/useCandidateResumeUpload.ts');
  read('src/features/candidates/library/candidateLibraryViewModel.ts');

  assert.match(page, /CandidateLibraryWorkspace/);
  assert.match(workspace, /CandidateLibraryFilters/);
  assert.match(workspace, /CandidateLibraryTable/);
  assert.match(workspace, /CandidateLibraryDetail/);
  assert.match(workspace, /CandidateLibraryOverlays/);
  assert.match(overlays, /CandidateUploadModal/);
  assert.match(detail, /CandidateDetailDrawer/);
  assert.ok(lineCount('src/pages/candidates/page.tsx') < 1650);
  assert.ok(
    lineCount('src/features/candidates/components/CandidateLibraryWorkspace.tsx') < CANDIDATE_WORKSPACE_CEILING,
    '候选人工作台只负责组合，必须控制在 600 行以内',
  );
  for (const file of [
    'CandidateLibraryFilters.tsx',
    'CandidateLibraryTable.tsx',
    'CandidateLibraryBulkActions.tsx',
    'CandidateLibraryPagination.tsx',
    'CandidateLibraryDetail.tsx',
    'CandidateLibraryOverlays.tsx',
  ]) {
    assert.ok(
      lineCount(`src/features/candidates/components/library/${file}`) < 450,
      `${file} 不得重新长成难以维护的大文件`,
    );
  }

  const controllerReturn = controller.slice(controller.lastIndexOf('return {'));
  for (const leakedViewDependency of [
    'PageHeader,',
    'CandidateDetailDrawer,',
    'PushToReviewerModal,',
    'AlertCircle,',
    'LoaderCircle,',
  ]) {
    assert.doesNotMatch(
      controllerReturn,
      new RegExp(`\\n\\s{4}${leakedViewDependency}`),
      `控制器不应向视图传递 ${leakedViewDependency}`,
    );
  }
  assert.ok(
    lineCount('src/features/candidates/library/useCandidateLibraryController.tsx') < 700,
    '候选人控制器应只负责组合，上传流程必须独立',
  );
  assert.match(controller, /useCandidateResumeUpload/);
});

test('需求页把基本详情、候选人和业务筛选分成三个真实入口', () => {
  const page = read('src/pages/jobs/page.tsx');
  const detail = read('src/pages/jobs/components/DemandDetailPanel.tsx');
  const candidates = read('src/pages/jobs/components/DemandCandidateDrawer.tsx');
  const reviews = read('src/pages/jobs/components/DemandBusinessReviewDrawer.tsx');

  for (const name of ['DemandDetailPanel', 'DemandCandidateDrawer', 'DemandBusinessReviewDrawer']) {
    assert.match(page, new RegExp(name));
  }
  assert.match(detail, /DetailActionBar/);
  assert.match(candidates, /CandidateDetailWorkspace/);
  assert.match(reviews, /DetailDrawerShell/);
  assert.ok(lineCount('src/pages/jobs/components/DemandDetailPanel.tsx') < 400);
  assert.ok(lineCount('src/pages/jobs/components/DemandCandidateDrawer.tsx') < 800);
});

test('需求下候选人选择直接使用真实接口、筛选和统一详情', () => {
  const drawer = read('src/pages/jobs/components/DemandCandidateDrawer.tsx');
  assert.match(drawer, /candidatesApi\.listCandidates/);
  assert.match(drawer, /搜索姓名、公司、学校、岗位或技能/);
  assert.match(drawer, /CandidateDetailWorkspace/);
  assert.match(drawer, /DetailDrawerShell/);
});

test('面试工作台把数据读取和操作弹层从页面组合中拆出', () => {
  const page = read('src/pages/interviews/page.tsx');
  read('src/features/interviews/useRecruiterInterviewWorkbench.ts');
  read('src/features/interviews/components/RecruiterInterviewOverlays.tsx');
  assert.match(page, /useRecruiterInterviewWorkbench/);
  assert.match(page, /RecruiterInterviewOverlays/);
  assert.ok(lineCount('src/pages/interviews/page.tsx') < 600);
});
