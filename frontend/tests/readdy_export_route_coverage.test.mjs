import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(testDir, '../src');

function collectRouteSources(directory) {
  return readdirSync(directory)
    .sort()
    .flatMap((entry) => {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) return collectRouteSources(path);
      if (!['.ts', '.tsx'].includes(extname(path))) return [];
      const source = readFileSync(path, 'utf8');
      return source.includes('path=') || source.includes('path:') ? [source] : [];
    });
}

const routeSource = collectRouteSources(srcRoot).join('\n');
const expectedRoutes = [
  '/dashboard',
  '/dashboard/interviews',
  '/dashboard/hired',
  '/dashboard/cycle',
  '/dashboard/offers',
  '/jobs',
  '/candidates',
  '/talent-map',
  '/kanban',
  '/interviews',
  '/offers',
  '/kpi-standards',
  '/analytics',
  '/ai-assistant',
  '/settings',
  '/interviewer/dashboard',
  '/interviewer/interviews',
  '/interviewer/candidates',
  '/interviewer/jobs',
  '/interviewer/screening',
  '/director/cockpit',
  '/director/progress',
  '/director/insights',
  '/director/approvals',
];

const missing = expectedRoutes.filter((path) => (
  !routeSource.includes(`path=\"${path}\"`)
  && !routeSource.includes(`path: '${path}'`)
  && !routeSource.includes(`path: \"${path}\"`)
));

assert.deepEqual(missing, [], `缺少 Readdy 导出路由：${missing.join(', ')}`);
console.log(`readdy_export_route_coverage: OK (${expectedRoutes.length} routes)`);
