import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(testDir, '../..');
const referenceRoot = resolve(appRoot, '../references/readdy-export/src');
const productRoot = resolve(appRoot, 'readdy-frontend/src');
const inventoryScript = resolve(appRoot, 'frontend/scripts/inventory-interactive-controls.mjs');
const referenceZip = resolve(appRoot, '../references/readdy-export.zip');
const expectedZipHash = '627a59d6d023479d50d11a1b17ba978f350ca7fa3170e4a9895b7801e181096e';

const actualZipHash = createHash('sha256').update(readFileSync(referenceZip)).digest('hex');
assert.equal(actualZipHash, expectedZipHash, 'Readdy ZIP 基准文件哈希发生变化');
assert.equal(
  readFileSync(resolve(appRoot, 'readdy-frontend/ORIGINAL_ZIP_SHA256.txt'), 'utf8').trim().split(/\s+/)[0],
  expectedZipHash,
  '整合产品记录的 ZIP 来源哈希不正确',
);

function inventory(root) {
  return JSON.parse(execFileSync(process.execPath, [inventoryScript, root], { encoding: 'utf8' }));
}

function multiset(controls) {
  const result = new Map();
  for (const control of controls) {
    if (!control.label) continue;
    const key = `${control.file}\t${control.tag}\t${control.label}`;
    result.set(key, (result.get(key) || 0) + 1);
  }
  return result;
}

function collectSourceFiles(directory) {
  return readdirSync(directory)
    .sort()
    .map((entry) => join(directory, entry))
    .flatMap((path) => {
      if (statSync(path).isDirectory()) return collectSourceFiles(path);
      return ['.ts', '.tsx'].includes(extname(path)) ? [{ path, source: readFileSync(path, 'utf8') }] : [];
    });
}

const reference = inventory(referenceRoot);
const product = inventory(productRoot);
assert.equal(reference.total, 718, 'Readdy ZIP 原始控件清单发生变化');
const referenceSet = multiset(reference.controls);
const productSet = multiset(product.controls);
const missing = [];

for (const [key, expectedCount] of referenceSet) {
  const actualCount = productSet.get(key) || 0;
  if (actualCount < expectedCount) missing.push(`${key} (${actualCount}/${expectedCount})`);
}

const referenceFileTags = multiset(reference.controls.map((control) => ({
  ...control,
  label: `${control.file}\t${control.tag}`,
})));
const productFileTags = multiset(product.controls.map((control) => ({
  ...control,
  label: `${control.file}\t${control.tag}`,
})));
for (const [key, expectedCount] of referenceFileTags) {
  const actualCount = productFileTags.get(key) || 0;
  if (actualCount < expectedCount) missing.push(`${key} controls (${actualCount}/${expectedCount})`);
}

assert.deepEqual(missing, [], `整合版缺少 ZIP 原版控件：\n${missing.join('\n')}`);

const deadButtons = product.controls.filter((control) => (
  (control.tag === 'button' || control.tag === 'Button')
  && !control.action
  && !control.insideForm
  && !control.href
));
assert.deepEqual(
  deadButtons.map((control) => `${control.file}:${control.line} ${control.label || '(无文字按钮)'}`),
  [],
  '存在点了没有处理逻辑的按钮',
);

const productSourceFiles = collectSourceFiles(productRoot);
const productSource = productSourceFiles.map(({ source }) => source).join('\n');
const placeholderLocations = productSourceFiles.flatMap(({ path, source }) =>
  source.split('\n').flatMap((line, index) =>
    line.includes('功能开发中')
      ? [`${path.slice(productRoot.length + 1)}:${index + 1}`]
      : []
  )
);
assert.deepEqual(placeholderLocations, [], `仍有占位交互：\n${placeholderLocations.join('\n')}`);

for (const expectedRoute of [
  '/dashboard', '/dashboard/interviews', '/dashboard/hired', '/dashboard/cycle',
  '/dashboard/offers', '/jobs', '/candidates', '/talent-map', '/kanban', '/interviews',
  '/offers', '/kpi-standards', '/analytics', '/ai-assistant', '/settings',
  '/interviewer/dashboard', '/interviewer/interviews', '/interviewer/candidates',
  '/interviewer/jobs', '/interviewer/screening', '/director/cockpit', '/director/progress',
  '/director/insights', '/director/approvals',
]) {
  assert.ok(productSource.includes(`path: '${expectedRoute}'`), `缺少路由 ${expectedRoute}`);
}

for (const format of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', '.zip']) {
  assert.ok(productSource.includes(format), `完整前端缺少上传格式 ${format}`);
}

console.log(`readdy ZIP parity passed: ${reference.controls.length} controls preserved`);
