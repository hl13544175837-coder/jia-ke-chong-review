# 招聘流程总览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个只读的招聘流程总览页，以飞书基准展示 11 个招聘步骤、状态流转、责任人、动作说明与接口准备情况。

**Architecture:** 使用 `features/recruitmentFlow/flow.ts` 保存唯一的静态、类型化流程数据；页面仅将这些数据渲染为响应式泳道，不调用任何 API。路由和左侧导航将把所有已登录角色带到同一只读页面。

**Tech Stack:** React 19、TypeScript、React Router 7、Tailwind CSS、Node test runner + tsx。

---

## 文件结构

- `src/features/recruitmentFlow/flow.ts`：流程数据类型、状态标签定义、5 个分组及 11 步数据。
- `src/pages/recruitment-flow/page.tsx`：响应式只读泳道页面。
- `src/router/config.tsx`：懒加载页面并注册 `/recruitment-flow` 路由。
- `src/components/feature/MainLayout.tsx`：为各主角色增加“招聘流程”导航入口。
- `tests/recruitment-flow-overview.test.mjs`：保护基准内容、页面边界及路由入口的契约测试。

### Task 1: 建立飞书基准流程数据

**Files:**
- Create: `readdy-frontend/src/features/recruitmentFlow/flow.ts`
- Create: `readdy-frontend/tests/recruitment-flow-overview.test.mjs`

- [ ] **Step 1: 写出失败的流程基准测试**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });

test('流程总览保留飞书基准的 11 步、5 组和 4 类接口状态', async () => {
  const { recruitmentFlowGroups, integrationStatusMeta } = await jiti.import(
    new URL('../src/features/recruitmentFlow/flow.ts', import.meta.url).href,
  );

  assert.equal(recruitmentFlowGroups.length, 5);
  assert.equal(recruitmentFlowGroups.flatMap((group) => group.steps).length, 11);
  assert.deepEqual(Object.keys(integrationStatusMeta).sort(), [
    'backend_ready', 'external_pending', 'frontend_connected', 'validated',
  ]);
  assert.match(recruitmentFlowGroups.flatMap((group) => group.steps).map((step) => step.title).join(' '), /创建并提交招聘需求.*确认实际入职/);
  assert.match(recruitmentFlowGroups.flatMap((group) => group.steps).find((step) => step.order === 9).branch, /加面 → 回到第 6 步/);
});
```

- [ ] **Step 2: 运行测试，确认因流程模块不存在而失败**

Run: `node --import tsx --test tests/recruitment-flow-overview.test.mjs`

Expected: FAIL，错误包含找不到 `src/features/recruitmentFlow/flow.ts`。

- [ ] **Step 3: 写入最小的类型化流程配置**

```ts
export type IntegrationStatus = 'backend_ready' | 'frontend_connected' | 'external_pending' | 'validated';

export const integrationStatusMeta: Record<IntegrationStatus, { label: string; className: string }> = {
  backend_ready: { label: '后端已实现', className: 'bg-amber-100 text-amber-800' },
  frontend_connected: { label: '前后端已串联', className: 'bg-blue-100 text-blue-800' },
  external_pending: { label: '外部待对接', className: 'bg-rose-100 text-rose-800' },
  validated: { label: '已联调验收', className: 'bg-emerald-100 text-emerald-800' },
};

export interface RecruitmentFlowStep {
  order: number;
  title: string;
  transition: string;
  owner: string;
  action: string;
  endpoint: string;
  statuses: IntegrationStatus[];
  branch?: string;
}

export interface RecruitmentFlowGroup {
  title: string;
  tone: 'blue' | 'violet' | 'sky' | 'orange' | 'green';
  steps: RecruitmentFlowStep[];
}

