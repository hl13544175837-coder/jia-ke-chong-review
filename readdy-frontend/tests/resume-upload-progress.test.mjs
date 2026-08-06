import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileResumeUploadProgress } from '../src/features/candidates/library/resumeUploadProgress.ts';

const response = (candidateId) => ({
  batch_id: 1,
  total: 1,
  results: [{
    file: 'candidate.pdf',
    status: 'processing',
    candidate_id: candidateId,
    reason: '文件已入库，AI 正在后台解析',
  }],
});

const candidate = (id, parseStatus, overrides = {}) => ({
  id,
  name_masked: '候选人张三',
  owner_hr_id: 1,
  is_favorite: false,
  created_at: '2026-08-06T09:00:00',
  parse_status: parseStatus,
  tag_count: 0,
  pipeline_state: 'never_entered',
  has_rejected_history: false,
  ...overrides,
});

test('后台解析成功后上传弹窗停止转圈并显示成功', () => {
  const result = reconcileResumeUploadProgress(
    response(101),
    [candidate(101, 'ok')],
  );

  assert.equal(result.results[0].status, 'ok');
  assert.equal(result.results[0].reason, '简历解析成功');
  assert.equal(result.results[0].name_masked, '候选人张三');
});

test('后台解析失败后上传弹窗停止转圈并显示可处理原因', () => {
  const result = reconcileResumeUploadProgress(
    response(102),
    [candidate(102, 'failed', { parse_error: '模型暂时不可用' })],
  );

  assert.equal(result.results[0].status, 'needs_confirmation');
  assert.equal(result.results[0].reason, '模型暂时不可用');
});

test('网络尚未返回新状态时保持解析中且不制造新对象', () => {
  const initial = response(103);
  const missing = reconcileResumeUploadProgress(initial, []);
  const pending = reconcileResumeUploadProgress(
    initial,
    [candidate(103, 'processing')],
  );

  assert.equal(missing, initial);
  assert.equal(pending, initial);
  assert.equal(initial.results[0].status, 'processing');
});
