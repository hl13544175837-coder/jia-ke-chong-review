# `demand_id` 迁移与回滚手册

> **状态（2026-07-10）：** demand-scoped P0 已推送至 CFPD `test/api`，当前正在 Libra/SIT 验收发布。首次发布已证明新前端资产在线，但旧 schema 使新后端无法接管；因此 RC/SIT server 镜像新增了 Gunicorn 前单次迁移 entrypoint，并固定执行 `alembic -c /app/backend/alembic.ini upgrade head`，不依赖 K8S 运行时工作目录。`GA`/生产镜像默认关闭该开关，生产仍严格执行本手册的备份、唯一 migration job 和回滚门禁。

> **当前代码边界：** 仓库现只有 additive Expand revision `20260710_01`，没有 Strict revision；SQLite 已有 upgrade/downgrade 往返用例，MySQL/PostgreSQL 尚无同引擎证据。当前 backfill 只能回填到已存在的 Demand，不自动创建 B 类“历史迁移需求”；当 B 类不为 0 时必须先交付并评审专用创建迁移，不得手填 SQL。在 Strict revision、B 类处理和同引擎验证补齐前，Phase D 结论必须是 NO-GO。

## 1. 目标与非目标

本迁移将主流程、面试、Offer/disposition、通知、审计与 BI 的归属键从隐式 `job_id` 切换为显式 `demand_id`，同时保留 `Job` 作为可复用职位/JD 画像。迁移必须保证：

- 每条历史业务事实最多映射一个 Demand，不猜测歧义数据。
- 每条已映射事实满足 `fact.org_id == demand.org_id` 和 `fact.job_id == demand.job_id`。
- P0 每个候选人只有一个 active `CandidateDemandFlow`，且与 `Candidate.current_demand_id` 一致。
- 旧调用只在 Job 能唯一解析 Demand 时兼容；歧义返回 409 `demand_id_required`。
- 一旦允许同一 Job 并行多 Demand，不再允许只回滚到旧镜像。

本手册不执行 P1 打印/归档，不开放 BOSS、人才地图、OA 占位或正式绩效。

## 2. 角色与变更窗口

| 角色 | 必须明确的 Owner |
|---|---|
| Release Owner | 决定开始/暂停/继续/回滚，保证只有一个 migration job |
| DBA / Database Owner | 备份、同引擎恢复演练、锁/容量评估、迁移执行和数据校验 |
| Backend Owner | Alembic revision、audit/backfill/verify 脚本、兼容路径和应用版本 |
| Frontend Owner | 显式 `demand_id` 传递、旧静态资源退出、四角色界面验收 |
| Product/Data Owner | 批准 B/C/D 类映射，确认 Demand/HC/负责人与 BI 口径 |
| Evidence Recorder | 归档命令、版本、时间、报告、校验和、截图、决策人与 cutover marker |

正式发布前必须预约完整窗口，禁止让 gunicorn/Flask worker 或应用请求执行 Demand 多表 DDL/回填。当前数据可丢弃的 SIT 例外是：RC 容器 entrypoint 在 Gunicorn 起 worker 之前运行一次 additive Expand，且发布窗口不并发扩容新副本。

## 3. 发布前硬门禁

任一项不满足都必须停止：

- [ ] CFPD `test` SHA、Libra CommitID、待发布镜像/后端版本和前端 asset hash 已对齐。
- [ ] Alembic revision 已通过 SQLite 文件库测试，并在 SIT 同引擎数据库上完成集成验证。
- [ ] `audit_demand_scope.py` 可幂等运行，报告可用 JSON/CSV 归档。
- [ ] `backfill_demand_scope.py` 默认 `--dry-run`，只应用已批准映射，重跑不创建重复 Demand/Flow/事实。
- [ ] `verify_demand_scope.py` 能检查 null、孤儿、org/job 不一致、多 active flow、数量对账和歧义记录。
- [ ] 数据库快照、uploads 快照和发布证据快照已生成，三者共享同一 backup ID/时间点。
- [ ] 已在同引擎临时库完成恢复演练；若 SIT/生产是 MySQL，已有 MySQL 实际 restore 证据或 DBA 可审计恢复证据。
- [ ] 维护/停写开关、客户端缓存清理、旧 worker 退出和紧急联系链已演练。
- [ ] 四角色、空态、错误态、反向操作、原始简历真源、AI 写入禁止和 BI 口径用例已通过。

## 4. 备份与同引擎恢复演练

### 4.1 通用证据清单

