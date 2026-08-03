import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const lineCount = (file) => read(file).split('\n').length;

test('候选人工作台把筛选、列表、导入和详情拆到候选人业务模块', () => {
  const page = read('src/pages/candidates/page.tsx');
  const workspace = read('src/features/candidates/components/CandidateLibraryWorkspace.tsx');
  read('src/features/candidates/library.ts');
  read('src/features/candidates/components/CandidateLibraryWorkspace.tsx');
  read('src/features/candidates/components/CandidateUploadModal.tsx');
  read('src/features/candidates/components/CandidateDetailDrawer.tsx');

  assert.match(page, /CandidateLibraryWorkspace/);
  assert.match(workspace, /CandidateUploadModal/);
  assert.match(workspace, /CandidateDetailDrawer/);
  assert.ok(lineCount('src/pages/candidates/page.tsx') < 1650);
});

test('需求详情按概况、JD、候选人、招聘进展和操作记录拆分', () => {
  const panel = read('src/pages/jobs/components/JobDetailPanel.tsx');
  const workspace = read('src/features/demands/components/jobDetail/JobDetailWorkspace.tsx');
  const sections = [
    'JobOverviewSection',
    'JobDescriptionSection',
    'JobCandidatesSection',
    'RecruitmentProgressSection',
    'JobActivityLogSection',
  ];
  sections.forEach((name) => {
    read(`src/features/demands/components/jobDetail/${name}.tsx`);
    assert.match(workspace, new RegExp(name));
  });
  assert.match(panel, /JobDetailWorkspace/);
  assert.ok(lineCount('src/pages/jobs/components/JobDetailPanel.tsx') < 900);
});

test('候选人选择归候选人模块且筛选计算与抽屉视图分开', () => {
  const drawer = read('src/features/candidates/components/SelectCandidateDrawer.tsx');
  read('src/features/candidates/selection.ts');
  read('src/features/candidates/components/CandidateSelectionFilters.tsx');
  assert.match(drawer, /CandidateSelectionFilters/);
  assert.match(read('src/features/demands/components/jobDetail/JobDetailWorkspace.tsx'), /@\/features\/candidates\/components\/SelectCandidateDrawer/);
  assert.ok(lineCount('src/features/candidates/components/SelectCandidateDrawer.tsx') < 850);
});

test('面试工作台把数据读取和操作弹层从页面组合中拆出', () => {
  const page = read('src/pages/interviews/page.tsx');
  read('src/features/interviews/useRecruiterInterviewWorkbench.ts');
  read('src/features/interviews/components/RecruiterInterviewOverlays.tsx');
  assert.match(page, /useRecruiterInterviewWorkbench/);
  assert.match(page, /RecruiterInterviewOverlays/);
  assert.ok(lineCount('src/pages/interviews/page.tsx') < 600);
});
