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
  /function ResumeOutlineNav/,
  'Candidate profile should expose a lightweight left resume outline for quick section jumps',
);

assert.match(
  candidateProfile,
  /const RESUME_OUTLINE_ITEMS/,
  'Resume outline should be curated as a short reading-mode list instead of mirroring every parsed field',
);

for (const label of ['全部', '重点', '经历', '项目', '教育/证书/其他']) {
  assert.match(
    candidateProfile,
    new RegExp(`label: '${label}'`),
    `Resume outline should include the simplified "${label}" entry`,
  );
}

for (const noisyLabel of ['姓名', '邮箱', '电话', '意向城市']) {
  assert.doesNotMatch(
    candidateProfile,
    new RegExp(`<span className="truncate">\\{sectionLabel\\(key\\)\\}<\\/span>|label: '${noisyLabel}'`),
    `Resume outline should not expose low-value field-level entry "${noisyLabel}"`,
  );
}

assert.match(
  candidateProfile,
  /function CandidatePipelineActionPanel/,
  'Candidate profile should have a right-side pipeline action panel instead of burying actions below the resume',
);

assert.match(
  candidateProfile,
  /完整简历/,
  'The central reading area should clearly remain the full resume, not just a summary',
);

assert.match(
  candidateProfile,
  /overflow-y-auto/,
  'The full resume should use an independent reader scroll area on desktop',
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
  /当前操作岗位/,
  'When a candidate has pipeline context, the action panel should show which job will be affected',
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
