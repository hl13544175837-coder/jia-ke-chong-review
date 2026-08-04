# 招聘产品 11 个页面统一优化 Implementation Plan

> **2026-08-04 现行口径：** 用户复核后恢复为“面试信息 / 候选人简历 / 面试评价”三个页签，并取消历史评价双盲锁；本文内“两页签”和“先提交再看历史评价”仅记录 2026-08-03 当时的已执行方案，不再作为当前实现要求。现行执行与核验以 `2026-08-04-recruitment-six-optimizations-codex-plan.md` 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 按 11 张已确认的优化图，统一招聘专员和面试官页面的详情结构、状态颜色、操作按钮、查询控件和页面叫法，并用自动化测试与 11 张实际页面截图逐项证明没有漏改。

**Architecture:** 保持现有 React + Vite + TypeScript 前端和 Flask 后端不变。本轮以共享展示组件收口颜色、按钮和详情抽屉骨架，再按“招聘需求 → 候选人 → 面试 → 工作台 → 面试官 → Offer”顺序改页面。只调整展示层和已有数据的筛选方式，不改后端状态机、接口字段、权限和数据口径；面试官详情继续使用后端角色过滤及前端 `interviewOnly` 模式。

**Tech Stack:** React 19、React Router 7、TypeScript 5.8、Tailwind CSS 3.4、Node Test Runner、现有 Flask API、Tabbit 浏览器。

## 执行结果（2026-08-03）

- 状态：已完成本计划的代码、自动化、文档和 11 张实际页面截图核对。
- 自动化：`node --test tests/*.test.mjs` 共 112 项通过；`npm run type-check`、`npm run lint`、`npm run build`、`git diff --check` 均通过。
- 实机：使用 Tabbit、真实本地 API、招聘专员与面试官演示账号完成核对；当前桌面可用截图尺寸为 1310×768、缩放 100%，因此用该尺寸替代原计划的 1440×900，并同时覆盖了接近 1280×720 的窄屏换行检查。
- 证据：`docs/verification/2026-08-03-recruitment-ui-consistency/actual-01` 至 `actual-11`，共 11 张。
- 范围边界：按用户选择的 A 方案，不新增 Offer“面试轮次”筛选；当前数据无轮数字段，也没有新增接口或伪造数据。

---

## 一、执行边界

- 实施仓库固定为 `/Users/yenns/Documents/新版招聘/zhipin-mvp`，代码基线以公司 CFPD 仓库 `cfpd/zhipin-mvp` 的 `test` 分支为准。
- 只修改当前主线前端 `readdy-frontend/` 和本轮受影响的真源文档，不触碰旧前端。
- 11 张图已经全部通过，实施时以“优化后”一侧为视觉目标，不再重新设计整体方向。
- 本轮不新增后端接口、数据库字段、状态或角色权限。若现有接口确实无法提供某个筛选字段，停止该字段实现并先修订本计划，不在前端编造数据。
- “招聘专员”和“面试官”使用相同页面骨架与相同名词，不代表数据权限相同。面试官仍不能看到 Offer 薪资、审批人、业务筛选备注、淘汰原因或后续 HR 流程。
- 保留现有规则：二面面试官提交本人评价前看不到一面文字结论，提交后只读查看；本轮只改展示结构，不改该可见性规则。
- Offer 页面明确展示“一期仍为人工登记，OA 尚未接入”，不伪装成已完成 OA 自动同步。
- 不执行 `git reset`、`git checkout --`、`git stash`、`git clean`，不覆盖用户已有改动。

## 二、五条统一规则（全程不能破坏）

| 编号 | 统一规则 | 完成标准 |
|---:|---|---|
| U1 | 个人详情统一格式 | 统一标题区、状态、内容页签、滚动正文和右下角固定操作区；候选人类详情统一为“简历 / 招聘流程”两页签 |
| U2 | 状态必须靠颜色区分 | 灰=未开始/失效，黄=待处理/风险，蓝=进行中，绿=完成/通过，红=拒绝/淘汰/异常；同一状态在列表和详情颜色一致 |
| U3 | 操作按钮必须分主次 | 主操作=绿色实心，次操作=白底描边，危险操作=红色描边或红色实心，禁用=灰色；“查看详情”由点击整行承担，不和业务动作混在一起 |
| U4 | 常用查询控件直接展示 | 搜索、岗位、部门、负责人/面试官、时间等常用条件放在列表上方；不再藏在“筛选”按钮或表头小图标内；支持重置 |
| U5 | 两类角色叫法统一 | 统一使用“候选人筛选”“简历”“招聘流程”“面试安排”“面试评价”等词；不再出现“待面试官筛选 / 候选人简历 / 历史评价”等同义叫法 |

