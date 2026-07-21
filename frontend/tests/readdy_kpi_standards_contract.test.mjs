import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/KpiStandardsPage.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../src/lib/nav.ts', import.meta.url), 'utf8');

assert.match(page, /data-ui="readdy-kpi-standards"/);
assert.match(page, /api\.getKpiStandards/);
assert.match(page, /api\.saveKpiStandards/);
assert.match(page, /api\.resetKpiStandards/);
assert.match(page, /流程健康度阈值/);
assert.match(page, /不用于个人排名或绩效评价/);
assert.doesNotMatch(page, /localStorage|sessionStorage|mocks\/kpiStandards|专员健康度/);
assert.match(api, /getKpiStandards\(/);
assert.match(app, /path="\/kpi-standards"/);
assert.match(nav, /to: '\/kpi-standards'/);

console.log('readdy_kpi_standards_contract: OK');
