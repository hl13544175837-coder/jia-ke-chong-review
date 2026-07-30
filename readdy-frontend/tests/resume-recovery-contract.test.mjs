import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('简历异常处理对用户提供完整补救入口', () => {
  const types = read('src/features/candidates/types.ts');
  const api = read('src/features/candidates/api.ts');
  const page = read('src/pages/candidates/page.tsx');
  const demandDrawer = read('src/pages/jobs/components/DemandCandidateDrawer.tsx');
  const panel = read('src/pages/candidates/components/ResumeRecoveryPanel.tsx');
  const ui = `${page}\n${demandDrawer}\n${panel}`;

  assert.match(types, /'original_confirmed'/);
  assert.match(types, /'needs_confirmation'/);
  assert.match(api, /confirmOriginal/);
  assert.match(api, /replaceResume/);
  assert.match(api, /retryParse/);
  assert.match(api, /updateProfile/);

  assert.match(ui, /待确认/);
  assert.match(ui, /原件有效，结构化信息待补全/);
  assert.match(ui, /确认原件有效/);
  assert.match(ui, /重新解析/);
  assert.match(ui, /更换简历/);
  assert.match(ui, /手动补录/);
  assert.match(ui, /工作年限/);
  assert.match(ui, /技能关键词/);
  assert.match(ui, /window\.confirm\(/);
  assert.match(page, /<ResumeRecoveryPanel/);
  assert.match(demandDrawer, /<ResumeRecoveryPanel/);
  assert.match(page, /简历待确认，处理后才能加入流程/);
  assert.match(demandDrawer, /简历待确认/);
});

test('批量导入把待确认视为已落库待处理，不会再次重复上传', () => {
  const page = read('src/pages/candidates/page.tsx');

  assert.match(page, /\['ok', 'duplicate', 'needs_confirmation'\]\.includes\(result\.status\)/);
  assert.match(page, /result\.status === 'needs_confirmation'/);
  assert.match(page, /查看并处理/);
});

test('重复简历允许明确保留旧版或设为新版，失败文件可单独重试', () => {
  const types = read('src/features/candidates/types.ts');
  const api = read('src/features/candidates/api.ts');
  const page = read('src/pages/candidates/page.tsx');
  const panel = read('src/pages/candidates/components/ResumeRecoveryPanel.tsx');

  assert.match(types, /resume_versions/);
  assert.match(api, /getResumeVersions/);
  assert.match(api, /downloadResumeVersion/);
  assert.match(page, /保留现有版本/);
  assert.match(page, /设为新版简历/);
  assert.match(page, /重试此文件/);
  assert.match(panel, /历史简历版本/);
});

test('正常候选人也能编辑简历信息，模型报错显示可执行的人话提示', () => {
  const panel = read('src/pages/candidates/components/ResumeRecoveryPanel.tsx');
  const types = read('src/features/candidates/types.ts');

  assert.match(panel, /编辑简历信息/);
  assert.match(panel, /模型暂时不可用，可先手动补录/);
  assert.match(panel, /looksLikeResumeFilename/);
  assert.match(panel, /请输入候选人姓名/);
  assert.match(panel, /form\.education !== initialForm\.education/);
  assert.match(panel, /form\.skills !== initialForm\.skills/);
  assert.match(panel, /新原件已保留，但 AI 仍未识别/);
  assert.match(types, /education\?: Array<\{ degree: string \}>/);
  assert.match(types, /skills\?: Array<\{ tag: string; score: number \}>/);
  assert.doesNotMatch(panel, /if \(!needsConfirmation && !originalConfirmed && !editing\) return null/);
});
