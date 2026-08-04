# 招聘系统技术债解耦 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变已审批业务流程、不破坏现有数据的前提下，建立真实浏览器测试和模块边界，拆开候选人、详情抽屉、人才地图及后端简历模块，让后续修改不会跨功能板块产生连锁问题。

**Architecture:** 保持当前 React + Flask 的“模块化单体”，不拆微服务。页面只组合功能，业务逻辑归属 `features`/后端领域服务；跨模块只能调用公开接口。全过程采用测试先行、小提交、逐批截图验收，任何一步失败都可单独回退。

**Tech Stack:** React 19、TypeScript、Vite、Flask、SQLAlchemy、Node Test、Pytest、Playwright、GitLab CI。

---

## 1. 执行范围

### 本次处理

- [ ] 增加真实浏览器自动测试，覆盖滚动、弹窗、固定按钮和五类角色主流程。
- [ ] 所有候选人/面试详情统一使用同一套抽屉生命周期和滚动结构。
- [ ] 将 2420 行的候选人工作台拆成查询、数据、列表、详情和操作模块。
- [ ] 将人才地图从前端 Mock 数据切换到仓库已经存在的真实后端接口。
- [ ] 删除没有路由入口的旧页面、旧组件以及只验证旧代码的测试。
- [ ] 将后端简历大文件按上传、解析、文件、历史版本职责拆分。
- [ ] 将模块边界、Mock 禁用、文件体积和浏览器冒烟加入自动门禁。

### 本次明确不处理

- 企业微信消息接口。
- 企业微信日历接口。
- ZIP 压缩包解析能力。
- 新业务流程、新页面视觉重做或数据库业务字段扩张。
- 将当前系统拆成微服务。

## 2. 强制开发规则

1. 一次只处理一个功能板块；一个任务一个提交。
2. 先写会失败的测试，再写最小实现，再跑全量回归。
3. 不允许通过删除测试、放宽断言或隐藏错误来换取通过。
4. 不改任务范围以外的业务逻辑、权限、数据库迁移和外部接口。
5. 页面层只组合组件，不承载接口编排和复杂业务判断。
6. `pages` 不得引用其他页面的内部组件；`features` 不得反向引用 `pages`。
7. 正式路由可到达的页面不得读取 `src/mocks` 中的业务事实。
8. 每批完成后必须记录：改动文件、测试结果、浏览器截图、已知风险、提交号。
9. 全量门禁未通过，不得推送公司 GitLab `test`。
10. 公司 GitLab 目标固定为 `cfpd/test`：`https://git.ymdd.tech/cfpd/zhipin-mvp.git`。

## 3. 目标模块结构

```text
readdy-frontend/src/features/candidates/
├── api.ts
├── types.ts
├── library/
│   ├── useCandidateLibraryData.ts
│   ├── useCandidateLibraryFilters.ts
│   ├── useCandidateDetail.ts
│   └── candidateLibraryViewModel.ts
└── components/library/
    ├── CandidateLibraryFilters.tsx
    ├── CandidateLibraryTable.tsx
    ├── CandidateLibraryBulkActions.tsx
    ├── CandidateLibraryDetail.tsx
    └── CandidateLibraryOverlays.tsx

readdy-frontend/src/features/talentMaps/
├── api.ts
├── types.ts
└── useTalentMapWorkspace.ts

backend/app/services/resumes/
├── upload_service.py
├── parse_service.py
├── file_service.py
└── version_service.py
```

约束：`CandidateLibraryWorkspace.tsx` 最终只负责组合，目标控制在 600 行以内；新增业务组件原则上控制在 400 行以内。超过时必须说明原因并继续按职责拆分。

---

### Task 0：冻结当前正确基线

**Files:**
- Create: `docs/verification/2026-08-04-technical-debt-decoupling/baseline.md`
- Verify: `readdy-frontend/tests/*.test.mjs`
- Verify: `backend/tests/`
- Verify: `base_agent/tests/`

- [ ] **Step 1：确认分支和提交**

Run:

```bash
git fetch cfpd
git status --short --branch
git log -3 --oneline
git ls-remote cfpd refs/heads/test
```

Expected：工作区干净；本地包含滚动修复 `2e61c47`；远端状态被准确记录，不凭本地缓存判断。

- [ ] **Step 2：创建独立技术债分支**

Run:

```bash
git switch -c codex/technical-debt-decoupling-20260804
```

Expected：后续工作不直接堆在 `test` 分支上。

- [ ] **Step 3：运行完整基线门禁**