## 三、11 张图追踪矩阵

批准图目录：`/Users/yenns/.codex/visualizations/2026/08/03/019fc700-435c-7a22-b1a8-345275ea5c1c/zhipin-ui-review/`

| 图号 | 功能板块 | 批准图 | 主要页面/组件 | 必须核对 | 实施 | 自动化 | 实际截图 |
|---:|---|---|---|---|:---:|:---:|:---:|
| 01 | 招聘需求列表 | `comparison-01-demand-list.jpg` | `/jobs`、`RequisitionTable.tsx` | 查询条件外露、状态颜色、操作主次 | [x] | [x] | [x] |
| 02 | 招聘需求详情 | `comparison-02-demand-detail.jpg` | `DemandDetailPanel.tsx` | 详情格式、状态色、右下角固定按钮 | [x] | [x] | [x] |
| 03 | 候选人详情 | `comparison-03-candidate-detail.jpg` | `CandidateLibraryWorkspace.tsx` | “简历 / 招聘流程”、固定按钮 | [x] | [x] | [x] |
| 04 | 招聘专员面试列表 | `comparison-04-interview-list.jpg` | `/interviews`、Toolbar、Table | 查询条件外露、状态色、动作精简 | [x] | [x] | [x] |
| 05 | 招聘专员面试详情 | `comparison-05-interview-detail.jpg` | `/interviews` 详情区 | “简历 / 招聘流程”、固定按钮 | [x] | [x] | [x] |
| 06 | 招聘专员工作台 | `comparison-06-recruiter-dashboard.jpg` | `/dashboard` | 待办按类型分组、动作明确 | [x] | [x] | [x] |
| 07 | 面试官候选人筛选列表 | `comparison-07-interviewer-screening.jpg` | `/interviewer/screening` | 改名、查询条件外露、状态色 | [x] | [x] | [x] |
| 08 | 面试官候选人详情 | `comparison-08-interviewer-candidate-detail.jpg` | `BusinessReviewDetail.tsx` | 两页签、固定三类操作、权限不扩大 | [x] | [x] | [x] |
| 09 | 面试官面试列表 | `comparison-09-interviewer-interviews.jpg` | `/interviewer/interviews` | 岗位/部门/时间查询、状态色 | [x] | [x] | [x] |
| 10 | 面试官面试详情 | `comparison-10-interviewer-interview-detail.jpg` | `InterviewerInterviewDetailDrawer.tsx` | 三页签合为两页签、固定评价操作、权限不扩大 | [x] | [x] | [x] |
| 11 | Offer 列表 | `comparison-11-offer-list.jpg` | `/offers`、`OfferTable.tsx` | 查询条件外露、状态色、OA 边界 | [x] | [x] | [x] |

## 四、共享实现约定

**新增：**

- `readdy-frontend/src/components/ui/SemanticStatusBadge.tsx`：只负责统一状态色和尺寸。
- `readdy-frontend/src/components/ui/ActionButton.tsx`：统一 `primary`、`secondary`、`danger`、`disabled` 四类按钮。
- `readdy-frontend/src/components/ui/DetailActionBar.tsx`：详情底部固定操作区，按钮永远右对齐并适配窄屏换行。
- `readdy-frontend/src/components/ui/DetailWorkspaceTabs.tsx`：候选人类详情统一“简历 / 招聘流程”两页签及无障碍属性。
- `readdy-frontend/src/components/ui/FilterBar.tsx`：只提供常用查询控件的横向布局、换行和重置区域，各页面仍维护自己的筛选字段与业务逻辑。
- `readdy-frontend/src/components/ui/recruitmentPresentation.ts`：集中维护 Demand、业务筛选、面试和 Offer 的状态中文名与颜色语义。
- `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`：锁定 11 张图对应的公共规则和页面接线。

**复用和扩展：**

- `ReadOnlyDetailDrawer.tsx` 继续负责抽屉遮罩、滚动、Escape 和焦点恢复，不新建第二套弹层生命周期。
- `WorkspaceTabs.tsx` 继续负责列表页状态页签；`DetailWorkspaceTabs.tsx` 只负责详情内两页签。
- `CandidateJourneySummary.tsx` 继续负责招聘历程；面试官端必须传 `interviewOnly`。
- 各业务页面保留现有 API、提交动作、错误提示、重试和 URL 状态，只替换展示结构。

