import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'src');
const pagesRoot = path.join(sourceRoot, 'pages');
const routerConfig = path.join(sourceRoot, 'router', 'config.tsx');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

function pageOwner(target) {
  let directory = path.extname(target) ? path.dirname(target) : target;
  while (directory.startsWith(pagesRoot)) {
    if (existsSync(path.join(directory, 'page.tsx'))) return directory;
    if (directory === pagesRoot) break;
    directory = path.dirname(directory);
  }
  return null;
}

function resolveImport(importer, specifier) {
  if (specifier.startsWith('@/')) return path.join(sourceRoot, specifier.slice(2));
  if (specifier.startsWith('.')) return path.resolve(path.dirname(importer), specifier);
  return null;
}

test('业务代码不直接引用其他页面目录里的内部组件', () => {
  const violations = [];

  sourceFiles(sourceRoot).forEach((file) => {
    if (file === routerConfig) return;
    const importerOwner = pageOwner(file);
    const source = readFileSync(file, 'utf8');
    const importPattern = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

    for (const match of source.matchAll(importPattern)) {
      const target = resolveImport(file, match[1]);
      if (!target || !target.startsWith(pagesRoot)) continue;
      const targetOwner = pageOwner(target);
      if (!targetOwner || importerOwner === targetOwner) continue;
      violations.push(`${path.relative(root, file)} -> ${match[1]}`);
    }
  });

  assert.deepEqual(
    violations,
    [],
    `跨页面依赖必须迁移到 src/features：\n${violations.join('\n')}`,
  );
});

test('候选人详情和工作台模块保持单向依赖', () => {
  const candidateFeature = sourceFiles(path.join(sourceRoot, 'features', 'candidates'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const dashboard = readFileSync(path.join(pagesRoot, 'dashboard', 'page.tsx'), 'utf8');
  const communicationTasks = readFileSync(
    path.join(sourceRoot, 'features', 'workbench', 'communicationTasks.ts'),
    'utf8',
  );

  assert.doesNotMatch(candidateFeature, /@\/pages\//);
  assert.doesNotMatch(dashboard, /pages\/offers/);
  assert.doesNotMatch(communicationTasks, /@\/pages\//);
});
