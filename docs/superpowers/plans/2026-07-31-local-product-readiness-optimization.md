# 本地产品可用性全面收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不新增业务页面、不更换技术栈、不依赖外部接口的前提下，把当前 `test` 版本收口到可供公司同事稳定小范围连续试用的本地产品质量。

**Architecture:** 保持现有 React 19 + Vite 8 + TypeScript + Tailwind 前端和 Flask 后端不变。第一批修复弹层残留和页面返回状态；第二批增加全局防白屏和路由按需加载；第三批完成五角色、异常路径、常见屏幕和试用交接验收。所有改动先写失败测试，再做最小实现，每批独立提交、独立回归。人才地图按用户确认保持现状，不修改源码、入口和展示。

**Tech Stack:** React 19、React Router 7、TypeScript 5.8、Tailwind CSS 3.4、Node Test Runner、现有 Flask/SQLite 本地环境。

---

## 执行边界

- 只修改 `/Users/yenns/Documents/新版招聘/zhipin-mvp/.worktrees/sit-resume-ai` 中当前 `test` 候选代码。
- 只使用 `readdy-frontend`，不修改旧 `frontend` 页面。
- 不新增业务页面，不改导航信息架构，不替换现有 UI 技术栈。
- 不接 OA、企业微信、外部日历、模型或其他外部接口。
- 不修改招聘需求、候选人、面试、Offer 的后端状态机。
- 不删除、合并、重建或覆盖当前本地数据库数据。
- 不执行 reset、checkout、stash 或 clean。

## 文件结构

**新增公共组件：**

- `readdy-frontend/src/components/ui/useOverlayLifecycle.ts`：统一弹窗/抽屉的 Escape、滚动锁定、焦点恢复和卸载清理。
- `readdy-frontend/src/components/ui/AppErrorBoundary.tsx`：单页异常时显示可恢复提示，避免整页白屏。
- `readdy-frontend/src/components/ui/RouteLoadingFallback.tsx`：路由按需加载期间使用统一加载状态。

**主要修改：**

- `readdy-frontend/src/App.tsx`
- `readdy-frontend/src/router/config.tsx`
- `readdy-frontend/src/components/feature/ResumeUploadModal.tsx`
- `readdy-frontend/src/components/ui/ReadOnlyDetailDrawer.tsx`
- `readdy-frontend/src/pages/talent-map/page.tsx`
- `readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx`
- `readdy-frontend/src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx`
- `readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx`
- `readdy-frontend/src/pages/interviewer/interviews/components/RescheduleRequestModal.tsx`
- `readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx`
- `readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx`
- `readdy-frontend/src/features/navigation/pageMemory.ts`
- `readdy-frontend/tests/*.test.mjs`
- `docs/14_本地多角色招聘闭环验收记录.md`
- `docs/15_同事小范围试用说明.md`

---

## 第一批：先解决会卡住的问题

### Task 1：统一弹窗和抽屉的关闭清理

**风险：中。** 涉及多个弹层，但不改表单字段和提交逻辑。

**Files:**

- Create: `readdy-frontend/src/components/ui/useOverlayLifecycle.ts`
- Modify: `readdy-frontend/src/components/feature/ResumeUploadModal.tsx`
- Modify: `readdy-frontend/src/components/ui/ReadOnlyDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/components/RescheduleRequestModal.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx`
- Test: `readdy-frontend/tests/overlay-lifecycle-contract.test.mjs`

- [ ] **Step 1: 写失败测试，锁定核心弹层必须共用清理逻辑**

```js
test('核心弹窗统一清理遮罩、滚动和焦点', () => {
  const hook = read('src/components/ui/useOverlayLifecycle.ts');
  assert.match(hook, /event\.key === 'Escape'/);
  assert.match(hook, /document\.body\.style\.overflow/);
  assert.match(hook, /previousActiveElement/);
  assert.match(hook, /removeEventListener/);
  coreOverlays.forEach((file) => {
    assert.match(read(file), /useOverlayLifecycle/, file);
  });
});
```

- [ ] **Step 2: 验证测试先失败**

Run: `cd readdy-frontend && node --test tests/overlay-lifecycle-contract.test.mjs`

Expected: FAIL，提示公共 hook 不存在或弹层未接入。

- [ ] **Step 3: 实现统一生命周期 hook**

```tsx
export function useOverlayLifecycle({
  open,
  onClose,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    initialFocusRef?.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [initialFocusRef, onClose, open]);
}
```

- [ ] **Step 4: 逐个迁移核心弹层**

每个弹层只做以下三件事：传入 `open`、传入原有 `onClose`、给弹层容器增加 `tabIndex={-1}` 和 ref。删除各自重复的 Escape 监听，不改保存、评价、改约、Offer 创建或上传逻辑。

