# 招聘产品全闭环 Implementation Plan（人才地图除外）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重做现有界面、不更换技术栈、不接企业微信与公司 OA 的前提下，让招聘专员、招聘经理、面试官、管理员和 HR 总监使用同一套真实数据完成从需求到入职的内部闭环，并形成可直接交给研发接手的工程与接口资料。

**Architecture:** 保留 React/Vite 与 Flask/SQLAlchemy 单体架构。后端服务统一拥有状态、权限、数据一致性、通知、HC 和审计规则；前端只展示后端事实并触发合法动作。Mock 只用于向数据库初始化演示数据，不能在当前产品页面中承担业务保存。

**Tech Stack:** React 19、TypeScript、React Router 7、Vite 8、Flask 3.1、SQLAlchemy 2.0、pytest、Node 契约测试、PDF/DOCX 直接解析、扫描件 OCR、可替换大模型解析适配器。

---

## 一、范围与硬性约束

| 项目 | 约定 |
|---|---|
| 包含页面 | 工作台、招聘需求、候选人/简历库、业务筛选、面试管理、面试官端、Offer、分析看板、系统设置 |
| 明确排除 | 人才地图页面及其数据、交互和接口 |
| 界面原则 | 界面冻结：不删、不改名、不换位置、不重做；优先修后端、数据、权限和状态，前端只做最小接线 |
| 数据原则 | 所有操作写入数据库；刷新、退出、换账号后仍能看到 |
| Mock 原则 | 可保留演示数据，但必须通过真实数据库和真实接口流转 |
| 外部边界 | OA、企业微信、短信、邮件、电子签不做真实发送；站内通知、站内日程和手工登记必须可闭环 |
| 研发交接 | 提供启动、部署、账号、数据库、接口、外部适配器、测试和验收文档 |
| 交付边界 | 全程只在本地独立开发分支工作；不推送 GitHub/GitLab，不合并到 `test` 或其他远端分支 |
| 回退保障 | 开工前保存包含未提交内容的本地完整基线；每阶段独立提交，界面与后端尽量分开提交 |
| 执行原则 | 按风险验证：核心数据/状态/权限写自动回归；按钮/跳转实际点击；文案/样式页面检查。每阶段修复后跑相关回归再提交 |

### 界面冻结红线（长任务期间自动执行，不再逐项询问）

| 类别 | 硬性规定 |
|---|---|
| 导航与页面 | 不删除、改名、换序侧栏入口；不新增或删除一级页面；人才地图完全不动 |
| 熟悉度保护 | 现有标题、页签、卡片、表格列、抽屉、弹窗、字段和可见按钮默认全部保留，不擅自隐藏或搬家 |
| 全局样式 | 不更换主题、颜色体系、整体间距和主要信息结构，不做整页重新设计 |
| 优先修复方式 | 先修接口、数据库、权限、状态和跳转；能复用现有按钮、抽屉、弹窗的，不新增界面元素 |
| 允许的小改动 | 修正文案和状态；让现有按钮真正可用；按状态启用/禁用；补短提示、错误原因、下一步和必要的“查看 Offer”等防死路入口 |
| 禁止的默认动作 | 不因“看起来重复”直接删除板块；不把常用操作挪到陌生位置；不添加用户看不懂的技术词和概念 |
| 每行/每卡按钮 | 最多常驻 1 个主按钮 + 1 个次按钮；其他低频操作放入现有“更多/…”菜单 |
| 抽屉/弹窗按钮 | 底部最多常驻 2 个操作；其余动作进入一个“更多操作”入口或原有上下文菜单 |
| 单页新增预算 | 整个长任务累计下来，同一页面最多新增 2 个常驻可见控件；不得新增一级页签、一级入口或整块内容，避免分阶段不断累加 |
| 按钮命名 | 使用直白的中文“动词 + 对象”，如“确认已面试”“进入 Offer”“查看 Offer”，不使用研发术语 |
| 一次性授权 | 用户批准本计划即代表允许全部“绿色范围”小改，执行中不再逐项询问，也不把普通技术选择反复抛给用户 |
| 超线处理 | 如某方案必须删/挪板块、新增页面或页签、超过按钮预算，自动放弃该方案；依次改用后端修复、复用原按钮、复用原抽屉/弹窗、放入原“更多/…”菜单或补短提示 |
| 无法绕开 | 若所有合规方案都无法解决，保留现有界面和功能，登记为“界面冻结受限项”，继续执行其他任务；最终明确说明，绝不擅自突破红线或假报完成 |
| 对比验收 | 每页改动前记录原布局，改动后在同一路由、同一视口对比；侧栏、标题、页签、主要板块和表格列不得无授权变化 |
| 回退方式 | 后端修复与界面小改尽量分开提交；若用户觉得页面陌生，只回退对应界面提交，保留已经验证的数据修复 |

