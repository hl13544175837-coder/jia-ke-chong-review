import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/KanbanPage.tsx', import.meta.url), 'utf8');

assert.match(page, /DrawerShell/, 'Kanban 候选人流程详情应复用统一右侧抽屉');
assert.match(
  page,
  /data-ui="kanban-candidate-card"[\s\S]*?onClick=\{onOpen\}/,
  '点击候选人卡片空白区应在当前看板打开抽屉',
);
assert.doesNotMatch(
  page,
  /data-ui="kanban-candidate-card"\s+role="button"/,
  '整卡不得伪装成包含多个子按钮的单一按钮；键盘用户使用姓名按钮打开详情',
);
assert.match(page, /data-ui="kanban-candidate-name"/, '卡片姓名应打开当前页抽屉');
assert.match(
  page,
  /event\.stopPropagation\(\)/,
  '推进、淘汰、修正、转需求和历史操作不得误触卡片抽屉',
);
assert.match(page, /data-ui="kanban-candidate-drawer"/, '看板候选人抽屉应有可验收标识');
assert.match(page, /stageLabel\(detailCandidate\.stage\)/, '抽屉必须展示看板真实当前阶段');
assert.match(page, /detailOffer/, '抽屉应复用真实 Offer 状态');
assert.match(page, /data-ui="kanban-kpi-button"/, '顶部 KPI 应可点击定位');
assert.match(page, /data-ui="kanban-stage-button"/, '阶段标题应可点击定位');
assert.match(page, /function focusStage\(/, 'KPI 与阶段应共用当前页定位逻辑');
assert.match(page, /scrollIntoView/, '定位阶段应在当前页内滚动完成');

console.log('kanban_same_page_drawer: OK');
