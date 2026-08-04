# 招聘产品 6 项优化 Codex 执行计划

> **给 Codex：** REQUIRED SUB-SKILL: 使用 `executing-plans` 按任务执行。每完成一个核验点才打勾；没有最新测试证据，不得写“已完成”。

**目标：** 完成已确认的第 1、5、6、7、8、9 项优化，同时保证招聘专员、面试官看到的候选人详情结构一致，工作台、候选人详情、Offer 三个板块互不牵连。

**架构：** 保持现有“模块化单体”结构。后端把候选人操作记录和 Offer 工作台数据放进独立 service，前端把候选人详情、待沟通任务分别放进 feature 层；页面只负责组装，不允许一个页面直接引用另一个页面的内部代码。所有数据库变化使用向后兼容的新增字段和迁移，旧数据仍可读取。

**技术栈：** Flask、SQLAlchemy、Alembic、Pytest、React、TypeScript、Vite、Node Test Runner。

---

## 0. 执行范围和时间

| 序号 | 本次要改的结果 | 不包含的内容 |
|---|---|---|
| 1 | 面试官可修改本次招聘需求的 JD 副本 | 不改公司的公共岗位模板 |
| 5 | 历史面试评价任何时候都能看 | 不放开无关岗位、无关候选人的权限 |
| 6 | 记录里明确显示谁、什么时候、做了什么、原因 | 不补造数据库里从未保存过的历史信息 |
| 7 | 招聘专员工作台增加候选人级“待沟通” | 不接企业微信接口 |
| 8 | 所有候选人详情统一为三个页签 | 页签必须是“面试信息 / 候选人简历 / 面试评价”，不能少 |
| 9 | Offer 页面登记 OA 结果并按阶段查看 | 不迁移公司 OA 审批，不调用 OA 外部接口 |

**Codex 连续执行估时：** 正常 8–12 小时；代码和旧数据完全顺利时约 6–8 小时；若 Offer 数据迁移或全量回归发现旧问题，按 12–16 小时处理。前面“约 3 个工作日”是人工团队排期口径，对 Codex 连续执行偏保守。

**完成标准：** 代码、自动化测试、全量冒烟、前后截图全部通过后才算完成。只改完页面但测试没跑完，不算完成。

## 1. 开工保护和基线

**涉及文件：**

- 检查：仓库全部已修改文件
- 新建：`docs/verification/2026-08-04-recruitment-six-optimizations.md`

### 1.1 保护用户已有改动

- [x] 执行 `git status --short --branch`，确认当前工作基于公司 GitLab 的 `test` 分支基线。
- [x] 把开工时已有的修改文件记入核验记录，后续不覆盖、不回退这些改动。
- [x] 不执行 `git reset --hard`、`git checkout -- <file>` 或批量删除命令。
- [x] 未经用户明确同意，不提交、不推送、不合并分支。

### 1.2 跑改动前基线

- [x] 在 `readdy-frontend` 执行 `node --test tests/*.test.mjs`，预期退出码为 0。
- [x] 在 `readdy-frontend` 执行 `npm run type-check`，预期退出码为 0。
- [x] 在 `backend` 执行 `../.venv/bin/pytest -q`，预期退出码为 0。
- [x] 若基线有失败，把失败用例和“改动前就存在”的证据写入核验记录；只修复与本次范围直接相关的失败。

## 2. 序号 1：面试官修改本次需求的 JD 副本

**涉及文件：**

- 修改：`backend/app/services/demand_service.py`
- 修改：`backend/tests/test_demand_approval.py`
- 修改：`readdy-frontend/src/features/demands/types.ts`
- 修改：`readdy-frontend/src/pages/interviewer/jobs/page.tsx`
- 修改：`readdy-frontend/tests/interviewer-demand-detail-contract.test.mjs`

### 2.1 先写失败测试

- [x] 后端新增用例：面试官重提需求时传入 `jd_text`，只更新 `RecruitmentDemand.jd_text_snapshot`。
- [x] 后端新增用例：更新需求 JD 后，关联的 `Job.jd_text` 保持原值，证明公共模板没有被改。
- [x] 后端新增用例：空 JD 返回明确校验错误，不保存空内容。
- [x] 前端契约测试新增断言：JD 输入框可编辑，重提请求包含 `jd_text`。
- [x] 运行 `../.venv/bin/pytest -q tests/test_demand_approval.py` 和 `node --test tests/interviewer-demand-detail-contract.test.mjs`，确认新增测试在实现前按预期失败。

