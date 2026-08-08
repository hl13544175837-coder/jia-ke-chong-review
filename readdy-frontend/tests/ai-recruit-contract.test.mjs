import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_RECRUIT_PLATFORMS,
  buildAiRecruitTask,
  DEFAULT_GREETING_TEMPLATE,
  SKILL_INSTALL_HINT,
} from '../src/features/demands/aiRecruit.ts';

const demand = {
  id: 14,
  request_no: 'REQ-20260807-2EAF8B42EA494E01',
  job_title: 'AI运营',
  jd_text: '负责 AI 产品运营，3 年以上经验',
};

test('任务单模板包含全部关键字段', () => {
  const task = buildAiRecruitTask({
    demand,
    platforms: [
      { key: 'BOSS直聘', account: 'hr01_boss' },
      { key: '猎聘', account: 'hr01_liepin' },
    ],
    greeting: '您好，想聊聊AI运营岗位',
    apiBaseUrl: 'http://127.0.0.1:5010/api',
    token: 'test-token',
    skillName: '智聘AI找人',
  });
  assert.match(task, /智聘AI找人/);
  assert.match(task, /REQ-20260807/);
  assert.match(task, /AI运营/);
  assert.match(task, /3 年以上经验/);
  assert.match(task, /BOSS直聘：hr01_boss/);
  assert.match(task, /猎聘：hr01_liepin/);
  assert.match(task, /您好，想聊聊AI运营岗位/);
  assert.match(task, /http:\/\/127\.0\.0\.1:5010\/api/);
  assert.match(task, /test-token/);
  assert.doesNotMatch(task, /undefined/);
});

test('未填 JD 时给出提示而不是空字段', () => {
  const task = buildAiRecruitTask({
    demand: { ...demand, jd_text: '' },
    platforms: [{ key: '58同城', account: 'a' }],
    greeting: DEFAULT_GREETING_TEMPLATE,
    apiBaseUrl: 'http://127.0.0.1:5010/api',
    token: 't',
    skillName: '智聘AI找人',
  });
  assert.match(task, /暂未返回 JD 正文/);
});

test('平台列表与安装说明可导出', () => {
  assert.deepEqual(AI_RECRUIT_PLATFORMS.map((item) => item.key), ['BOSS直聘', '猎聘', '58同城']);
  assert.match(SKILL_INSTALL_HINT, /SKILL\.md/);
});
