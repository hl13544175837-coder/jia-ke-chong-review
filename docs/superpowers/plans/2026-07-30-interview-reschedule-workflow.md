# 面试改约、取消后重排与全程留痕 Implementation Plan

> **For agentic workers:** Use test-driven development for every state-changing service and API. Preserve all existing local changes and do not commit.

**Goal:** 在现有面试页面内实现面试官申请、招聘专员确认/拒绝/取消待重排、招聘专员主动调整和完整排期历史。

**Architecture:** 新增一张不可变快照为主的改约记录表和一个聚焦的领域服务。现有面试任务继续表示当前有效安排；同面试官改时间更新原任务，取消后重排创建替代任务。前端只扩展现有抽屉和弹窗，通过现有 REST 客户端调用本地 Flask API。

**Tech Stack:** Flask、SQLAlchemy、Alembic、SQLite/MySQL 兼容模型、React 19、TypeScript、Tailwind CSS、Node test runner、pytest。

---

## 执行边界

- 只改当前 `/Users/yenns/Documents/新版招聘/zhipin-mvp`，不进入 `/private/tmp`。
- 只改 `readdy-frontend`，不启动或恢复旧 `frontend` 应用代码。
- 不 reset、checkout、stash、clean、切分支、提交或覆盖现有未提交改动。
- 不新增产品页面；使用现有“我的面试”“面试管理”及其抽屉/弹窗。
- 不调用外部日历或消息接口；通知只写本地站内通知表。

## 文件职责

| 文件 | 职责 |
|---|---|
| `backend/app/models.py` | 新增 `InterviewRescheduleRequest` 模型 |
| `backend/migrations/versions/20260730_13_interview_reschedule_requests.py` | 新表、索引和兼容迁移 |
| `backend/app/services/interview_reschedule_service.py` | 申请、批准、拒绝、取消待重排、替代任务关联、历史序列化 |
| `backend/app/services/interview_management_service.py` | 招聘专员直接调整时写改约历史 |
| `backend/app/api/interview.py` | 改约请求、处理、历史和替代安排接口；列表补待改约摘要 |
| `backend/tests/test_interview_reschedule_workflow.py` | 角色、状态、通知、留痕和重新激活合同测试 |
| `readdy-frontend/src/features/interviews/types.ts` | 改约请求、历史、处理输入类型 |
| `readdy-frontend/src/features/interviews/api.ts` | 本地改约 API 客户端 |
| `readdy-frontend/src/pages/interviewer/interviews/components/RescheduleRequestModal.tsx` | 面试官申请改约弹窗 |
| `readdy-frontend/src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx` | 改约入口、待确认提示、历史展示 |
| `readdy-frontend/src/pages/interviewer/interviews/page.tsx` | 加载历史、提交申请、刷新状态 |
| `readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx` | 招聘专员调整原因、替代请求关联 |
| `readdy-frontend/src/pages/interviews/components/RescheduleRequestPanel.tsx` | 招聘专员处理待改约和查看历史 |
| `readdy-frontend/src/pages/interviews/page.tsx` | 待改约处理、直接调整留痕、取消待重排和重新安排 |
| `readdy-frontend/tests/interview-reschedule-workflow.test.mjs` | 前端入口、状态、API 和无新增页面合同 |

## Task 1：后端失败测试

- [ ] 创建测试数据工厂，包含招聘负责人、原面试官、可选新面试官、需求、候选人和有效面试任务。
- [ ] 先写并运行失败测试：面试官可提交一个待处理申请，原任务不改变，负责人收到通知。
- [ ] 先写并运行失败测试：非本人、已完成、过去时间、空原因和重复待处理申请被拒绝。
- [ ] 先写并运行失败测试：招聘专员同意同面试官改时间和更换面试官都通知正确人员并留历史。
- [ ] 先写并运行失败测试：拒绝不改变原安排；取消待重排保留面试阶段；替代任务关联旧任务且可使用原面试官。
- [ ] 先写并运行失败测试：招聘专员直接调整也会生成已批准历史。

## Task 2：数据库与领域服务

