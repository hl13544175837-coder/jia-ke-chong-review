import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('招聘端主导航使用“简历库”，需求上下文保留候选人提示', () => {
  const layout = read('readdy-frontend/src/components/feature/MainLayout.tsx');
  const page = read('readdy-frontend/src/pages/candidates/page.tsx');

  assert.match(
    layout,
    /path:\s*'\/candidates'[^\n]*label:\s*'简历库'/,
    '左侧导航应显示“简历库”',
  );
  assert.match(page, /navState\?\.jobTitle\s*&&\s*<h1[^>]*>当前需求候选人<\/h1>/);
});

test('用户可见的人才沉淀名称统一为“公司人才库”', () => {
  const visibleCopyFiles = [
    'readdy-frontend/src/pages/candidates/page.tsx',
    'readdy-frontend/src/pages/candidates/components/CandidateDetailDrawer.tsx',
    'readdy-frontend/src/pages/interviews/page.tsx',
    'readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx',
    'readdy-frontend/src/pages/director/insights/page.tsx',
    'readdy-frontend/src/mocks/candidateProfiles.ts',
    'readdy-frontend/src/mocks/director.ts',
    'readdy-frontend/src/mocks/resumePush.ts',
    'backend/app/services/candidate_library_service.py',
  ];

  for (const relativePath of visibleCopyFiles) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /人才池/, `${relativePath} 仍存在“人才池”`);
    assert.doesNotMatch(source, /(?<!公司)人才库/, `${relativePath} 仍存在未统一的“人才库”`);
  }
});
