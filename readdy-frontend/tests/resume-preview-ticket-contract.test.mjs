import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const readOptional = (file) => {
  const absolute = path.join(root, file);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
};

test('预览接口先申请短时票据，不再直接生成临时对象链接', () => {
  const api = read('src/features/businessReviews/api.ts');
  const detail = readOptional('src/features/candidates/library/useCandidateDetail.ts');

  assert.notEqual(detail, '', '缺少候选人详情 hook');
  assert.match(api, /createPreviewTicket/);
  assert.match(api, /resume\/\$\{candidateId\}\/original\/preview-ticket/);
  assert.match(api, /method:\s*['"]POST['"]/);

  assert.match(detail, /createPreviewTicket/);
  assert.match(detail, /window\.open/);
  assert.match(detail, /externalApiBaseUrl/);
  assert.match(detail, /issued\.url/);
  const previewBlock = detail.slice(
    detail.indexOf('const previewOriginalResume'),
    detail.indexOf('const downloadOriginalResume'),
  );
  assert.doesNotMatch(previewBlock, /createObjectURL/);
});

test('下载仍然保留现有 blob 下载方式', () => {
  const detail = readOptional('src/features/candidates/library/useCandidateDetail.ts');

  assert.match(detail, /createObjectURL/);
  assert.match(detail, /link\.download/);
});