export const recruitmentFlowGroups: RecruitmentFlowGroup[] = [
  { title: '需求启动', tone: 'blue', steps: [
    { order: 1, title: '创建并提交招聘需求', transition: '必填校验后进入待审批', owner: '用人部门', action: '提交岗位、JD、计划人数、优先级与到岗日期。', endpoint: 'POST /api/demands', statuses: ['frontend_connected', 'external_pending'] },
    { order: 2, title: '审核需求并生效', transition: '通过 → approved + active；驳回 → 补充信息', owner: '招聘专员', action: '审核合理性并承接招聘任务。', endpoint: 'POST /api/demands/{id}/approve | reject', statuses: ['frontend_connected'] },
  ] },
  { title: '候选人筛选', tone: 'violet', steps: [
    { order: 3, title: '导入简历并关联需求', transition: '解析成功 → 待筛选；失败 → 保留原文待处理', owner: '招聘专员', action: '选择来源、关联需求并复核解析结果。', endpoint: 'POST /api/resume/upload', statuses: ['frontend_connected'] },
    { order: 4, title: '初筛并推送业务审核', transition: '通过初筛后分配业务审核人', owner: '招聘专员', action: '完成 HR 初筛并推送候选人信息。', endpoint: 'POST /api/business-reviews', statuses: ['frontend_connected', 'external_pending'] },
    { order: 5, title: '业务初筛并返回结论', transition: '通过 → 安排面试；不通过 → 结束', owner: '业务面试官', action: '查看完整简历并给出业务适配性结论。', endpoint: 'POST /api/business-reviews/{id}/decision', statuses: ['frontend_connected', 'external_pending'] },
  ] },
  { title: '面试决策', tone: 'sky', steps: [
    { order: 6, title: '双方确认后创建面试安排', transition: '确认后生成面试任务', owner: '招聘专员', action: '协调候选人与面试官，确认时间、地点和轮次。', endpoint: 'POST/PATCH /api/interview/assignments', statuses: ['backend_ready', 'external_pending'] },
    { order: 7, title: '面试进行并确认任务状态', transition: '已进行 → 待评价；取消/改约 → 重新排期', owner: '招聘专员 + 系统', action: 'HR 确认系统中的面试状态。', endpoint: '外部状态接口', statuses: ['external_pending'] },
    { order: 8, title: '主面试官提交本轮评价', transition: '通过/不通过 + 简评；协同面试官可补充', owner: '主面试官', action: '面试评价完成后回传候选人评价信息。', endpoint: 'POST /api/interview/feedback', statuses: ['frontend_connected', 'external_pending'] },
    { order: 9, title: 'HR 确认本轮处理结果', transition: '加面 → 回到第 6 步；淘汰 → 结束；全通过 → Offer', owner: '招聘专员', action: '根据评价决定后续推进。', endpoint: 'POST /api/pipeline/demands/{id}/move', statuses: ['frontend_connected'], branch: '加面 → 回到第 6 步；淘汰 → 结束；全通过 → Offer' },
  ] },
  { title: 'Offer 管理', tone: 'orange', steps: [
    { order: 10, title: 'Offer 拟定、审批、发放与答复', transition: '草稿 → 待审 → 已批准 → 已发送 → 接受/拒绝', owner: '招聘专员', action: '拟定与发放 Offer，并登记候选人答复。拒绝、过期或撤回会释放名额。', endpoint: 'PUT /offer/{candidate} | POST /api/offers/{id}/actions', statuses: ['frontend_connected', 'external_pending'] },
  ] },
  { title: '入职闭环', tone: 'green', steps: [
    { order: 11, title: '确认实际入职并结算岗位缺口', transition: 'accepted 锁定；onboarded 后缺口 -1；未到岗 → 释放', owner: '招聘专员', action: '填写实际入职日期，并由 HR 手动关闭已满足 HC 的需求。', endpoint: '/offers/{id}/actions:onboard | /demands/{id}/close', statuses: ['frontend_connected', 'external_pending'] },
  ] },
];
```

- [ ] **Step 4: 运行流程基准测试，确认通过**

Run: `node --import tsx --test tests/recruitment-flow-overview.test.mjs`

Expected: PASS，显示 1 个通过测试。

- [ ] **Step 5: 提交流程数据与测试**

```bash
git add readdy-frontend/src/features/recruitmentFlow/flow.ts readdy-frontend/tests/recruitment-flow-overview.test.mjs
git commit -m "feat: define recruitment flow overview data"
```

### Task 2: 实现响应式只读泳道页

**Files:**
- Create: `readdy-frontend/src/pages/recruitment-flow/page.tsx`
- Modify: `readdy-frontend/tests/recruitment-flow-overview.test.mjs`

- [ ] **Step 1: 扩展测试，先约束只读页面要素**

```js
import { readFile } from 'node:fs/promises';