### 长任务自动决策等级

| 等级 | 可执行范围 | 执行规则 |
|---|---|---|
| 绿色：自动执行 | 修接口/数据库/权限/状态；修现有按钮、跳转、提示和禁用规则；复用现有抽屉、弹窗和“更多”菜单；预算内补必要入口 | 无需再次询问，完成后用测试和页面对比验收 |
| 黄色：自动降级 | 原方案会新增整块内容、超过按钮预算或改变操作位置 | 不实施原方案，自动选择对现有界面影响最小的替代方案 |
| 红色：绝不执行 | 删除、改名、换序导航/页签/主要板块；重做页面；改变技术栈；触碰人才地图 | 即使能缩短开发时间也不得执行，记录原因并继续其他工作 |

每阶段提交前必须自动检查：原有可见结构删除数为 `0`、改名数为 `0`、换位数为 `0`、整个任务累计新增的常驻控件不超预算。任一超线就只回退该阶段界面改动，保留已通过测试的后端修复。

### 分级验证与防敷衍规则

| 类型 | 必须提供的证据 |
|---|---|
| 数据、状态、权限、HC | 合并成核心业务场景的自动回归测试，不为每个小文案单独写测试 |
| 跨账号推送、面试、Offer、入职 | 真实账号走流程 + 数据库变化 + 自动回归 |
| 按钮、跳转、搜索、筛选 | 浏览器实际点击，记录起点、目标页面和筛选结果 |
| 文案、提示、小样式 | 同路由页面检查和界面冻结对比 |

每阶段只有同时具备以下四类证据才能写“已解决”：修复前能复现、修复后实际操作正常、数据库事实正确、相关旧功能回归通过。缺少任一项只能写“代码已修改”，不能写“问题已解决”。若出现新增问题，立即停止当前阶段，检查本阶段差异；优先撤回本阶段改动，找到根因后重新实现，不在错误方案上继续补丁。

## 二、问题覆盖矩阵

