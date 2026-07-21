import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const page = readFileSync(join(srcRoot, 'features/candidates/pages/CandidatesPage.tsx'), 'utf8');
const css = readFileSync(join(srcRoot, 'index.css'), 'utf8');

assert.match(page, /data-ui="readdy-candidates"/, '简历库应使用 Readdy 正式页面外观');
assert.match(page, /data-ui="readdy-candidate-tabs"/, '简历库应有 Readdy 状态分段');
for (const label of ['全部候选人', '招聘流程中', '人才池']) {
  assert.match(page, new RegExp(label), `简历库应提供 ${label} 真实筛选`);
}
assert.match(
  page,
  /api\.searchCandidates\(\{\s*pipeline_status:\s*'in_pipeline'/,
  '招聘流程数量应来自真实 API',
);
assert.match(
  page,
  /api\.searchCandidates\(\{\s*pipeline_status:\s*'not_in_pipeline'/,
  '人才池数量应来自真实 API',
);
assert.match(page, /selectedCandidateIds/, '简历库应支持批量选择候选人');
assert.match(page, /handleBatchAddToDemand/, '批量加入需求应走真实流程写入');
assert.match(page, /api\.batchAddToPipeline\(selectedJobId, selectedCandidateIds, demandId\)/, '批量加入必须调用真实 API');
assert.match(page, /candidatePreview/, '列表内应提供 Readdy 候选人详情抽屉');
assert.match(page, /scopeCountsAsync\.error/, '候选人范围统计失败不能伪装成空数据');
assert.match(page, /scopeCountsAsync\.reload/, '候选人范围统计失败应可重试');
assert.match(page, /demandsAsync\.error/, '需求选项失败应显示真实错误');
assert.match(page, /demandsAsync\.reload/, '需求选项失败应提供重试');
assert.match(css, /\.readdy-candidates\s+\.enterprise-hero/, '简历库应对旧 Enterprise hero 做 Readdy 视觉收敛');
assert.doesNotMatch(page, /localStorage|sessionStorage|mock/i, '简历库业务不得使用假数据或浏览器业务存储');
