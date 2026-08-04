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
  const demandWorkspace = read('src/features/demands/components/jobDetail/JobDetailWorkspace.tsx');

  assert.match(candidateWorkspace, /PageHeader/);
  assert.match(candidateWorkspace, /WorkspaceTabs/);
  assert.match(interviewPage, /PageHeader/);
  assert.match(interviewPage, /PageStateCard/);
  assert.match(overlays, /ScheduleInterviewModal/);
  assert.match(demandWorkspace, /ResumeUploadModal/);
});

test('候选人筛选拆分后保留原有尺寸、颜色、圆角和激活态', () => {
  const filters = read('src/features/candidates/components/CandidateSelectionFilters.tsx');
  const drawer = read('src/features/candidates/components/SelectCandidateDrawer.tsx');

  assert.match(drawer, /max-w-3xl/);
  assert.match(filters, /px-6 py-3/);
  assert.match(filters, /rounded-lg/);
  assert.match(filters, /appearance-none[^'"\n]*pr-8/);
  assert.match(filters, /border-primary-300 bg-primary-50\/60 text-primary-700/);
  assert.match(filters, /bg-primary-500 text-white border-primary-500/);
  assert.match(filters, /bg-accent-500 text-white border-accent-500/);
  assert.doesNotMatch(filters, /bg-\$\{/);
});
