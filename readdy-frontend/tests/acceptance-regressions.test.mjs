import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve(import.meta.dirname, '../src') },
});

test('Offer 页签数字与当前时间范围使用同一批记录', async () => {
  const { buildOfferTabCounts } = await jiti.import('../src/pages/offers/workbench.ts');
  const items = [
    { oa_status: 'not_started', updated_at: '2026-08-12T00:00:00Z' },
    { oa_status: 'not_started', updated_at: '2026-07-01T00:00:00Z' },
    { oa_status: 'completed', updated_at: '2026-07-01T00:00:00Z' },
  ];

  assert.deepEqual(buildOfferTabCounts(items, {
    recentDays: 7,
    now: new Date('2026-08-13T00:00:00Z'),
  }), {
    pending_registration: 1,
    follow_up: 0,
    completed: 0,
  });
});

test('候选人姓名为空时统一显示可识别的候选人编号', async () => {
  const helperPath = new URL('../src/features/candidates/candidateDisplayName.ts', import.meta.url);
  assert.ok(existsSync(helperPath), '应提供统一的候选人姓名兜底方法');
  const { candidateDisplayName } = await jiti.import(helperPath.href);

  assert.equal(candidateDisplayName({ id: 35, name_masked: '' }), '候选人 #35');
  assert.equal(candidateDisplayName({ id: 35, name_masked: '  ' }), '候选人 #35');
  assert.equal(candidateDisplayName({ id: 35, name_masked: '王小明' }), '王小明');
});
