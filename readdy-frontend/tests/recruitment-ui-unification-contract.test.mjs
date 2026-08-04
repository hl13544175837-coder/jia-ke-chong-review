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

test('公共组件统一状态颜色、操作按钮、查询条和详情底栏', () => {
  const badge = readOptional('src/components/ui/SemanticStatusBadge.tsx');
  const action = readOptional('src/components/ui/ActionButton.tsx');
  const actionBar = readOptional('src/components/ui/DetailActionBar.tsx');
  const filters = readOptional('src/components/ui/FilterBar.tsx');

  assert.notEqual(badge, '', '缺少统一状态组件');
  assert.match(badge, /data-ui="semantic-status-badge"/);
  assert.match(badge, /neutral[\s\S]*pending[\s\S]*info[\s\S]*success[\s\S]*danger/);
  assert.notEqual(action, '', '缺少统一操作按钮');
  assert.match(action, /primary[\s\S]*secondary[\s\S]*danger/);
  assert.notEqual(actionBar, '', '缺少详情固定操作区');
  assert.match(actionBar, /data-ui="detail-action-bar"/);
  assert.match(actionBar, /sticky bottom-0/);
  assert.notEqual(filters, '', '缺少直接展示的查询条');
  assert.match(filters, /data-ui="filter-bar"/);
  assert.match(filters, /flex-wrap/);
});

test('所有候选人详情统一使用面试信息、候选人简历、面试评价三个页签', () => {
  const tabs = readOptional('src/features/candidates/components/CandidateDetailTabs.tsx');
  const workspace = readOptional('src/features/candidates/components/CandidateDetailWorkspace.tsx');
  assert.notEqual(tabs, '', '缺少统一详情页签');
  assert.notEqual(workspace, '', '缺少统一候选人详情工作区');
  const labels = [...tabs.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['面试信息', '候选人简历', '面试评价']);
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /aria-selected/);
  assert.match(workspace, /CandidateDetailTabs/);

  const consumers = [
    'src/features/candidates/components/CandidateLibraryWorkspace.tsx',
    'src/pages/interviews/components/RecruiterInterviewDetailDrawer.tsx',
    'src/pages/interviewer/screening/components/BusinessReviewDetail.tsx',
    'src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx',
    'src/pages/jobs/components/DemandCandidateDrawer.tsx',
  ];
  consumers.forEach((file) => {
    assert.match(readOptional(file), /CandidateDetailWorkspace/, file);
    assert.match(readOptional(file), /DetailActionBar/, file);
  });
});

test('长简历详情把页签工作区限制在弹层内并由内容区独立滚动', () => {
  const longResumeDrawers = [
    'src/features/candidates/components/CandidateLibraryWorkspace.tsx',
    'src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx',
  ];

  longResumeDrawers.forEach((file) => {
    const source = read(file);
    assert.match(
      source,
      /<CandidateDetailWorkspace[^>]*className="flex min-h-0 flex-1 flex-col"/,
      `${file} 的统一页签工作区必须占满弹层剩余高度`,
    );
    assert.match(
      source,
      /className="min-h-0 flex-1 overflow-y-auto[^\"]*"/,
      `${file} 的长简历内容区必须自己滚动`,
    );
  });
});

test('Offer 候选人姓名进入同一套候选人详情', () => {
  const table = read('src/pages/offers/components/OfferTable.tsx');
  const page = read('src/pages/offers/page.tsx');
  assert.match(table, /onOpenCandidate/);
  assert.match(page, /navigate\(`\/candidates\?candidate=\$\{offer\.candidate_id\}&demand=\$\{offer\.demand_id\}/);
});

test('五个列表把常用查询条件直接放在页面上', () => {
  const consumers = [
    'src/pages/jobs/components/RequisitionTable.tsx',
    'src/pages/interviews/components/InterviewWorkbenchToolbar.tsx',
    'src/pages/interviewer/screening/page.tsx',
    'src/pages/interviewer/interviews/page.tsx',
    'src/pages/offers/page.tsx',
  ];
  consumers.forEach((file) => assert.match(read(file), /FilterBar/, file));

  const screening = read('src/pages/interviewer/screening/page.tsx');
  for (const key of ['q', 'job', 'department', 'city']) {
    assert.match(screening, new RegExp(`searchParams\\.get\\('${key}'\\)`), `筛选页缺少 ${key} URL 条件`);
  }

  const interviews = read('src/pages/interviewer/interviews/page.tsx');
  for (const key of ['q', 'job', 'department', 'date']) {
    assert.match(interviews, new RegExp(`searchParams\\.get\\('${key}'\\)`), `面试页缺少 ${key} URL 条件`);
  }
});

test('面试官入口统一叫候选人筛选', () => {
  const consumers = [
    'src/components/feature/MainLayout.tsx',
    'src/pages/interviewer/dashboard/page.tsx',
    'src/pages/interviewer/screening/page.tsx',
  ];
  consumers.forEach((file) => {
    const source = read(file);
    assert.match(source, /候选人筛选/, file);
    assert.doesNotMatch(source, /待面试官筛选/, file);
  });
});

test('面试官详情继续使用角色过滤后的招聘过程', () => {
  const screening = read('src/pages/interviewer/screening/components/BusinessReviewDetail.tsx');
  const interview = read('src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx');
  assert.match(screening, /<CandidateJourneySummary journey=\{journey\} interviewOnly/);
  assert.match(interview, /<CandidateJourneySummary journey=\{journey\} interviewOnly/);
});

test('面试官候选人详情在右下角直接区分三类筛选动作', () => {
  const detail = read('src/pages/interviewer/screening/components/BusinessReviewDetail.tsx');
  const page = read('src/pages/interviewer/screening/page.tsx');
  const modal = read('src/features/businessReviews/components/ReviewActionModal.tsx');

  assert.match(detail, />请 HR 补充</);
  assert.match(detail, />不合适</);
  assert.match(detail, />通过并提交</);
  assert.match(detail, /onReview\('needs_info'\)/);
  assert.match(detail, /onReview\('rejected'\)/);
  assert.match(detail, /onReview\('approved'\)/);
  assert.match(page, /initialDecision=\{reviewDecision\}/);
  assert.match(modal, /initialDecision\?: BusinessDecision/);
});

test('Offer 列表只登记 OA 结果且不伪造外部接口', () => {
  const page = read('src/pages/offers/page.tsx');
  assert.match(page, /仅登记 OA 结果，不会自动发起或同步 OA/);
  assert.match(page, /登记 OA 结果/);
});
