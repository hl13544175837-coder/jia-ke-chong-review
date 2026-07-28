import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const candidates = read('readdy-frontend/src/pages/candidates/page.tsx');
const demandTabs = read('readdy-frontend/src/pages/jobs/components/RequisitionTabs.tsx');
const dashboard = read('readdy-frontend/src/pages/dashboard/page.tsx');

assert.doesNotMatch(
  candidates,
  /className=\{`border-b-2 px-3 py-2/,
  '候选人范围页签不应继续使用与其他状态页签割裂的下划线样式',
);
assert.match(candidates, /data-ui="candidate-scope-tab"/, '候选人范围页签应有统一样式标记');
assert.match(candidates, /rounded-lg border/, '候选人范围页签应使用与需求状态页签一致的框选结构');
assert.match(demandTabs, /rounded-(?:md|lg)[^`']*border/, '招聘需求状态页签应保留统一框选结构');

assert.match(dashboard, /function isDueTodayOrOverdue/, '工作台应按真实日期判断红色紧急提示');
assert.doesNotMatch(
  dashboard,
  /tone: \(demand\.metrics\.over_headcount > 0 \? 'red'/,
  'HC 超额属于需关注事项，不应默认标红',
);
assert.doesNotMatch(
  dashboard,
  /index === 1 \? 'bg-red-50 text-red-700'/,
  '提醒颜色不能依赖列表位置，应由事项紧急程度决定',
);
assert.match(dashboard, /attentionItems\.map\(\(item\) =>/, '提醒应携带自己的紧急程度');

console.log('recruitment_release_ui_guard: OK');