## 五、分步实施清单

### Task 0：保存基线证据并确认工作区

**Files:** 无产品文件改动。

- [x] 运行 `git status --short --branch`，确认没有未识别的用户改动。
- [x] 运行 `git branch --show-current`，记录当前实施分支。
- [x] 运行 `git ls-remote git@git.ymdd.tech:cfpd/zhipin-mvp.git refs/heads/test`，记录 CFPD `test` 的远端 SHA；这里只核对，不推送。
- [x] 在 `readdy-frontend` 运行 `node --test tests/ui-consistency-contract.test.mjs tests/interviewer-detail-tabs-contract.test.mjs tests/page-state-memory-contract.test.mjs`。
- [x] 在 `readdy-frontend` 运行 `npm run type-check && npm run lint && npm run build`。
- [x] 记录基线结果；若基线已有失败，先区分旧失败与本轮失败，不顺手改无关问题。

Expected: 工作区范围清楚；现有测试、类型、规范和构建结果都有基线记录。

### Task 1：先用测试锁定五条统一规则

**Files:**

- Create: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`
- Modify: `readdy-frontend/tests/ui-consistency-contract.test.mjs`
- Modify: `readdy-frontend/tests/interviewer-detail-tabs-contract.test.mjs`
- Modify: `readdy-frontend/tests/page-state-memory-contract.test.mjs`

- [x] 先写失败测试：11 个页面都必须使用公共状态、按钮或查询布局组件。
- [x] 增加失败测试：个人详情只能显示“简历 / 招聘流程”两个固定页签，并带 `role="tablist"`、`role="tab"`、`aria-selected`。
- [x] 增加失败测试：`MainLayout.tsx`、面试官工作台和筛选页不得再出现“待面试官筛选”，统一为“候选人筛选”。
- [x] 增加失败测试：三个列表的基础查询控件直接存在于页面 DOM，不能只靠筛选弹层或表头弹层。
- [x] 增加失败测试：详情操作区使用 `DetailActionBar`，列表业务动作使用 `ActionButton`。
- [x] 增加 URL 记忆测试：筛选页保留 `q/job/department/city`；面试页保留 `q/job/department/date`；离开再回来不重新打开旧详情。
- [x] 运行 `node --test tests/recruitment-ui-unification-contract.test.mjs tests/ui-consistency-contract.test.mjs tests/interviewer-detail-tabs-contract.test.mjs tests/page-state-memory-contract.test.mjs`。

Expected: 新增用例先 FAIL，失败原因明确指向尚未接入的公共组件、两页签或统一叫法。

### Task 2：实现公共状态、按钮、详情页签和查询条

**对应：** U1、U2、U3、U4；为图 01–11 提供共用底座。

**Files:**

- Create: `readdy-frontend/src/components/ui/SemanticStatusBadge.tsx`
- Create: `readdy-frontend/src/components/ui/ActionButton.tsx`
- Create: `readdy-frontend/src/components/ui/DetailActionBar.tsx`
- Create: `readdy-frontend/src/components/ui/DetailWorkspaceTabs.tsx`
- Create: `readdy-frontend/src/components/ui/FilterBar.tsx`
- Create: `readdy-frontend/src/components/ui/recruitmentPresentation.ts`
- Modify: `readdy-frontend/src/components/ui/ReadOnlyDetailDrawer.tsx`
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`

- [x] `SemanticStatusBadge` 接收统一语义色，不允许页面自己拼散落的状态 class。
- [x] `recruitmentPresentation.ts` 为 Demand、业务筛选、面试、Offer 状态提供唯一中文名和语义色映射。
- [x] `ActionButton` 固定四种样式，保留原按钮的 `disabled`、`type`、`onClick` 和无障碍名字。
- [x] `DetailActionBar` 使用底部固定/粘性布局、右对齐、白底和上边框；正文留足底部空间，不能被按钮遮住。
- [x] `DetailWorkspaceTabs` 固定 `resume` 与 `flow` 两个 key，中文固定为“简历”“招聘流程”，切换只改本地状态。
- [x] `FilterBar` 支持桌面横排、窄屏换行、搜索区和“重置”区，不读取业务数据。
- [x] `ReadOnlyDetailDrawer` 只做向后兼容扩展，现有调用方不改也能正常渲染。
- [x] 运行 `node --test tests/recruitment-ui-unification-contract.test.mjs tests/overlay-lifecycle-contract.test.mjs tests/visual-primitives-regression.test.mjs`。
- [x] 运行 `npm run type-check && npm run lint`。