每次备份/恢复保存：

- backup ID、源环境、数据库引擎与精确版本。
- 开始/结束时间、命令或 DBA 作业 ID、执行人、退出码。
- DB dump/snapshot、uploads archive、发布元数据的大小与 SHA-256。
- 恢复到新建临时库后的表行数、Alembic revision、约束/索引检查和核心查询结果。
- 原始简历文件可读验证。DB 恢复成功不代表 uploads 恢复成功。
- 恢复耗时、实测 RTO/RPO、验证结论和 DBA/Release Owner 签字。

### 4.2 MySQL 硬门禁

MySQL DDL 存在隐式提交，必须逐 revision 执行和验证。以下命令只是操作模板，实际参数由 DBA 从密钥管理器/运维系统注入，禁止把密码写入 shell history 或文档：

```bash
mysqldump --single-transaction --routines --triggers --events \
  --set-gtid-purged=OFF --host=<host> --user=<user> <source_db> \
  > <backup_id>.sql

mysql --host=<host> --user=<user> -e 'CREATE DATABASE <restore_db>'
mysql --host=<host> --user=<user> <restore_db> < <backup_id>.sql
```

恢复后必须在 `<restore_db>` 上运行行数/约束校验和 Demand verify 脚本。仅拿到 dump 文件、仅在 SQLite 上复制数据，或只收到“备份成功”通知，都不满足 MySQL 门禁。

### 4.3 PostgreSQL 与 SQLite

- PostgreSQL 大表索引评估并发创建，FK 可先创建后验证；具体策略体现在 revision 和 DBA 变更单中。
- SQLite 仅用于开发/演示，使用 batch migration；SQLite 绿色不能代替 MySQL/PostgreSQL 集成和恢复证据。

## 5. Phase A — Expand

### 5.1 执行

1. 将应用保持在与旧 schema 兼容的版本，不开启并行 Demand。
2. 由唯一 release migration job 执行；当前 RC/SIT 则由容器 entrypoint 在 Gunicorn 前执行同一命令：

   ```bash
   cd backend
   alembic current
   alembic upgrade 20260710_01
   alembic current
   ```

3. 检查新建 Demand/flow 表、nullable `demand_id`、`current_demand_id`、面试轮次/primary 字段、索引、唯一约束与 FK。
4. 确认新应用 worker 只校验 revision，不执行 `ALTER TABLE`。

### 5.2 停止条件

- revision 失败或不一致。
- 目标引擎不支持 revision 中的索引/FK 策略。
- 迁移被多 worker 重复触发。
- 锁等待、复制延迟或容量增长超出 DBA 阈值。

### 5.3 回滚

优先回滚应用并保留 additive schema，不在发布窗口中为了“干净”立即 drop 新列/新表。只有 revision downgrade 已在同引擎演练且新表确认无业务写入时，才可由 DBA 执行。

## 6. Phase B — Audit 与 Backfill

### 6.1 审计分类

审计脚本按 `(org_id, candidate_id, job_id)` 组装事实 bundle：

| 类别 | 判定 | 处理 |
|---|---|---|
| A | Job 只有一个 Demand | 可自动映射，但仍要输出依据 |
| B | 有流程事实但没有 Demand | 生成“历史迁移需求”候选，须 Product/Data Owner 批准后创建 |
| C | 多个 Demand，但存在唯一且不重叠的时间证据 | 只按已批准规则映射，保留证据区间 |
| D | 多个 Demand 且时间重叠/无可靠边界 | 导出人工映射表，禁止脚本猜测 |
| E | 跨组织、孤儿外键、时间线异常或 Job 不一致 | 直接阻断迁移，修复源数据后重跑 |

### 6.2 命令顺序

参数以脚本 `--help` 为真源，下列为发布流程要求：

```bash
python3 backend/scripts/audit_demand_scope.py --database <database> --output <audit-report>
python3 backend/scripts/backfill_demand_scope.py --database <database> --mapping <approved-mapping> --dry-run
python3 backend/scripts/backfill_demand_scope.py --database <database> --mapping <approved-mapping> --apply
python3 backend/scripts/verify_demand_scope.py --database <database> --output <verify-report>
```

回填顺序固定为：

1. Demand 主数据和创建时快照。
2. `CandidateDemandFlow` 和 `Candidate.current_demand_id`。
3. Pipeline 流水。
4. Interview / Assignment / Feedback。
5. Offer / Disposition。
6. Event / Notification / UploadBatch 等辅助事实。

