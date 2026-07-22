import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const interviews = readFileSync(new URL('../src/pages/ReaddyInterviewsPage.tsx', import.meta.url), 'utf8');
const offers = readFileSync(new URL('../src/pages/OffersPage.tsx', import.meta.url), 'utf8');
const jobs = readFileSync(new URL('../src/pages/JobsPage.tsx', import.meta.url), 'utf8');
const hired = readFileSync(new URL('../src/pages/HiredPage.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
const analytics = readFileSync(new URL('../src/pages/AnalyticsPage.tsx', import.meta.url), 'utf8');

assert.match(
  interviews,
  /record\.assignment_id == null[\s\S]*record\.candidate_id === assignment\.candidate_id/,
  '只有历史上没有 assignment_id 的反馈才能按候选人、需求和轮次回退匹配',
);
assert.match(
  interviews,
  /onKeyDown=\{\(event\) => \{\s*if \(event\.target !== event\.currentTarget\) return;/,
  '面试行键盘交互不得吞掉行内按钮的 Enter/Space',
);
assert.match(
  offers,
  /onKeyDown=\{\(event\) => \{\s*if \(event\.target !== event\.currentTarget\) return;/,
  'Offer 行键盘交互不得误触行内状态动作',
);
assert.match(
  jobs,
  /function handleJobRowKeyDown[\s\S]*if \(event\.target !== event\.currentTarget\) return;/,
  '岗位行键盘交互不得阻止编辑输入框输入空格',
);
assert.doesNotMatch(
  jobs,
  /<tr[\s\S]{0,180}role="button"[\s\S]{0,500}handleJobRowKeyDown/,
  '岗位表格行包含输入框和按钮，不得再伪装成一个包含子按钮的大按钮',
);
assert.match(
  hired,
  /onKeyDown=\{\(event\) => \{\s*if \(event\.target !== event\.currentTarget\) return;/,
  '已入职行键盘交互不得吞掉姓名按钮的 Enter/Space',
);
assert.match(offers, /const detailRequestRef = useRef\(0\)/, 'Offer 详情请求应有序列保护');
assert.match(
  offers,
  /if \(requestId !== detailRequestRef\.current\) return;/,
  '快速切换 Offer 时旧请求不得覆盖当前抽屉',
);
assert.match(
  offers,
  /detailRequestRef\.current \+= 1;[\s\S]*setSelected\(null\)/,
  '关闭 Offer 抽屉时必须让未完成详情请求失效',
);
assert.match(
  offers,
  /function invalidateOfferDetail\([\s\S]*detailRequestRef\.current \+= 1;[\s\S]*setSelected\(null\)/,
  '打开编辑或状态操作前应统一关闭并作废详情抽屉',
);
assert.match(offers, /onEdit=\{\(\) => openEditForm\(offer\)\}/, '编辑 Offer 前应关闭竞争中的详情请求');
assert.match(offers, /onAction=\{\(action\) => openActionModal\(offer, action\)\}/, '状态操作前应关闭竞争中的详情请求');
assert.match(
  offers,
  /const \[detailError, setDetailError\] = useState\(''\)/,
  'Offer 详情接口失败时应在抽屉内保留明确的错误状态',
);
assert.match(
  offers,
  /disabled=\{loading \|\| Boolean\(error\)\}/,
  'Offer 详情尚未读取成功时不得打印列表中的简版数据',
);

const kanban = readFileSync(new URL('../src/pages/KanbanPage.tsx', import.meta.url), 'utf8');
assert.match(
  kanban,
  /useEffect\(\(\) => \{[\s\S]*setDetailCandidateId\(null\)[\s\S]*\}, \[effectiveDemandId\]\)/,
  '切换 Demand 时必须清理旧候选人的详情和操作上下文',
);
assert.match(interviews, /useSearchParams/, '面试管理应读取同页下钻链接的筛选参数');
assert.match(interviews, /searchParams\.get\('status'\)/, '待补反馈链接应真正应用状态筛选');
assert.match(interviews, /searchParams\.get\('demand'\)/, '单 Demand 面试链接应真正应用需求筛选');
assert.match(
  interviews,
  /const \[searchParams, setSearchParams\] = useSearchParams\(\)/,
  '面试页应能在用户调整筛选时同步更新深链接参数',
);
assert.match(
  interviews,
  /function changeStatusFilter[\s\S]*setSearchParams\(next, \{ replace: true \}\)/,
  '状态筛选和 URL 必须保持一致，避免清除后刷新又恢复旧筛选',
);
assert.match(
  interviews,
  /function clearAllFilters[\s\S]*setSearchParams\(new URLSearchParams\(\), \{ replace: true \}\)/,
  '清除全部筛选时应同时清空地址栏筛选参数',
);
assert.doesNotMatch(
  `${dashboard}\n${analytics}`,
  /\/kanban\?stage=business_review/,
  '组织级待反馈汇总不能冒充默认第一条 Demand 的精准阶段下钻',
);

console.log('same_page_interaction_safety: OK');
