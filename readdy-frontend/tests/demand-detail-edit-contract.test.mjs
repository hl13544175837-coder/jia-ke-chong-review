import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = readFileSync(
  path.resolve(import.meta.dirname, '../src/pages/jobs/components/DemandDetailPanel.tsx'),
  'utf8',
);
const types = readFileSync(
  path.resolve(import.meta.dirname, '../src/features/demands/types.ts'),
  'utf8',
);

test('需求编辑可同步修正岗位名称和JD快照', () => {
  assert.match(types, /job_title\?:\s*string/);
  assert.match(types, /jd_text\?:\s*string/);
  assert.match(source, /job_title:\s*demand\.job_title/);
  assert.match(source, /jd_text:\s*demand\.jd_text/);
  assert.match(source, /Field label="岗位名称"/);
  assert.match(source, /岗位 JD/);
  assert.match(source, /patch\('job_title'/);
  assert.match(source, /patch\('jd_text'/);
});
