import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const rejectionForm = readSource('components/pipeline/RejectionDispositionForm.tsx');

assert.match(
  rejectionForm,
  /请填写淘汰原因/,
  'Rejecting a candidate should block submission until HR provides a reason',
);

assert.match(
  rejectionForm,
  /disabled=\{busy \|\| !reason\.trim\(\)\}/,
  'The confirm-reject button should be disabled when the required reason is empty',
);
