import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../src/components/AppShell.tsx'), 'utf8');

assert.match(source, /transition-all duration-300/, 'Readdy sidebar should animate open and collapse states');
assert.match(source, /motion-reduce:transition-none/, 'Shell transitions should respect reduced-motion preferences');
assert.doesNotMatch(source, /gsap\.from\(mainScope/, 'Route changes should not hide the whole content area with imperative animation');