- [ ] **Step 5: 验证弹层测试和现有流程测试**

Run: `cd readdy-frontend && node --test tests/overlay-lifecycle-contract.test.mjs tests/page-state-memory-contract.test.mjs tests/interview-reschedule-workflow.test.mjs tests/structured-interview-feedback-contract.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 6: Tabbit 本地验收**

依次打开“需求详情 → 简历详情 → 安排面试 → 改约 → 填写反馈 → Offer 详情”，分别用关闭按钮、点击遮罩和 Escape 关闭；随后切换左侧菜单。验收标准：页面可继续点击、背景恢复滚动、旧弹层不自动重开、焦点回到原按钮。

- [ ] **Step 7: 提交**

```bash
git add readdy-frontend/src/components/ui/useOverlayLifecycle.ts readdy-frontend/src/components/ui/ReadOnlyDetailDrawer.tsx readdy-frontend/src/components/feature/ResumeUploadModal.tsx readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx readdy-frontend/src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx readdy-frontend/src/pages/interviewer/interviews/components/RescheduleRequestModal.tsx readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx readdy-frontend/tests/overlay-lifecycle-contract.test.mjs
git commit -m "fix: unify overlay cleanup behavior"
```

### Task 2：返回页面只恢复筛选，不恢复已经关闭的弹层

**风险：低。** 延续现有 `pageMemory` 机制，只补齐遗漏参数。

**Files:**

- Modify: `readdy-frontend/src/features/navigation/pageMemory.ts`
- Modify: `readdy-frontend/tests/page-state-memory-contract.test.mjs`

- [ ] **Step 1: 增加全部主导航页面的恢复测试**

测试应覆盖 `/jobs`、`/candidates`、`/interviews`、`/offers`、三个面试官页面和 `/analytics`。筛选参数 `tab`、`status`、`q` 可保留；`demand`、`candidate`、`assignment`、`offer`、`schedule`、`quickSchedule`、`detailCandidate` 必须清除。

- [ ] **Step 2: 验证新增用例先暴露遗漏**

Run: `cd readdy-frontend && node --test tests/page-state-memory-contract.test.mjs`

Expected: 若有遗漏则 FAIL，并明确打印对应路径和参数；若现有实现已覆盖则直接 PASS，不做无意义改动。

- [ ] **Step 3: 只补齐失败用例对应的参数清理**

```ts
const TRANSIENT_QUERY_KEYS = new Set([
  'demand', 'candidate', 'assignment', 'offer',
  'schedule', 'quickSchedule', 'detailCandidate', 'task',
]);
```

`safeRememberedHref` 统一删除这些临时详情键，保留路径允许的筛选键。

- [ ] **Step 4: 验证**

Run: `cd readdy-frontend && node --test tests/page-state-memory-contract.test.mjs tests/workspace-detail-navigation-contract.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add readdy-frontend/src/features/navigation/pageMemory.ts readdy-frontend/tests/page-state-memory-contract.test.mjs
git commit -m "fix: keep filters without reopening old details"
```

---

## 第二批：增加防白屏和加载速度收口

### Task 3：页面异常时提供恢复入口，不出现整页白屏

**风险：中。** 增加兜底层，不改变正常页面逻辑。

**Files:**

- Create: `readdy-frontend/src/components/ui/AppErrorBoundary.tsx`
- Modify: `readdy-frontend/src/App.tsx`
- Test: `readdy-frontend/tests/app-resilience-contract.test.mjs`

- [ ] **Step 1: 写失败测试**

```js
test('应用提供全局错误兜底和恢复动作', () => {
  const boundary = read('src/components/ui/AppErrorBoundary.tsx');
  const app = read('src/App.tsx');
  assert.match(boundary, /页面暂时无法显示/);
  assert.match(boundary, /重新加载/);
  assert.match(boundary, /返回工作台/);
  assert.match(app, /<AppErrorBoundary>/);
});
```

- [ ] **Step 2: 验证测试先失败**

Run: `cd readdy-frontend && node --test tests/app-resilience-contract.test.mjs`

Expected: FAIL，提示错误边界不存在。

- [ ] **Step 3: 实现错误边界**

使用 React class error boundary 捕获渲染异常。错误界面只显示大白话说明、“重新加载”和“返回工作台”两个动作；不在页面展示堆栈、接口地址或敏感信息。“返回工作台”使用 `window.location.assign('/')`，由现有角色守卫送到对应首页。

- [ ] **Step 4: 包裹现有应用内容**

在 `App.tsx` 的 Provider 内、`AppRoutes` 外增加 `<AppErrorBoundary>`，保持认证、权限、Toast 和路由顺序不变。

- [ ] **Step 5: 验证**

Run: `cd readdy-frontend && node --test tests/app-resilience-contract.test.mjs && npm run type-check && npm run lint`

Expected: 全部 PASS，0 warning。

- [ ] **Step 6: 提交**

```bash
git add readdy-frontend/src/components/ui/AppErrorBoundary.tsx readdy-frontend/src/App.tsx readdy-frontend/tests/app-resilience-contract.test.mjs
git commit -m "feat: add recoverable application error boundary"
```

### Task 4：页面按需加载，降低首次进入等待

**风险：低。** 只改变加载方式，不改变页面内容和接口。

**Files:**

- Create: `readdy-frontend/src/components/ui/RouteLoadingFallback.tsx`
- Modify: `readdy-frontend/src/router/config.tsx`
- Modify: `readdy-frontend/src/App.tsx`
- Test: `readdy-frontend/tests/route-loading-contract.test.mjs`

- [ ] **Step 1: 记录改动前构建大小**

Run: `cd readdy-frontend && npm run build`

Expected baseline: 当前主 JavaScript 文件约 967 KB，构建成功但有大包提醒。

- [ ] **Step 2: 写失败测试**

```js
test('业务页面使用 React lazy 按路由加载', () => {
  const routes = read('src/router/config.tsx');
  const app = read('src/App.tsx');
  assert.match(routes, /lazy\(\(\) => import\('@\/pages\/dashboard\/page'\)\)/);
  assert.doesNotMatch(routes, /import DashboardPage from '@\/pages\/dashboard\/page'/);
  assert.match(app, /<Suspense fallback=\{<RouteLoadingFallback \/>\}>/);
});
```

- [ ] **Step 3: 验证测试先失败**

Run: `cd readdy-frontend && node --test tests/route-loading-contract.test.mjs`

Expected: FAIL，因为当前页面全部一次性导入。

- [ ] **Step 4: 把业务页面改为 React.lazy**

认证守卫、MainLayout、角色模型保持同步加载；Dashboard、招聘需求、简历库、面试、Offer、人才地图、数据看板、面试官和总监页面改为 `lazy(() => import(...))`。

- [ ] **Step 5: 增加统一加载状态**

```tsx
export default function RouteLoadingFallback() {
  return <div role="status" aria-live="polite" className="flex min-h-64 items-center justify-center text-sm text-foreground-500">页面加载中...</div>;
}
```

在 `App.tsx` 中只增加一层 Suspense，不在每个页面重复添加加载组件。

- [ ] **Step 6: 验证构建结果**

Run: `cd readdy-frontend && node --test tests/route-loading-contract.test.mjs && npm run type-check && npm run lint && npm run build`

Expected: 全部 PASS；构建产物出现多个页面 chunk，入口主 JavaScript 文件显著小于改动前约 967 KB。

- [ ] **Step 7: 提交**

```bash
git add readdy-frontend/src/components/ui/RouteLoadingFallback.tsx readdy-frontend/src/router/config.tsx readdy-frontend/src/App.tsx readdy-frontend/tests/route-loading-contract.test.mjs
git commit -m "perf: lazy load role pages"
```

---

## 第三批：真实使用验收和交接收口

### Task 5：常见屏幕和组件一致性检查

**风险：低。** 只修复实际截图发现的溢出、遮挡和错位。

**Files:**

- Modify when a failure is reproduced: `readdy-frontend/src/components/ui/PageHeader.tsx`
- Modify when a failure is reproduced: `readdy-frontend/src/components/ui/WorkspaceTabs.tsx`
- Modify when a failure is reproduced: `readdy-frontend/src/index.css`
- Modify when a failure is reproduced: 对应页面组件文件
- Test: `readdy-frontend/tests/ui-consistency-contract.test.mjs`
- Update: `docs/14_本地多角色招聘闭环验收记录.md`

- [ ] **Step 1: 固定验收尺寸**

在 Tabbit 分别使用 1440×900、1366×768、1280×720 查看招聘专员、面试官、人力总监三个角色的全部左侧菜单页面。

- [ ] **Step 2: 每个页面检查同一组标准**

标题不与左侧菜单重复；说明文字保留；绿色实心选中态一致；表格可横向滚动；主操作按钮不被截断；弹窗最大高度不超过视口并保留底部按钮；抽屉关闭后页面恢复可点击。

- [ ] **Step 3: 只对复现问题做最小 CSS 修复**

允许的修复范围为 `min-w-0`、`overflow-x-auto`、`max-h-[calc(100vh-...)]`、`flex-wrap` 和现有断点类；不重做布局，不换颜色、字号和组件体系。

- [ ] **Step 4: 扩充一致性契约**

为实际修复的页面增加对应断言，确保 `PageHeader`、`WorkspaceTabs`、可滚动表格和弹层高度规则不会再次回退。

- [ ] **Step 5: 验证**

Run: `cd readdy-frontend && node --test tests/ui-consistency-contract.test.mjs && npm run type-check && npm run lint`

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add readdy-frontend/src readdy-frontend/tests/ui-consistency-contract.test.mjs docs/14_本地多角色招聘闭环验收记录.md
git commit -m "fix: close responsive workspace gaps"
```

