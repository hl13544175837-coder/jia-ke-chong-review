import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(srcRoot, path), 'utf8');

const form = read('features/demands/components/DemandCreateModal.tsx');
const page = read('features/demands/pages/DemandsPage.tsx');

assert.doesNotMatch(
  form,
  /toISOString\(\)\.slice\(0,\s*10\)/,
  'The requested date must not be frozen at module load or derived in UTC',
);
assert.match(
  form,
  /function localDate\([\s\S]*getFullYear\(\)[\s\S]*getMonth\(\)[\s\S]*getDate\(\)/,
  'Date input defaults should be assembled from local calendar fields',
);
assert.match(
  form,
  /requested_at:\s*localDate\(\)/,
  'The requested date should use the local calendar helper',
);

assert.match(
  form,
  /job_title:\s*''/,
  'A required job title should start empty',
);
assert.doesNotMatch(
  form,
  /default_interviewer_id:\s*\d+/,
  'Loading options must not silently select a business owner',
);

assert.match(
  form,
  /if \(field === 'province'\)[\s\S]*city:\s*nextCities\[0\]\s*\?\?\s*''/,
  'Changing province should update city from the same selection',
);
assert.match(
  form,
  /onFieldChange\?\.\(String\(field\)\)/,
  'Changing a field should clear its stale server error',
);
assert.match(
  form,
  /setLocalErrors/,
  'Field changes should clear matching local validation errors',
);

assert.match(
  page,
  /function clearCreateError\(field: string\)\s*\{[\s\S]*setCreateMessage\(null\)/,
  'Any corrected create field should dismiss the stale top-level create error',
);
assert.match(
  page,
  /onFieldChange=\{clearCreateError\}/,
  'The create modal should route all field changes through stale-error cleanup',
);
