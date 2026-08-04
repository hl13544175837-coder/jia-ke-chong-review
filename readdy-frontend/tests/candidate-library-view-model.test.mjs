import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve(import.meta.dirname, '../src') },
});
const { buildCandidateLibraryViewModel } = await jiti.import(
  '../src/features/candidates/library/candidateLibraryViewModel.ts',
);

const candidate = (overrides) => ({
  id: 1,
  name_masked: '候选人',
  owner_hr_id: null,
  is_favorite: false,
  created_at: '2026-08-04T00:00:00Z',
  parse_status: 'ok',
  tag_count: 0,
  current_stage: 'pending',
  ...overrides,
});

test('候选人展示模型可单独计算演示数据隐藏、选中和批量状态', () => {
  const result = buildCandidateLibraryViewModel({
    candidates: [
      candidate({ id: 1, is_favorite: true, current_demand_id: 8 }),
      candidate({ id: 2, is_local_demo_record: true }),
      candidate({ id: 3, parse_status: 'failed' }),
    ],
    hideLocalDemoRecords: true,
    selectedIds: new Set([1]),
  });

  assert.deepEqual(result.visibleCandidates.map((item) => item.id), [1, 3]);
  assert.equal(result.localDemoRecordCount, 1);
  assert.deepEqual(result.selectedCandidates.map((item) => item.id), [1]);
  assert.equal(result.allVisibleSelected, true);
  assert.equal(result.selectedAllFavorite, true);
  assert.equal(result.selectedAllInPipeline, true);
  assert.equal(result.selectedAllReviewable, true);
});
