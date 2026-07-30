# 业务记录可点击详情与数据下钻 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让需求、任务、岗位和真实分析指标都能进入权限安全、可恢复的详情或下钻结果。

**Architecture:** 新增一个只读详情抽屉基础组件，各页面只负责准备领域数据和允许的动作。详情状态使用 URL 查询参数保存；面试官需求继续使用现有本地详情接口。分析服务只扩展现有只读响应，为每条需求返回可核对的阶段和 Offer 汇总，不改数据库；管理层演示页只读现有演示数据。

**Tech Stack:** React 19、TypeScript、React Router、Tailwind CSS、Node test runner、现有 Flask 本地 API。

---

## 执行边界

- 只修改 `/Users/yenns/Documents/新版招聘/zhipin-mvp/readdy-frontend`、本计划文档，以及本地分析只读响应和对应测试。
- 不修改数据库结构，不运行 `backend/seed_dev.py`。
- 不调用外部服务，不启动旧 `frontend`。
- 不 reset、checkout、stash、clean、切分支或覆盖用户未提交改动。
- 不执行 Git commit；所有改动留在当前工作区供用户检查。

## 文件职责

| 文件 | 职责 |
|---|---|
| `src/components/ui/ReadOnlyDetailDrawer.tsx` | 新增详情抽屉外壳、键盘关闭和标准状态区 |
| `src/pages/interviewer/jobs/components/InterviewerDemandDetailDrawer.tsx` | 面试官需求只读详情和允许的下一步 |
| `src/pages/interviewer/jobs/page.tsx` | 整行点击、详情请求、URL 恢复 |
| `src/pages/dashboard/page.tsx` | 待办整条点击和岗位详情提示 |
| `src/pages/kanban/page.tsx` | 分离查看详情与修改阶段 URL |
| `src/pages/director/progress/page.tsx` | 高风险岗位和岗位清单只读详情 |
| `backend/app/services/analytics_service.py` | 给需求明细补充真实阶段和 Offer 汇总 |
| `backend/tests/test_analytics_truth.py` | 证明下钻明细来自当前组织真实数据 |
| `src/features/analytics/types.ts` | 分析需求明细类型 |
| `src/pages/analytics/page.tsx` | 真实分析指标、漏斗、部门下钻 |
| `tests/clickable-detail-foundation-contract.test.mjs` | 共享抽屉和工作台交互契约 |
| `tests/interviewer-demand-detail-contract.test.mjs` | 面试官需求详情与权限文案契约 |
| `tests/workflow-drilldown-contract.test.mjs` | 看板、管理层和分析下钻契约 |

## Task 1：共享只读详情抽屉

**Files:**
- Create: `readdy-frontend/src/components/ui/ReadOnlyDetailDrawer.tsx`
- Create: `readdy-frontend/tests/clickable-detail-foundation-contract.test.mjs`

- [x] 先写失败测试，要求组件包含 `role="dialog"`、`aria-modal`、Escape 关闭、遮罩关闭、标准加载/失败/重试区和可选 footer。
- [x] 运行 `node --test tests/clickable-detail-foundation-contract.test.mjs`，确认因组件不存在而失败。
- [x] 实现最小共享抽屉，不写领域数据，不发接口请求。
- [x] 再运行测试，确认通过。

## Task 2：面试官招聘需求整行详情

**Files:**
- Create: `readdy-frontend/src/pages/interviewer/jobs/components/InterviewerDemandDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/jobs/page.tsx`
- Create: `readdy-frontend/tests/interviewer-demand-detail-contract.test.mjs`

- [x] 先写失败测试：整行是按钮、显示“查看详情”、调用 `demandsApi.getDemand`、URL 使用 `demand`、抽屉只读且不包含审核/Offer/删除操作。
- [x] 运行单测，确认因详情组件和交互缺失而失败。
- [x] 增加 `selectedDemand`、`detailLoading`、`detailError`，点击后先显示列表快照，再请求完整详情。
- [x] 待审核显示等待说明；未通过复用现有 `openResubmit`；已通过跳转 `/interviewer/screening?demand=<id>`。
- [x] 关闭详情清理 URL；页面首次加载根据 URL 恢复详情。
- [x] 运行单测、类型检查和代码规范检查。

## Task 3：招聘专员工作台点击规范

**Files:**
- Modify: `readdy-frontend/src/pages/dashboard/page.tsx`
- Modify: `readdy-frontend/tests/clickable-detail-foundation-contract.test.mjs`

