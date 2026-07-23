import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const app = readFileSync(join(srcRoot, 'App.tsx'), 'utf8');
const facadeSources = [
  'features/assistant/pages.tsx',
  'features/analytics/pages.tsx',
  'features/pipeline/pages.tsx',
  'features/interviews/pages.tsx',
  'features/demands/pageEntries.tsx',
  'features/candidates/routes.tsx',
].map((path) => readFileSync(join(srcRoot, path), 'utf8')).join('\n');

assert.match(app, /lazy\(/, 'App should lazy-load the login page');
assert.match(app, /<Suspense/, 'Lazy routes should be wrapped in Suspense');

[
  'AgentPage',
  'BiPage',
  'PipelinePage',
  'InterviewListPage',
  'InterviewsPage',
  'JobMatchPage',
].forEach((page) => {
  assert.match(
    facadeSources,
    new RegExp(`const ${page} = lazy\\(\\(\\) => import\\(`),
    `${page} should be loaded only when its route is visited`,
  );
});

assert.doesNotMatch(
  `${app}\n${facadeSources}`,
  /import \{ TalentMapPage \}/,
  'Talent map should stay lazy-loaded instead of being imported into the app shell eagerly',
);
assert.match(
  facadeSources,
  /const TalentMapPage = lazy/,
  'Talent map should be lazy-loaded when its route is visited',
);