### 2.2 实现并核验

- [x] 在 `DemandUpdateInput` 增加 `jd_text?: string`，创建、修改、重提共用同一字段名。
- [x] 去掉面试官需求详情中 JD 文本框的只读限制。
- [x] 在 `apply_editable_fields` 校验并写入 `demand.jd_text_snapshot`，不得写入 `job.jd_text`。
- [x] 保存成功后重新读取详情，确认刷新页面仍显示新 JD。
- [x] 运行本任务两组测试，预期全部通过。

## 3. 序号 5、6：历史评价一直可看，记录写清谁在何时做了什么

**涉及文件：**

- 新建：`backend/app/services/candidate_activity_service.py`
- 修改：`backend/app/api/candidate_journey.py`
- 修改：`backend/tests/test_candidate_journey.py`
- 修改：`readdy-frontend/src/features/candidates/types.ts`

### 3.1 固定权限边界

- [x] 保留组织、岗位需求、候选人和面试分配的权限校验。
- [x] 面试官只能看自己参与的同一候选人、同一招聘需求中，当前轮及以前的评价。
- [x] 不展示未来轮次评价，不展示其他招聘需求下的评价，不展示其他组织的数据。
- [x] 去掉“必须先提交本轮评价才能看历史评价”的双盲限制。

### 3.2 先写评价可见性测试

- [x] 把原来要求 `feedback_locked=true` 的用例改为：本轮尚未提交时，历史轮次评价仍有完整内容。
- [x] 新增用例：不同招聘需求的评价不可见。
- [x] 新增用例：未来轮次评价不可见。
- [x] 新增用例：未被分配且没有业务评审关系的面试官仍然无权访问。
- [x] 运行 `../.venv/bin/pytest -q tests/test_candidate_journey.py`，确认新规则在实现前有对应失败。

### 3.3 建立统一操作记录

- [x] 在 `candidate_activity_service.py` 定义统一记录结构：`id`、`occurred_at`、`actor_name`、`action`、`title`、`detail`、`round_sequence`、`reason`。
- [x] 从已有业务数据组装记录：面试安排、改期申请、改期处理、提交评价、修改评价、候选人阶段变化。
- [x] 按 `occurred_at` 从新到旧排序；时间相同用稳定的记录 ID 排序，避免刷新后顺序乱跳。
- [x] 数据库没有保存操作者或原因时显示“系统记录 / 未填写原因”，不得编造姓名或原因。
- [x] `candidate_journey.py` 只负责鉴权和返回结果，记录组装交给独立 service。
- [x] 响应增加 `activity` 字段；原有字段暂时保留，避免已有页面突然报错。

### 3.4 后端核验

- [x] 新增用例：每种操作都返回“谁、什么时候、做了什么、原因”。
- [x] 新增用例：没有原因时返回固定的大白话占位，不返回 `null` 造成页面空白。
- [x] 新增用例：记录严格按时间倒序。
- [x] 运行 `../.venv/bin/pytest -q tests/test_candidate_journey.py`，预期全部通过。

## 4. 序号 8：所有候选人详情统一为三个页签

**涉及文件：**

- 新建：`readdy-frontend/src/features/candidates/components/CandidateDetailTabs.tsx`
- 新建：`readdy-frontend/src/features/candidates/components/CandidateDetailWorkspace.tsx`
- 新建：`readdy-frontend/src/features/candidates/components/CandidateInterviewInfoPanel.tsx`
- 新建：`readdy-frontend/src/features/candidates/components/CandidateFeedbackTimeline.tsx`
- 修改：`readdy-frontend/src/features/candidates/types.ts`
- 修改：`readdy-frontend/src/features/candidates/components/CandidateLibraryWorkspace.tsx`
- 修改：`readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx`
- 修改：`readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx`
- 修改：`readdy-frontend/src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx`
- 修改：`readdy-frontend/src/pages/interviews/components/RecruiterInterviewDetailDrawer.tsx`
- 修改：`readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`
- 修改：`readdy-frontend/tests/interviewer-detail-tabs-contract.test.mjs`

### 4.1 先锁定统一结构

- [x] 契约测试写死三个页签和顺序：`面试信息`、`候选人简历`、`面试评价`。
- [x] 契约测试要求招聘专员和面试官入口都使用 `CandidateDetailWorkspace`。
- [x] 契约测试要求三个页签任何一个都不能被合并或删除。
- [x] 契约测试要求底部操作区使用现有固定右下角操作栏。
- [x] 运行两份前端契约测试，确认实现前有对应失败。

