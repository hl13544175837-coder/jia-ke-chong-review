import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createJiti } from 'jiti';

const root = path.resolve(import.meta.dirname, '..');
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve(root, 'src') },
});

const { requiredMenuCodeForPath } = await jiti.import(
  '../src/auth/companyPagePermissions.ts',
);

function source(relativePath) {
  return fs.readFileSync(path.join(root, 'src', relativePath), 'utf8');
}

test('招聘专员和面试官的同类页面使用各自路由并接受同一业务菜单授权', () => {
  assert.equal(requiredMenuCodeForPath('/dashboard'), 'index');
  assert.equal(requiredMenuCodeForPath('/interviewer/dashboard'), 'index');
  assert.equal(requiredMenuCodeForPath('/interviews'), 'interviews');
  assert.equal(requiredMenuCodeForPath('/interviewer/interviews'), 'interviews');
  assert.equal(requiredMenuCodeForPath('/interviewer/screening'), 'interviews');
  assert.equal(requiredMenuCodeForPath('/jobs'), 'demands');
  assert.equal(requiredMenuCodeForPath('/interviewer/jobs'), 'demands');
});

test('其他受保护页面也不能绕过 PGS 菜单直接输入网址进入', () => {
  assert.equal(requiredMenuCodeForPath('/online-resumes'), 'candidates');
  assert.equal(requiredMenuCodeForPath('/candidates'), 'candidates');
  assert.equal(requiredMenuCodeForPath('/talent-map'), 'candidates');
  assert.equal(requiredMenuCodeForPath('/kanban'), 'pipeline');
  assert.equal(requiredMenuCodeForPath('/offers'), 'pipeline');
  assert.equal(requiredMenuCodeForPath('/analytics'), 'bi');
  assert.equal(requiredMenuCodeForPath('/settings'), 'settings');
  assert.equal(requiredMenuCodeForPath('/unknown'), null);
});

test('主布局按当前地址检查 PGS 页面权限', () => {
  const layout = source('components/feature/MainLayout.tsx');
  assert.match(layout, /requiredMenuCodeForPath\(location\.pathname\)/);
  assert.match(layout, /hasMenu\(requiredMenuCode\)/);
  assert.match(layout, /当前账号没有这个页面权限/);
});

test('招聘专员面试管理和面试官我的面试读取不同范围的数据', () => {
  const recruiter = source('pages/interviews/page.tsx');
  const recruiterData = source('features/interviews/useRecruiterInterviewWorkbench.ts');
  const interviewer = source('pages/interviewer/interviews/page.tsx');
  assert.match(recruiter, /title="面试管理"/);
  assert.match(recruiter, /useRecruiterInterviewWorkbench/);
  assert.match(recruiterData, /listManagementRows/);
  assert.match(interviewer, /title="我的面试"/);
  assert.match(interviewer, /listMyAssignments/);
  assert.doesNotMatch(interviewer, /listManagementRows/);
});

test('招聘专员和面试官只显示各自职责内的面试操作', () => {
  const recruiter = source('pages/interviews/page.tsx');
  const interviewer = source('pages/interviewer/interviews/page.tsx');
  assert.match(recruiter, /createAssignment/);
  assert.match(recruiter, /moveAfterInterview/);
  assert.match(recruiter, /saveFeedback/); // 专员可代填面试反馈
  assert.doesNotMatch(recruiter, /listMyAssignments/);
  assert.match(interviewer, /saveFeedback/);
  assert.match(interviewer, /requestReschedule/);
  assert.doesNotMatch(interviewer, /createAssignment/);
  assert.doesNotMatch(interviewer, /moveCandidate/);
});
