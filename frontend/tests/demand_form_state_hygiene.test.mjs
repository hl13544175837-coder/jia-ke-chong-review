import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(srcRoot, path), 'utf8');

const form = read('features/demands/components/DemandForm.tsx');
const page = read('features/demands/pages/DemandsPage.tsx');

assert.doesNotMatch(
  form,
  /const today\s*=\s*new Date\(\)\.toISOString\(\)/,
  'The requested date must not be frozen at module load or derived in UTC',
);
assert.match(
  form,
  /function localDateInputValue\([\s\S]*getFullYear\(\)[\s\S]*getMonth\(\)[\s\S]*getDate\(\)/,
  'Date input defaults should be assembled from local calendar fields',
);
assert.match(
  form,
  /useState<FormState>\(\(\)\s*=>\s*\([\s\S]*requested_at:\s*localDateInputValue\(\)/,
  'The local requested date should be computed lazily when the form instance is created',
);

assert.match(
  form,
  /job_id:\s*''/,
  'A required job should start empty until the user explicitly selects a template',
);
assert.doesNotMatch(
  form,
  /if\s*\(!form\.job_id\s*&&\s*jobs\.length\s*>\s*0\)/,
  'Loading jobs must not silently select the first required option',
);

const selectJob = form.match(/function selectJob\(value: string\)\s*\{[\s\S]*?\n  \}/)?.[0] ?? '';
assert.match(
  selectJob,
  /city:\s*selected\?\.city\s*\|\|\s*''/,
  'Explicit job selection should copy that template city instead of an earlier implicit default',
);
assert.match(
  selectJob,
  /requester_department:\s*selected\?\.department\s*\|\|\s*''/,
  'Explicit job selection should copy that template department',
);
for (const field of ['job_id', 'city', 'requester_department']) {
  assert.match(
    selectJob,
    new RegExp(`['"]${field}['"]`),
    `Selecting a job should clear stale ${field} errors`,
  );
}
assert.match(
  selectJob,
  /onFieldChange\?\./,
  'Job selection should notify the page so matching server errors are cleared',
);
assert.match(
  selectJob,
  /setLocalErrors/,
  'Job selection should clear matching local validation errors',
);

assert.match(
  page,
  /function clearCreateError\(field: string\)\s*\{[\s\S]*setCreateMessage\(null\)/,
  'Any corrected create field should dismiss the stale top-level create error',
);
assert.match(
  page,
  /onFieldChange=\{clearCreateError\}/,
  'The form should route all field changes through stale-error cleanup',
);

assert.doesNotMatch(
  form,
  /disabled=\{role === 'recruiter'\}/,
  '招聘专员的负责人下拉不能被前端直接禁用',
);
assert.match(
  page,
  /\['recruiter', 'manager', 'admin'\]\.includes\(role \?\? ''\)/,
  '创建需求页面应为招聘专员加载后端裁剪后的负责人选项',
);
assert.match(
  form,
  /role === 'recruiter' && ownerOptions\.length === 1/,
  '招聘专员只有本人一个可选项时应自动补齐负责人',
);
