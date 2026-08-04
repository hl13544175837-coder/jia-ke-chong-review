import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'src');
const routerConfig = path.join(sourceRoot, 'router', 'config.tsx');

const knownRuntimeMockDebt = new Set([
  'src/pages/talent-map/page.tsx -> @/mocks/talentMap',
]);

const allowedStaticLookups = new Set([
  '@/mocks/options',
]);

function moduleFile(target) {
  const candidates = [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    path.join(target, 'index.ts'),
    path.join(target, 'index.tsx'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function resolveImport(importer, specifier) {
  if (specifier.startsWith('@/')) return moduleFile(path.join(sourceRoot, specifier.slice(2)));
  if (specifier.startsWith('.')) return moduleFile(path.resolve(path.dirname(importer), specifier));
  return null;
}

function runtimeImports(file) {
  const source = readFileSync(file, 'utf8');
  const imports = [];
  const staticPattern = /import\s+(?!type\b)[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/g;
  const sideEffectPattern = /import\s*['"]([^'"]+)['"]/g;
  const dynamicPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const pattern of [staticPattern, sideEffectPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return [...new Set(imports)];
}

function routeEntries() {
  return runtimeImports(routerConfig)
    .filter((specifier) => specifier.startsWith('@/pages/'))
    .map((specifier) => resolveImport(routerConfig, specifier))
    .filter(Boolean);
}

function reachableRuntimeMockImports() {
  const visited = new Set();
  const queue = routeEntries();
  const violations = [];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    for (const specifier of runtimeImports(file)) {
      const resolved = resolveImport(file, specifier);
      if (!resolved) continue;
      if (resolved.startsWith(path.join(sourceRoot, 'mocks'))) {
        if (allowedStaticLookups.has(specifier)) continue;
        violations.push(`${path.relative(root, file)} -> ${specifier}`);
        continue;
      }
      if (resolved.startsWith(sourceRoot)) queue.push(resolved);
    }
  }

  return [...new Set(violations)].sort();
}

test('正式路由禁止新增运行时 Mock 业务数据依赖', () => {
  const violations = reachableRuntimeMockImports();
  const unexpected = violations.filter((item) => !knownRuntimeMockDebt.has(item));
  const staleAllowlist = [...knownRuntimeMockDebt].filter((item) => !violations.includes(item));

  assert.deepEqual(unexpected, [], `发现新的正式路由 Mock 依赖：\n${unexpected.join('\n')}`);
  assert.deepEqual(staleAllowlist, [], `以下 Mock 债已消失，请删除临时白名单：\n${staleAllowlist.join('\n')}`);
});
