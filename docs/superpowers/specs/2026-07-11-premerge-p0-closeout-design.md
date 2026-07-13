# Pre-merge P0 Closeout Design

> 状态：2026-07-11 经项目负责人确认，完成合并前技术审计后直接收口并推进 CFPD `test`；本轮不触发 Libra/SIT 发布。
> 基线：`ee231f40a3923dfc156f9845a8d7bb787a647487`。

## 1. 目标与范围

本轮只处理会让代码源出现数据损坏、权限泄漏、BI 误导、迁移失控或不可恢复的 P0 问题，并把最终树恢复到既有 ADR 的约束内。完成后从隔离分支 fast-forward 推送 CFPD `test`，但不自动执行 Libra 构建或 SIT 发布。

保留现有 React 18 + Vite 8 + TypeScript、Flask 3.1 + SQLAlchemy 2.0 + Alembic、MySQL/SQLite/PostgreSQL 兼容和模块化单体架构。当前依赖审计没有发现应用依赖漏洞，合并前不升级 React 19、Router 7、Tailwind 4，也不拆微服务、微前端或第二套权限体系。

本轮不合入 OA/Merak 或 Consul/Eureka WIP。OA 缺真实服务身份、字段过滤和联调证据；应用内注册中心在 Gunicorn 多 worker 下会重复注册，且 K8S 已有原生服务发现能力，必须单独立项。

> 【2026-07-13 后续】上述“单独立项”已在 `test` 分支落地为可选服务注册模块（`backend/app/registry/`），由配置动态切换、默认关闭（`CONSUL_ENABLED`/`EUREKA_ENABLED` 均为 false 时不注册，仍走 K8S 原生服务发现）。此前顾虑的多 worker 重复注册，已通过 `backend/gunicorn.conf.py` 的 master 单点注册钩子解决（注册只在 master 发生一次，worker 仅响应 `/actuator/health`）。是否在 SIT 启用、以及是否纳入 Libra/SIT 发布，仍需项目负责人确认。详见 DEPLOYMENT.md「服务注册中心（Consul / Eureka）」。

## 2. 已确认的问题

1. `create_app()` 在所有环境执行 `create_all`、`ALTER TABLE` 和业务数据归一化，绕开 Alembic revision，并可能在多 worker/多副本并发改库。
2. 当前 Alembic expand revision 假设旧业务表已存在，空库执行失败；生产又不能退回 app factory 自动建库。
3. 备份、恢复和 demo 清理链会泄露数据库 URL、遗漏 `candidate_demand_flows`、清空无关 uploads，并生成标准恢复脚本无法直接消费的快照。
4. `/bi/overview`、`/bi/staff/:id` 和管理提醒仍存在 job-scoped/个人绩效契约；Dashboard 把接口失败显示为 0 或“暂无卡点”。
5. AI 概览对 recruiter 的面试数量没有收敛到其可见 Demand/候选人范围。
6. 主面试官和反馈采用 check-then-insert，并发请求可能产生同轮多个 primary 或重复 assignment feedback。
7. 生产 CORS 只检查“非空”，`*`、`null` 或非法 origin 可穿透；BOSS CLI 默认可在请求路径从未锁定上游安装。
8. 前端镜像用 `npm install`，Node 版本约束只写在文档；本地 agent/生成物没有进入 `.gitignore`。

## 3. 架构决策

### 3.1 数据库生命周期唯一化

- `create_app()` 只在测试，或显式本地 debug + SQLite 模式执行 `create_all` 与旧库兼容补丁。
- MySQL/PostgreSQL、非 debug 环境不执行隐式 DDL、未知组织回填或业务数据归一化。
- 已存在的旧库继续由 `alembic upgrade head` 执行 expand。
- 空库使用独立、显式开关控制的 bootstrap 脚本：仅当数据库没有任何业务表时，按当前 metadata 创建 head schema 并 `stamp head`；发现部分业务表时拒绝猜测，不自动补全。
- RC/SIT 可显式允许空库 bootstrap；GA/生产默认禁止。生产初始化仍应由唯一 migration/bootstrap job 执行。
- `/api/health` 继续只是 liveness，文档不得把它描述为数据库/schema readiness。

### 3.2 恢复与清理闭环

