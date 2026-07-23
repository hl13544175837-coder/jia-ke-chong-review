import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

[
  'lib/pipelineInsights.ts',
].forEach((path) => {
  assert.ok(existsSync(join(srcRoot, path)), `${path} should exist`);
});

const pipelinePage = readSource('pages/PipelinePage.tsx');
const insights = readSource('lib/pipelineInsights.ts');

assert.match(
  pipelinePage,
  /InterviewAdjustModal/,
  'Interview management should use a modal for schedule and adjustment actions',
);

assert.match(
  pipelinePage,
  /listInterviewAssignments/,
  'Interview management should load real interview assignment data',
);

assert.match(
  pipelinePage,
  /createInterviewAssignment/,
  'Interview management should save schedule changes through the existing assignment API',
);

assert.doesNotMatch(
  pipelinePage,
  /KanbanColumn/,
  'Candidate pipeline page should no longer render every stage as a long kanban column grid',
);

assert.match(
  pipelinePage,
  /HeaderFilter[\s\S]*FilterMenu[\s\S]*FilterItem/,
  'Interview management should provide clickable table filters',
);

assert.match(
  insights,
  /buildPipelineInsight/,
  'AI guidance should be rule-based from current pipeline data for the MVP',
);

assert.match(
  insights,
  /停留超过/,
  'Pipeline insight should flag long-stalled candidates without calling a new backend service',
);
