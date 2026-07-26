import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const page = read('readdy-frontend/src/pages/offers/page.tsx');
assert.match(page, /offersApi\.listOffers/, 'Offer 页必须读取真实 Offer 列表');
assert.match(page, /offersApi\.getOffer/, 'Offer 详情必须读取最新历史和版本');
assert.match(page, /offersApi\.runAction/, 'Offer 状态推进必须调用真实状态机接口');
assert.match(page, /demandsApi\.listDemands/, '新建 Offer 必须读取真实招聘需求');
assert.match(page, /useProductRole/, '审批操作必须根据当前真实角色展示');
assert.match(page, /useSearchParams/, '面试结果进入 Offer 后必须承接需求和候选人深链');
assert.match(page, /searchParams\.get\(['"]demand['"]\)/, 'Offer 页必须读取 demand 参数');
assert.match(page, /searchParams\.get\(['"]candidate['"]\)/, 'Offer 页必须读取 candidate 参数');
assert.doesNotMatch(page, /@\/mocks\/offers|initialOffers|zhipin-current-role/, 'Offer 页不得使用假数据或旧角色缓存');

const createModal = read('readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx');
assert.match(createModal, /candidatesApi\.listCandidates/, '候选人必须从真实候选人接口读取');
assert.match(createModal, /offersApi\.saveDraft/, '保存草稿必须写入真实 Offer 接口');
assert.match(createModal, /current_stage\s*===\s*['"]offer['"]|stage:\s*['"]offer['"]/, '只能选择当前在 Offer 阶段的候选人');
assert.match(createModal, /approval_status\s*===\s*['"]approved['"]/, '只能选择已审核通过的招聘需求');
assert.match(createModal, /initialDemandId/, 'Offer 草稿弹窗必须支持预填需求');
assert.match(createModal, /initialCandidateId/, 'Offer 草稿弹窗必须支持预填候选人');
assert.doesNotMatch(createModal, /@\/mocks\/candidates|candidateList/, '新建 Offer 不得使用假候选人');

const drawer = read('readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx');
for (const action of ['submit', 'approve', 'reject', 'send', 'accept', 'decline', 'withdraw', 'expire', 'onboard']) {
  assert.match(drawer, new RegExp(`['"]${action}['"]`), `Offer 详情缺少 ${action} 状态操作`);
}
for (const label of ['记录为已发放', '实际入职日期', '操作历史', '版本']) {
  assert.ok(drawer.includes(label), `Offer 详情缺少“${label}”`);
}
assert.match(drawer, /status\s*===\s*409|\.status\s*===\s*409/, '409 并发冲突必须单独处理');
assert.match(drawer, /刷新最新状态/, '并发冲突必须能刷新最新状态');
assert.doesNotMatch(drawer, /邮件已发送|已成功发送邮件/, '页面不得假装邮件已真实发送');

const table = read('readdy-frontend/src/pages/offers/components/OfferTable.tsx');
assert.match(table, /OfferRecord/, 'Offer 表格必须使用真实 Offer 数据类型');
assert.doesNotMatch(table, /@\/mocks\/offers/, 'Offer 表格不得使用假数据类型');
for (const column of ['identity', 'demand', 'compensation', 'status', 'updated']) {
  assert.match(
    table,
    new RegExp(`data-ui="offer-column-filter-${column}"`),
    `5190 Offer 表头 ${column} 必须可展开筛选`,
  );
}
assert.match(page, /resetOfferFilters/, 'Offer 列筛选必须支持一键重置');
assert.match(page, /statusFilter/, 'Offer 列筛选必须支持精确状态');
assert.match(page, /updatedOrder/, 'Offer 列筛选必须支持更新时间排序');

console.log('readdy_mysql_pilot_offer_ui_contract: OK');
