import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const interviewerPage = readFileSync(path.join(root, 'src/pages/interviewer/jobs/page.tsx'), 'utf8');
const demandTypes = readFileSync(path.join(root, 'src/features/demands/types.ts'), 'utf8');
const recruiterForm = readFileSync(path.join(root, 'src/pages/jobs/components/RequisitionForm.tsx'), 'utf8');

test('面试官可以选择自定义新岗位并提交岗位名称', () => {
  assert.match(interviewerPage, /customJobTitle/);
  assert.match(interviewerPage, /value="custom">自定义新岗位/);
  assert.match(interviewerPage, /job_title:\s*draft\.customJobTitle\.trim\(\)/);
  assert.match(interviewerPage, /draft\.jobId === 'custom'/);
  assert.match(demandTypes, /interface RecruitmentDemandInput[\s\S]*job_id\?: number/);
  assert.match(demandTypes, /BusinessDemandInput = RecruitmentDemandInput/);
});

test('招聘专员部门可以输入并保留常用部门建议', () => {
  assert.match(recruiterForm, /list="department-suggestions"/);
  assert.match(recruiterForm, /<datalist id="department-suggestions">/);
  assert.match(recruiterForm, /技术研发部/);
  assert.doesNotMatch(recruiterForm, /<select[\s\S]{0,300}value=\{formData\.department\}/);
});

test('招聘地点可以输入海外或远程并保留常用城市建议', () => {
  assert.match(recruiterForm, /list="location-suggestions"/);
  assert.match(recruiterForm, /<datalist id="location-suggestions">/);
  assert.match(recruiterForm, /远程办公/);
  assert.match(recruiterForm, /海外/);
  assert.doesNotMatch(recruiterForm, /value=\{formData\.province\}/);
});
