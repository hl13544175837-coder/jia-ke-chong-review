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

assert.match(
  candidateProfile,
  /function CandidateEvidenceCard/,
  'Candidate profile should render a factual evidence card inside match analysis',
);

assert.match(
  candidateProfile,
  /<CandidateMatchAnalysis/,
  'Candidate judgement should live in the explicit match-analysis tab instead of a permanent rail',
);

assert.match(
  candidateProfile,
  /简历事实摘要/,
  'The match-analysis tab should distinguish resume facts from an HR decision',
);

assert.doesNotMatch(
  candidateProfile,
  /推荐判断|建议优先初筛|建议人工复核|先补关键经历|暂无明显风险|highSkills/,
  'The frontend must not turn locally chosen skill thresholds into a screening recommendation',
);

assert.match(
  candidateProfile,
  /结构化信息来自后端解析结果/,
  'The evidence card should state that its facts come from the backend parsing result',
);

assert.doesNotMatch(
  candidateProfile,
  /hiddenSkillCount > 12|Number\(skill\.score \|\| 0\) >= 4|highSkills\.length >=/,
  'The frontend must not embed screening thresholds in the candidate evidence view',
);

assert.match(
  candidateProfile,
  /辅助雷达/,
  'The old radar should be downgraded to an auxiliary visualization',
);

assert.doesNotMatch(
  candidateProfile,
  /<CardTitle>\{useRadar \? '技能雷达' : '技能评分'\}<\/CardTitle>/,
  'Skill radar should no longer be the primary card title',
);