提交前必须用 `git diff --name-only --cached` 确认只包含本任务实际修改的文件；若 `src` 中出现无关文件，取消暂存后按文件精确加入。

### Task 6：五角色完整流程与异常路径验收

**风险：中。** 会在本地数据库写入测试记录，但不删除或覆盖既有记录。

**Files:**

- Update: `docs/14_本地多角色招聘闭环验收记录.md`
- Create: `docs/15_同事小范围试用说明.md`

- [ ] **Step 1: 验收前记录数据库数量和备份位置**

记录候选人、招聘需求、面试任务、评价和 Offer 数量；使用现有备份脚本生成可恢复本地快照。只记录新增验收数据，不自动恢复旧库。

- [ ] **Step 2: 招聘专员流程**

创建测试需求 → 查看整行详情 → 选择候选人 → 安排一面 → 处理改约 → 查看评价 → 推进下一轮 → 创建 Offer。每一步验证返回页面后页签和搜索保留，详情弹层不自动重开。

- [ ] **Step 3: 一面和二面面试官流程**

分别查看招聘需求和候选人简历 → 申请或接受改约 → 提交本轮评价 → 验证只能看到授权轮次和历史留痕，不能操作 Offer 或淘汰。

- [ ] **Step 4: 人力总监和管理员流程**

