import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

test('KPI 标准 API 层：走真实后端且带版本乐观锁', () => {
  const api = read('src/features/kpiStandards/api.ts');
  assert.match(api, /kpiStandardsApi\s*=/);
  assert.match(api, /get\s*\(\)/);
  assert.match(api, /save\s*\(version: number, config: KpiStandardConfig\)/);
  assert.match(api, /reset\s*\(version: number\)/);
  assert.match(api, /['"]\/kpi-standards['"]/);
  assert.match(api, /method:\s*['"]PUT['"]/);
  assert.match(api, /method:\s*['"]POST['"]/);
  assert.match(api, /body:\s*\{\s*version,\s*config\s*\}/);
  assert.match(api, /from ['"]@\/lib\/api['"]/);
  assert.doesNotMatch(api, /localStorage|@\/mocks/i);
});

test('KPI 标准类型：字段与后端 schema 对齐', () => {
  const types = read('src/features/kpiStandards/types.ts');
  assert.match(types, /block_categories/);
  assert.match(types, /risk_thresholds/);
  assert.match(types, /health_thresholds/);
  assert.match(types, /high_if_status_paused_or_closed/);
  assert.match(types, /high_if_zero_fill_and_blocked/);
  assert.match(types, /medium_if_blocked/);
  assert.match(types, /medium_fill_ratio_threshold/);
  assert.match(types, /green_threshold/);
  assert.match(types, /yellow_threshold/);
  assert.match(types, /version: number/);
});

test('KPI 标准页面：不再使用 localStorage mock，接真实 API 并处理冲突', () => {
  const page = read('src/pages/kpi-standards/page.tsx');
  assert.match(page, /kpiStandardsApi\.get\(\)/);
  assert.match(page, /kpiStandardsApi\.save\(version, config\)/);
  assert.match(page, /kpiStandardsApi\.reset\(version\)/);
  // 版本冲突时重新拉取最新配置
  assert.match(page, /status === 409/);
  assert.match(page, /await load\(\)/);
  // 有加载失败重试入口
  assert.match(page, /重新加载/);
  assert.doesNotMatch(page, /@\/mocks\/kpiStandards/);
  assert.doesNotMatch(page, /localStorage/);
});

test('看板阻塞面板：使用真实需求数据和真实口径配置，无假人名', () => {
  const panel = read('src/pages/kanban/components/BlockagePanel.tsx');
  assert.match(panel, /interface BlockagePanelProps/);
  assert.match(panel, /demand: RecruitmentDemand/);
  assert.match(panel, /kpiConfig: KpiStandardConfig \| null/);
  assert.match(panel, /demand\.health/);
  assert.match(panel, /demand\.risk_flags/);
  assert.match(panel, /current_stage_counts/);
  assert.doesNotMatch(panel, /@\/mocks/);
  assert.doesNotMatch(panel, /张敏|李华|王磊/);
});

test('看板页面：为 manager/admin 拉取真实口径配置并渲染面板', () => {
  const page = read('src/pages/kanban/page.tsx');
  assert.match(page, /kpiStandardsApi\.get\(\)/);
  assert.match(page, /canViewKpiConfig/);
  assert.match(page, /<BlockagePanel demand=\{currentDemand\} kpiConfig=\{kpiConfig\} \/>/);
});

test('路由与菜单：KPI 标准入口放开给 manager/admin', () => {
  const router = read('src/router/config.tsx');
  assert.match(router, /KpiStandardsPage/);
  assert.match(router, /path: '\/kpi-standards'/);
  assert.match(router, /RequireCompanyRole allow=\{managerRoles\}/);
  assert.doesNotMatch(
    router.slice(router.indexOf('path: \'/kpi-standards\''), router.indexOf('path: \'/kpi-standards\'') + 200),
    /RoleHomeRedirect/,
  );

  const layout = read('src/components/feature/MainLayout.tsx');
  assert.match(layout, /path: '\/kpi-standards'/);
  assert.match(layout, /roles: \['manager'\]/);
  assert.match(layout, /roles: \['admin'\]/);
  assert.match(layout, /label: '口径配置'/);
});