| 编号 | 问题 | 负责阶段 | 关闭标准 |
|---|---|---|---|
| P01 | 简历导入失败或多个入口结果不同 | 阶段 2 | 所有入口走统一上传与解析服务 |
| P02 | 原简历、解析信息、候选人记录断开 | 阶段 2 | 三者用同一 candidate/resume 关系读取 |
| P03 | 新建需求失败且错误不清楚 | 阶段 3 | 精确字段错误、保留表单、可重试 |
| P04 | HC 已满仍能继续选人 | 阶段 3 | 后端阻止、前端禁用并引导完成/调 HC |
| P05 | 招聘中、已完成、待确认互相矛盾 | 阶段 1、3 | 全站统一状态口径 |
| P06 | 候选人目标岗位、当前需求、阶段不一致 | 阶段 4 | 每次应聘绑定明确 demand，历史独立保留 |
| P07 | 推送后面试官看不到任务或简历 | 阶段 4、5 | 真实账号收到同一 task、candidate、resume、demand |
| P08 | 已关闭岗位仍出现在工作台待办 | 阶段 3、8 | 关闭时清理待办，历史只读 |
| P09 | 待确认与待反馈混用 | 阶段 6 | 已安排→确认已面试→待反馈→已反馈 |
| P10 | 反馈完成后没有明确下一步 | 阶段 6 | 下一轮/加面试官/Offer/淘汰四选一 |
| P11 | 已进入 Offer 后面试页成为死路 | 阶段 6 | 显示并可打开对应 Offer |
| P12 | Offer 该修改时不能改、完成后限制不解释 | 阶段 7 | 草稿/被驳回可改；已发放用撤回/新版本处理 |
| P13 | Offer 首页被历史记录占满 | 阶段 7 | 默认今日待办；历史单独归档 |
| P14 | 入职与 HC 不联动或重复扣减 | 阶段 7 | 入职只生效一次，HC 与岗位完成状态同步 |
| P15 | 工作台重复、过期或无关待办 | 阶段 8 | 只显示当前账号可处理事项 |
| P16 | 无权限时直接跳走，用户不知道原因 | 阶段 8 | 明确提示角色与可进入入口 |
| P17 | 分析看板是假实时、导出是假按钮 | 阶段 9 | 使用真实聚合数据并下载真实文件 |
| P18 | 系统设置刷新后失效 | 阶段 9 | 用户、部门、权限、流程配置真实持久化 |
| P19 | 外部接口未接导致内部流程断掉 | 阶段 10 | 站内替代闭环 + 可替换接口契约 |
| P20 | 研发接手后无法启动或验收 | 阶段 10、11 | 文档、迁移、账号、脚本、接口与验收报告齐全 |
| P21 | 修复时删改界面过多或新增按钮过多，用户找不到原功能 | 阶段 0、11 | 界面冻结契约通过；删除/改名/换位均为 0；所有页面符合按钮预算；执行中无需用户逐项确认 |

## 三、严格执行计划表

### 已批准的六批精简执行方式

为减少重复验收，以下六批是本轮实际执行节奏；后面的 Task 0-11 继续作为问题检查清单，不再各自重复跑全量测试或重复做三角色验收。

| 批次 | 合并范围 | 验收方式 |
|---|---|---|
| 1 | Task 0：恢复点、隔离工作区、基线 | 恢复点校验 + 基线全量测试 |
| 2 | Task 1-4：状态、简历、需求、候选人、业务筛选 | 相关后端回归 + 招聘专员/业务筛选人实机 |
| 3 | Task 5-6：面试官接收、面试安排、反馈、招聘决策 | 面试闭环回归 + 招聘专员/面试官实机 |
| 4 | Task 7：Offer、入职、HC、岗位关闭 | Offer 生命周期回归 + 中期全量测试 |
| 5 | Task 8-10：工作台、通知、权限、统计、设置、外部边界 | 相关回归 + 页面跳转与真实数据检查 |
| 6 | Task 11：三角色全流程与交接 | 最终全量测试 + 三角色浏览器 + 数据库证据 |

全量测试只在批次 1、批次 4 和批次 6 执行；其他批次只跑受影响的相关测试。文案和小样式不单独写自动测试，使用页面检查和界面冻结对比。