总监只读查看管理驾驶舱、招聘进展、人才储备、审批风险和数据看板；管理员查看系统设置、角色和审计信息。验证不同角色菜单、数据范围和返回首页均正确。

- [ ] **Step 5: 异常路径**

检查空列表、搜索无结果、详情加载失败、重复点击提交、提交中关闭、浏览器刷新、前进后退、弹层关闭后切页。每个异常必须有明确说明、禁用重复动作或重试入口，不能把失败显示成成功或 0。

- [ ] **Step 6: 更新验收记录**

记录验收版本、账号角色、操作路径、实际结果、写入的测试记录、失败项和截图。不得把外部通知、外部日历或模型能力写成已通过。

- [ ] **Step 7: 编写一页试用说明**

`docs/15_同事小范围试用说明.md` 必须包含：访问地址、五类账号用途、统一测试密码说明、推荐测试顺序、当前不测能力、问题反馈格式，以及“只使用测试数据，不上传真实候选人隐私信息”的提醒。

- [ ] **Step 8: 提交**

```bash
git add docs/14_本地多角色招聘闭环验收记录.md docs/15_同事小范围试用说明.md
git commit -m "docs: add local colleague trial handoff"
```

### Task 7：全量门禁与最终交付

**风险：低。** 只验证，不修改或发布。

**Files:**

- Verify only: entire repository

- [ ] **Step 1: 前端全量检查**

```bash
cd readdy-frontend
node --test tests/*.test.mjs
npm run type-check
npm run lint
npm run build
```

Expected: 所有测试通过、类型通过、Lint 0 warning、正式构建成功。

- [ ] **Step 2: 仓库级本地发布检查**

Run: `./scripts/check-sit-release.sh`

Expected: 后端、前端、依赖安全、数据库迁移、Git 状态和 RC 参数全部通过；未提供公司 SIT 实值配置时必须明确显示“本地候选不冒充公司环境验收”。

- [ ] **Step 3: 检查工作区和提交范围**

```bash
git status --short
git log --oneline -8
git diff --check
```

Expected: 工作区干净、每批有独立提交、无格式错误。

- [ ] **Step 4: 最终交付摘要**

只输出四部分：修复了什么、用户现在能做到什么、全量测试结果、仍然明确排除的外部能力。不把“本地通过”写成“公司 Test 已部署”。

---

## 完成标准

| 标准 | 验收结果 |
|---|---|
| 左侧菜单和页面标题不重复 | 所有角色页面通过一致性测试和截图检查 |
| 切页返回状态正确 | 保留筛选和搜索，不重开旧详情或操作弹窗 |
| 弹窗关闭后页面可继续操作 | 遮罩、滚动、键盘监听和焦点全部恢复 |
| 单页异常不白屏 | 提供重新加载和返回工作台入口 |
| 首次加载更轻 | 页面按路由拆包，入口包显著小于当前约 967 KB |
| 五角色本地闭环可走通 | 招聘专员、一面、二面、总监、管理员均有验收记录 |
| 异常路径可恢复 | 空态、失败、重复点击、刷新和返回都有明确结果 |
| 同事知道怎么测试 | 有一页大白话试用说明和反馈格式 |
| 不越过范围 | 无新业务页面、无接口接入、无数据库清理、无技术栈替换 |
