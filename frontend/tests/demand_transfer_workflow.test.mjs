import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(root, path), 'utf8');

const types = read('types/index.ts');
const api = read('lib/api.ts');
const stages = read('lib/pipelineStages.ts');
const page = read('pages/PipelinePage.tsx');
const panel = read('components/pipeline/PipelineCandidatePanel.tsx');

assert.match(types, /'transferred'/, 'Transferred should be a visible terminal pipeline stage');
assert.match(stages, /key:\s*'transferred'[\s\S]*label:\s*'已转出'/, 'The source demand should show transferred separately from rejected');
assert.match(api, /\/pipeline\/transfer/, 'Frontend API should call the transactional demand transfer endpoint');
assert.match(panel, /转到其他需求/, 'Candidate actions should expose the transfer recovery path');
assert.match(panel, /转需原因（必填）/, 'Demand transfer should require a business reason');
assert.match(panel, /from_demand_id:\s*demandId/, 'Transfer should preserve the source demand id');
assert.match(panel, /to_demand_id:/, 'Transfer should select an explicit target demand id');
assert.match(page, /onTransferred/, 'Pipeline page should refresh after a successful transfer');
