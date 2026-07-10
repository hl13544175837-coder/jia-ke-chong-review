import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const candidateProfile = readSource('features/candidates/pages/CandidateProfilePage.tsx');
const candidatesApi = readSource('features/candidates/api.ts');

assert.match(
  candidateProfile,
  /招聘操作/,
  'Candidate profile should retain real workflow actions behind an explicit on-demand control',
);

assert.match(
  candidateProfile,
  /showRecruitmentActions/,
  'Recruiting actions should be collapsible instead of occupying a permanent side rail',
);

assert.doesNotMatch(
  candidateProfile,
  /xl:grid-cols-\[240px_minmax\(0,1fr\)_300px\]/,
  'Candidate profile must remove the old permanent three-column reader layout',
);

assert.match(
  candidatesApi,
  /movePipeline:\s*api\.movePipeline/,
  'Candidate profile flow actions should reuse the existing real movePipeline API',
);

assert.match(
  candidateProfile,
  /api\.getCandidatePipelines/,
  'Pipeline actions should be driven by the candidate pipeline API instead of mock data',
);

assert.match(
  candidateProfile,
  /NEXT_STAGE/,
  'Normal progress should reuse the shared next-stage contract',
);

assert.match(
  candidateProfile,
  /当前操作需求/,
  'When a candidate has pipeline context, the action panel should show which demand will be affected',
);

assert.match(
  candidateProfile,
  /demand_id:\s*pipeline\.demand_id/,
  'Candidate profile workflow writes should carry the selected demand id',
);

assert.match(
  candidateProfile,
  /RejectionDispositionForm/,
  'Rejecting a candidate should keep the existing required rejection-disposition workflow',
);

assert.match(
  candidateProfile,
  /修正原因（必填）/,
  'Stage correction should require a reason so mistaken operations are auditable',
);

assert.match(
  candidateProfile,
  /window\.confirm/,
  'Stage correction should require a second confirmation because it changes current pipeline and BI stock',
);

assert.doesNotMatch(
  candidateProfile,
  /推进到[^<]*(?:确认|原因（必填）)/,
  'Normal next-stage progress should stay lightweight and should not force confirmation or required reason',
);