| 阶段 | 工作内容 | 核心产物 | 阶段验收 | 失败处理 |
|---|---|---|---|---|
| 0 | 建立隔离开发环境和当前基线 | 独立分支/工作区、基线报告 | 当前测试结果与未提交文件清单留档 | 不动用户原改动，基线不明则停止 |
| 1 | 统一招聘状态和操作规则 | 后端状态服务、前端只读规则 | 同一记录在所有页面状态一致 | 只回退状态规则提交 |
| 2 | 统一简历导入和混合解析 | PDF/DOCX/OCR/大模型适配器、重试、查重 | 上传后能跨账号查看原件和结构化简历 | 保留原文件，解析失败不生成假成功 |
| 3 | 修复需求、审核、HC 和关闭清理 | 需求校验、状态流、HC 守卫、关闭清理 | 创建→审核→招聘→达成→关闭跑通 | 回退当前需求提交，不动简历阶段 |
| 4 | 修复候选人与业务筛选 | 应聘关系、推送任务、补充/改派/催办 | 招聘专员推送，面试官真实收到 | 单人失败不影响其他候选人 |
| 5 | 打通面试官端简历与权限 | 面试官任务、完整简历、JD、HR 备注 | 面试官只能看到自己的真实任务 | 权限不明则拒绝并记录，不扩大数据范围 |
| 6 | 修复面试状态、反馈和下一步 | 排期、确认、反馈、下一轮、Offer、淘汰 | 多角色完整走完至少两轮面试 | 冲突时保持原阶段，禁止半成功 |
| 7 | 完成 Offer 与入职闭环 | 今日待办、编辑/审批/发放/回复/入职、HC | Offer 全状态流转并只扣减一次 HC | 状态冲突返回 409，不覆盖历史 |
| 8 | 清理工作台、通知和角色入口 | 精准待办、站内通知、无权限说明 | 关闭事项不再提醒，角色数据不串 | 单接口失败只影响对应分区 |
| 9 | 真实化分析看板和系统设置 | 真实指标、真实导出、持久化设置 | 刷新后设置不丢，报表与数据库一致 | 保留旧配置备份，写入失败不显示成功 |
| 10 | 建立外部适配器和研发交接 | OA/企微接口契约、站内替代、部署文档 | 不接外部也能完整演示，研发可替换适配器 | 外部失败不回滚内部业务事实 |
| 11 | 三角色全流程总验收 | 自动测试、浏览器证据、验收报告 | 全流程、全量测试、构建全部通过 | 定位到具体阶段和提交后回退修复 |

## 四、逐阶段实施任务

### Task 0：保护基线和回退能力

**Files:**
- Read only: `git status`、`git log`、当前测试输出
- Create at execution: `docs/acceptance/recruitment-closure-baseline.md`
- Create at execution: `frontend/tests/recruitment_ui_freeze_contract.test.mjs`

- [ ] 记录当前分支、HEAD、远端和未提交文件，明确 `backend/seed_dev.py`、`backend/tests/test_seed_dev_demand_scope.py` 与演示脚本的归属。
- [ ] 在仓库外建立带日期时间的只读本地基线副本，包含当前已跟踪和未跟踪文件；记录副本路径、文件数量和校验结果。
- [ ] 使用独立 `codex/recruitment-product-closure-v2` 分支/工作区执行，不覆盖用户工作树。
- [ ] 运行当前后端、前端、类型、lint 和构建，记录基线通过数与已知限制。
- [ ] 按路由记录现有侧栏、标题、页签、主要板块、表格列、抽屉/弹窗和常驻按钮，形成界面冻结清单。
- [ ] 建立界面冻结契约测试：无授权删除、改名、换序、新增一级页签，以及按钮超过预算时必须失败。
- [ ] 建立“绿色自动执行、黄色自动降级、红色禁止执行”的变更登记；后续阶段不再等待逐项界面确认。
- [ ] 基线不通过时先区分“原有失败”和“本次范围”；没有归属证据时不得修改。
- [ ] 提交基线文档：`docs: record recruitment closure baseline`。

**Gate:** 能准确回到执行前的完整本地状态（包括未提交内容），且用户未提交文件完全不变；未验证恢复方法前不得进入阶段 1。

**回退级别：**

1. 全部返回：恢复开工前本地基线副本。
2. 阶段返回：撤回对应阶段的独立提交，不影响已验收阶段。
3. 只退界面：撤回界面提交，保留已通过测试的后端、数据和权限修复。

**UI Gate:** 先锁定用户熟悉的现有结构；后续每个阶段只允许清单内的最小改动。

### Task 1：建立唯一招聘状态规则

**Files:**
- Create: `backend/app/services/recruitment_state_service.py`
- Create: `backend/tests/test_recruitment_state_contract.py`
- Create: `readdy-frontend/src/features/workflow/rules.ts`
- Create: `frontend/tests/recruitment_state_consistency.test.mjs`
- Modify: `backend/app/services/pipeline_service.py`
- Modify: `backend/app/services/demand_service.py`

