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
assert.match(api, /CandidateListQuery/, 'API client should type candidate list query params');
assert.match(api, /CandidateListResponse/, 'API client should type paginated candidate response');
assert.match(api, /searchCandidates/, 'API client should expose a paginated candidate search method');
assert.match(api, /\/candidates\?/, 'Paginated search should call /candidates with query params');
assert.match(api, /batchAddToPipeline/, 'API client should expose the duplicate-safe add-to-pipeline method');

const types = readSource('types/index.ts');
assert.match(types, /CandidateListQuery/, 'Candidate list query type should exist');
assert.match(types, /CandidateListResponse/, 'Candidate list response type should exist');
assert.match(types, /intent_city\?:\s*string/, 'Candidate list item should expose parsed intent city');
assert.match(types, /city\?:\s*string/, 'Candidate list query should support city filtering');
assert.match(types, /parse_status\?:\s*ParseStatus/, 'Candidate list query should support parse status filtering');
assert.match(types, /source_channel\?:\s*string/, 'Candidate list query should support source channel filtering');
assert.match(types, /pipeline_status\?:/, 'Candidate list query should support assignment status filtering');
assert.match(types, /education\?:\s*string/, 'Candidate list query should support education filtering');
assert.match(types, /skill\?:\s*string/, 'Candidate list query should support skill filtering');
assert.match(types, /min_score\?:\s*number/, 'Candidate list query should support minimum skill score filtering');

const candidatesPage = readSource('features/candidates/pages/CandidatesPage.tsx');
assert.match(candidatesPage, /useDebounce/, 'Candidate page should debounce server search');
assert.match(candidatesPage, /searchCandidates/, 'Candidate page should use server-side search');
assert.match(candidatesPage, /Pagination/, 'Candidate page should render pagination controls');
assert.match(candidatesPage, /per_page:\s*20/, 'Candidate page should request a stable page size');
assert.match(candidatesPage, /意向城市/, 'Candidate page should offer an intent city filter');
assert.match(candidatesPage, /cityFilter/, 'Candidate page should keep intent city filter state');
assert.match(candidatesPage, /intent_city/, 'Candidate page should display or search parsed intent city');
assert.match(
  candidatesPage,
  /city:\s*cityFilter === 'all' \? undefined : cityFilter/,
  'Candidate page should pass intent city to server search'
);
assert.match(candidatesPage, /解析状态/, 'Candidate page should offer a parse status filter');
assert.match(candidatesPage, /来源渠道/, 'Candidate page should offer a source channel filter');
assert.match(candidatesPage, /入流程状态/, 'Candidate page should offer a clear assignment status filter');
assert.match(candidatesPage, /全部状态/, 'Assignment status filter should use status wording instead of resume wording');
assert.match(candidatesPage, /未进入流程/, 'Assignment status filter should use concise status options');
assert.match(candidatesPage, /已进入流程/, 'Assignment status filter should use concise status options');
assert.doesNotMatch(candidatesPage, /label="岗位流程"/, 'Candidate page should avoid ambiguous job-process filter wording');
assert.doesNotMatch(candidatesPage, /<option value="all">全部简历<\/option>/, 'Assignment status filter should not sound like the whole library filter');
assert.match(
  candidatesPage,
  /pipeline_status:\s*pipelineStatusFilter === 'all' \? undefined : pipelineStatusFilter/,
  'Candidate page should pass assignment status to server search'
);
assert.match(candidatesPage, /listDemands/, 'Candidate page should load active demands for downstream assignment');
assert.match(candidatesPage, /targetDemandId/, 'Candidate page should keep the exact target demand context');
assert.match(candidatesPage, /batchAddToPipeline\(selectedJobId, \[candidateId\], demandId\)/, 'Candidate page should add selected resumes to the chosen demand safely');
assert.match(candidatesPage, /加入所选需求/, 'Candidate page should expose the action to add library resumes to a demand');
for (const column of ['identity', 'profile', 'skills', 'source', 'score', 'created']) {
  assert.match(
    candidatesPage,
    new RegExp(`data-ui="candidate-column-filter-${column}"`),
    `${column} candidate table header should expose a clickable filter`,
  );
}
assert.match(candidatesPage, /label="学历"/, 'Candidate page should provide an education filter');
assert.match(candidatesPage, /label="技能关键词"/, 'Candidate page should accept a skill keyword beyond current-page tags');
assert.match(candidatesPage, /label="招聘阶段（任一需求）"/, 'Candidate page should explain the demand-scoped stage filter');
assert.match(candidatesPage, /education:\s*educationFilter === 'all' \? undefined : educationFilter/, 'Education must be sent to server search');
assert.match(candidatesPage, /skill:\s*debouncedSkill\.trim\(\) \|\| undefined/, 'Skill keyword must be sent to server search');
assert.match(candidatesPage, /min_score:\s*Number\(scoreFilter\) \|\| undefined/, 'Minimum score must be sent to server search');
assert.doesNotMatch(
  candidatesPage,
  /const matchesTag =[\s\S]*candidateTags\(candidate\)\.some/,
  'Skill filtering must not be limited to the current page',
);
