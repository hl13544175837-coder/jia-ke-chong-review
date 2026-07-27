import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const page = fs.readFileSync(
  path.join(root, 'readdy-frontend/src/pages/dashboard/page.tsx'),
  'utf8',
);

assert.match(
  page,
  /type DashboardPanel = 'headcount' \| 'tasks' \| 'waiting' \| 'interviews'/,
  '工作台应明确四个可展开板块',
);
assert.match(
  page,
  /useState<DashboardPanel \| null>\(null\)/,
  '四个明细板块进入页面时必须默认收起',
);
assert.match(
  page,
  /current === panel \? null : panel/,
  '点击同一卡片应收起，点击其他卡片应切换为单开状态',
);
assert.match(page, /aria-expanded=\{expandedPanel === card\.panel\}/, '概览卡必须向读屏器说明展开状态');
assert.match(page, /aria-controls=\{card\.controls\}/, '概览卡必须关联自己控制的明细区域');

for (const [panel, regionId] of [
  ['headcount', 'dashboard-headcount-panel'],
  ['tasks', 'dashboard-tasks-panel'],
  ['waiting', 'dashboard-waiting-panel'],
  ['interviews', 'dashboard-interviews-panel'],
]) {
  assert.match(
    page,
    new RegExp(`expandedPanel === '${panel}'`),
    `${panel} 卡片应独立控制自己的明细`,
  );
  assert.match(page, new RegExp(`id="${regionId}"`), `${panel} 明细区必须有稳定 ID`);
}

assert.match(page, /ri-arrow-up-s-line/, '展开卡片应显示收起箭头');
assert.match(page, /ri-arrow-down-s-line/, '收起卡片应显示展开箭头');

console.log('dashboard_summary_card_disclosure: OK');