- [ ] 记录当前状态矛盾的复现证据，并用一个合并场景回归覆盖需求、候选人、业务筛选、面试、Offer、入职的合法迁移与非法回退。
- [ ] 运行：`.venv/bin/pytest backend/tests/test_recruitment_state_contract.py -q`，确认回归场景能暴露当前错误。
- [ ] 实现后端唯一状态判断和稳定 400/403/409 错误；前端规则只负责显示，不拥有业务真相。
- [ ] 运行后端测试、`node frontend/tests/recruitment_state_consistency.test.mjs` 和类型检查，预期全部通过。
- [ ] 提交：`feat: unify recruitment workflow states`。

**Gate:** 相同记录在工作台、需求、候选人、面试和 Offer 页面显示同一状态。

### Task 2：统一简历导入与混合解析

**Files:**
- Create: `backend/app/services/resume_parser_service.py`
- Create: `backend/app/services/resume_ocr_adapter.py`
- Create: `backend/app/services/resume_llm_adapter.py`
- Create: `backend/tests/test_resume_import_pipeline.py`
- Modify: `backend/app/api/resume.py`
- Modify: `backend/app/services/resume_service.py`
- Modify: `backend/app/services/candidate_library_service.py`
- Modify: `readdy-frontend/src/features/candidates/api.ts`
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx`

- [ ] 记录当前导入问题，并用一个导入管线回归覆盖：PDF/DOCX 直接提取、扫描 PDF/图片 OCR、ZIP 逐份处理、低可信字段待确认、重复文件不重复建人。
- [ ] 运行：`.venv/bin/pytest backend/tests/test_resume_import_pipeline.py backend/tests/test_resume_parse_retry.py -q`，确认场景能暴露当前错误。
- [ ] 实现文件识别顺序：原生文字→OCR→规则提取→可替换大模型结构化；电话、邮箱和日期不得由模型凭空补写。
- [ ] 保存原文件、文件哈希、原始文字、结构化字段、解析状态、错误原因和解析版本。
- [ ] 所有导入入口调用同一 API；失败时保留原文件并提供“重新解析”，不生成空白成功记录。
- [ ] 跨招聘专员与面试官账号验证原件、中文结构化简历和解析状态一致。
- [ ] 提交：`feat: unify resume import and parsing`。

**Gate:** 导入成功、解析失败、重试、查重、需求内导入和简历库导入全部有真实数据库证据。

### Task 3：修复需求、审核、HC 与关闭清理

**Files:**
- Modify: `backend/app/api/demands.py`
- Modify: `backend/app/services/demand_service.py`
- Modify: `backend/app/services/demand_approval_service.py`
- Modify: `backend/tests/test_demand_management.py`
- Modify: `backend/tests/test_demand_close_flow_cleanup.py`
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/RequisitionForm.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx`

- [ ] 记录当前需求/HC问题，并用一个需求生命周期回归覆盖字段错误、驳回原因、HC守卫、调整HC和关闭清理。
- [ ] 运行需求聚焦测试，确认场景能暴露当前错误。
- [ ] 后端实现 HC 和状态守卫；前端保留填写内容并显示字段级错误。
- [ ] “招聘中 + HC 已达成”统一为“待确认结束”，按钮改为确认完成或调整 HC。
- [ ] 关闭/取消需求后，未完成业务筛选和通知退出活跃待办，历史可追溯。
- [ ] 提交：`fix: enforce demand lifecycle and headcount`。

**Gate:** 不能超 HC、不能产生关闭岗位新任务、状态全站一致。

### Task 4：统一候选人应聘关系与业务筛选

**Files:**
- Modify: `backend/app/api/candidates.py`
- Modify: `backend/app/api/business_reviews.py`
- Modify: `backend/app/services/candidate_library_service.py`
- Modify: `backend/app/services/business_review_service.py`
- Modify: `backend/tests/test_candidate_journey.py`
- Modify: `backend/tests/test_business_reviews.py`
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Modify: `readdy-frontend/src/pages/candidates/components/PushToReviewerModal.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/DemandBusinessReviewDrawer.tsx`

