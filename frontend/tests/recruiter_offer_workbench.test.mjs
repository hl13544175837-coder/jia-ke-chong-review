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

console.log('recruiter_offer_workbench: OK');
