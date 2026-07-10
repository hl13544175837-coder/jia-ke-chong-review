import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const api = readSource('lib/api.ts');
assert.match(api, /batchAddToPipeline/, 'API client should expose batchAddToPipeline');
assert.match(api, /\/jobs\/\$\{jobId\}\/batch-pipeline/, 'Batch add should call the job-scoped backend endpoint');
assert.match(api, /demand_id/, 'Batch add should send the selected demand context');
assert.match(api, /getDemandPipelineBoard/, 'Pipeline board should support explicit demand context');

const types = readSource('types/index.ts');
assert.match(types, /BatchAddToPipelineResponse/, 'Batch add response type should exist');

const jobMatchPage = readSource('pages/JobMatchPage.tsx');
assert.match(jobMatchPage, /selectedIds/, 'Match page should keep selected candidate ids');
assert.match(jobMatchPage, /toggleSelectAll/, 'Match page should support selecting all joinable candidates');
assert.match(jobMatchPage, /批量加入流程/, 'Match page should expose a batch add action');
assert.match(jobMatchPage, /existingPipelineIds\.has/, 'Batch selection should be aware of already-joined candidates');
assert.match(jobMatchPage, /batchAddToPipeline/, 'Match page should call the batch add API');
assert.match(jobMatchPage, /searchParams\.get\('demand'\)/, 'Match page should read demand context from the deep link');
assert.match(jobMatchPage, /demand_id: demandId/, 'Single-candidate joins should write the selected demand id');
