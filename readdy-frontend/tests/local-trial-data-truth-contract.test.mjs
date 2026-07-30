import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('入职和招聘周期页面读取本地真实接口，不保留写死名单', () => {
  const hired = read('src/pages/dashboard/hired/page.tsx');
  const cycle = read('src/pages/dashboard/cycle/page.tsx');

  assert.match(hired, /offersApi\.listOffers/);
  assert.doesNotMatch(hired, /const hiredList\s*=\s*\[/);
  assert.match(cycle, /analyticsApi\.overview/);
  assert.doesNotMatch(cycle, /const cycleData\s*=\s*\[/);
  assert.match(hired, /暂时无法读取/);
  assert.match(cycle, /暂时无法读取/);
});

test('管理层现有四个页面统一读取真实统计，不再导入演示数据', () => {
  const pages = [
    'src/pages/director/cockpit/page.tsx',
    'src/pages/director/progress/page.tsx',
    'src/pages/director/insights/page.tsx',
    'src/pages/director/approvals/page.tsx',
  ];

  pages.forEach((file) => {
    const source = read(file);
    assert.match(source, /analyticsApi\.overview/, file);
    assert.doesNotMatch(source, /@\/mocks\//, file);
    assert.match(source, /暂时无法读取/, file);
  });
});

test('真实统计类型包含入职记录、周期明细和管理风险字段', () => {
  const types = read('src/features/analytics/types.ts');
  assert.match(types, /hired_records: AnalyticsHiredRecord\[\]/);
  assert.match(types, /cycle_rows: AnalyticsCycleRow\[\]/);
  assert.match(types, /attention_items: AnalyticsAttentionItem\[\]/);
  assert.match(types, /days_open: number/);
  assert.match(types, /over_headcount: number/);
  const directorData = read('src/pages/director/data.ts');
  assert.match(directorData, /Math\.min\(100, safeRate/);
  assert.match(directorData, /over_headcount: '超出招聘 HC'/);
  const insights = read('src/pages/director/insights/page.tsx');
  assert.match(insights, /current\.remaining \+= row\.remaining/);
  assert.match(insights, /const remaining = row\.remaining/);
  assert.doesNotMatch(insights, /to="\/candidates"/);
});

test('管理驾驶舱的现有报表入口允许总监访问', () => {
  const router = read('src/router/config.tsx');
  assert.match(router, /const analyticsRoles: ProductRole\[\] = \['recruiter', 'manager', 'admin', 'interviewer', 'hr_director'\]/);
  assert.match(router, /path: '\/analytics',[\s\S]*allow=\{analyticsRoles\}/);
});

test('本地登录桥和前端登录状态支持真实总监账号', () => {
  const bridge = read('../scripts/local-oauth-bridge.mjs');
  const auth = read('src/auth/companyAuth.tsx');
  const gatewayRoles = read('src/auth/gatewayRoles.ts');
  assert.match(bridge, /\['director01', 'director01@mvp\.local'\]/);
  assert.match(auth, /export type \{ CompanyRole \} from '.\/gatewayRoles'/);
  assert.match(gatewayRoles, /export type CompanyRole = [^;]*'hr_director'/);
  assert.match(gatewayRoles, /VALID_COMPANY_ROLES[^=]*=[\s\S]*'hr_director'/);
});