- [x] 先写失败测试：待处理事项使用整条语义化按钮；岗位名称旁存在“查看需求”提示；数字下钻按钮保持独立。
- [x] 运行单测并确认预期失败。
- [x] 将单动作待办改成整条按钮，不嵌套第二个按钮；右侧动作显示为文字与箭头。
- [x] 岗位名称按钮补充可见的详情提示，不改变数字下钻。
- [x] 运行单测、类型检查和代码规范检查。

## Task 4：招聘进度看板详情与修改阶段分流

**Files:**
- Modify: `readdy-frontend/src/pages/kanban/page.tsx`
- Create: `readdy-frontend/tests/workflow-drilldown-contract.test.mjs`

- [x] 先写失败测试：`detailCandidate` 打开历史；`candidate + target` 打开修改阶段；关闭详情清理 `detailCandidate`；错误区有“重新加载”。
- [x] 运行单测并确认预期失败。
- [x] 提取 URL 同步辅助函数，打开历史时写入 `detailCandidate`。
- [x] 首次加载分别恢复详情和修改弹窗，不允许同一参数触发两种动作。
- [x] 历史失败保留错误并可重试。
- [x] 运行单测、类型检查和代码规范检查。

## Task 5：管理层岗位风险详情

**Files:**
- Modify: `readdy-frontend/src/pages/director/progress/page.tsx`
- Modify: `readdy-frontend/tests/workflow-drilldown-contract.test.mjs`

- [x] 先写失败测试：高风险卡片和岗位清单都能打开详情；URL 使用 `position`；详情明确只读且显示阻塞原因。
- [x] 运行单测并确认预期失败。
- [x] 使用共享抽屉展示当前岗位数据；不新增写操作和外部请求。
- [x] 高风险卡片使用完整按钮；表格行支持鼠标、Enter、Space 和焦点样式。
- [x] 打开、关闭、刷新与 URL 同步。
- [x] 运行单测、类型检查和代码规范检查。

## Task 6：真实分析数据下钻

**Files:**
- Modify: `backend/app/services/analytics_service.py`
- Modify: `backend/tests/test_analytics_truth.py`
- Modify: `readdy-frontend/src/features/analytics/types.ts`
- Modify: `readdy-frontend/src/pages/analytics/page.tsx`
- Modify: `readdy-frontend/tests/workflow-drilldown-contract.test.mjs`

- [x] 先写后端失败测试：每条需求返回 `funnel`、`hires_month`、`hires_quarter`、`offers_issued` 和 `offers_accepted`，且不混入其他组织。
- [x] 运行后端单测并确认预期失败。
- [x] 从现有需求指标和 Offer 记录生成只读汇总，更新前端类型。
- [x] 再写前端失败测试：真实 KPI、漏斗阶段和部门行可点击；成本卡不可点击；下钻使用 `data.demands`；URL 使用 `insight`。
- [x] 运行前端单测并确认预期失败。
- [x] 为可解释指标建立本地筛选函数，返回需求明细和汇总说明。
- [x] KPI、漏斗和部门改为按钮并显示“查看明细”反馈。
- [x] 使用共享抽屉展示需求编号、岗位、部门、HC、已入职、流程中和剩余名额。
- [x] 空结果显示“当前条件下暂无组成明细”，不伪造数据。
- [x] 运行单测、类型检查和代码规范检查。

## Task 7：完整验证与 Tabbit 验收

- [x] 运行 `node --test tests/*.test.mjs`。
- [x] 运行 `npm run type-check`。
- [x] 运行 `npm run lint`。
- [x] 运行 `npm run build`。
- [x] 运行后端权限相关测试，确认面试官只能读取自己的需求。
- [x] 运行 `git diff --check`，确认基准 commit 未变化。
- [x] 检查 SQLite 完整性和 5190/5100/5010 进程目录。
- [x] 只在 Tabbit 验收面试官需求、工作台、看板和分析页；浏览器控制台无报错。
- [ ] 管理层页面的真实账号验收：现有登录系统不会签发路由要求的 `hr_director` 角色，未扩大权限绕过。
- [x] 主执行者进行第二轮只读复审权限、URL 恢复和交互一致性。

## 回退方式

每个任务只撤销本任务明确修改的文件，使用 `apply_patch` 精确回退。禁止使用 checkout、reset 或 stash。若详情接口返回权限异常，立即停止 UI 验收，不扩大前端可见范围。
