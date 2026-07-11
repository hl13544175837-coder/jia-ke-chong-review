# ADR-0002: Demand-scoped Recruiting Flow

## Status

Accepted（代码候选已实现，环境待验收）

> 决策日期：2026-07-10；代码收口更新：2026-07-11。当前实现已进入 `codex/premerge-p0-closeout-20260711` 代码候选；CFPD ref、Libra 构建、SIT 部署和测试站生效必须分别取证。生产和真实数据切换仍需单独决策。

## Context

基线系统把 `Job` 同时当作可复用 JD 画像和一次具体招聘任务，流程、面试和 BI 大量以 `job_id` 定位。这导致同一职位在不同城市、部门、批次、HC 或负责人下无法同时开展招聘，也会让责任归属、转需求和 BI 口径串账。

基线还有三个高风险语义：

- 转需求会把源流程写成 `rejected`，混淆“转出”与“淘汰”。
- AI 面试或 AI 助手可改写主流程，人工决策边界不够清晰。
- BI 曾包含“专员效能/个人绩效”表述，但数据只足以支撑进度、瓶颈和当前责任协同，不足以支撑排名、奖金或历史功劳结算。

## Decision

### 1. Job 与 Demand 分层

- `Job` 是可复用的职位/JD 画像。
- `RecruitmentDemand` 是一次具体招聘任务，持有城市、部门、JD 快照、HC、负责人、计划日期和关闭元数据。
- 同一 Job 可以有多个并行或历史 Demand。Demand 关闭或恢复不反向改写 Job 状态，也不影响兄弟 Demand。
- 匹配仍属于 `job_id`；主流程、面试、Offer、disposition、通知、审计与 BI 属于 `demand_id`。

### 2. 候选人流程不变量

- 新增 `CandidateDemandFlow`，以 `(org_id, candidate_id, demand_id)` 唯一，作为 Demand 下当前流程投影。
- `Candidate.current_demand_id` 指向当前 active flow。P0 每个候选人只允许一个 active flow。
- `pipeline_stages` 继续 append-only，但当前阶段必须按 `(candidate_id, demand_id)` 取最新一行。
- 主阶段保持 `pending → ai_screen → business_review → interview → offer → onboarded/rejected`；转出使用独立终态 `transferred`。

### 3. 转 Demand 和负责人转派

- 转 Demand 是单事务：源 flow 置为 `transferred`，目标 flow 从 `pending` 开始，`Candidate.current_demand_id` 指向目标，当前 owner 跟随目标 Demand。
- `transferred` 不等于 `rejected`，不进入淘汰口径。
- Demand owner 转派在单事务内更新 Demand、其下 active flows 和当前候选人 owner；不修改 Job owner，不重写历史 actor。
- HC 达标只生成 `completion_suggested`，系统不自动关闭 Demand。

### 4. 面试轮次

- 面试轮次在 `interview` 主阶段内使用 `round_sequence` 表达，不重新拆成一面/二面/终面主阶段。
- 同一 Demand/候选人/轮次只有一名 `is_primary=true` 的主面试官。
- 有效主面试安排使用 nullable `primary_slot=round_sequence`，数据库唯一约束 `(org_id,demand_id,candidate_id,primary_slot)`；同一 assignment 的 feedback 也唯一。迁移遇到存量重复必须中止，不自动挑选赢家。
- 只有主面试官反馈能完成该轮；辅助反馈不完成轮次，任何反馈都不推进主流程。

### 5. AI 和原始简历边界

- AI 只做解析、匹配、总结和建议。
- AI 不自动推进、淘汰、发 Offer、转派负责人或关闭 Demand；相关工具不进入 P0 工具目录。
- 提示词、前端隐藏按钮或功能开关不是安全边界；边界由工具目录、后端服务、RBAC、审计和负向测试共同保证。
- 原始简历是事实真源。候选人详情分为“原始简历 / 结构化 / 匹配分析”三个视图，AI 产物不覆盖原文。

### 6. BI 使用边界

