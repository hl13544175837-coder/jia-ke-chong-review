import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(srcRoot, path), 'utf8');

const page = read('pages/InterviewListPage.tsx');
const panel = read('components/interviewRecords/InterviewAssignmentPanel.tsx');

assert.match(
  page,
  /const interviewersAsync = useAsync<InterviewerOption\[]>/,
  'Interviewer choices should load independently from interview records and pending work',
);

const workspaceLoader = page.match(
  /const workspaceAsync = useAsync<InterviewWorkspaceData>\([\s\S]*?\n\s*\}, \[role, isInterviewer\]\);/,
)?.[0] ?? '';
assert.ok(workspaceLoader, 'The interview workspace loader should remain identifiable');
assert.doesNotMatch(
  workspaceLoader,
  /api\.listInterviewers\(\)/,
  'An interviewer-option failure must not reject the main interview workspace request',
);
assert.match(
  page,
  /interviewersError=\{interviewersAsync\.error\?\.message \?\? null\}/,
  'The assignment panel should receive the isolated interviewer loading error',
);
assert.match(
  page,
  /onReloadInterviewers=\{interviewersAsync\.reload\}/,
  'The assignment panel should be able to retry interviewer options without reloading all records',
);

assert.match(
  panel,
  /interviewersError\?: string \| null/,
  'The assignment panel should distinguish an option error from a true empty account list',
);
assert.match(
  panel,
  /面试官列表暂时无法加载/,
  'The assignment panel should explain an interviewer loading failure in user language',
);
assert.match(
  panel,
  /重新加载面试官/,
  'The assignment panel should offer a local retry action',
);

for (const [id, name] of [
  ['interview-assignment-demand', 'demand_id'],
  ['interview-assignment-candidate', 'candidate_id'],
  ['interview-assignment-round', 'round'],
  ['interview-assignment-round-sequence', 'round_sequence'],
  ['interview-assignment-scheduled-at', 'scheduled_at'],
  ['interview-assignment-location', 'location'],
  ['interview-assignment-responsibility', 'is_primary'],
]) {
  assert.match(
    panel,
    new RegExp(`id="${id}"[\\s\\S]*?name="${name}"|name="${name}"[\\s\\S]*?id="${id}"`),
    `${name} should have a stable id/name pair so its visible label is programmatically associated`,
  );
}

assert.match(
  panel,
  /<label[^>]*htmlFor="interview-assignment-note"[\s\S]*?>\s*安排备注/,
  'The interview note should have a visible associated label',
);
assert.match(
  panel,
  /id="interview-assignment-note"[\s\S]*name="note"|name="note"[\s\S]*id="interview-assignment-note"/,
  'The interview note field should expose a stable id and form name',
);
assert.match(
  panel,
  /role="status"[\s\S]*aria-live="polite"|aria-live="polite"[\s\S]*role="status"/,
  'Assignment success and validation messages should be announced without stealing focus',
);
