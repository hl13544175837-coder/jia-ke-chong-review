import assert from 'node:assert/strict';

process.env.TZ = 'Asia/Shanghai';

const {
  interviewDateTimeToLocalInput,
  interviewHasStarted,
  localInterviewInputToUtc,
} = await import('../../readdy-frontend/src/features/interviews/dateTime.ts');

const localInput = '2026-07-27T04:11';
const utcValue = localInterviewInputToUtc(localInput);

assert.equal(utcValue, '2026-07-26T20:11:00.000Z', '北京时间排期必须转换为同一时刻的 UTC');
assert.equal(interviewDateTimeToLocalInput(utcValue), localInput, '编辑排期时必须还原为原北京时间');
assert.equal(interviewDateTimeToLocalInput('2026-07-26T20:11:00'), localInput, '后端无时区时间必须按 UTC 读取');
assert.equal(interviewHasStarted('2026-07-26T20:11:00', Date.parse('2026-07-26T20:11:00Z')), true, '到达 UTC 开场时刻后必须允许评价');
assert.equal(interviewHasStarted('2026-07-26T20:11:01', Date.parse('2026-07-26T20:11:00Z')), false, '开场前必须继续禁止评价');

console.log('readdy_interview_timezone: OK');