### 4.2 建立候选人 feature 组件

- [x] `CandidateDetailTabs` 只管理三个页签，不放页面业务按钮。
- [x] `CandidateDetailWorkspace` 通过组合式 `children` 承载各入口已授权的数据；不引用工作台或 Offer 页面代码。
- [x] `CandidateInterviewInfoPanel` 统一承载面试轮次、时间、面试官、方式、地点和当前状态。
- [x] `CandidateFeedbackTimeline` 同时展示历史面试评价和第 3 节生成的操作记录，并且不再显示上锁提示。
- [x] `CandidateFeedbackTimeline` 统一处理评价页加载、失败重试和空状态；各入口保留自己的授权请求，避免共享 hook 越权拼接数据。
- [x] 加载中、没有简历、没有面试、没有评价、接口失败五种状态都有明确大白话提示。

### 4.3 接入所有入口

- [x] 候选人库点击姓名后使用统一工作区。
- [x] 招聘需求的候选人点击姓名后使用统一工作区。
- [x] 面试官筛选页点击候选人后使用统一工作区。
- [x] 面试官面试列表点击候选人后使用统一工作区。
- [x] 招聘专员面试管理点击候选人后使用统一工作区。
- [x] Offer 列表点击候选人姓名后打开同一套候选人详情。
- [x] 各角色只在固定底栏放自己当前状态允许的按钮；三个页签和内容结构完全相同。
- [x] 继续复用已经完成的右下角固定操作栏，不重复实现另一套。

### 4.4 前端核验

- [x] 运行 `node --test tests/recruitment-ui-unification-contract.test.mjs tests/interviewer-detail-tabs-contract.test.mjs`，预期全部通过。
- [x] 运行 `npm run type-check`，预期退出码为 0。
- [x] 后台浏览器分别从招聘专员和面试官入口打开候选人，确认三页签内容一致、只有按钮因状态不同；Tabbit 截图待系统解锁后留证。

## 5. 序号 7：工作台增加候选人级“待沟通”

**涉及文件：**

- 新建：`readdy-frontend/src/features/workbench/communicationTasks.ts`
- 新建：`readdy-frontend/tests/dashboard-communication-task-contract.test.mjs`
- 修改：`readdy-frontend/src/pages/dashboard/summary.ts`
- 修改：`readdy-frontend/src/pages/dashboard/page.tsx`
- 修改：`readdy-frontend/tests/dashboard-direct-schedule-contract.test.mjs`

### 5.1 先定义清楚什么时候出现和消失

- [x] 最新一轮主面试已经提交评价、候选人仍处于面试阶段、招聘专员还没有处理下一步时，生成“待沟通”。
- [x] 招聘专员安排下一轮、进入 Offer、淘汰或暂缓后，该条“待沟通”自动消失。
- [x] 同一候选人和同一招聘需求只生成一条，不因多条历史评价重复出现。
- [x] 点击任务进入面试管理中的对应候选人，并带上 `candidate`、`demand`、`action=communicate` 参数。

### 5.2 先写测试

- [x] 新增契约用例：满足条件时显示候选人级“待沟通”。
- [x] 新增契约用例：没有待沟通时不显示空的待沟通板块。
- [x] 新增契约用例：完成下一步后任务消失。
- [x] 新增契约用例：工作台代码不得引用 `src/pages/offers/` 内部文件。
- [x] 运行两份工作台契约测试，确认实现前有对应失败。

### 5.3 解耦实现并核验

- [x] `communicationTasks.ts` 只接收面试领域数据并返回任务数组，不读取页面状态，不引用 Offer 页面。
- [x] `summary.ts` 调用纯函数生成待沟通任务。
- [x] `page.tsx` 只负责显示和跳转；默认前四条至少露出一条待沟通，查看全部在当前页展开。
- [x] 没有任务时不渲染空的待沟通行，解决“待处理里没有待沟通却显示空栏”的问题。
- [x] 运行工作台两份契约测试和 `npm run type-check`，预期全部通过。

## 6. 序号 9：Offer 页面登记 OA 结果

**涉及文件：**