Expected: 公共组件测试 PASS；原有弹层生命周期和视觉基础测试不回退。

### Task 3：图 01——招聘需求列表

**Files:**

- Modify: `readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx`
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`

- [x] 把搜索、状态、部门、负责人等基础查询直接放在表格上方，保留搜索和重置。
- [x] 删除或停用重复的表头小筛选入口，避免同一个条件有两套入口。
- [x] 状态列改用 `SemanticStatusBadge`，列表与需求详情使用同一映射。
- [x] 行点击继续打开详情；操作列只保留当前业务可执行动作，不再额外放“查看详情”。
- [x] 业务动作使用 `ActionButton`：主要下一步绿色、次要动作描边、关闭/拒绝类红色。
- [x] 保留现有 Demand 权限、分页、URL 条件和空态行为。
- [x] 运行目标测试后，在 Tabbit 以 1440×900 核对图 01。

Expected: 图 01 的“实施、自动化”两格可勾选；查询不必先点“筛选”才能看到。

### Task 4：图 02——招聘需求详情

**Files:**

- Modify: `readdy-frontend/src/pages/jobs/components/DemandDetailPanel.tsx`
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`

- [x] 标题区统一展示需求名称、编号、负责人和状态徽标。
- [x] 普通文字状态替换为共享状态徽标，状态名与列表一致。
- [x] 正文信息按批准图分组，字段顺序一致；不删除已有业务信息。
- [x] 底部操作全部迁到 `DetailActionBar`，固定在右下角并保留原权限和禁用条件。
- [x] 审核通过、退回、关闭、恢复等动作按主次和危险色区分，不能改变原后端调用。
- [x] 核对长内容滚动时标题和底部操作仍可见，正文最后一行不被遮住。

Expected: 图 02 的三格可勾选；需求详情和其他个人详情的头部、正文、底部节奏一致。

### Task 5：图 03——招聘专员候选人详情

**Files:**

- Modify: `readdy-frontend/src/features/candidates/components/CandidateLibraryWorkspace.tsx`
- Modify: `readdy-frontend/src/components/candidates/CandidateJourneySummary.tsx`（只在统一布局确有需要时修改）
- Modify: `readdy-frontend/src/components/candidates/StructuredResumeView.tsx`（只在统一布局确有需要时修改）
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`
- Test: `readdy-frontend/tests/resume-recovery-contract.test.mjs`

- [x] 把现有混排正文拆成“简历 / 招聘流程”两页签，默认打开“简历”。
- [x] “简历”保留原简历、结构化简历和恢复提示；“招聘流程”保留当前需求、业务筛选和历程。
- [x] 页签切换只改本地展示，不重复调用候选人详情接口。
- [x] 底部关闭和当前业务动作迁到 `DetailActionBar`，操作权限和提交逻辑不变。
- [x] 候选人状态使用共享状态徽标；同一状态与面试详情一致。
- [x] 验证简历缺失、解析失败、加载失败和空流程时仍显示原来的恢复入口。

Run: `node --test tests/recruitment-ui-unification-contract.test.mjs tests/resume-recovery-contract.test.mjs tests/candidate-data-hygiene-contract.test.mjs`

Expected: 全部 PASS；图 03 的三格可勾选。

### Task 6：图 04——招聘专员面试列表

**Files:**

- Modify: `readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx`
- Modify: `readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx`
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`
- Test: `readdy-frontend/tests/page-state-memory-contract.test.mjs`

- [x] 把候选人搜索、岗位、部门、面试官、时间直接放在列表上方，增加明确重置入口。
- [x] URL 只保存可恢复筛选，不保存已关闭的详情和操作弹窗。
- [x] 删除重复的表头筛选弹层；保留必要排序。
- [x] 面试状态改用公共映射，待处理黄、进行中蓝、完成绿、取消灰/红。
- [x] 整行点击负责打开详情；操作列只显示安排、确认、评价、改约等真实动作。
- [x] 保留原来的安排、取消、改约、反馈和错误处理流程。

Run: `node --test tests/recruitment-ui-unification-contract.test.mjs tests/page-state-memory-contract.test.mjs tests/interview-reschedule-workflow.test.mjs tests/interviewer-self-confirm-contract.test.mjs`

