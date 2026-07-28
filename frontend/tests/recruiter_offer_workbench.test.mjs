import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const workbenchPath = path.join(root, 'readdy-frontend/src/pages/offers/workbench.ts');

assert.equal(fs.existsSync(workbenchPath), true, 'Offer 工作台必须把待办与风险口径放进独立规则文件');

const {
  buildOfferTabCounts,
  filterAndSortOffers,
  isTodayOfferTask,
  offerPrimaryAction,
  offerRisk,
  offerStatusLabel,
} = await import(`${pathToFileURL(workbenchPath).href}?offer-workbench`);

const now = new Date('2026-07-27T12:00:00+08:00');
const record = (id, status, overrides = {}) => ({
  id,
  status,
  approval_status: status,
  candidate_name: `候选人${id}`,
  position: '产品经理',
  department: '产品部',
  request_no: `REQ-${id}`,
  salary_range: '25K × 14薪',
  onboard_date: null,
  created_by_name: '招聘专员01',
  created_at: '2026-07-27T01:00:00Z',
  updated_at: '2026-07-27T01:00:00Z',
  submitted_at: null,
  approved_at: null,
  sent_at: null,
  expires_at: null,
  responded_at: null,
  ...overrides,
});

const records = [
  record(1, 'draft'),
  record(2, 'pending', { submitted_at: '2026-07-25T01:00:00Z' }),
  record(3, 'approved', { approved_at: '2026-07-26T01:00:00Z' }),
  record(4, 'sent', { sent_at: '2026-07-23T01:00:00Z', expires_at: '2026-07-29T15:59:59Z' }),
  record(5, 'accepted', { responded_at: '2026-07-26T01:00:00Z', onboard_date: '2026-07-29' }),
  record(6, 'declined'),
  record(7, 'withdrawn'),
  record(8, 'expired'),
  record(9, 'onboarded'),
];

assert.equal(offerStatusLabel('pending'), '待确认');
assert.equal(offerPrimaryAction('approved'), '登记发放');
assert.deepEqual(buildOfferTabCounts(records, now), {
  today: 5,
  draft: 1,
  pending: 1,
  approved: 1,
  sent: 1,
  accepted: 1,
  history: 4,
});
assert.equal(offerRisk(records[3], now).level, 'high');
assert.equal(isTodayOfferTask(records[8], now), false);
assert.deepEqual(
  filterAndSortOffers({
    items: records,
    tab: 'today',
    search: '产品经理',
    demand: '',
    owner: '',
    risk: '',
    order: 'urgent',
    now,
  }).map((item) => item.id),
  [4, 2, 5, 3, 1],
);

const page = source('readdy-frontend/src/pages/offers/page.tsx');
const workbenchSource = source('readdy-frontend/src/pages/offers/workbench.ts');
assert.match(page, /确认方案、登记发放、跟进回复和确认入职/);
assert.match(page, /今日提醒/);
assert.match(page, /filterAndSortOffers/);
for (const copy of ['今日待办', '草稿', '待确认', '待发放', '待回复', '待入职', '历史记录']) {
  assert.match(`${page}\n${workbenchSource}`, new RegExp(copy), `Offer 页面缺少“${copy}”`);
}
for (const filter of ['招聘需求', '负责人', '风险', '紧急优先']) {
  assert.match(page, new RegExp(filter), `Offer 页面缺少“${filter}”筛选`);
}
assert.match(page, /md:grid-cols-2/, '中等宽度下筛选区必须分成两列，避免挤出页面');
assert.match(page, /xl:grid-cols-3/, '常见桌面宽度下筛选区最多使用三列');

const table = source('readdy-frontend/src/pages/offers/components/OfferTable.tsx');
assert.match(table, /查看确认进度/, '招聘专员不能看到自审 Offer 的误导按钮');
assert.match(table, /role/, 'Offer 行主操作必须根据当前角色显示');

const drawer = source('readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx');
assert.match(drawer, /role === 'manager'[\s\S]*return \['approve', 'reject'\]/, '只有经理类角色可以确认或驳回 Offer');
assert.match(drawer, /canMaintain \? \['withdraw'\] : \[\]/, '待确认期间招聘专员只能撤回，不能自行确认');
assert.match(drawer, /canMaintain/, 'Offer 修改、发放、回复与入职操作必须限制给招聘专员或管理员');
assert.match(drawer, /已退回招聘专员修改/, '主管查看退回记录时必须明确下一步由招聘专员处理');
const detail = source('readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx');
const createModal = source('readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx');
const offerSurface = `${page}\n${table}\n${detail}\n${createModal}\n${workbenchSource}`;
for (const copy of ['已退回修改', '修改后重提']) {
  assert.match(offerSurface, new RegExp(copy), `经理退回的 Offer 缺少“${copy}”`);
}
assert.match(detail, /退回修改/, '主管退回操作不能再误写成终止流程');
assert.match(detail, /退回原因/, '退回的 Offer 必须明确显示退回原因');
assert.doesNotMatch(table, /min-w-\[1040px\]/, 'Offer 表格不应在常见桌面宽度下强制横向滚动');
for (const copy of ['继续编辑', '确认 Offer', '登记发放', '登记候选人回复', '确认入职', '查看记录']) {
  assert.match(offerSurface, new RegExp(copy), `Offer 操作缺少“${copy}”`);
}
for (const stale of ['提交审批', '待审批', '审批通过', '审批人']) {
  assert.doesNotMatch(offerSurface, new RegExp(stale), `Offer 页面仍残留旧文案“${stale}”`);
}
for (const channel of ['企业微信', '邮件', '线下', '其他']) assert.match(detail, new RegExp(channel));
assert.match(detail, /仅登记发送结果/);

console.log('recruiter_offer_workbench: OK');