test('流程总览页展示基准声明、四列泳道和关键分支，不调用 API', async () => {
  const source = await readFile(new URL('../src/pages/recruitment-flow/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /以飞书基准为准/);
  assert.match(source, /当前页面不调用接口/);
  assert.match(source, /状态流转/);
  assert.match(source, /主责角色/);
  assert.match(source, /动作说明/);
  assert.match(source, /接口准备情况/);
  assert.match(source, /step\.branch/);
  assert.doesNotMatch(source, /apiRequest\(|fetch\(|axios\./);
});
```

- [ ] **Step 2: 运行测试，确认页面文件缺失而失败**

Run: `node --import tsx --test tests/recruitment-flow-overview.test.mjs`

Expected: FAIL，错误包含找不到 `src/pages/recruitment-flow/page.tsx`。

- [ ] **Step 3: 实现页面，桌面端四列泳道、窄屏端卡片布局**

```tsx
import PageHeader from '@/components/ui/PageHeader';
import { integrationStatusMeta, recruitmentFlowGroups } from '@/features/recruitmentFlow/flow';

const toneClass = {
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  violet: 'border-violet-200 bg-violet-50 text-violet-800',
  sky: 'border-sky-200 bg-sky-50 text-sky-800',
  orange: 'border-orange-200 bg-orange-50 text-orange-800',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

export default function RecruitmentFlowPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6" data-ui="recruitment-flow-overview">
      <PageHeader title="招聘流程总览" description="从需求启动到入职闭环的只读流程说明" />
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">以飞书基准为准</p>
        <p className="mt-1">接口状态用于说明建设口径；当前页面不调用接口，也不会修改招聘数据。</p>
      </section>
      <section aria-label="接口准备情况图例" className="rounded-xl border border-background-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-foreground-900">接口准备情况</h2>
        <div className="mt-3 flex flex-wrap gap-2">{Object.entries(integrationStatusMeta).map(([key, meta]) => <span key={key} className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>)}</div>
      </section>
      <section className="space-y-6" aria-label="连续招聘流程">
        {recruitmentFlowGroups.map((group) => <section key={group.title} className="space-y-3">
          <h2 className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${toneClass[group.tone]}`}>{group.title}</h2>
          <div className="overflow-hidden rounded-xl border border-background-200 bg-white">
            <div className="hidden grid-cols-[minmax(14rem,1.3fr)_minmax(9rem,.8fr)_minmax(16rem,1.4fr)_minmax(15rem,1.2fr)] gap-4 border-b border-background-200 bg-background-50 px-4 py-3 text-xs font-semibold text-foreground-600 lg:grid"><span>状态流转</span><span>主责角色</span><span>动作说明</span><span>接口准备情况</span></div>
            {group.steps.map((step) => <article key={step.order} className="grid gap-3 border-b border-background-100 p-4 last:border-b-0 lg:grid-cols-[minmax(14rem,1.3fr)_minmax(9rem,.8fr)_minmax(16rem,1.4fr)_minmax(15rem,1.2fr)] lg:gap-4">
              <div><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">{step.order}</span><h3 className="mt-2 font-semibold text-foreground-900">{step.title}</h3><p className="mt-1 text-sm text-foreground-600">{step.transition}</p>{step.branch && <p className="mt-2 rounded-md bg-background-50 px-2 py-1 text-xs text-foreground-700">{step.branch}</p>}</div>
              <div><p className="text-xs font-medium text-foreground-500 lg:hidden">主责角色</p><p className="mt-1 text-sm text-foreground-800">{step.owner}</p></div>
              <div><p className="text-xs font-medium text-foreground-500 lg:hidden">动作说明</p><p className="mt-1 text-sm leading-6 text-foreground-700">{step.action}</p></div>
              <div><p className="text-xs font-medium text-foreground-500 lg:hidden">接口准备情况</p><p className="mt-1 break-words font-mono text-xs text-foreground-700">{step.endpoint}</p><div className="mt-2 flex flex-wrap gap-1.5">{step.statuses.map((status) => <span key={status} className={`rounded-full px-2 py-1 text-xs font-medium ${integrationStatusMeta[status].className}`}>{integrationStatusMeta[status].label}</span>)}</div></div>
            </article>)}
          </div>
        </section>)}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 运行页面与数据契约测试，确认通过**

Run: `node --import tsx --test tests/recruitment-flow-overview.test.mjs`

Expected: PASS，显示 2 个通过测试。

- [ ] **Step 5: 提交页面实现**

```bash
git add readdy-frontend/src/pages/recruitment-flow/page.tsx readdy-frontend/tests/recruitment-flow-overview.test.mjs
git commit -m "feat: add recruitment flow overview page"
```

### Task 3: 注册路由与导航入口

**Files:**
- Modify: `readdy-frontend/src/router/config.tsx`
- Modify: `readdy-frontend/src/components/feature/MainLayout.tsx`
- Modify: `readdy-frontend/tests/recruitment-flow-overview.test.mjs`

- [ ] **Step 1: 扩展测试，先约束路由与导航入口**

```js
test('所有主角色可从导航进入流程总览路由', async () => {
  const [routerSource, layoutSource] = await Promise.all([
    readFile(new URL('../src/router/config.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/feature/MainLayout.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(routerSource, /const RecruitmentFlowPage = lazy\(\(\) => import\('\@\/pages\/recruitment-flow\/page'\)\)/);
  assert.match(routerSource, /path: '\/recruitment-flow'/);
  for (const role of ['recruiter', 'manager', 'admin', 'interviewer', 'hr_director']) {
    assert.match(layoutSource, new RegExp(`path: '/recruitment-flow'.*label: '招聘流程'.*roles: \['${role}'\]`));
  }
});
```

- [ ] **Step 2: 运行测试，确认路由尚未注册而失败**

Run: `node --import tsx --test tests/recruitment-flow-overview.test.mjs`

Expected: FAIL，断言提示尚未找到 `RecruitmentFlowPage` 或 `/recruitment-flow`。

- [ ] **Step 3: 注册所有角色可访问的页面和菜单**

在 `src/router/config.tsx` 添加：

```tsx
const RecruitmentFlowPage = lazy(() => import('@/pages/recruitment-flow/page'));
const allProductRoles: ProductRole[] = ['admin', 'manager', 'recruiter', 'interviewer', 'hr_director'];

{
  path: '/recruitment-flow',
  element: <RequireCompanyRole allow={allProductRoles}><RecruitmentFlowPage /></RequireCompanyRole>,
},
```

在 `src/components/feature/MainLayout.tsx` 的五个角色导航数组中分别增加：

```ts
// recruiterNavItems
{ path: '/recruitment-flow', icon: 'ri-route-line', label: '招聘流程', roles: ['recruiter'] },
// managerNavItems
{ path: '/recruitment-flow', icon: 'ri-route-line', label: '招聘流程', roles: ['manager'] },
// adminNavItems
{ path: '/recruitment-flow', icon: 'ri-route-line', label: '招聘流程', roles: ['admin'] },
// interviewerNavItems
{ path: '/recruitment-flow', icon: 'ri-route-line', label: '招聘流程', roles: ['interviewer'] },
// directorNavItems
{ path: '/recruitment-flow', icon: 'ri-route-line', label: '招聘流程', roles: ['hr_director'] },
```

不要给该导航项配置 `menuCode`，保证它作为公共说明页不依赖尚未配置的权限菜单。

- [ ] **Step 4: 运行路由契约与现有运行时约束**

Run: `node --import tsx --test tests/recruitment-flow-overview.test.mjs tests/runtime-route-truth-contract.test.mjs`

Expected: PASS，流程总览和运行时 Mock 约束均通过。

- [ ] **Step 5: 提交路由与导航入口**

```bash
git add readdy-frontend/src/router/config.tsx readdy-frontend/src/components/feature/MainLayout.tsx readdy-frontend/tests/recruitment-flow-overview.test.mjs
git commit -m "feat: expose recruitment flow overview"
```

### Task 4: 全量验证与视觉检查

**Files:**
- Modify: `readdy-frontend/tests/recruitment-flow-overview.test.mjs`（仅当验证发现契约遗漏时）

- [ ] **Step 1: 运行完整前端静态检查**

Run: `npm run lint && npm run type-check && npm run test:contract && npm run build`

Expected: 每条命令退出码为 0；构建输出包含 `built in`。

- [ ] **Step 2: 使用本地账号做桌面端视觉检查**

打开 `http://127.0.0.1:5190/login`，用 `hr01 / Zhipin2026` 登录，进入“招聘流程”。确认 11 个步骤、5 个分组、顶部飞书基准声明和 4 类图例均可见，桌面端显示四列泳道且无文字重叠。

- [ ] **Step 3: 做手机宽度视觉检查**

将浏览器宽度调整到 390px，确认每一步改为纵向字段卡片，接口名称可换行，页面没有横向滚动或内容被截断。

- [ ] **Step 4: 最终检查并提交验证修复（若没有修复则跳过提交）**

Run: `git diff --check && git status --short`

Expected: 无空白错误；仅包含本计划的预期变更。若视觉检查导致代码或测试修复，提交：

```bash
git add readdy-frontend/src readdy-frontend/tests
git commit -m "test: verify recruitment flow overview"
```
