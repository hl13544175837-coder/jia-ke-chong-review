import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/HiredPage.tsx', import.meta.url), 'utf8');

assert.match(
  page,
  /function SummaryCard\([\s\S]*onActivate/,
  '入职摘要卡应支持可选的同页下钻行为',
);
assert.match(
  page,
  /type="button"[\s\S]*onClick=\{onActivate\}/,
  '可下钻的入职摘要卡应使用真实按钮语义',
);
assert.match(
  page,
  /const \[selectedHiredKpi, setSelectedHiredKpi\]/,
  '页面应保存当前 KPI 抽屉上下文',
);
assert.match(
  page,
  /<SummaryCard[\s\S]*onActivate=\{\(\) => setSelectedHiredKpi\([\s\S]*<SummaryCard[\s\S]*onActivate=\{\(\) => setSelectedHiredKpi\([\s\S]*<SummaryCard[\s\S]*onActivate=\{\(\) => setSelectedHiredKpi\(/,
  '三个入职 KPI 都应首击打开同页抽屉',
);
assert.match(
  page,
  /<DrawerShell[\s\S]*testId="hired-kpi-drawer"/,
  '入职 KPI 应在当前页右侧抽屉展开',
);
assert.match(page, /selectedHiredKpi[\s\S]*hired\.map/, 'KPI 抽屉应展示现有 Offer 数据');
assert.match(page, /to="\/offers"[\s\S]*进入完整工作台/, '抽屉底部应保留 Offer 工作台入口');
assert.match(page, /const \[selected, setSelected\]/, '不应破坏已有入职行详情抽屉');

console.log('hired_kpi_same_page_drawer: OK');
