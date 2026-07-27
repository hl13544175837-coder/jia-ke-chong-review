import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const summaryUrl = pathToFileURL(path.join(root, 'readdy-frontend/src/pages/dashboard/summary.ts')).href;
const { buildDashboardSummary } = await import(`${summaryUrl}?balanced-workbench`);

function metrics(overrides = {}) {
  return {
    recommended_count: 0,
    business_review_count: 0,
    interview_count: 0,
    offer_count: 0,
    onboarded_count: 0,
    accepted_offer_count: 0,
    locked_headcount: 0,
    remaining_headcount: 0,
    over_headcount: 0,
    transferred_count: 0,
    current_stage_counts: {},
    ...overrides,
  };
}

function demand(id, overrides = {}) {
  return {
    id,
    status: 'active',
    approval_status: 'approved',
    completion_suggested: false,
    target_date: '2026-08-20',
    risk_flags: [],
    headcount: 3,
    job_title: `岗位${id}`,
    metrics: metrics(),
    ...overrides,
  };
}

const now = new Date('2026-07-27T12:00:00+08:00');
const facts = {
  demands: [
    demand(1, {
      job_title: 'AI算法工程师',
      target_date: '2026-07-30',
      metrics: metrics({
        remaining_headcount: 2,
        business_review_count: 3,
        interview_count: 2,
        offer_count: 1,
        current_stage_counts: { pending: 2, ai_screen: 1 },
      }),
    }),
    demand(2, {
      job_title: 'Java开发工程师',
      metrics: metrics({
        remaining_headcount: 0,
        over_headcount: 1,
        business_review_count: 1,
        interview_count: 1,
        onboarded_count: 4,
        current_stage_counts: { pending: 1 },
      }),
    }),
    demand(3, { status: 'closed', metrics: metrics({ business_review_count: 99 }) }),
    demand(4, {
      job_title: '前端开发工程师',
      risk_flags: ['business_feedback_pending'],
      metrics: metrics({ remaining_headcount: 1, business_review_count: 1 }),
    }),
  ],
  reviews: [],
  offers: [],
  interviews: [
    {
      assignment_id: 101,
      assignment_status: 'scheduled',
      feedback_submitted: false,
      scheduled_at: '2026-07-27T02:00:00Z',
    },
    {
      assignment_id: 102,
      assignment_status: 'scheduled',
      feedback_submitted: false,
      scheduled_at: '2026-07-28T02:00:00Z',
    },
    {
      assignment_id: 103,
      assignment_status: 'awaiting_feedback',
      feedback_submitted: false,
      scheduled_at: '2026-07-25T02:00:00Z',
    },
  ],
};

const summary = buildDashboardSummary(facts, 'recruiter', now);

assert.deepEqual(summary.todayInterviews.map((item) => item.assignment_id), [101]);
assert.deepEqual(summary.overdueFeedback.map((item) => item.assignment_id), [103]);
assert.deepEqual(summary.stageSummary, {
  screening: 4,
  businessReview: 5,
  interview: 3,
  offer: 1,
  onboarding: 0,
});
assert.equal(summary.demandProgress.length, 3, '只汇总生效需求');
assert.equal(summary.demandProgress[0].demand.id, 2, '超出 HC 的岗位应排在风险最前面');
assert.equal(summary.demandProgress[0].risk.level, 'high');
assert.equal(summary.demandProgress[0].risk.label, '超出 HC 1 人');
const deadlineDemand = summary.demandProgress.find((item) => item.demand.id === 1);
assert.equal(deadlineDemand?.risk.level, 'high');
assert.equal(deadlineDemand?.risk.label, '距截止 3 天');
assert.equal(deadlineDemand?.nextAction, '跟进反馈');
assert.equal(
  summary.demandProgress.find((item) => item.demand.id === 4)?.risk.label,
  '有候选人等待业务反馈',
  '风险栏不能向用户显示内部代码',
);

console.log('dashboard_balanced_view_model: OK');
