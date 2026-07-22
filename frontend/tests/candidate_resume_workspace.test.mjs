import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const componentPaths = [
  'features/candidates/components/OriginalResumeViewer.tsx',
  'features/candidates/components/StructuredResumeView.tsx',
  'features/candidates/components/CandidateMatchAnalysis.tsx',
];
componentPaths.forEach((path) => {
  assert.ok(existsSync(join(srcRoot, path)), `${path} should exist`);
});

const page = readSource('features/candidates/pages/CandidateProfilePage.tsx');
const api = readSource('features/candidates/api.ts');
const types = readSource('features/candidates/types.ts');
const original = readSource('features/candidates/components/OriginalResumeViewer.tsx');
const structured = readSource('features/candidates/components/StructuredResumeView.tsx');
const matchAnalysis = readSource('features/candidates/components/CandidateMatchAnalysis.tsx');

for (const label of ['原始简历', '结构化画像', '匹配分析']) {
  assert.match(page, new RegExp(label), `Candidate reader should expose the top tab "${label}"`);
}

assert.match(
  page,
  /useState<CandidateResumeTab>\('original'\)/,
  'Original resume should be the default truth tab',
);
assert.match(page, /<OriginalResumeViewer/, 'Original tab should use the secure original viewer');
assert.match(page, /<StructuredResumeView/, 'Structured tab should be isolated in its own component');
assert.match(page, /<CandidateMatchAnalysis/, 'Match analysis should be isolated in its own component');
assert.match(
  page,
  /role="tablist"[^>]*className="[^"]*grid-cols-3/,
  'All three top tabs should remain discoverable at once on a narrow screen',
);
assert.doesNotMatch(
  page,
  /xl:grid-cols-\[240px_minmax\(0,1fr\)_300px\]/,
  'The old long-lived three-column shell must be removed',
);

assert.match(types, /interface OriginalResumeInfo/, 'Feature types should expose path-free original metadata');
assert.match(types, /available: boolean/, 'Original metadata should explain whether a file is usable');
assert.doesNotMatch(types, /raw_file_path/, 'Frontend contracts must never expose the server path');

assert.match(api, /previewOriginalResume/, 'Feature API should fetch an authenticated preview blob');
assert.match(api, /downloadOriginalResume/, 'Feature API should fetch an authenticated download blob');
assert.match(
  api,
  /headers:\s*authHeaders\(\)/,
  'Original file requests should reuse the shared authenticated headers',
);
assert.match(
  api,
  /\$\{API_BASE\}\/resume\/\$\{candidateId\}\/original\/\$\{mode\}/,
  'Original files should call the protected route family through the configured API prefix',
);
assert.match(api, /fetchOriginalResume\(candidateId, 'preview'\)/, 'Preview should select the protected preview route');

assert.match(original, /URL\.createObjectURL/, 'Viewer should render a protected blob without exposing its API URL');
assert.match(original, /title="原始简历预览"/, 'PDF preview should have an accessible title');
assert.match(original, /解析失败不影响查看原始简历/, 'Parse failure should not hide the original truth');
assert.match(original, /未找到可用的原始简历/, 'Missing originals should show a recovery state');
assert.match(original, /重新上传/, 'Missing originals should point to the recovery action');

assert.match(structured, /结构化画像/, 'Structured view should label AI-parsed data as a separate view');
assert.match(structured, /不代表原始简历原文/, 'Structured data should not be presented as source truth');

assert.match(matchAnalysis, /aria-expanded/, 'AI match panel should be collapsible');
assert.match(matchAnalysis, /previewJobMatch/, 'Match analysis should use the existing read-only matching API');
assert.match(matchAnalysis, /AI 匹配结果仅供辅助/, 'Match result should state its human-review boundary');