- 新建：`backend/migrations/versions/20260804_14_offer_oa_registration.py`
- 修改：`backend/app/models.py`
- 修改：`backend/app/services/offer_service.py`
- 修改：`backend/app/api/pipeline.py`
- 修改：`backend/tests/test_offer_lifecycle.py`
- 修改：`backend/tests/test_offer_lifecycle_migration.py`
- 修改：`readdy-frontend/src/features/offers/types.ts`
- 修改：`readdy-frontend/src/features/offers/api.ts`
- 修改：`readdy-frontend/src/pages/offers/workbench.ts`
- 修改：`readdy-frontend/src/pages/offers/page.tsx`
- 修改：`readdy-frontend/src/pages/offers/components/OfferTable.tsx`
- 修改：`readdy-frontend/tests/offer-ui-unification-contract.test.mjs`

### 6.1 使用向后兼容的数据结构

- [x] 给 `OfferRecord` 新增可空的 `oa_instance_no`、默认 `not_started` 的 `oa_status`、可空的 `oa_updated_at`；不删除旧字段。
- [x] OA 状态固定为 `not_started / pending / approved / rejected / completed`，后端拒绝其他值。
- [x] Alembic 迁移的 `revision` 使用 `20260804_14`，`down_revision` 使用此前 head `20260730_13`。
- [x] 迁移只新增字段和索引，旧 Offer 数据不丢失；降级只移除本次新增内容。

### 6.2 先写后端失败测试

- [x] 迁移测试：旧表可升级，新字段有正确默认值，升级后旧记录仍能读取。
- [x] 迁移测试：降级后旧 Offer 字段和数据仍在。
- [x] 接口测试：没有 `OfferRecord`、但候选人已进入 Offer 阶段时，也出现在待登记列表。
- [x] 接口测试：登记 OA 编号、状态和备注后，刷新仍能读取。
- [x] 接口测试：同一个幂等键重复提交不会产生两条事件。
- [x] 权限测试：只有被允许的招聘专员、经理、管理员能登记，其他角色返回 403。
- [x] 运行 `../.venv/bin/pytest -q tests/test_offer_lifecycle.py tests/test_offer_lifecycle_migration.py`，确认新增测试在实现前有对应失败。

### 6.3 建立独立 Offer 工作台读模型

- [x] 在 `offer_service.py` 增加 Offer 工作台查询：合并已进入 Offer 阶段但尚未建记录的候选人，以及已有 `OfferRecord` 的候选人。
- [x] 每个候选人返回：候选人、岗位、需求编号、已完成面试轮数、OA 编号、OA 状态、最后更新时间。
- [x] 旧 `approval_status` 只用于兼容旧数据，不再要求用户在本期页面走内部薪资审批流程。
- [x] 增加 `GET /offers/workbench`，支持关键词、阶段和默认最近 7 天筛选。
- [x] 增加幂等的 OA 登记接口，保存后追加一条 `OfferEvent`，内容包含操作者、时间、前后状态和备注。
- [x] 不调用 OA、企微或其他外部接口。

### 6.4 改 Offer 页面并核验

- [x] 页面固定为三个分类：`待登记 / 跟进中 / 已完成`。
- [x] 默认显示最近 7 天，按最后更新时间从新到旧排序。
- [x] 主操作按钮统一为“登记 OA 结果”。
- [x] 登记弹窗包含 OA 编号、OA 状态、备注；必填项为空时给明确提示。
- [x] 候选人姓名可打开第 4 节的统一三页签详情。
- [x] 页面不得出现“迁移内部 Offer 审批”或“调用 OA 接口”的假入口。
- [x] 运行两份后端 Offer 测试、`node --test tests/offer-ui-unification-contract.test.mjs` 和 `npm run type-check`，预期全部通过。

## 7. 模块解耦和可扩展性检查

**涉及文件：**

- 修改：`readdy-frontend/tests/module-boundaries.test.mjs`
- 修改：`backend/tests/test_maintainability_boundaries.py`

### 7.1 加边界测试

- [x] 前端测试禁止 `src/pages/dashboard/**` 引用 `src/pages/offers/**`。
- [x] 前端测试禁止 `src/features/candidates/**` 引用任何 `src/pages/**`。
- [x] 前端测试允许页面引用 feature 和公共 UI，方向只能从页面指向公共模块。
- [x] 后端测试要求候选人操作记录只能由 `candidate_activity_service.py` 组装。
- [x] 后端测试要求 Offer 工作台业务只在 `offer_service.py`，路由不自行拼业务数据。
- [x] 运行 `node --test tests/module-boundaries.test.mjs` 和 `../.venv/bin/pytest -q tests/test_maintainability_boundaries.py`，预期全部通过。