Run:

```bash
bash scripts/check-sit-release.sh
```

Expected：后端、前端、类型、Lint、构建、依赖安全、数据库唯一迁移头全部通过；若工作区状态检查因基线记录文件失败，先在创建文件前运行并记录结果。

- [ ] **Step 4：记录人工浏览器基线**

至少记录以下页面：招聘需求、候选人详情长简历、招聘专员面试详情、面试官筛选详情、面试官面试详情、Offer、人才地图。记录当前地址、账号角色、关键滚动区域尺寸和截图路径。

- [ ] **Step 5：提交基线记录**

```bash
git add docs/verification/2026-08-04-technical-debt-decoupling/baseline.md
git commit -m "docs: record technical debt refactor baseline"
```

---

### Task 1：建立模块边界和技术决策

**Files:**
- Create: `docs/adr/0003-modular-monolith-ui-boundaries.md`
- Create: `readdy-frontend/tests/runtime-route-truth-contract.test.mjs`
- Modify: `readdy-frontend/tests/module-boundaries.test.mjs`
- Modify: `readdy-frontend/tests/frontend-maintainability-contract.test.mjs`

- [ ] **Step 1：先增加会失败的边界测试**

测试必须表达四条规则：

```text
1. pages 不能导入另一个 pages 目录的内部组件。
2. features 不能导入 pages。
3. 正式路由可到达页面不能运行时导入 src/mocks 业务数据。
4. CandidateLibraryWorkspace 必须小于 600 行。
```

- [ ] **Step 2：确认测试按预期失败**

Run:

```bash
cd readdy-frontend
node --test tests/runtime-route-truth-contract.test.mjs tests/module-boundaries.test.mjs tests/frontend-maintainability-contract.test.mjs
```

Expected：人才地图 Mock 和候选人工作台文件体积规则失败；已有跨页面边界继续通过。

- [ ] **Step 3：写 ADR，锁定架构选择**

ADR 必须明确：

```text
决定：保持模块化单体，不拆微服务。
原因：当前是内部招聘产品，部署单元少，优先降低研发复杂度。
代价：仍然整体部署，但代码、测试和数据责任必须按模块隔离。
替代方案：整体重写、微服务、继续维持大页面；均不采用。
```

- [ ] **Step 4：提交架构护栏**

```bash
git add docs/adr/0003-modular-monolith-ui-boundaries.md readdy-frontend/tests
git commit -m "test: define modular frontend boundaries"
```

说明：这一提交允许新增测试处于明确的红灯状态，但必须紧接对应修复任务；不得推送为可构建候选。

---

### Task 2：增加真实浏览器自动测试

**Files:**
- Modify: `readdy-frontend/package.json`
- Modify: `readdy-frontend/package-lock.json`
- Create: `readdy-frontend/playwright.config.ts`
- Create: `readdy-frontend/e2e/helpers/login.ts`
- Create: `readdy-frontend/e2e/candidate-detail-scroll.spec.ts`
- Create: `readdy-frontend/e2e/core-role-smoke.spec.ts`
- Modify: `.gitlab-ci.yml`

- [ ] **Step 1：安装测试工具并固定版本到锁文件**

```bash
cd readdy-frontend
npm install --save-dev @playwright/test
npx playwright install chromium
```

说明：这里使用的是自动化测试引擎，不会把用户默认浏览器改成 Google Chrome。

- [ ] **Step 2：增加测试命令**

`package.json` 增加：

```json
{
  "scripts": {
    "test:contract": "node --test tests/*.test.mjs",
    "test:e2e": "playwright test",
    "test:e2e:smoke": "playwright test --grep @smoke"
  }
}
```

- [ ] **Step 3：配置测试环境变量，不硬编码账号密码**

使用：

```text
E2E_BASE_URL
E2E_RECRUITER_USER / E2E_RECRUITER_PASSWORD
E2E_INTERVIEWER_USER / E2E_INTERVIEWER_PASSWORD
E2E_MANAGER_USER / E2E_MANAGER_PASSWORD
E2E_DIRECTOR_USER / E2E_DIRECTOR_PASSWORD
E2E_ADMIN_USER / E2E_ADMIN_PASSWORD
```

- [ ] **Step 4：先写长简历失败用例**

断言必须是真实行为，不检查源码文字：