当前脚本已覆盖 Pipeline / Interview / Assignment / Feedback / Offer / Disposition，以及能从 payload 识别 candidate + job 的 Event；Notification、UploadBatch 的历史映射/排除对账还未实现。这两表不得被 `verify ok` 隐含宣称为“已全量迁移”；严格切换前必须补齐显式映射或已批准的非 Demand 排除清单与数量对账。

每条记录都要产出“旧表 + 旧记录 ID → demand_id → 映射分类/依据 → 批准人”。任一 D/E 未清零，禁止进入严格切换。

### 6.3 对账

- 每张事实表的迁移前总数 = 已映射 + 明确保留为 null 的非 Demand 记录 + 已批准排除记录。
- 核心事实 `demand_id IS NULL` = 0（严格切换前）。
- 孤儿 Demand/FK、跨 org、`job_id != demand.job_id`、重复 `(org,candidate,demand)` flow、多 active flow = 0。
- 按 Demand 重算的最新阶段与流程投影一致。
- `transferred` 不计入 rejected，面试反馈不产生流程推进流水。

## 7. Phase C — Dual-write / Shadow-read

1. 部署显式传递 `demand_id` 且对旧 schema 兼容的应用。
2. 新写入同时维持 Demand 真源和必要的旧兼容字段，但不将 Job 状态/owner 与 Demand 反向同步。
3. 新读路径按 Demand 返回；后台影子读与旧结果对比，差异不向普通用户暴露，但必须写入审计报告。
4. 在尚未开启同 Job 多 Demand 的窗口内，旧 Job-only 调用可唯一解析；有歧义时立即 409，不降级为默认 Demand。
5. 持续对账 pipeline、journey、interview、offer、audit 和 BI，并确认 AI 不可达主流程写服务。

此阶段可回滚兼容应用并保留 additive schema/已回填数据，前提是尚未接受同 Job 多 Demand 的新业务事实。

## 8. Phase D — Strict Cutover

> 当前仓库未提供 Strict revision，本节是发布契约，不是现在可执行的命令。不得把 Expand revision 或当前 `verify ok` 当作 Strict cutover 完成证据。

### 8.1 切换前

- 进入维护/写入冻结，排空旧 worker 和异步任务。
- 重新生成同一 backup ID 的 DB/uploads/release metadata 快照。
- 重跑 audit/backfill dry-run/verify，确认 D/E = 0、核心 null = 0、对账结果与已批准报告一致。
- 确认前端 asset hash 和后端版本对齐，不允许旧静态资源继续发送 Job-only 请求。

### 8.2 切换

1. 由唯一 migration job 应用 strict revision（实际 revision ID 以代码为准），将核心 Demand 归属约束收紧。
2. 部署 Demand-scoped 后端与前端，健康检查同时校验应用版本和 schema revision。
3. 记录 cutover marker，至少包含：

   ```text
   environment=
   cutover_at_utc=
   cfpd_test_sha=
   libra_commit_id=
   backend_version_or_image_digest=
   frontend_asset_hash=
   alembic_revision=
   audit_report_sha256=
   backfill_report_sha256=
   verify_report_sha256=
   database_backup_id=
   uploads_backup_id=
   restore_drill_evidence_id=
   release_owner=
   dba_owner=
   parallel_demands_enabled=false
   ```

4. 完成冒烟后，由 Release Owner 显式把 marker 中 `parallel_demands_enabled` 改为 `true`。该时点就是不可只回滚旧镜像的边界。

### 8.3 SIT 必测矩阵

| 场景 | 期望 |
|---|---|
| 同 Job 建两个 Demand | 城市/部门/HC/owner 独立，列表、详情、流程、面试、Offer、BI 不串账 |
| 招聘专员 | 只管理受权 Demand；无 Demand/无候选人/无面试官时知道下一步 |
| 招聘经理 | 可看 Demand 进度、瓶颈和当前责任，不出现人员排名/奖金结论 |
| 面试官 | 只看自己的安排/原始简历/本轮反馈，无流程推进/Offer/淘汰入口 |
| 管理员 | 可查 Demand-indexed 审计，跨 org 访问仍失败并留痕 |
| 转 Demand | 源 `transferred`，目标 `pending`，owner 跟随目标，失败无部分写入，不计淘汰 |
| Demand owner 转派 | active flow/当前 owner 改变，Job owner/历史 actor 不改 |
| 面试轮次 | 每轮一名 primary；辅助反馈不完成轮次；反馈不推进主流程 |
| AI | 只解析/匹配/总结/建议；无法推进、淘汰、Offer、转派或关闭 Demand |
| 原始简历 | 原始/结构化/匹配三视图可分开查看，原文不被 AI 覆盖 |
| 旧 Job-only 请求 | 唯一可解析时兼容；多 Demand 歧义时返回 409 `demand_id_required` |
| 反向操作 | 误推进可追加修正，误关闭可恢复，误负责人可转派，历史不删除 |