- [ ] 记录当前候选人交接问题，并用一个业务筛选回归覆盖岗位绑定、转岗历史、关闭岗位、退回补充和催办去重。
- [ ] 运行候选人和业务筛选测试，确认场景能暴露当前错误。
- [ ] 统一候选人当前应聘、历史应聘、目标岗位和人才库状态口径。
- [ ] 推送事务同时创建任务、站内通知和审计；任何一步失败时整体不落库。
- [ ] 通过/不合适/需补充/改派均有清楚下一步，不允许候选人停在未知状态。
- [ ] 提交：`fix: close candidate business review handoff`。

**Gate:** 招聘专员推送后，指定面试官真实账号能立即看到同一候选人和简历。

### Task 5：打通面试官端的数据和权限

**Files:**
- Modify: `backend/app/middleware/auth.py`
- Modify: `backend/app/services/business_review_service.py`
- Modify: `backend/app/services/interview_service.py`
- Modify: `backend/tests/test_business_review_resume_access.py`
- Modify: `backend/tests/test_demand_scope_permissions.py`
- Modify: `readdy-frontend/src/pages/interviewer/dashboard/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/page.tsx`

- [ ] 记录当前跨账号不可见/越权问题，并用一个面试官权限回归覆盖任务、原简历、JD、HR备注和禁止查看全库。
- [ ] 运行权限测试，确认场景能暴露当前错误。
- [ ] 返回角色友好的 403 信息；前端显示当前账号角色和正确入口，不再静默跳走。
- [ ] 使用真实面试官账号验证工作台、业务筛选和我的面试三处数据一致。
- [ ] 提交：`fix: enforce interviewer task visibility`。

**Gate:** 招聘专员账号和面试官账号各自只能看该看的数据，且任务交接无丢失。

### Task 6：修复面试状态、反馈和招聘决策

**Files:**
- Modify: `backend/app/services/interview_management_service.py`
- Modify: `backend/app/services/interview_workflow_service.py`
- Modify: `backend/tests/test_interview_management_contract.py`
- Modify: `backend/tests/test_interview_loop.py`
- Modify: `readdy-frontend/src/pages/interviews/workbench.ts`
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Modify: `readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx`

- [ ] 记录当前面试状态问题，并用一个面试闭环回归覆盖安排、确认已面试、反馈和招聘专员决策。
- [ ] 运行面试聚焦测试，确认场景能暴露当前错误。
- [ ] 状态固定为：待安排→已安排→待确认已面试→待反馈→已反馈。
- [ ] 反馈后提供下一轮、增加面试官、进入 Offer、淘汰；淘汰必须填写原因。
- [ ] 已进入 Offer 的面试详情显示“查看 Offer”；已淘汰显示原因和人才库去向。
- [ ] 提交：`fix: close interview feedback decision flow`。

**Gate:** 至少两轮面试能跨真实账号完成，且不存在“待确认却催反馈”。

### Task 7：完成 Offer、审批、发放、回复、入职与 HC

**Files:**
- Modify: `backend/app/services/offer_service.py`
- Modify: `backend/tests/test_offer_lifecycle.py`
- Modify: `readdy-frontend/src/pages/offers/workbench.ts`
- Modify: `readdy-frontend/src/pages/offers/page.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx`
- Modify: `frontend/tests/recruiter_offer_workbench.test.mjs`

- [ ] 记录当前 Offer 问题，并用一个 Offer 生命周期回归覆盖编辑、审批、发放、撤回/重发、回复、入职和重复入职保护。
- [ ] 运行 Offer 聚焦测试，确认场景能暴露当前错误。
- [ ] 保留现有 Offer 工作台布局，默认展示今天需要招聘专员处理的事项；历史记录独立归档。
- [ ] 内部审批由招聘专员提交、经理审批；外部送达暂由手工登记，不显示虚假的企业微信成功。
- [ ] 入职成功只扣减一次 HC；拒绝、撤回、过期释放名额并保留历史。
- [ ] 提交：`fix: complete offer onboarding lifecycle`。