- [ ] 新增 `InterviewRescheduleRequest` 模型，包含旧/新安排快照、来源、状态、申请/处理人和替代任务。
- [ ] 新增 `20260730_13` 迁移；只创建新表和索引，降级禁止破坏历史。
- [ ] 实现申请校验、权限范围、时间标准化、待处理唯一性和历史序列化。
- [ ] 实现批准、拒绝、取消待重排、创建替代任务后的状态流转。
- [ ] 每个动作写现有 `Event` 和 `Notification`，接收人集合去重。
- [ ] 扩展直接调整服务，保存调整前快照并创建 `recruiter_direct` 历史。
- [ ] 运行 Task 1 测试直至通过。

## Task 3：后端 API 与读模型

- [ ] 新增面试官提交改约接口。
- [ ] 新增按任务/候选人读取改约历史接口，按角色限制范围。
- [ ] 新增招聘专员处理申请接口，动作仅允许 `approve`、`reject`、`cancel_and_wait`。
- [ ] 新增待重排申请创建替代任务接口，复用现有任务创建服务并关联新旧任务。
- [ ] 给面试任务和面试管理行补充 `pending_reschedule`、`reschedule_status`、`reschedule_request_id`。
- [ ] 为现有直接调整接口增加 `change_reason` 必填并写历史。
- [ ] 运行后端定向测试和相关面试测试。

## Task 4：前端失败测试

- [ ] 先写失败测试：面试详情有“申请改约”，弹窗要求原因和最多两个未来时间。
- [ ] 先写失败测试：待处理时显示“当前安排仍有效”，不能重复申请。
- [ ] 先写失败测试：招聘专员详情能批准、拒绝、取消待重排，并显示旧/新安排历史。
- [ ] 先写失败测试：直接调整必须填写调整原因；待重排仍使用现有安排弹窗且不新增路由页面。
- [ ] 运行测试并确认因实现缺失而失败。

## Task 5：面试官界面

- [ ] 增加申请弹窗，使用当前产品字号、颜色、按钮和表单样式。
- [ ] 在现有详情抽屉底部增加次级“申请改约”，不遮挡评价主动作。
- [ ] 提交成功后关闭弹窗、刷新任务和历史，显示明确成功提示。
- [ ] 在面试信息中展示待处理提示和倒序排期历史。
- [ ] 弹窗关闭、Escape 和遮罩遵循现有交互，避免残留遮罩阻断其他页面。

## Task 6：招聘专员界面

- [ ] 面试管理行/详情显示待改约状态和申请摘要。
- [ ] 在现有详情内增加处理面板，不新建页面。
- [ ] 批准时打开当前安排弹窗并预填建议时间，可保留或更换面试官。
- [ ] 拒绝、取消待重排必须填写原因；成功后刷新列表和详情。
- [ ] 待重排候选人显示“因改约待重新安排”，点击现有“安排面试”创建关联替代任务。
- [ ] 招聘专员直接调整必须填写原因，成功后在历史中可见。
- [ ] 运行前端合同测试、类型检查和代码规范检查。

## Task 7：完整验证

- [ ] 升级本地数据库到 `20260730_13`，确认 SQLite `integrity_check=ok`。
- [ ] 运行新增后端测试、面试相关测试和后端全量 pytest。
- [ ] 运行前端全量 Node 测试、`type-check`、`lint`、`build`。
- [ ] 运行 `git diff --check`，确认没有空白错误和破坏性 Git 操作。
- [ ] 确认只使用 5190、5100、5010，且进程路径分别属于当前 Readdy 前端、登录桥和后端。
- [ ] 只在 Tabbit/Codex 内置浏览器按面试官、招聘专员做本地闭环验收。

## Task 8：飞书流程画板

- [ ] 读取相关招聘纪要，提取已确认的正常流程和异常分支；不把不确定事项伪装成确定规则。
- [ ] 新建“智聘招聘全流程与异常分支（2026-07-30）”画板。
- [ ] 画出需求、简历、HR 初筛、面试官筛选、排期/改约、面试反馈、Offer、入职主链路。
- [ ] 画出解析失败、重复简历、待补充、时间冲突、改约拒绝、取消待重排、面试不通过进入人才池、Offer 拒绝/放弃等分支。
- [ ] 使用角色颜色、状态颜色、箭头说明和图例；所有改约分支链接回可继续处理的状态。
- [ ] 查询画板确认节点和连线写入成功，返回可打开的飞书链接。

## 回退方式

只用 `apply_patch` 精确撤销本次新增代码或字段引用；迁移只新增表，必要时停止应用并保留该表，不使用 `checkout`、`reset`、`stash` 或删除本地数据库。任何测试失败先定位本次改动，不扩大重构范围。
