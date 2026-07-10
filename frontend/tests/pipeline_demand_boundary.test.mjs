import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const pipelinePage = readSource('pages/PipelinePage.tsx');

const preferredStageOrder = pipelinePage.match(
  /const PREFERRED_STAGE_ORDER:[\s\S]*?=\s*\[([\s\S]*?)\];/,
)?.[1] ?? '';

assert.match(
  preferredStageOrder,
  /'transferred'/,
  'A Demand containing only transferred candidates should auto-open the transferred stage',
);

assert.match(
  pipelinePage,
  /searchParams\.get\('job'\)/,
  'The pipeline should explicitly resolve legacy job deep links instead of ignoring their scope',
);
assert.match(
  pipelinePage,
  /legacyJobDemands\.length\s*===\s*1/,
  'A legacy job link should resolve only when exactly one visible Demand matches',
);
assert.match(
  pipelinePage,
  /hasCompleteVisibleDemandList/,
  'Legacy uniqueness must not be guessed from only the first page of visible Demands',
);
assert.match(
  pipelinePage,
  /旧岗位链接对应多个招聘需求/,
  'An ambiguous legacy job link should explain that the user must choose a concrete Demand',
);

assert.match(
  pipelinePage,
  /该招聘需求不存在或你无权查看/,
  'An invalid or invisible demand deep link should render a safe, actionable message',
);
assert.match(
  pipelinePage,
  /const effectiveDemandId\s*=\s*effectiveDemand\?\.id\s*\?\?\s*null/,
  'The board request id must come from a Demand visible in the current user list',
);
assert.doesNotMatch(
  pipelinePage,
  /const effectiveDemandId\s*=\s*[\s\S]{0,80}selectedDemandId\s*\?\?/,
  'The board must not request an unchecked demand id directly from the URL',
);

assert.match(
  pipelinePage,
  /demandResolutionError/,
  'Demand resolution failures should block the pipeline workspace',
);