```ts
const scrollPanel = page.getByTestId('candidate-detail-scroll-panel');
const before = await scrollPanel.evaluate((node) => node.scrollTop);
await scrollPanel.evaluate((node) => node.scrollTo(0, node.scrollHeight));
const after = await scrollPanel.evaluate((node) => node.scrollTop);
expect(after).toBeGreaterThan(before);
await expect(page.getByTestId('candidate-detail-action-bar')).toBeVisible();
```

- [ ] **Step 5：补五角色最小冒烟**

每个角色至少验证：成功登录、菜单权限正确、核心列表可打开、详情可关闭、页面没有整页错误。招聘专员和面试官额外验证三个详情页签及历史评价可见。

- [ ] **Step 6：先在本地运行**

```bash
cd readdy-frontend
npm run test:e2e:smoke
```

Expected：所有真实点击和滚动通过；失败时保存截图和 trace。

- [ ] **Step 7：接入 GitLab CI**

CI 中先运行契约测试、类型、Lint 和构建，再运行浏览器冒烟；冒烟失败必须保留截图和 trace 作为构建产物。

- [ ] **Step 8：提交浏览器护栏**

```bash
git add readdy-frontend/package.json readdy-frontend/package-lock.json readdy-frontend/playwright.config.ts readdy-frontend/e2e .gitlab-ci.yml
git commit -m "test: add browser smoke coverage for core recruitment flows"
```

---

### Task 3：统一所有详情抽屉

