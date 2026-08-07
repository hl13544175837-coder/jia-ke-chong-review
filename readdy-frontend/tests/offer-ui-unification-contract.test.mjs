import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jitiFactory from 'jiti';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const jiti = jitiFactory(import.meta.url, { interopDefault: true });
const offerWorkbench = await jiti.import('../src/pages/offers/workbench.ts');

test('Offer 常用条件直接展示并支持按更新时间筛选', () => {
  const page = read('src/pages/offers/page.tsx');
  assert.match(page, /FilterBar/);
  assert.match(page, /updatedDateFilter/);
  assert.match(page, /按更新时间筛选/);
  assert.match(page, /resetOfferFilters/);
  assert.doesNotMatch(page, /面试轮次/);
});

test('Offer 页面固定为待登记、跟进中、已完成并登记 OA 结果', () => {
  const page = read('src/pages/offers/page.tsx');
  const table = read('src/pages/offers/components/OfferTable.tsx');
  const workbench = read('src/pages/offers/workbench.ts');
  const api = read('src/features/offers/api.ts');
  const tabsBlock = workbench.match(/OFFER_WORKBENCH_TABS[\s\S]*?=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
  const labels = [...tabsBlock.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['待登记', '跟进中', '已完成']);
  assert.match(page, /登记 OA 结果/);
  assert.match(page, /最近 7 天/);
  assert.match(page, /仅登记 OA 结果，不会自动发起或同步 OA/);
  assert.match(api, /registerOaResult/);
  assert.match(api, /oa-registration/);
  assert.match(table, /oa_status/);
  assert.match(table, /oa_instance_no/);
  assert.match(table, /SemanticStatusBadge/);
  assert.match(table, /ActionButton/);
});

test('Offer 深链登记成功后保持弹窗关闭', () => {
  const page = read('src/pages/offers/page.tsx');
  assert.equal(typeof offerWorkbench.clearOfferCandidateSelection, 'function');

  const next = offerWorkbench.clearOfferCandidateSelection(
    new URLSearchParams('demand=12&candidate=34&tab=follow_up'),
  );
  assert.equal(next.get('candidate'), null);
  assert.equal(next.get('demand'), '12');
  assert.equal(next.get('tab'), 'follow_up');
  assert.match(page, /handledOfferQuery/);
  assert.match(page, /closeOaRegistration/);
  assert.match(page, /const saved = await offersApi\.registerOaResult[\s\S]*?closeOaRegistration\(\)/);
});
