import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../src/pages/PipelinePage.tsx'), 'utf8');
const drawerSource = source.slice(
  source.indexOf('function InterviewActionDrawer'),
  source.indexOf('function CandidateDetailDialog'),
);

assert.match(
  source,
  /import \{ createPortal \} from 'react-dom';/,
  'Interview action drawer should use a React portal',
);
assert.match(
  drawerSource,
  /return createPortal\([\s\S]*document\.body,[\s\S]*\);/,
  'Interview action drawer should mount against document.body so animated page transforms cannot clip it',
);
assert.match(
  drawerSource,
  /fixed inset-0/,
  'Interview action drawer backdrop should cover the browser viewport',
);
assert.match(
  drawerSource,
  /overflow-y-auto/,
  'Interview action drawer content should remain independently scrollable',
);