Expected: 全部 PASS；图 04 的三格可勾选。

### Task 7：图 05——招聘专员面试详情

**Files:**

- Create: `readdy-frontend/src/pages/interviews/components/RecruiterInterviewDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`
- Test: `readdy-frontend/tests/workspace-detail-navigation-contract.test.mjs`

- [x] 把 `page.tsx` 内联详情抽成独立组件，复用现有详情抽屉骨架。
- [x] 详情固定为“简历 / 招聘流程”两页签，默认打开“招聘流程”。
- [x] “招聘流程”集中显示面试安排、轮次、评价、改约记录和候选人历程；“简历”显示已有简历组件。
- [x] 底部业务动作全部进入 `DetailActionBar`，固定右下角，按钮颜色遵循 U3。
- [x] 不改变招聘专员查看完整流程、安排下一轮、进入 Offer 或淘汰的原有权限和 API。
- [x] 快速切换不串详情，加载失败保留局部重试，Escape/焦点恢复继续有效。

Run: `node --test tests/recruitment-ui-unification-contract.test.mjs tests/workspace-detail-navigation-contract.test.mjs tests/overlay-lifecycle-contract.test.mjs tests/interview-round-binding-contract.test.mjs`

Expected: 全部 PASS；图 05 的三格可勾选。

### Task 8：图 06——招聘专员工作台

**Files:**

- Modify: `readdy-frontend/src/pages/dashboard/page.tsx`
- Modify: `readdy-frontend/src/pages/dashboard/components/TodoPanel.tsx`（确认当前页面实际使用后再修改）
- Test: `readdy-frontend/tests/dashboard-direct-schedule-contract.test.mjs`
- Test: `readdy-frontend/tests/workflow-drilldown-contract.test.mjs`
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`

- [x] 使用现有需求、面试、Offer、业务筛选数据，把待办按类型分组：待补评价、待安排面试、待确认已面试、HC/需求风险、Offer 跟进。
- [x] 每条待办只保留一个明确主动作，文案直接说明下一步。
- [x] 状态/风险使用公共颜色，不以大段说明代替状态。
- [x] 点击后仍进入现有真实页面和对应筛选，不新建通知接口，不在前端生成业务事实。
- [x] 已关闭、暂停或完成需求的旧任务不重新进入待办。
- [x] 空待办时显示“当前没有待处理事项”和可去的页面入口。

Run: `node --test tests/dashboard-direct-schedule-contract.test.mjs tests/workflow-drilldown-contract.test.mjs tests/recruitment-ui-unification-contract.test.mjs`

Expected: 全部 PASS；图 06 的三格可勾选。

### Task 9：图 07——面试官候选人筛选列表与统一叫法

**Files:**

- Modify: `readdy-frontend/src/components/feature/MainLayout.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/dashboard/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/page.tsx`
- Modify: `readdy-frontend/src/features/navigation/pageMemory.ts`（只有白名单需要补充时修改）
- Modify: `readdy-frontend/tests/ui-consistency-contract.test.mjs`
- Modify: `readdy-frontend/tests/page-state-memory-contract.test.mjs`
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`

- [x] 左侧导航、工作台卡片、页面标题统一从“待面试官筛选”改为“候选人筛选”。
- [x] 搜索、岗位、部门、城市直接展示，条件写入 URL 并可重置。
- [x] 返回页面时恢复筛选，但不自动重开旧候选人详情。
- [x] 待筛选、通过、不合适状态使用公共颜色。
- [x] 整行打开候选人详情，操作列只保留真实业务动作。
- [x] 页面加载、错误、空态继续使用大白话说明下一步。

Run: `node --test tests/recruitment-ui-unification-contract.test.mjs tests/ui-consistency-contract.test.mjs tests/page-state-memory-contract.test.mjs tests/interviewer-demand-detail-contract.test.mjs`

Expected: 全部 PASS；代码和可见页面不再出现旧叫法；图 07 的三格可勾选。

### Task 10：图 08——面试官候选人详情

**Files:**