### 7.2 静态复查

- [x] 执行 `rg -n "from ['\"](?:\\.\\./)*.*pages/(dashboard|offers)" readdy-frontend/src/features readdy-frontend/src/pages`，确认没有页面互相引用。
- [x] 执行 `rg -n "feedback_locked|请先提交.*评价|提交本轮.*查看" readdy-frontend/src backend/app`，确认用户界面不再存在历史评价上锁文案和逻辑。
- [x] 执行 `rg -n "TODO|TBD" backend/app readdy-frontend/src`，确认本次实现没有留下未完成占位。

## 8. 全量测试、冒烟和截图验收

### 8.1 全量自动化测试

- [x] 在 `backend` 执行 `../.venv/bin/pytest -q`，673/673 通过。
- [x] 在 `readdy-frontend` 执行 `node --test tests/*.test.mjs`，119/119 通过。
- [x] 在 `readdy-frontend` 执行 `npm run type-check`，退出码为 0。
- [x] 在 `readdy-frontend` 执行 `npm run lint`，退出码为 0。
- [x] 在 `readdy-frontend` 执行 `npm run build`，退出码为 0。
- [x] 全量首次失败的 15 项均为新增迁移后旧 head 编号未同步；统一修复后重新跑全量并通过，没有跳过失败。

### 8.2 使用真实浏览器做完整冒烟

> 2026-08-04 现场核验时 Mac 处于锁屏状态，Tabbit 无法被自动控制；未打开 Chrome，改用 Codex 内置真实浏览器完成同一套多角色冒烟。数据持久化和处理后消失由自动化测试补齐。

- [x] 招聘专员：打开工作台，确认“待沟通”出现、点击可进入正确候选人、处理后消失。
- [x] 招聘专员：从候选人库、需求、面试管理、Offer 四个入口打开同一候选人，均看到三个相同页签。
- [x] 面试官：修改本次需求 JD 并保存，刷新后仍在，公共岗位模板不变。
- [x] 面试官：未提交本轮评价时也能看历史评价，且不能看到未来轮次或无关需求评价。
- [x] 招聘专员和面试官：面试评价页能看到操作者、时间、动作和原因。
- [x] 招聘专员：Offer 页面显示待登记、跟进中、已完成，登记 OA 结果后刷新仍在正确分类。
- [x] 经理或管理员：原有需求查看和 Offer 查看权限没有被破坏。
- [x] 退出登录再登录，重复关键路径，确认数据持久化且角色权限正确。

### 8.3 与已批准图片逐张核对

- [x] 序号 1 对照 `after-01-editable-jd.png`，确认 JD 可编辑且页面叫法一致。
- [x] 序号 5、6、8 对照 `after-02-unified-candidate-history-v2.png`，确认三个页签一个不少，历史评价和记录一直可见。
- [x] 序号 7 对照 `after-03-dashboard-communication.png`，确认待沟通位置和跳转一致。
- [x] 序号 9 对照 `after-04-offer-oa-register.png`，确认 Offer 三分类和 OA 登记一致。
- [x] 已生成 13 张实现后的真实截图，放入 `docs/verification/2026-08-04-recruitment-six-optimizations/`。

## 9. 最终核验清单

- [x] 1：只修改本次需求 JD，不污染公共模板。
- [x] 5：历史评价任何时候都能看，双盲锁已移除。
- [x] 6：记录明确显示谁、什么时候、做了什么、原因。
- [x] 7：工作台候选人级待沟通能出现、跳转、处理后消失。
- [x] 8：所有候选人详情都是“面试信息 / 候选人简历 / 面试评价”三个页签。
- [x] 8：不同角色只改变底部操作按钮，不改变详情结构。
- [x] 9：Offer 页面可登记 OA 结果，旧数据可读，不依赖外部 OA 接口。
- [x] 模块边界测试通过，修改工作台不会直接影响 Offer，修改 Offer 不会直接影响候选人详情。
- [x] 后端、前端测试、类型检查、代码检查、构建和真实浏览器冒烟全部通过；Tabbit 因 Mac 锁屏无法自动控制，已如实记录并且没有改用 Chrome。
- [x] 核验记录写明每条结果、测试命令、通过数量、截图路径和仍存在的限制。
- [x] 只有上述项目全部打勾后，才向用户汇报“全部完成”。