- BI 按 Demand 计算，所有数字可下钻到候选人、流水、安排或反馈事实。
- BI 只回答进度、瓶颈和当前责任协同；不用于人员排名、绩效考核、奖金分配、历史功劳结算或自动问责。
- 负责人转派改变当前责任投影，不改变历史推进人、面试反馈人和事件 actor。

### 7. 服务 Owner 与兼容策略

- Demand 上下文解析、Demand 生命周期、流程、面试与 BI 分别收敛到 `demand_context_service`, `demand_service`, `pipeline_service`, `interview_workflow_service`, `bi_service`；API 不实现并行规则。
- 迁移采用 Expand → Backfill → Dual-write/Shadow-read → Strict cutover → Contract。
- 兼容窗口内，旧 `job_id` 调用只在能唯一解析 Demand 时代理；有歧义时返回 HTTP 409 `demand_id_required`，禁止猜测或默认选最新记录。
- 架构仍是 React + Flask + 单库的模块化单体，不因本轮改造拆微服务、微前端或第二套权限体系。

## Consequences

### Positive

- 同一职位可以按城市、部门、批次、HC 和负责人独立管理。
- 候选人流程、面试、Offer、审计和 BI 共享同一归属键，能稳定下钻与对账。
- 转出、淘汰、当前责任和历史行为者不再混淆。
- AI 和 BI 的边界更符合真实试点的风险承受能力。

### Negative

- 需要跨表回填 `demand_id`，并在一段时间内维护新旧契约。
- 流程和转派事务更严格，对安全迁移、一致性测试和审计证据的要求更高。
- 旧客户端在同一 Job 有多个 Demand 时会收到 409，必须升级为显式携带 `demand_id`。

## Alternatives Considered

**继续限制一个 Job 只有一个未结束 Demand**

- Rejected。这只是用技术限制遮蔽真实业务中的并行需求，会迫使用户复制 Job 或在系统外管理批次。

**直接把 Job 改名为 Demand**

- Rejected。这会丢失可复用 JD 画像与具体招聘任务之间的语义分离，匹配和招聘执行仍会绑死。

**一次性大爆炸切换**

- Rejected。无法先审计历史歧义，也无法在同引擎恢复演练和影子对账通过前控制数据风险。

**在应用启动或多 worker 中自动执行 DDL/回填**

- Rejected。GA/生产迁移必须由版本化 Alembic 脚本和唯一 release migration job 执行，否则无法保证顺序、幂等、锁竞争与回滚边界；Flask 应用工厂、Gunicorn worker 和业务 worker 均不得执行 DDL/回填。
- 仅对数据可丢弃的 RC/SIT，允许容器 entrypoint 在 Gunicorn 启动前执行显式空库 bootstrap 与 `alembic upgrade head`，但发布层必须保证整个迁移窗口只有一个副本、一次启动，且用独立环境开关启用。勾选自动部署本身不构成单副本证据；无法确认单副本时必须改用唯一 migration job，不得依赖数据库碰撞“自然串行”。该例外不适用于生产或真实候选人数据。

**保留 AI 主流程写工具，仅依赖确认弹窗或 prompt 约束**

- Rejected。确认交互与文案可以改善可用性，但不能代替后端能力边界和负向测试。

## Rollback Boundary

- Strict cutover 之前可停止发布、回滚应用、保留已扩展但未启用的 schema，并重跑审计/回填。
- Strict cutover 后不得只回滚应用代码。必须依据 cutover marker、进入维护/写入冻结，并在“前向修复”与“整库恢复到切换前快照”之间做明确决策。
- Contract 阶段删除旧字段/路径后，回滚只能依赖已演练的整库恢复或新的前向迁移。

## References

- `docs/01_PRD.md`
- `docs/03_BI看板设计.md`
- `docs/SDD-智聘招聘系统-v1.0.md`
- `docs/10_demand_id迁移与回滚手册.md`
- `docs/06_试点上线检查清单.md`
- `docs/08_Libra_SIT发布路线.md`
