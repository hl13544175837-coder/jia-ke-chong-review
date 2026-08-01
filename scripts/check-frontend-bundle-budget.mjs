#!/usr/bin/env node

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY_LIMIT_BYTES = 360_000;
const ROUTE_LIMIT_BYTES = 130_000;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(scriptDir, '..', 'readdy-frontend', 'out', 'assets');

function formatKilobytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function measuredFiles(pattern) {
  const names = (await readdir(assetsDir)).filter((name) => pattern.test(name));
  return Promise.all(names.map(async (name) => ({
    name,
    bytes: (await stat(path.join(assetsDir, name))).size,
  })));
}

function largest(files) {
  return [...files].sort((left, right) => right.bytes - left.bytes)[0];
}

async function main() {
  let entries;
  let routes;
  try {
    entries = await measuredFiles(/^index-.*\.js$/);
    routes = await measuredFiles(/^page-.*\.js$/);
  } catch (error) {
    console.error(`无法读取前端构建产物：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const entry = largest(entries);
  const route = largest(routes);
  if (!entry || !route) {
    console.error('前端构建产物不完整：没有找到入口包或路由包，请先运行 npm run build。');
    process.exitCode = 1;
    return;
  }

  console.log(`入口包：${entry.name} · ${formatKilobytes(entry.bytes)}（上限 ${formatKilobytes(ENTRY_LIMIT_BYTES)}）`);
  console.log(`最大路由包：${route.name} · ${formatKilobytes(route.bytes)}（上限 ${formatKilobytes(ROUTE_LIMIT_BYTES)}）`);

  const failures = [];
  if (entry.bytes > ENTRY_LIMIT_BYTES) {
    failures.push(`入口包超过上限 ${formatKilobytes(ENTRY_LIMIT_BYTES)}`);
  }
  if (route.bytes > ROUTE_LIMIT_BYTES) {
    failures.push(`最大路由包超过上限 ${formatKilobytes(ROUTE_LIMIT_BYTES)}`);
  }
  if (failures.length > 0) {
    console.error(`前端包体积门禁未通过：${failures.join('；')}。请先拆分依赖或页面代码。`);
    process.exitCode = 1;
    return;
  }

  console.log('前端包体积门禁通过。');
}

await main();
