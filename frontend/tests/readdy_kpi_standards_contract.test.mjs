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
assert.match(page, /阶段停滞天数/);
assert.match(page, /无推荐预警天数/);
assert.match(page, /低面试转化候选人阈值/);
assert.match(page, /需求开放过久天数/);
assert.match(page, /不用于个人排名或绩效评价/);
assert.doesNotMatch(page, /流程健康度阈值|绿色正常线|黄色警戒线|high_if_status_paused_or_closed|high_if_zero_fill_and_blocked|attention_hc_gap_ratio|attention_if_blocked/);
assert.doesNotMatch(page, /localStorage|sessionStorage|mocks\/kpiStandards|专员健康度/);
assert.match(api, /getKpiStandards\(/);
assert.match(app, /path="\/kpi-standards"/);
assert.match(nav, /to: '\/kpi-standards'/);

console.log('readdy_kpi_standards_contract: OK');