- 连接串输出统一脱敏，日志只保留 dialect、host 和 database，不打印用户名、密码或 query secret。
- SQLite 备份使用 SQLite backup API，覆盖 WAL 一致性；快照目录具备无碰撞命名、manifest 和 archive 校验。
- uploads 打包拒绝符号链接、特殊文件、越界和不可移植路径；恢复先在临时目录完整校验，再原子切换。
- demo 清理先冻结主键集合并锁定命中行，包含 `candidate_demand_flows` 等 Demand 事实，只删除 demo 候选人明确引用的文件。
- cleanup 生成的快照必须能被标准恢复脚本直接读取。MySQL 自动恢复未实现前，`--confirm` 保持 fail closed；dry-run 只显示脱敏范围。

### 3.3 Demand 维度 BI 与真实错误态

- `bi_service` 成为团队总览、专员当前工作盘子和单 Demand 指标的唯一 owner。
- 当前阶段按 `(candidate_id, demand_id)` 最新流水计算；同一 Job 的兄弟 Demand 不能合并。
- 团队和专员接口只返回进度、卡点、当前责任和待补反馈，不返回个人通过率、转化率、排名或“绩效”字段。
- 所有提醒携带 `demand_id`，深链使用 `/pipeline?demand=...`。
- Dashboard 对每个数据分区保留 loading/error 状态；失败时显示“数据暂不可用 + 重试”，不得展示 0 或成功空态。
- AI 概览复用同一可见范围，recruiter 只能统计自己可读 Demand 下的面试。

### 3.4 面试并发不变量

- 新增 nullable `primary_slot`：有效主面试官写入 `round_sequence`，辅助或取消任务为 NULL；唯一索引 `(org_id, demand_id, candidate_id, primary_slot)` 在 MySQL/PostgreSQL/SQLite 上阻止并发双 primary。
- `InterviewFeedback.assignment_id` 增加唯一索引，legacy NULL 允许多行；并发重复反馈捕获 `IntegrityError` 后返回已存在结果。
- API 在检查主面试官与面试官时间冲突前锁定稳定的 Flow/User 父行，数据库约束作为最终防线。
- 新 Alembic revision 负责列、回填、重复检测和索引；发现存量重复时中止迁移并输出冲突，不自动挑选赢家。

### 3.5 安全与构建卫生

- 生产 origin 必须是合法 `http(s)://host[:port]`，拒绝 `*`、`null`、路径、query 和 fragment；启动护栏与部署自检复用同一规则。
- `BOSS_CLI_AUTO_INSTALL` 默认 false；运行时未显式配置固定 CLI 时 fail closed。
- 前端 Docker 使用 `npm ci`；`package.json` 声明 Vite 8 对 Node 的约束。
- `.gitignore` 排除 `.workbuddy/` 和 `outputs/`；规划文档和产品材料不与发布代码混合提交。

## 4. 错误处理与兼容

- 生产 schema 不符合预期时拒绝启动或由 Alembic/bootstrap job 失败，不在 worker 内尝试修复。
- BI legacy job-only 请求仅在能解析唯一 Demand 时代理；歧义继续返回 409 `demand_id_required`。
- 并发唯一约束冲突返回 409 和稳定 code，客户端可刷新已有任务/反馈。
- cleanup/restore 在产物缺失、校验失败、上传切换失败或不支持的 MySQL 自动恢复场景中停止，不把部分成功当作完成。

## 5. 验证与交付

每个行为先写失败测试，再做最小实现。最终门禁：

- 后端 + `base_agent` 全量 pytest；
- Python 3.12 新鲜依赖环境验证；
- 前端 `npm test`、lint、typecheck、build；
- Alembic：空库 bootstrap、旧库 expand、head 升级、重复 primary 阻断；
- 备份/恢复/cleanup 专项与数据库 URL 脱敏；
- 同一 Job 两个 Demand 的 BI、提醒、AI scope；
- `git diff --check`、依赖审计和只包含本轮文件的提交审查；
- 推送前重新 `git ls-remote ... refs/heads/test`，远端若不再是本轮基线则停止并重新评估；只允许 fast-forward `HEAD:test`。

相关行为变化同步到 `README.md`、`RUNNING.md`、`DEPLOYMENT.md`、PRD、SDD、BI 设计、试点/上线清单、Libra 路线和文档地图。
