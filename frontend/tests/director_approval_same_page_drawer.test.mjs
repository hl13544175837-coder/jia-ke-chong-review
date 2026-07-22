import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(
  new URL('../src/pages/director/DirectorApprovalsPage.tsx', import.meta.url),
  'utf8',
);

// 总监审批列表的详情阅读应留在当前页，并复用统一右侧抽屉。
assert.match(
  page,
  /import \{ DrawerShell \} from '\.\.\/\.\.\/components\/ui\/DrawerShell'/,
  '审批详情应复用共享 DrawerShell',
);
assert.match(
  page,
  /const \[selectedOffer, setSelectedOffer\] = useState<OfferRecord \| null>\(null\)/,
  '页面应维护当前查看的 Offer',
);
assert.match(
  page,
  /setSelectedOffer\(offer\)[\s\S]*api\.getOffer\(offer\.id\)/,
  '打开抽屉后应读取真实 Offer 详情与操作历史',
);
assert.match(
  page,
  /const detailRequestRef = useRef\(0\)[\s\S]*const requestId = \+\+detailRequestRef\.current[\s\S]*requestId !== detailRequestRef\.current/,
  '切换或关闭抽屉后，过期请求不得重新打开或覆盖当前详情',
);
assert.match(
  page,
  /<tr[\s\S]*onClick=\{\(\) => void openOfferDetails\(offer\)\}/,
  '待审批整行应在当前页打开详情',
);
assert.match(
  page,
  /近期审批与后续进展[\s\S]*onClick=\{\(\) => void openOfferDetails\(offer\)\}/,
  '近期处理记录整行应在当前页打开只读详情',
);

// 行内审批按钮仍走原状态机，但必须阻止点击冒泡误开详情。
assert.match(
  page,
  /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*setActionTarget\(\{ offer, action: 'approve' \}\)/,
  '通过按钮应阻止整行点击并保留原审批动作',
);
assert.match(
  page,
  /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*setActionTarget\(\{ offer, action: 'reject' \}\)/,
  '拒绝按钮应阻止整行点击并保留原审批动作',
);
assert.match(page, /api\.runOfferAction/, '审批写操作仍必须使用真实 Offer API');

assert.match(page, /<DrawerShell[\s\S]*title="Offer 审批详情"/);
assert.match(page, /testId="director-approval-detail-drawer"/);
assert.match(page, />基本信息</);
assert.match(page, />薪资与入职</);
assert.match(page, />状态与时间</);
assert.match(page, />备注与处理记录</);
assert.match(
  page,
  /<Link[\s\S]*to="\/offers"[\s\S]*前往 Offer 管理/,
  '抽屉内可提供明确的次级入口，但列表普通点击不得跳页',
);

console.log('director_approval_same_page_drawer: OK');
