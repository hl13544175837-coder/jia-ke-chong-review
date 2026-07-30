import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const loginSource = fs.readFileSync(path.join(root, 'src/pages/login/page.tsx'), 'utf8');
const scheduleSource = fs.readFileSync(
  path.join(root, 'src/pages/interviews/components/ScheduleInterviewModal.tsx'),
  'utf8',
);
const interviewerDashboardSource = fs.readFileSync(
  path.join(root, 'src/pages/interviewer/dashboard/page.tsx'),
  'utf8',
);
const interviewPageSource = fs.readFileSync(
  path.join(root, 'src/pages/interviews/page.tsx'),
  'utf8',
);

test('登录页统一为智聘并把常见错误翻成中文', () => {
  assert.doesNotMatch(loginSource, /TalentFlow/);
  assert.match(loginSource, />智聘</);
  assert.match(loginSource, /loginErrorCopy/);
  assert.match(loginSource, /账号或密码错误/);
  assert.match(loginSource, /本地登录服务暂不可用，请确认服务已启动/);
});

test('主流程只说明本地站内日程，不展示未接入外部能力', () => {
  assert.match(scheduleSource, /保存后会创建本地站内日程和待办。/);
  assert.doesNotMatch(scheduleSource, /企业微信|待接入/);
  assert.doesNotMatch(interviewerDashboardSource, /企业微信|待接入/);
  assert.doesNotMatch(interviewPageSource, /企业微信|待接入/);
});