- Modify: `readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/page.tsx`
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`
- Test: `readdy-frontend/tests/round-feedback-visibility-contract.test.mjs`

- [x] 详情改为“简历 / 招聘流程”两页签，复用统一头部、状态和底部操作区。
- [x] “招聘流程”只显示面试官被授权看到的筛选任务、面试历程和评价，不展示 HR/Offer 私密内容。
- [x] 底部固定显示“需要 HR 补充”“不合适”“通过”等当前可用动作；无权限或已完成时按原逻辑禁用/隐藏。
- [x] 危险/否定动作使用红色，主通过动作使用绿色，补充信息使用次按钮。
- [x] 保留提交确认、错误提示、重复点击保护和重新加载。
- [x] 用 recruiter 与 interviewer 两种账号对同一候选人做只读对比，确认版式一致、字段权限不同。

Run: `node --test tests/recruitment-ui-unification-contract.test.mjs tests/round-feedback-visibility-contract.test.mjs tests/management-role-workflow-contract.test.mjs`

Expected: 全部 PASS；面试官看不到新增敏感字段；图 08 的三格可勾选。

### Task 11：图 09——面试官面试列表

**Files:**

- Modify: `readdy-frontend/src/pages/interviewer/interviews/page.tsx`
- Modify: `readdy-frontend/src/features/navigation/pageMemory.ts`（只有白名单需要补充时修改）
- Modify: `readdy-frontend/tests/page-state-memory-contract.test.mjs`
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`

- [x] 在现有搜索之外，直接展示岗位、部门、面试时间查询控件和重置。
- [x] 页签、搜索和查询条件写入 URL；详情编号、候选人编号等临时参数关闭后清除。
- [x] 状态使用公共映射，与招聘专员面试列表保持一致。
- [x] 操作列只显示当前面试官能执行的确认、评价、修改评价或改约申请。
- [x] 不能出现推进下一轮、进入 Offer、淘汰等 HR 动作。
- [x] 保留当前到点后本人确认面试、结构化评价和错误恢复逻辑。

Run: `node --test tests/recruitment-ui-unification-contract.test.mjs tests/page-state-memory-contract.test.mjs tests/interviewer-self-confirm-contract.test.mjs tests/structured-interview-feedback-contract.test.mjs`

Expected: 全部 PASS；图 09 的三格可勾选。

### Task 12：图 10——面试官面试详情

**Files:**

- Modify: `readdy-frontend/src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx`
- Modify: `readdy-frontend/tests/interviewer-detail-tabs-contract.test.mjs`
- Test: `readdy-frontend/tests/round-feedback-visibility-contract.test.mjs`
- Test: `readdy-frontend/tests/overlay-lifecycle-contract.test.mjs`

- [x] 把“面试信息 / 候选人简历 / 历史评价”三页签合并为“简历 / 招聘流程”两页签。
- [x] “招聘流程”承载面试基本信息、JD、改约记录、本轮和按规则解锁的历史评价；默认打开“招聘流程”。
- [x] 页签切换只改本地状态，不重新请求详情接口。
- [x] 继续使用 `<CandidateJourneySummary journey={journey} interviewOnly />`，不能删除 `interviewOnly`。
- [x] 底部固定区只保留“面试尚未开始”“确认已面试并填写评价”“填写评价”“修改评价”等原有动作。
- [x] 评价弹窗打开时详情层不响应 Escape；详情错误仍可局部重新加载。
- [x] 运行敏感词检查，面试官详情源码不得新增薪酬、审批人、淘汰原因、Offer 操作字段。

Run: `node --test tests/interviewer-detail-tabs-contract.test.mjs tests/round-feedback-visibility-contract.test.mjs tests/overlay-lifecycle-contract.test.mjs tests/structured-interview-feedback-contract.test.mjs`

Expected: 全部 PASS；两页签可切换；原权限与评价规则不回退；图 10 的三格可勾选。

### Task 13：图 11——Offer 列表和 OA 边界

**Files:**

