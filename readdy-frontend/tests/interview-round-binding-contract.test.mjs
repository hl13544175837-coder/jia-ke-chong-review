import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const modalSource = fs.readFileSync(
  path.join(root, 'src/pages/interviews/components/ScheduleInterviewModal.tsx'),
  'utf8',
);

test('标准面试类型固定绑定第 1、2、3 轮', () => {
  assert.match(modalSource, /round_1:\s*1/);
  assert.match(modalSource, /round_2:\s*2/);
  assert.match(modalSource, /round_3:\s*3/);
});

test('新建安排切换面试类型时同步轮次，特殊类型保留传入的下一轮序号', () => {
  assert.match(modalSource, /fixedRoundSequenceByType\[nextRound\]\s*\?\?\s*passedRoundSequence/);
  assert.match(modalSource, /onChange=\{handleRoundChange\}/);
});

test('编辑历史安排时不能修改面试类型或轮次序号', () => {
  assert.match(modalSource, /disabled=\{editing\s*\|\|\s*saving\}/);
  assert.match(modalSource, /onSave\(editing\s*\?\s*editable\s*:/);
});

test('轮次序号使用只读文字，不再提供数字输入框', () => {
  assert.doesNotMatch(modalSource, /type=["']number["']/);
  assert.match(modalSource, /第 \{roundSequence\} 轮/);
  assert.match(modalSource, /aria-label=["']面试轮次序号["']/);
});
