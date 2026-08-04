import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('拆分后的工作台继续使用统一标题、页签、状态和弹层生命周期', () => {
  const candidateWorkspace = [
    'src/features/candidates/components/CandidateLibraryWorkspace.tsx',
    'src/features/candidates/components/library/CandidateLibraryFilters.tsx',
    'src/features/candidates/library/useCandidateLibraryController.tsx',
  ].map(read).join('\n');
  const interviewPage = read('src/pages/interviews/page.tsx');
  const overlays = read('src/features/interviews/components/RecruiterInterviewOverlays.tsx');
  const demandWorkspace = read('src/pages/jobs/components/DemandCandidateDrawer.tsx');

  assert.match(candidateWorkspace, /PageHeader/);
  assert.match(candidateWorkspace, /WorkspaceTabs/);
  assert.match(interviewPage, /PageHeader/);
  assert.match(interviewPage, /PageStateCard/);
  assert.match(overlays, /ScheduleInterviewModal/);
  assert.match(demandWorkspace, /CandidateDetailWorkspace/);
  assert.match(demandWorkspace, /DetailDrawerShell/);
});

test('候选人筛选拆分后保留原有尺寸、颜色、圆角和激活态', () => {
  const drawer = read('src/pages/jobs/components/DemandCandidateDrawer.tsx');

  assert.match(drawer, /max-w-6xl/);
  assert.match(drawer, /px-5 py-3/);
  assert.match(drawer, /rounded-lg/);
  assert.match(drawer, /border-primary-400 bg-primary-50/);
  assert.match(drawer, /bg-primary-500 text-white/);
  assert.doesNotMatch(drawer, /bg-\$\{/);
});