**Gate:** Offer 从草稿到入职全流程刷新不丢，数据库事件和 HC 结果一致。

### Task 8：清理工作台、通知和角色入口

**Files:**
- Modify: `backend/app/api/notifications.py`
- Modify: `backend/tests/test_notifications.py`
- Modify: `readdy-frontend/src/pages/dashboard/summary.ts`
- Modify: `readdy-frontend/src/pages/dashboard/page.tsx`
- Modify: `readdy-frontend/src/components/feature/MainLayout.tsx`
- Modify: `readdy-frontend/src/auth/productRole.tsx`
- Modify: `frontend/tests/dashboard_data_truth_contract.test.mjs`
- Modify: `frontend/tests/interviewer_role_scope.test.mjs`

- [ ] 记录当前工作台问题，并用一个工作台回归覆盖关闭事项、待办去重、零值卡片和无权限说明。
- [ ] 运行工作台和角色测试，确认场景能暴露当前错误。
- [ ] 待办根据当前账号、需求状态和真实任务生成；部分接口失败显示“数据暂不可用”。
- [ ] 通知深链到准确候选人、任务、面试或 Offer，并保留返回来源。
- [ ] 提交：`fix: align dashboard tasks and role routes`。

**Gate:** 工作台每一项都能解释来源、点击可处理、处理后自动消失。

### Task 9：真实化分析看板和系统设置

**Files:**
- Create: `backend/app/api/analytics.py`
- Create: `backend/app/api/settings.py`
- Create: `backend/app/services/analytics_service.py`
- Create: `backend/app/services/settings_service.py`
- Create: `backend/tests/test_analytics_truth.py`
- Create: `backend/tests/test_settings_persistence.py`
- Modify: `readdy-frontend/src/pages/analytics/page.tsx`
- Modify: `readdy-frontend/src/pages/settings/page.tsx`

- [ ] 记录当前统计/设置问题，并用一个真实性回归覆盖数据库指标、组织隔离、真实导出、设置持久化和权限即时生效。
- [ ] 运行新测试，确认场景能暴露静态 Mock 和本地状态问题。
- [ ] 分析服务聚合真实需求、候选人、面试、Offer 和入职数据；页面显示数据时间与口径。
- [ ] 设置服务持久化用户、部门、角色权限和基础流程参数；写入失败不得显示成功。
- [ ] 导出真实 CSV/Excel，并记录导出人、时间和筛选条件。
- [ ] 提交：`feat: persist settings and real analytics`。

**Gate:** 修改设置后刷新和换账号仍生效；报表数据能追溯到数据库记录。

### Task 10：外部接口适配器和研发交接

**Files:**
- Create: `backend/app/integrations/oa_adapter.py`
- Create: `backend/app/integrations/wecom_adapter.py`
- Create: `backend/tests/test_external_adapter_boundaries.py`
- Create: `docs/13_试点业务流程与研发接口交接.md`
- Create: `docs/acceptance/recruitment-closure-runbook.md`
- Modify: `docs/01_PRD.md`
- Modify: `README.md`

- [ ] 定义 OA 需求同步和企业微信消息/日程的输入、输出、幂等键、失败重试和回调签名，不发送真实外部请求。
- [ ] 默认站内适配器真实创建通知、日程和手工回执；外部适配器不可用时内部业务仍可完成。
- [ ] 文档写清启动命令、环境变量、数据库迁移、演示账号、数据初始化、接口契约和外部边界。
- [ ] 为研发提供从替换适配器到联调回调的逐步说明。
- [ ] 提交：`docs: add recruitment integration handoff`。

**Gate:** 新研发只阅读文档即可启动系统、跑测试、走演示并定位外部接口位置。

### Task 11：全量测试与三角色真实验收