- Modify: `readdy-frontend/src/pages/offers/page.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/OfferTable.tsx`
- Modify: `readdy-frontend/src/pages/offers/workbench.ts`
- Create: `readdy-frontend/tests/offer-ui-unification-contract.test.mjs`
- Test: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`

- [x] 把候选人搜索、需求/岗位、负责人、更新时间、风险直接放在列表上方，保留重置和排序。
- [x] 不增加“面试轮数”筛选：当前 `OfferRecord` 没有轮数字段，本轮按“不新增接口、不编造数据”的边界执行。
- [x] Offer 状态使用公共映射，列表、详情和工作台一致。
- [x] 操作列只显示当前角色下一步；整行点击继续打开详情。
- [x] 页面增加常驻说明：“一期 Offer 由招聘专员线下确认后登记，OA 自动发起/同步尚未接入。”
- [x] 不改 Offer 草稿、经理确认/退回、发放登记、候选人回复和确认入职状态机。
- [x] 招聘专员不能确认自己的 Offer，面试官仍不能进入 Offer 页面。

Run: `node --test tests/offer-ui-unification-contract.test.mjs tests/recruitment-ui-unification-contract.test.mjs tests/management-role-workflow-contract.test.mjs tests/workspace-detail-navigation-contract.test.mjs`

Expected: 全部 PASS；OA 文案真实；图 11 的三格可勾选。

### Task 14：同步产品和技术真源文档

**Files:**

- Modify: `RUNNING.md`
- Modify: `docs/01_PRD.md`
- Modify: `docs/11_Readdy新前端迁移与验收矩阵.md`
- Modify: `docs/13_试点业务流程与研发接口交接.md`
- Modify: `docs/SDD-智聘招聘系统-v1.0.md`

- [x] 把所有“面试信息 / 候选人简历 / 历史评价”三页签说明改为“简历 / 招聘流程”两页签。
- [x] 把“待面试官筛选”统一改为“候选人筛选”，但保留路由 `/interviewer/screening` 不变。
- [x] 写清楚常用查询条件外露、状态色和固定底部操作区的展示规则。
- [x] 写清楚同一骨架不改变角色权限；面试官 journey 继续由后端过滤并在前端 `interviewOnly` 展示。
- [x] 写清楚 Offer 一期仍为人工登记，OA 自动发起/同步尚未接入。
- [x] 不修改 `AGENTS.md`，因为本轮没有改变项目级执行规范。
- [x] 运行 `rg -n "面试信息|候选人简历|历史评价|待面试官筛选" RUNNING.md docs/01_PRD.md docs/11_Readdy新前端迁移与验收矩阵.md docs/13_试点业务流程与研发接口交接.md docs/SDD-智聘招聘系统-v1.0.md readdy-frontend/src readdy-frontend/tests`，逐个判断剩余命中；产品可见旧叫法应为 0，历史说明或测试反例必须有明确原因。

Expected: 五份真源文档与代码口径一致，没有“代码两页签、文档三页签”的冲突。

### Task 15：全量自动化验收

**Files:** 只修复本轮改动造成的失败。

- [x] 在 `readdy-frontend` 运行 `node --test tests/*.test.mjs`。
- [x] 运行 `npm run type-check`。
- [x] 运行 `npm run lint`。
- [x] 运行 `npm run build`。
- [x] 在仓库根目录运行 `git diff --check`。
- [x] 运行 `git status --short`，核对修改文件全部属于本计划。
- [x] 运行 `git diff --stat` 和 `git diff -- readdy-frontend/src readdy-frontend/tests RUNNING.md docs/01_PRD.md docs/11_Readdy新前端迁移与验收矩阵.md docs/13_试点业务流程与研发接口交接.md docs/SDD-智聘招聘系统-v1.0.md`，人工复核没有接口、权限或状态机变更。

Expected: Node 测试全部 PASS；type-check、lint、build、diff-check 全部成功；0 个无关文件混入。

### Task 16：Tabbit 实际页面验收并产出 11 张证据图

**截图目录：** `docs/verification/2026-08-03-recruitment-ui-consistency/`

- [x] 按 `RUNNING.md` 启动本地前后端，确认使用真实本地 API 和演示账号，不使用 mock 页面。
- [x] 使用 Tabbit、浏览器缩放 100%，先用招聘专员账号验收图 01–06、11；受当前桌面尺寸限制，实际截图统一为 1310×768，并在本节执行结果中留痕。
- [x] 切换面试官账号验收图 07–10；对图 08、10额外核对无薪酬、审批、淘汰、后续 HR 流程。
- [x] 每张图先完成点击检查，再保存实际截图：

| 图号 | 实际截图文件 | 点击检查 |
|---:|---|---|
| 01 | `actual-01-demand-list.png` | 查询、重置、状态、行详情、主次动作 |
| 02 | `actual-02-demand-detail.png` | 滚动、固定按钮、关闭、状态一致 |
| 03 | `actual-03-candidate-detail.png` | 两页签、简历恢复、流程、固定按钮 |
| 04 | `actual-04-interview-list.png` | 五类查询、重置、状态、真实动作 |
| 05 | `actual-05-interview-detail.png` | 两页签、流程、固定按钮、重试 |
| 06 | `actual-06-recruiter-dashboard.png` | 待办分组、每条主动作、跳转落点 |
| 07 | `actual-07-interviewer-screening.png` | 新叫法、查询 URL、重置、状态 |
| 08 | `actual-08-interviewer-candidate-detail.png` | 两页签、三类动作、敏感字段不可见 |
| 09 | `actual-09-interviewer-interviews.png` | 岗位/部门/时间、URL 恢复、状态 |
| 10 | `actual-10-interviewer-interview-detail.png` | 两页签、评价动作、解锁规则、敏感字段不可见 |
| 11 | `actual-11-offer-list.png` | 查询、状态、角色动作、OA 边界文案 |

- [x] 把每张 `actual-XX` 与对应 `comparison-XX` 的优化后一侧逐项对照，不以“看起来差不多”代替检查。
- [x] 以当前 1310×768 窄屏实机和桌面尺寸自动化用例检查查询条换行、表格横向滚动、详情底部按钮不遮正文。
- [x] 额外检查加载态、空态、接口失败态、无权限态；每种状态都必须说明发生了什么和下一步。
- [x] 11 张实际图全部生成后，再回到“11 张图追踪矩阵”，只有“实施、自动化、实际截图”三格都有证据时才能勾选完成。

Expected: `actual-01` 至 `actual-11` 共 11 张，数量不多不少；每一张都能追溯到批准图、页面、自动化测试和点击验收。

### Task 17：最终漏项审计与交付

- [x] 核对 U1：图 02、03、05、08、10 的详情头部、两页签/信息区和底部操作是否统一。
- [x] 核对 U2：图 01、02、04、07、09、11 的同状态颜色是否一致。
- [x] 核对 U3：11 张图内的主、次、危险、禁用按钮是否一眼可分。
- [x] 核对 U4：图 01、04、07、09、11 的常用查询是否直接可见并能重置。
- [x] 核对 U5：代码、测试、文档和页面是否统一使用新叫法。
- [x] 核对权限：面试官端无 Offer 薪资、审批人、业务筛选备注、淘汰信息和后续流程；招聘专员端原动作可正常执行。
- [x] 核对业务：Demand、面试、评价、Offer 的后端状态机、API 请求和审计逻辑无变化。
- [x] 核对 OA：只显示未接入说明，没有自动发起/自动同步假按钮。
- [x] 核对文件：无未完成标记、占位文案、mock 数据、临时 console、未使用 import。
- [x] 运行 `rg -n "console\.log|待面试官筛选|候选人简历|历史评价" readdy-frontend/src readdy-frontend/tests RUNNING.md docs/01_PRD.md docs/11_Readdy新前端迁移与验收矩阵.md docs/13_试点业务流程与研发接口交接.md docs/SDD-智聘招聘系统-v1.0.md` 并逐条处理或记录合法原因；再逐行审查本轮 diff，确认没有未完成标记和占位文案。
- [x] 最终交付说明固定包含：本轮处理、验证依据、文档同步、11 张证据图目录、范围内未实施项（无）；另注明按 A 方案明确排除的 Offer“面试轮次”筛选。

## 六、完成定义

以下条件必须同时满足，才能说“11 张图已经全部改完”：

1. 追踪矩阵 11 行的“实施、自动化、实际截图”共 33 个格全部有证据。
2. 五条统一规则 U1–U5 全部通过。
3. Node 全量测试、TypeScript 类型检查、ESLint、前端构建、`git diff --check` 全部成功。
4. 11 张实际页面截图与 11 张批准图逐一对应。
5. 面试官权限和历史评价解锁规则没有扩大或退回。
6. Offer 页面明确 OA 未接入，没有虚假自动化。
7. 五份真源文档与最终页面叫法、页签和权限说明一致。
8. 没有无关代码、临时文案、mock 数据或未说明的失败项混入本轮改动。

## 七、建议提交批次

为便于回退和核对，每一批只提交相关文件，不使用 `git add .`：

1. `test: lock recruitment ui unification contracts`
2. `feat: add shared recruitment ui semantics`
3. `feat: unify recruiter demand and candidate views`
4. `feat: unify recruiter interview and dashboard views`
5. `feat: unify interviewer screening and interview views`
6. `feat: unify offer filters and oa boundary copy`
7. `docs: sync recruitment ui terminology and permissions`
8. `test: add approved ui visual evidence`

每批提交前都先运行该批目标测试；最后一批前运行 Task 15 的全量门禁。
