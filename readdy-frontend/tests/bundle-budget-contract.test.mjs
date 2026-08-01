import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const frontendRoot = path.resolve(import.meta.dirname, '..');
const projectRoot = path.resolve(frontendRoot, '..');

test('前端构建体积有明确红线并输出实际最大文件', () => {
  const file = path.join(projectRoot, 'scripts/check-frontend-bundle-budget.mjs');
  assert.equal(existsSync(file), true, '缺少前端包体积检查脚本');
  const source = readFileSync(file, 'utf8');

  assert.match(source, /ENTRY_LIMIT_BYTES\s*=\s*360_000/);
  assert.match(source, /ROUTE_LIMIT_BYTES\s*=\s*130_000/);
  assert.match(source, /index-.*\\\.js/);
  assert.match(source, /page-.*\\\.js/);
  assert.match(source, /最大路由包|largest route/i);
  assert.match(source, /process\.exitCode\s*=\s*1/);
});

test('正式构建后立即执行前端包体积门禁', () => {
  const source = readFileSync(path.join(projectRoot, 'scripts/check-sit-release.sh'), 'utf8');
  const buildIndex = source.indexOf('前端正式构建');
  const budgetIndex = source.indexOf('前端包体积门禁');

  assert.ok(buildIndex >= 0, '缺少前端正式构建步骤');
  assert.ok(budgetIndex > buildIndex, '包体积门禁必须在正式构建之后执行');
  assert.match(source, /node scripts\/check-frontend-bundle-budget\.mjs/);
});