**Files:**
- Create: `backend/tests/test_recruitment_end_to_end.py`
- Create: `frontend/tests/recruitment_product_closure.test.mjs`
- Modify: `frontend/tests/recruitment_ui_freeze_contract.test.mjs`
- Create: `docs/acceptance/recruitment-product-closure-report.md`

- [ ] 后端端到端测试真实写库：需求→审核→简历→业务筛选→两轮面试→Offer→入职→HC→关闭。
- [ ] 浏览器使用招聘专员、经理/管理员、面试官账号重复走流程并记录每一步数据库/页面证据。
- [ ] 分别刷新、退出、重新登录，确认数据不丢且权限不串。
- [ ] 在与基线相同的路由和视口逐页对比：侧栏、标题、页签、主要板块、表格列和原有入口无未经批准的删除、改名或换位。
- [ ] 逐页统计新增常驻按钮：每行/每卡不超过“1 主 + 1 次”，整个任务累计同页不超过 2 个新增常驻控件，低频动作全部收进原有“更多/…”菜单。
- [ ] 运行：`node frontend/tests/recruitment_ui_freeze_contract.test.mjs`，预期 0 failed。
- [ ] 运行：`.venv/bin/pytest backend/tests -q`，预期 0 failed。
- [ ] 运行全部可执行前端契约测试，预期 0 failed。
- [ ] 运行：`npm --prefix readdy-frontend run type-check && npm --prefix readdy-frontend run lint && npm --prefix readdy-frontend run build`，预期退出码全部为 0。
- [ ] 运行：`git diff --check`，预期退出码 0。
- [ ] 对照 P01-P21 逐项签字；任何一项未关闭，不得宣布完成。
- [ ] 提交：`test: verify recruitment product closure`。

**Gate:** 自动测试、真实浏览器、多角色、数据一致性和交接文档同时通过。

## 五、阶段汇报格式

每完成一个阶段，只按以下格式汇报：

| 项目 | 内容 |
|---|---|
| 本阶段完成 | 对应问题编号与功能 |
| 自动测试 | 命令、通过数、失败数 |
| 实机验收 | 使用账号、操作步骤、结果 |
| 数据证据 | 写入/状态/通知/HC 的真实变化 |
| 界面变化 | 删除/改名/换位数量（应为 0）、新增常驻控件数量、是否符合按钮预算 |
| 界面冻结受限项 | 无则写“无”；有则写原需求、为何超线、采用了什么替代方案及剩余影响 |
| 未解决 | 明确列出，不用“基本完成” |
| Commit | 本阶段独立提交号 |
| 是否进入下一阶段 | 只有全部通过才写“是” |

## 六、最终停止条件

出现以下任一情况，必须停止当前错误路径并修复，不能继续在错误方案上堆代码；仅界面方案超线时，回退该界面改动并继续其他不相关任务：

1. 核心数据、状态、权限或 HC 被修改，却没有对应的合并场景回归和修复前复现证据。
2. 当前阶段测试失败。
3. 全量回归出现新增失败。
4. 页面成功但数据库没有变化。
5. 一个角色成功、另一个角色看不到。
6. 刷新或重新登录后数据消失。
7. 状态、人数、HC 在不同页面不一致。
8. 需要修改人才地图。
9. 需要对外发送 OA、企业微信、短信或邮件真实数据。
10. 需要覆盖用户未提交的文件。
11. 当前方案会删除、改名、换序任何现有导航、页签、主要板块、表格列或常用入口；必须放弃该方案并自动改走合规替代方案。
12. 当前方案会新增一级页面、一级页签或整块内容；必须放弃该方案并自动改走合规替代方案。
13. 单行/单卡、抽屉/弹窗或单页新增按钮超过界面冻结预算。
14. 页面自动对比发现原功能找不到、操作位置改变或新增按钮难以理解；必须回退该阶段界面改动后重新实现。

只有 P01-P21 全部关闭，且 Task 11 的业务、数据、权限、界面冻结和交接验收全部通过，才允许结束任务。