### 8.4 切换后观察

- 监控 409 `demand_id_required`、Demand 404/403、null/constraint 错误、转 Demand 事务回滚、BI 对账差异和面试归属错误。
- 运行中出现任一跨 org、多 active flow、Job/Demand 不一致或 AI 主流程写入，立即停写并升级为 P0 事故。
- 确认旧 worker 全部退出、浏览器/CDN 旧静态资源不再命中。

## 9. Phase E — Contract（非 P0 同次发布）

Contract 必须在严格切换稳定至少一个发布周期后单独立项，包括删除旧写路径、旧兼容字段和废弃 API。执行前必须证明无旧客户端流量，并再次完成同引擎备份/恢复演练。

## 10. 回滚决策表

| 当前检查点 | 旧代码能否运行 | 允许的回滚 |
|---|---|---|
| Expand 完成，未回填 | 可以 | 回滚应用，保留 additive schema；必要时用已演练 downgrade |
| Backfill / Dual-write，未开放兄弟 Demand | 可以，但必须是兼容版本 | 回滚兼容应用，保留新表/列和已回填数据，修复后前向重跑 |
| Strict revision 已执行，`parallel_demands_enabled=false` | 通常不可直接 | 优先前向修复；若必须回退，停写后整体恢复切换前 DB + uploads |
| `parallel_demands_enabled=true` | 不可以 | 前向修复；或停写、明确接受丢失切换后数据，整体恢复切换前 DB + uploads |
| Contract 已 drop 旧字段/路径 | 不可以 | 新的前向迁移，或已演练的整库恢复；不得只切旧镜像 |

整体恢复时的固定顺序：停止入口和所有 worker → 锁定事故时间线→ 保存事故现场快照 → 恢复切换前 DB → 恢复同 backup ID 的 uploads → 部署与该 schema 匹配的应用 → 校验行数/文件/版本 → 四角色冒烟 → 由 Release Owner 决定恢复流量。

## 11. 发布证据包模板

```text
environment:
release_window:
release_owner:
dba_owner:
product_data_approver:

cfpd_remote: git@git.ymdd.tech:cfpd/zhipin-mvp.git
cfpd_test_sha:
libra_commit_id:
backend_version_or_image_digest:
frontend_asset_hash:
alembic_before:
alembic_after:

audit_report_path_sha256:
approved_mapping_path_sha256:
backfill_dry_run_path_sha256:
backfill_apply_path_sha256:
verify_report_path_sha256:
category_counts_A_B_C_D_E:
core_null_count:
orphan_count:
cross_org_count:
job_demand_mismatch_count:
multi_active_flow_count:

database_engine_and_version:
database_backup_id_sha256:
uploads_backup_id_sha256:
restore_drill_evidence_id:
restore_elapsed:
measured_rpo_rto:

cutover_at_utc:
parallel_demands_enabled_at_utc:
post_cutover_observation_window:
four_role_smoke_evidence:
same_job_two_demands_evidence:
legacy_409_evidence:
ai_negative_write_evidence:
bi_drilldown_reconciliation_evidence:
decision: GO | STOP | FORWARD_FIX | FULL_RESTORE
decision_reason:
approvals:
```

## 12. 最终 GO / NO-GO

只有以下结论同时成立才可 GO：

1. 待发布代码、CFPD SHA、Libra CommitID、后端版本、前端 asset hash 和 Alembic revision 相互对齐。
2. audit/backfill/verify 报告可追溯，D/E、核心 null、孤儿、跨 org、Job/Demand 不一致、多 active flow 全部为 0。
3. 同引擎恢复演练成功；MySQL 环境有真实 MySQL restore 证据。
4. 同 Job 两 Demand、四角色、空/错/反向路径、转 Demand、面试、原始简历、AI 负向和 BI 下钻全部通过。
5. cutover marker 已归档，所有人理解 `parallel_demands_enabled=true` 之后不能只回滚旧镜像。

如任一证据缺失，结论只能是 NO-GO，不得用“代码构建成功”或“Libra 绿色”代替数据迁移、恢复和用户流程证据。
