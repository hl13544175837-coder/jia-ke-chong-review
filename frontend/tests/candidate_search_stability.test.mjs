import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const candidatesPage = readFileSync(
  join(__dirname, '../src/features/candidates/pages/CandidatesPage.tsx'),
  'utf8',
);

assert.match(
  candidatesPage,
  /const \[searchQuery, setSearchQuery\] = useState\(''\)/,
  'Candidate search should keep committed search text separate from the input being composed',
);
assert.match(
  candidatesPage,
  /const debouncedQuery = useDebounce\(searchQuery, 300\)/,
  'Candidate API search should debounce only committed search text',
);
assert.match(
  candidatesPage,
  /onCompositionStart=/,
  'Candidate search should detect the start of Chinese IME composition',
);
assert.match(
  candidatesPage,
  /onCompositionEnd=/,
  'Candidate search should commit Chinese IME text only after composition ends',
);
assert.match(
  candidatesPage,
  /if \(loading && data === null\)/,
  'Background candidate searches should keep the current page visible',
);
assert.match(
  candidatesPage,
  /libraryTotal/,
  'The library total should remain independent from the filtered result total',
);
assert.match(
  candidatesPage,
  /aria-live="polite"[\s\S]{0,180}正在搜索/,
  'Background search should expose a visible, accessible progress message',
);
assert.match(
  candidatesPage,
  /setSearchQuery\(''\)/,
  'Reset should clear both visible and committed search text',
);