**Files:**
- Create: `readdy-frontend/src/components/ui/DetailDrawerShell.tsx`
- Modify: `readdy-frontend/src/components/ui/ReadOnlyDetailDrawer.tsx`
- Modify: `readdy-frontend/src/features/candidates/components/CandidateDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/interviews/components/RecruiterInterviewDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx`
- Modify: `readdy-frontend/tests/overlay-lifecycle-contract.test.mjs`
- Modify: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`

- [ ] **Step 1：先写统一行为测试**

每个详情抽屉必须具备：Escape 关闭、背景不可滚动、焦点恢复、页头固定、内容区独立滚动、右下角操作区固定、窄屏横向不溢出。

- [ ] **Step 2：创建唯一抽屉外壳**

公开接口固定为：

```ts
interface DetailDrawerShellProps {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  canClose?: boolean;
  ariaLabel: string;
}
```

外壳统一管理遮罩、层级、焦点、Escape、背景锁定和 `min-h-0`；业务组件只提供标题、内容和按钮。

- [ ] **Step 3：逐个迁移，一次只迁移一个入口**

迁移顺序：候选人库 → 招聘专员面试 → 面试官面试 → 业务筛选 → 招聘需求候选人。每迁移一个入口立即跑契约测试和对应浏览器用例，不允许五处一起改完再测。

- [ ] **Step 4：执行验证**

```bash
cd readdy-frontend
node --test tests/overlay-lifecycle-contract.test.mjs tests/recruitment-ui-unification-contract.test.mjs
npm run type-check
npm run lint
npm run test:e2e -- --grep "详情|滚动"
```

- [ ] **Step 5：提交**

```bash
git add readdy-frontend/src/components/ui readdy-frontend/src/features/candidates/components/CandidateDetailDrawer.tsx readdy-frontend/src/pages readdy-frontend/tests
git commit -m "refactor: unify recruitment detail drawer behavior"
```

---

### Task 4：拆分候选人工作台

**Files:**
- Create: `readdy-frontend/src/features/candidates/library/useCandidateLibraryData.ts`
- Create: `readdy-frontend/src/features/candidates/library/useCandidateLibraryFilters.ts`
- Create: `readdy-frontend/src/features/candidates/library/useCandidateDetail.ts`
- Create: `readdy-frontend/src/features/candidates/library/candidateLibraryViewModel.ts`
- Create: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryFilters.tsx`
- Create: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryTable.tsx`
- Create: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryBulkActions.tsx`
- Create: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryDetail.tsx`
- Create: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryOverlays.tsx`
- Modify: `readdy-frontend/src/features/candidates/components/CandidateLibraryWorkspace.tsx`
- Modify: `readdy-frontend/tests/frontend-maintainability-contract.test.mjs`
- Modify: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`

- [ ] **Step 1：冻结现有用户行为**

新增或补齐测试，覆盖：查询条件、分页、批量选择、收藏、加入流程、上传、重复简历处理、详情深链、原件预览/下载、历史评价、业务筛选操作。

- [ ] **Step 2：先抽纯查询和展示计算**

`candidateLibraryViewModel.ts` 只接收数据并返回展示结果，不访问浏览器、不请求接口。对应测试必须直接输入数据并断言输出。

- [ ] **Step 3：抽查询状态**

`useCandidateLibraryFilters.ts` 只管理查询条件、重置、地址同步和页码；不得包含上传、详情或业务筛选逻辑。

- [ ] **Step 4：抽数据读取**

`useCandidateLibraryData.ts` 只管理候选人、需求、审核人、业务筛选任务和面试行数据，公开：

```ts
interface CandidateLibraryDataController {
  loading: boolean;
  error: string;
  candidates: CandidateListItem[];
  refreshCandidates: () => Promise<void>;
  refreshRelatedFacts: () => Promise<void>;
}
```

- [ ] **Step 5：抽详情控制器**

`useCandidateDetail.ts` 只负责打开、加载、切页签、关闭、预览和下载；关闭时必须清理地址中的候选人编号。

- [ ] **Step 6：拆视图组件**

筛选、表格、批量操作、详情、操作弹层分别迁入五个组件；组件通过明确 props 通信，不读取其他模块内部状态。

- [ ] **Step 7：把工作台降为组合器**

`CandidateLibraryWorkspace.tsx` 最终只做控制器组合和组件排列，行数小于 600；不得把拆出的逻辑复制保留在原文件。

- [ ] **Step 8：完整验证**

```bash
cd readdy-frontend
node --test tests/*.test.mjs
npm run type-check
npm run lint
npm run build
npm run test:e2e -- --grep "候选人|简历"
```

- [ ] **Step 9：截图对比并提交**

截图必须包含候选人列表、查询、上传、长简历顶部、长简历底部、历史评价、固定操作栏。

```bash
git add readdy-frontend/src/features/candidates readdy-frontend/tests docs/verification/2026-08-04-technical-debt-decoupling
git commit -m "refactor: split candidate library responsibilities"
```

---

### Task 5：人才地图切换真实接口

**Files:**
- Create: `readdy-frontend/src/features/talentMaps/api.ts`
- Create: `readdy-frontend/src/features/talentMaps/types.ts`
- Create: `readdy-frontend/src/features/talentMaps/useTalentMapWorkspace.ts`
- Modify: `readdy-frontend/src/pages/talent-map/page.tsx`
- Modify: `readdy-frontend/src/pages/talent-map/components/NodeEditModal.tsx`
- Modify: `backend/tests/test_talent_map.py`
- Modify: `readdy-frontend/tests/runtime-route-truth-contract.test.mjs`

- [ ] **Step 1：先补后端真实接口契约测试**

覆盖组织隔离、招聘专员只能管理本人地图、经理/Admin 管理范围、创建/修改地图、公司和人选、刷新后数据仍存在、无权限返回 403。

- [ ] **Step 2：建立前端类型和接口层**

接口层只调用现有：

```text
GET/POST /talent-maps
GET/PATCH /talent-maps/:id
POST /talent-maps/:id/companies
PATCH /talent-map-companies/:id
POST /talent-maps/:id/people
PATCH /talent-map-people/:id
```

- [ ] **Step 3：页面改用真实数据控制器**

删除 `@/mocks/talentMap` 运行时导入；加载失败显示错误和重试，不允许回退到演示数据冒充成功；保存成功后重新读取接口确认。

- [ ] **Step 4：验证刷新不丢数据**

真实浏览器创建一张地图、一个公司和一个人选，刷新页面并重新登录，三项数据仍存在且权限正确。

- [ ] **Step 5：运行测试并提交**

```bash
.venv/bin/python -m pytest backend/tests/test_talent_map.py -q
cd readdy-frontend
node --test tests/runtime-route-truth-contract.test.mjs
npm run type-check
npm run lint
npm run test:e2e -- --grep "人才地图"
```

```bash
git add readdy-frontend/src/features/talentMaps readdy-frontend/src/pages/talent-map backend/tests/test_talent_map.py readdy-frontend/tests
git commit -m "feat: connect talent map to persistent backend data"
```

---

### Task 6：删除不可达旧代码和错误测试目标

**Files:**
- Delete: `readdy-frontend/src/pages/dashboard/interviews/`
- Delete: `readdy-frontend/src/pages/candidates/components/`
- Delete: `readdy-frontend/src/pages/interviewer/interviews/components/InterviewDetailDrawer.tsx`
- Delete: `readdy-frontend/src/pages/interviewer/interviews/components/PositionDetailPopover.tsx`
- Delete: `readdy-frontend/src/pages/interviewer/dashboard/components/RescheduleModal.tsx`
- Delete: `readdy-frontend/src/pages/jobs/components/JobDetailPanel.tsx`
- Delete: `readdy-frontend/src/features/demands/components/jobDetail/`
- Delete: `readdy-frontend/src/features/candidates/components/SelectCandidateDrawer.tsx`
- Delete: `readdy-frontend/src/features/interviews/components/LegacyScheduleInterviewModal.tsx`
- Modify: `readdy-frontend/tests/frontend-maintainability-contract.test.mjs`
- Modify: `readdy-frontend/tests/trial-polish-contract.test.mjs`
- Modify: `readdy-frontend/tests/visual-primitives-regression.test.mjs`

- [ ] **Step 1：删除前再次证明不可达**

逐个执行 `rg`，确认只有文件自身或旧测试引用。特别确认 `/dashboard/interviews` 当前只重定向 `/interviews`，以及正式 `/jobs` 使用 `DemandDetailPanel` 而不是 `JobDetailPanel`。

- [ ] **Step 2：先把测试改到当前真实组件**

候选人关闭按钮测试改为检查 `features/candidates/components/CandidateDetailDrawer.tsx`；需求详情可维护性测试改为当前 `DemandDetailPanel.tsx` 和 `DemandCandidateDrawer.tsx`；不得简单删除覆盖要求。

- [ ] **Step 3：分组删除，每组后构建一次**

删除顺序：旧候选人组件 → 旧面试官组件 → 重定向后的旧面试页面 → 未使用的旧需求工作台。任一组导致真实入口失败，立即回退该组，不继续扩大范围。

- [ ] **Step 4：验证**

```bash
cd readdy-frontend
node --test tests/*.test.mjs
npm run type-check
npm run lint
npm run build
npm run test:e2e:smoke
```

- [ ] **Step 5：提交**

```bash
git add -A readdy-frontend/src readdy-frontend/tests
git commit -m "refactor: remove unreachable recruitment UI code"
```

---

### Task 7：拆分后端简历大文件

**Files:**
- Create: `backend/app/services/resumes/__init__.py`
- Create: `backend/app/services/resumes/upload_service.py`
- Create: `backend/app/services/resumes/parse_service.py`
- Create: `backend/app/services/resumes/file_service.py`
- Create: `backend/app/services/resumes/version_service.py`
- Modify: `backend/app/api/resume.py`
- Modify: `backend/app/api/resume_history.py`
- Test: `backend/tests/test_resume_upload.py`
- Test: `backend/tests/test_resume_history.py`
- Test: `backend/tests/test_resume_recovery.py`

- [ ] **Step 1：先冻结所有现有简历行为**

测试必须覆盖单文件上传、允许格式、重复文件、解析失败、手动补录、设置新版本、历史版本下载、权限和组织隔离。ZIP 只保持当前行为，不新增解析能力。

- [ ] **Step 2：先迁移纯文件操作**

`file_service.py` 负责安全文件名、保存路径、原件读取和下载响应所需元数据；不得访问 HTTP request。

- [ ] **Step 3：迁移版本逻辑**

`version_service.py` 负责创建版本、归档旧版本、设为当前版本和历史查询；事务仍由明确的服务入口控制。

- [ ] **Step 4：迁移解析逻辑**

`parse_service.py` 只负责解析状态和解析结果，不直接推进招聘流程，不发送 Offer，不改变候选人阶段。

- [ ] **Step 5：迁移上传编排**

`upload_service.py` 组合文件保存、重复判断、候选人落库和解析任务；API 文件只校验请求、调用服务并返回 JSON。

- [ ] **Step 6：目标体积**

`backend/app/api/resume.py` 最终控制在 350 行以内；每个新服务控制在 500 行以内。所有公开响应结构和状态码保持不变。

- [ ] **Step 7：验证并提交**

```bash
.venv/bin/python -m pytest backend/tests/test_resume_upload.py backend/tests/test_resume_history.py backend/tests/test_resume_recovery.py -q
.venv/bin/python -m pytest backend/tests base_agent/tests -q
```

```bash
git add backend/app/api/resume.py backend/app/api/resume_history.py backend/app/services/resumes backend/tests
git commit -m "refactor: separate resume API responsibilities"
```

---

### Task 8：将护栏加入发布门禁并完成总验收

**Files:**
- Modify: `scripts/check-sit-release.sh`
- Modify: `.gitlab-ci.yml`
- Modify: `README.md`
- Modify: `docs/SDD-智聘招聘系统-v1.0.md`
- Create: `docs/verification/2026-08-04-technical-debt-decoupling/final.md`

- [ ] **Step 1：发布门禁增加真实检查**

`check-sit-release.sh` 必须包含：前端契约测试、类型、Lint、构建、包体积、依赖安全、后端全量测试、唯一迁移头。浏览器测试需要真实运行环境，因此在 GitLab CI 独立 job 执行并将结果作为合并前必过项。

- [ ] **Step 2：运行总门禁**

```bash
bash scripts/check-sit-release.sh
```

Expected：全部退出码为 0，工作区最终干净。

- [ ] **Step 3：执行最终浏览器冒烟**

```bash
cd readdy-frontend
npm run test:e2e:smoke
```

人工复核与截图：招聘需求、候选人查询和上传、五个候选人详情入口、历史评价、固定操作栏、Offer、人才地图刷新持久化、五角色菜单权限。

- [ ] **Step 4：核对没有漏项**

```text
[ ] 正式可达页面无 Mock 业务数据
[ ] CandidateLibraryWorkspace < 600 行
[ ] resume.py < 350 行
[ ] 所有候选人详情共用统一抽屉生命周期
[ ] 长简历真实滚动测试通过
[ ] 固定右下角操作栏可见
[ ] 旧页面和旧测试目标已删除
[ ] 前后端全量测试通过
[ ] 类型、Lint、构建、依赖安全通过
[ ] 最终截图和提交号已记录
```

- [ ] **Step 5：更新文档真相**

README 和 SDD 只写当前代码真实状态；删除“人才地图仍为 Mock”等已经解决的描述，同时保留企微、企微日历、ZIP 二期边界。

- [ ] **Step 6：提交最终门禁和验收证据**

```bash
git add scripts/check-sit-release.sh .gitlab-ci.yml README.md docs
git commit -m "chore: enforce decoupled recruitment release gates"
```

- [ ] **Step 7：推送前最后确认**

```bash
git status --short --branch
git log --oneline cfpd/test..HEAD
git diff --check cfpd/test...HEAD
```

只有用户确认最终截图和核验结果后，才允许把批准提交推到公司 GitLab `test`。

---

## 4. 预计执行批次

| 批次 | 内容 | 粗估 Codex 有效执行时间 | 是否需要截图审批 |
|---|---|---:|---|
| 1 | 基线、架构边界、浏览器测试 | 2–4 小时 | 是 |
| 2 | 统一详情抽屉 | 2–3 小时 | 是 |
| 3 | 拆候选人工作台 | 3–5 小时 | 是 |
| 4 | 人才地图真实接口、清旧代码 | 3–5 小时 | 是 |
| 5 | 后端简历拆分、总验收 | 3–5 小时 | 是 |

总计粗估：13–22 小时有效执行时间。真实接口联调、公司 Test 环境速度或历史数据差异可能增加时间；任何批次都不能用跳过测试换速度。

## 5. 风险和控制

| 风险 | 控制方式 |
|---|---|
| 大文件拆分时丢行为 | 测试先行，只搬逻辑不改业务；每个小步骤单独提交 |
| 抽屉统一后影响其他页面 | 五个入口逐个迁移、逐个浏览器验证，不整批替换 |
| 人才地图真实接口与演示结构不同 | 先定义类型适配层，不让页面直接依赖后端原始字段 |
| 清理旧代码误删真实入口 | 删除前用路由和导入检索证明不可达；每组删除后构建和冒烟 |
| 后端拆分影响数据 | 不改数据库结构和响应契约；跑全量后端测试 |
| AI 修改范围过大 | 每个任务明确允许文件；提交前核对 `git diff --name-only` |
| 测试假通过 | 核心交互必须由真实浏览器断言，不只检查源码文字 |

## 6. 完工定义

只有同时满足以下条件才算完成：

1. 用户审批过的页面行为没有变化或退化。
2. 候选人、需求、面试、Offer、人才地图模块边界明确。
3. 修改一个模块时，其他模块的自动测试可以独立证明没有受影响。
4. 主菜单可达页面不再读取 Mock 业务事实。
5. 所有候选人详情滚动、页签和固定按钮均由真实浏览器测试覆盖。
6. 没有不可达旧页面和验证旧代码的假测试。
7. 前后端全量测试、类型、Lint、构建和安全检查全部通过。
8. 前后对比截图、测试结果、提交号和未处理二期边界完整记录。
9. 用户确认后才推送公司 GitLab `test`，推送不等于已经构建或部署。

