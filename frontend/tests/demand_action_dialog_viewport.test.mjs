import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(__dirname, '../src/features/demands/components/DemandActionDialog.tsx'),
  'utf8',
);

assert.match(
  source,
  /createPortal/,
  'Demand action dialog should portal outside the animated page container',
);
assert.match(
  source,
  /document\.body/,
  'Demand action dialog should mount against the browser body',
);
assert.ok(
  source.includes('max-h-[calc(100dvh-2rem)]'),
  'Demand action panel should stay within the current viewport height',
);
assert.match(
  source,
  /overflow-y-auto/,
  'Demand action content should scroll inside the dialog on short screens',
);
assert.match(
  source,
  /shrink-0/,
  'Demand action footer should remain visible while the content scrolls',
);
assert.match(
  source,
  /event\.key === 'Escape'/,
  'Demand action dialog should support Escape to close',
);
assert.match(
  source,
  /!busyRef\.current/,
  'Demand action dialog should ignore Escape while an action is submitting',
);
assert.match(
  source,
  /document\.body\.style\.overflow = 'hidden'/,
  'Demand action dialog should lock background body scrolling while open',
);
assert.match(
  source,
  /previousFocusRef\.current\.focus\(\)/,
  'Demand action dialog should restore focus after closing',
);
assert.match(
  source,
  /event\.key === 'Tab'/,
  'Keyboard focus should loop inside the modal dialog',
);
assert.match(
  source,
  /appRoot\.inert = true/,
  'The application behind the modal should be inert while the dialog is open',
);
assert.match(
  source,
  /useLayoutEffect\(\(\) => \{[\s\S]*busyRef\.current = busy;[\s\S]*onCancelRef\.current = onCancel;[\s\S]*\}, \[busy, onCancel\]\)/,
  'Escape handling should update latest props after commit and before user input',
);
assert.doesNotMatch(
  source,
  /const isOpen = mode !== null;\s*busyRef\.current = busy;/,
  'The modal should not mutate latest-prop refs during a render that React may discard',
);
assert.match(
  source,
  /previousFocusRef\.current\?\.isConnected/,
  'Focus should only be restored to a trigger that still exists',
);
