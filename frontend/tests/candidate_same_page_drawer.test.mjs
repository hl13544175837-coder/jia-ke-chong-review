import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(
  new URL('../src/features/candidates/pages/CandidatesPage.tsx', import.meta.url),
  'utf8',
);

assert.match(page, /DrawerShell/, '候选人详情应复用统一右侧抽屉');
assert.match(
  page,
  /data-ui="candidate-interactive-row"[\s\S]*?onClick=\{\(\) => onPreview\(candidate\)\}/,
  '点击候选人整行应在当前页打开详情',
);
assert.match(
  page,
  /data-ui="candidate-name-trigger"/,
  '候选人姓名应是当前页详情入口',
);
assert.match(
  page,
  /event\.stopPropagation\(\)/,
  '复选框、添加需求和行内操作不得误触整行抽屉',
);
assert.match(page, /data-ui="candidate-detail-drawer"/, '候选人抽屉应有可验收标识');
assert.match(page, /候选人概览/, '抽屉应保留候选人概览');
assert.match(page, /当前应聘 \/ 流程/, '抽屉应有真实应聘流程入口');
assert.match(
  page,
  /api\.getCandidatePipelines\(candidate\.id\)/,
  '当前应聘必须来自真实候选人流程接口',
);
assert.match(
  page,
  /to=\{`\/kanban\?demand=\$\{pipeline\.demand_id\}&candidate=\$\{candidate\.id\}`\}/,
  '每条应聘记录应能深链到对应 Demand 和候选人',
);
assert.match(
  page,
  /to=\{`\/candidates\/\$\{candidate\.id\}`\}[\s\S]*?查看完整档案/,
  '完整候选人档案应作为次级深链保留',
);

console.log('candidate_same_page_drawer: OK');
