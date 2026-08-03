import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('共享页面状态同时覆盖加载、空数据、失败和重试', () => {
  const file = 'src/components/ui/PageStateCard.tsx';
  assert.equal(existsSync(path.join(root, file)), true, '缺少共享页面状态组件');
  const source = read(file);

  assert.match(source, /type PageStateVariant = 'loading' \| 'empty' \| 'error'/);
  assert.match(source, /onAction\?: \(\) => void/);
  assert.match(source, /role=\{variant === 'error' \? 'alert' : 'status'\}/);
  assert.match(source, /重新加载/);
});

test('技术错误统一翻译为业务用户看得懂的提示', () => {
  const file = 'src/lib/userFacingError.ts';
  assert.equal(existsSync(path.join(root, file)), true, '缺少统一错误翻译函数');
  const source = read(file);

  assert.match(source, /export function userFacingError/);
  assert.match(source, /Failed to fetch|NetworkError|HTTP\\s\*/);
  assert.match(source, /请稍后重试/);
});

test('六个核心工作页复用统一状态和错误翻译', () => {
  const pages = [
    'src/pages/jobs/page.tsx',
    'src/pages/interviews/page.tsx',
    'src/pages/offers/page.tsx',
    'src/pages/interviewer/jobs/page.tsx',
    'src/pages/interviewer/screening/page.tsx',
    'src/pages/interviewer/interviews/page.tsx',
  ];

  pages.forEach((file) => {
    const source = file === 'src/pages/interviews/page.tsx'
      ? `${read(file)}\n${read('src/features/interviews/useRecruiterInterviewWorkbench.ts')}`
      : read(file);
    assert.match(source, /import PageStateCard from '@\/components\/ui\/PageStateCard'/, file);
    assert.match(source, /import \{ userFacingError \} from '@\/lib\/userFacingError'/, file);
    assert.match(source, /<PageStateCard/, file);
    assert.match(source, /variant="error"[\s\S]{0,260}?onAction=/, file);
  });
});

test('候选人详情的图标关闭按钮有可读名称', () => {
  const source = read('src/pages/candidates/components/CandidateDetailDrawer.tsx');
  assert.match(
    source,
    /<button[\s\S]{0,220}?type="button"[\s\S]{0,220}?aria-label="关闭候选人详情"/,
  );
  assert.match(source, /ri-close-line[^>]*aria-hidden="true"/);
});

test('本地同事试用清单覆盖五个角色和安全恢复步骤', () => {
  const checklistFile = '../docs/16_本地同事试用验收清单.md';
  assert.equal(existsSync(path.join(root, checklistFile)), true, '缺少本地同事试用验收清单');
  const source = `${read('../docs/15_同事小范围试用说明.md')}\n${read(checklistFile)}`;

  ['hr01', 'interviewer01', 'interviewer02', 'director01', 'admin01'].forEach((account) => {
    assert.match(source, new RegExp(account), `缺少 ${account} 的验收步骤`);
  });
  assert.match(source, /验收测试/);
  assert.match(source, /backup_pilot_data\.py/);
  assert.match(source, /restore_pilot_data\.py/);
  assert.match(source, /--dry-run/);
  assert.match(source, /停止.{0,12}服务/);
  assert.match(source, /绝不自动恢复|恢复绝不自动执行/);
});
