import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const biPage = readSource('pages/BiPage.tsx');
const types = readSource('types/index.ts');

assert.match(types, /interface BiDemandOperationalMetrics/, 'BI should type the demand read model');
assert.match(types, /interface BiDemandStageAge/, 'BI should type candidate stage-age facts');
assert.match(types, /interface BiDemandOutstandingFeedback/, 'BI should type feedback follow-up facts');
assert.doesNotMatch(
  types,
  /(?:first|second|final)_interview_(?:entries|feedbacks|passed|pass_rate|rate):\s*number/,
  'BI public types should not expose legacy fixed interview rounds',
);
assert.match(
  types,
  /archived_total\?:\s*number/,
  'BI funnel should expose archived terminal-stage totals separately',
);
assert.match(
  types,
  /funnel_total\?:\s*number/,
  'BI funnel should expose the all-stage denominator for conversion rates',
);
assert.match(
  biPage,
  /流程阶段/,
  'BI should render the selected Demand funnel',
);
assert.match(
  biPage,
  /阶段停留/,
  'BI page should surface stage-age blockers from the backend',
);
assert.match(
  biPage,
  /面试反馈跟进/,
  'BI page should surface outstanding feedback from the backend',
);
assert.match(
  biPage,
  /metrics\.hc\.completion_rate/,
  'BI page should render demand-scoped HC progress',
);
assert.match(
  biPage,
  /metrics\.current_responsibility/,
  'BI page should render current collaboration responsibility',
);
assert.match(
  biPage,
  /当前流程人数/,
  'BI should label current active pipeline stock plainly',
);
assert.match(
  biPage,
  /metrics\.funnel\.pipeline_total/,
  'BI should render the backend current pipeline total',
);
assert.doesNotMatch(
  biPage,
  /HR 绩效|渠道质量|简历消化/,
  'Phase-one demand BI should stop using performance and channel-analysis modules',
);

const biVisuals = readSource('components/bi/BiVisuals.tsx');
assert.doesNotMatch(
  biVisuals,
  /next\.value\s*\/\s*s\.value/,
  'Funnel labels should not show stage-to-stage conversion rates that can exceed 100%',
);
assert.match(
  biVisuals,
  /阶段占比/,
  'Funnel labels should explain the safer current-stage share',
);
assert.match(
  biVisuals,
  /\{clamped\.toFixed\(1\)\s*\+\s*'%'\}/,
  'Conversion ring should render the real percent before animation runs',
);

const candidatesPage = readSource('features/candidates/pages/CandidatesPage.tsx');
const animatedNumber = readSource('components/motion/AnimatedNumber.tsx');
assert.doesNotMatch(
  animatedNumber,
  /const obj = \{ n: 0 \}/,
  'Animated KPI numbers should not reset visible business metrics back to 0',
);
assert.match(
  animatedNumber,
  /parseDisplayedNumber/,
  'Animated KPI numbers should animate from the currently displayed value',
);

assert.match(
  candidatesPage,
  /简历总量[\s\S]{0,220}<AnimatedNumber value=\{totalCandidates\} \/>/,
  'Candidate total card should use the backend total, not the current page length',
);
assert.doesNotMatch(
  candidatesPage,
  /简历总量[\s\S]{0,220}<AnimatedNumber value=\{candidates\.length\} \/>/,
  'Candidate total card should not use the current page length',
);
assert.match(
  candidatesPage,
  /当前显示 \$\{filteredCandidates\.length\} \/ \$\{resultTotal\} 份/,
  'Candidate list summary should compare visible rows with the filtered backend total',
);
