#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ALLOWED_RSC_ADVISORY = 'GHSA-qwww-vcr4-c8h2';
const AUDIT_COMMAND = 'npm audit --json';
const HIGH_SEVERITIES = new Set(['high', 'critical']);
const RSC_PATTERNS = [
  /react-router\/dom(?:-export)?/,
  /RSCHydratedRouter/,
  /RSCStaticRouter/,
  /createCallServer/,
  /react-server/,
];

const advisoryId = (entry) => {
  const match = String(entry?.url ?? '').match(/(GHSA-[a-z0-9-]+)$/i);
  return match?.[1] ?? `UNKNOWN-${entry?.source ?? 'ADVISORY'}`;
};

export const evaluateAuditReport = (report) => {
  if (report?.error) {
    return {
      allowedAdvisories: [],
      blockedAdvisories: [`AUDIT-ERROR:${report.error.summary ?? 'unknown'}`],
    };
  }

  const ids = new Set();
  for (const vulnerability of Object.values(report?.vulnerabilities ?? {})) {
    for (const entry of vulnerability?.via ?? []) {
      if (typeof entry !== 'object' || !HIGH_SEVERITIES.has(entry.severity)) continue;
      ids.add(advisoryId(entry));
    }
  }

  const sorted = [...ids].sort();
  return {
    allowedAdvisories: sorted.filter((id) => id === ALLOWED_RSC_ADVISORY),
    blockedAdvisories: sorted.filter((id) => id !== ALLOWED_RSC_ADVISORY),
  };
};

const sourceFiles = (root) => {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    if (statSync(fullPath).isDirectory()) files.push(...sourceFiles(fullPath));
    else if (/\.(?:[cm]?js|tsx?)$/.test(entry)) files.push(fullPath);
  }
  return files;
};

export const scanForRscEntrypoints = (sourceRoot) => {
  const matches = [];
  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, 'utf8');
    if (RSC_PATTERNS.some((pattern) => pattern.test(source))) matches.push(file);
  }
  return matches;
};

const readAuditReport = (frontendRoot) => {
  try {
    return JSON.parse(execFileSync('npm', ['audit', '--json'], {
      cwd: frontendRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch (error) {
    const output = error?.stdout?.toString?.() ?? '';
    if (!output.trim()) throw error;
    return JSON.parse(output);
  }
};

const main = () => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.dirname(scriptDir);
  const frontendRoot = path.join(projectRoot, 'readdy-frontend');
  const report = readAuditReport(frontendRoot);
  const { allowedAdvisories, blockedAdvisories } = evaluateAuditReport(report);
  const rscEntrypoints = scanForRscEntrypoints(path.join(frontendRoot, 'src'));

  if (blockedAdvisories.length > 0) {
    console.error(`前端依赖审计失败：新增高危公告 ${blockedAdvisories.join(', ')}`);
    return 1;
  }
  if (allowedAdvisories.length > 0 && rscEntrypoints.length > 0) {
    console.error('前端依赖审计失败：项目已出现 RSC 入口，原安全例外不再适用。');
    for (const file of rscEntrypoints) console.error(`- ${path.relative(projectRoot, file)}`);
    return 1;
  }

  if (allowedAdvisories.length > 0) {
    console.log(
      `前端依赖审计通过（明确例外 ${ALLOWED_RSC_ADVISORY}：仅影响未启用的 RSC 模式）。`,
    );
  } else {
    console.log(`前端依赖审计通过（${AUDIT_COMMAND} 无高危结果）。`);
  }
  return 0;
};

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) process.exitCode = main();
