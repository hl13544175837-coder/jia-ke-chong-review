# Pre-merge P0 Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `ee231f4` 基线上关闭 schema、恢复、Demand-BI、面试并发和生产配置 P0，验证后 fast-forward 推送 CFPD `test`，不触发 SIT 发布。

**Architecture:** 保持 React + Flask 模块化单体。生产 schema 只由 Alembic/受控 bootstrap 管理；BI 统一进入 demand-scoped service；并发不变量由父行锁和数据库唯一索引共同保证；恢复脚本 fail closed。

**Tech Stack:** Flask 3.1, SQLAlchemy 2.0, Alembic, pytest, React 18, TypeScript 5.9, Vite 8, npm 10.

---

## Task 1: 生产 schema 生命周期与空库 bootstrap

**Files:**
- Create: `backend/scripts/bootstrap_database.py`
- Create: `backend/tests/test_schema_lifecycle.py`
- Modify: `backend/app/__init__.py`
- Modify: `backend/docker-entrypoint.sh`
- Modify: `backend/Dockerfile`
- Modify: `Makefile`

- [ ] **Step 1: 写失败测试，证明生产 app factory 不创建业务表**

```python
def test_production_app_factory_does_not_bootstrap_empty_database(tmp_path):
    app = create_app(ProductionSQLiteConfig.for_path(tmp_path / "empty.db"))
    with app.app_context():
        assert "users" not in inspect(db.engine).get_table_names()
```

- [ ] **Step 2: 运行 RED**

Run: `python3 -m pytest backend/tests/test_schema_lifecycle.py -q`
Expected: FAIL，因为当前 `create_app()` 自动创建 `users` 等表。

- [ ] **Step 3: 把兼容建表限制到 testing 或 debug+SQLite**

```python
def _should_run_local_schema_compat(app):
    uri = str(app.config.get("SQLALCHEMY_DATABASE_URI") or "")
    return bool(app.config.get("TESTING")) or (
        bool(app.config.get("FLASK_DEBUG")) and uri.startswith("sqlite:")
    )
```

`create_app()` 只在该函数为真时调用 `db.create_all()` 和 `_ensure_*`/归一化函数。

- [ ] **Step 4: 写空库 bootstrap 的 RED 测试**

```python
def test_bootstrap_empty_database_creates_head_schema_and_revision(tmp_path):
    result = bootstrap_database(database_url(tmp_path / "fresh.db"), allow_empty=True)
    assert result.status == "bootstrapped"
    assert read_revision(tmp_path / "fresh.db") == current_alembic_head()
```

同时测试：开关关闭拒绝；发现部分业务表拒绝；旧库返回 `existing_schema` 交给 Alembic expand。

- [ ] **Step 5: 实现受控 bootstrap + stamp**

`bootstrap_database.py` 只在无业务表且显式允许时通过当前 metadata 建 head schema，再调用 Alembic `stamp head`；部分 schema 必须报错，不执行补表。

- [ ] **Step 6: 接入容器入口**

```sh
if [ "${ALLOW_EMPTY_DATABASE_BOOTSTRAP:-false}" = "true" ]; then
    python /app/backend/scripts/bootstrap_database.py --allow-empty
fi
alembic -c /app/backend/alembic.ini upgrade head
```

RC 默认允许“真正空库”bootstrap，GA 默认 false；旧库仍执行 Alembic。

- [ ] **Step 7: 跑专项 GREEN 并提交**

Run: `python3 -m pytest backend/tests/test_schema_lifecycle.py backend/tests/test_schema_compatibility.py backend/tests/test_demand_scope_migration.py backend/tests/test_deployment_artifacts.py -q`

Commit files explicitly with message: `fix: enforce controlled database lifecycle`.

## Task 2: 面试 primary 与反馈并发唯一性

**Files:**
- Create: `backend/migrations/versions/20260711_02_interview_uniqueness.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/api/interview.py`
- Modify: `backend/app/services/interview_workflow_service.py`
- Modify: `backend/tests/test_demand_interview_rounds.py`
- Modify: `backend/tests/test_demand_scope_migration.py`

- [ ] **Step 1: 写模型与 API RED 测试**

```python
def test_two_primary_assignments_for_same_demand_round_conflict(...):
    first = create_primary(round_sequence=1)
    second = create_primary(round_sequence=1, interviewer_id=other_id)
    assert first.status_code == 201
    assert second.status_code == 409
    assert second.get_json()["code"] == "primary_interviewer_conflict"
```

再写同一 `assignment_id` 重复反馈返回原记录、不会生成第二行的测试。

- [ ] **Step 2: 运行 RED**

Run: `python3 -m pytest backend/tests/test_demand_interview_rounds.py -q`
Expected: FAIL，模型没有数据库唯一 slot，反馈 assignment_id 也不唯一。

- [ ] **Step 3: 添加跨数据库安全列与索引**

```python
primary_slot = db.Column(db.Integer, nullable=True)
db.Index(
    "uq_interview_assignment_primary_slot",
    "org_id", "demand_id", "candidate_id", "primary_slot",
    unique=True,
)
```

有效 primary 的 `primary_slot=round_sequence`；辅助或取消任务为 NULL。为 `InterviewFeedback.assignment_id` 建 nullable unique index。

- [ ] **Step 4: 迁移先检测存量重复再建索引**

revision `20260711_02` 对 active primary 回填 slot；重复组存在时抛出明确错误，不自动删除/选主。downgrade 删除索引和 slot。

- [ ] **Step 5: 锁定父行并处理 IntegrityError**

创建 assignment 前按固定顺序 `SELECT ... FOR UPDATE` 锁 active `CandidateDemandFlow` 与 interviewer `User`；唯一冲突 rollback 后返回稳定 409。反馈唯一冲突返回已存在 feedback 及 `deduplicated=true`。

- [ ] **Step 6: 跑专项 GREEN 并提交**

Run: `python3 -m pytest backend/tests/test_demand_interview_rounds.py backend/tests/test_demand_scope_migration.py backend/tests/test_interview_loop.py -q`

Commit: `fix: enforce interview round uniqueness`.

## Task 3: 备份、恢复与 demo 清理闭环

**Files:**
- Create: `backend/scripts/upload_archive_validation.py`
- Create: `backend/tests/test_pilot_data_recovery.py`
- Modify: `backend/scripts/backup_pilot_data.py`
- Modify: `backend/scripts/restore_pilot_data.py`
- Modify: `backend/scripts/cleanup_demo_data.py`

- [ ] **Step 1: 写 RED 测试覆盖真实缺口**

```python
def test_cleanup_removes_matching_candidate_demand_flows_only(...):
    run_cleanup_confirm()
    assert count("candidate_demand_flows", demo_candidate_id) == 0
    assert count("candidate_demand_flows", real_candidate_id) == 1
```

另外覆盖：连接串不含密码；cleanup 快照可由 restore 读取；WAL 快照；同秒目录不碰撞；archive 越界/符号链接/特殊文件；上传切换失败不报告成功；MySQL confirm 在连接前拒绝。

- [ ] **Step 2: 运行 RED**

Run: `python3 -m pytest backend/tests/test_pilot_data_recovery.py backend/tests/test_deployment_artifacts.py -q`

- [ ] **Step 3: 实现 archive 校验与 SQLite 一致备份**

复用 `upload_archive_validation.py` 完成 member/path/type 校验；SQLite 使用 `sqlite3.Connection.backup()`，快照写 manifest 后再标记完成。

- [ ] **Step 4: 修复 cleanup 计划与产物布局**

冻结 demo user/job/demand/candidate/flow 主键；delete order 在 Demand 之前删除 `candidate_demand_flows`；uploads 只删除 demo candidate `raw_file_path` 指向的安全文件；快照根目录直接生成标准 `uploads.tar.gz`。

- [ ] **Step 5: 恢复先完整验证再切换**

数据库产物和 uploads archive 都存在且通过校验后才开始恢复；uploads 解压到 sibling 临时目录，再用可回滚 rename 切换。

- [ ] **Step 6: 跑专项 GREEN 并提交**

Run: `python3 -m pytest backend/tests/test_pilot_data_recovery.py backend/tests/test_deployment_artifacts.py -q`

Commit: `fix: make pilot cleanup recoverable`.

## Task 4: Demand-scoped 团队/专员 BI 与 AI scope

**Files:**
- Modify: `backend/app/services/bi_service.py`
- Modify: `backend/app/api/bi.py`
- Modify: `backend/app/services/agent_service.py`
- Create: `backend/tests/test_bi_operational_overview.py`
- Modify: `backend/tests/test_demand_bi_isolation.py`
- Modify: `backend/tests/test_access_control_hardening.py`

- [ ] **Step 1: 写 sibling Demand RED 测试**

```python
def test_team_overview_keeps_sibling_demands_separate(...):
    payload = get_overview_as_manager()
    assert payload["purpose"] == "operational_collaboration"
    assert payload["funnel"]["pending"] == 1
    assert payload["funnel"]["interview"] == 1
    assert all("demand=" in item["action_path"] for item in payload["alerts"])
    assert "staff" not in payload
```

专员详情断言只返回 current workload，不出现 `performance`、pass rate、conversion rate；AI recruiter summary 不统计他人 Demand 面试。

- [ ] **Step 2: 运行 RED**

Run: `python3 -m pytest backend/tests/test_bi_operational_overview.py backend/tests/test_demand_bi_isolation.py backend/tests/test_access_control_hardening.py -q`

- [ ] **Step 3: 在 bi_service 聚合 Demand 事实**

新增 `build_team_operational_overview(org_id)` 与 `build_staff_operational_workload(org_id, hr_id)`；复用 `build_demand_operational_metrics`，只聚合 funnel、stage age、outstanding feedback、HC 和当前 owner。

- [ ] **Step 4: API 移除个人绩效契约**

`/bi/overview` 返回 `purpose/purpose_label/funnel/alerts/demands`；`/bi/staff/:id` 返回 `workload`。提醒必须含 `demand_id` 并深链 `/pipeline?demand=<id>&candidate=<id>`。

- [ ] **Step 5: AI 复用可见范围**

recruiter interview count 同时受当前 org、visible Demand 和 scoped candidate 约束；manager/admin 保持当前组织总量。

- [ ] **Step 6: 跑专项 GREEN 并提交**

Run: `python3 -m pytest backend/tests/test_bi_operational_overview.py backend/tests/test_demand_bi_isolation.py backend/tests/test_access_control_hardening.py -q`

Commit: `fix: align BI with demand ownership`.

## Task 5: Dashboard loading/error 与工作盘子文案

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/tests/pilot_dashboard_lightweight_ux.test.mjs`
- Create: `frontend/tests/dashboard_data_truth_contract.test.mjs`

- [ ] **Step 1: 写 RED contract**

断言 Dashboard 消费 `loading/error/reload`，失败文案包含“数据暂不可用”，管理提醒的成功空态只在请求成功且数组为空时出现；源码不再包含 `RecruiterPerformancePanel` 或 `performance`。

- [ ] **Step 2: 运行 RED**

Run: `cd frontend && node tests/dashboard_data_truth_contract.test.mjs`

- [ ] **Step 3: 实现分区状态**

`useDashboardStats` 返回 `{stats, loading, errors, reload}`；请求失败把对应分区设为 unavailable，不写入 `EMPTY_STATS` 成功值。KPI 加载显示 `—`，失败显示错误卡和重试。

- [ ] **Step 4: 把专员“绩效”改为“当前工作盘子”**

消费后端 `workload`：活动 Demand、活动候选人、业务待反馈、面试中、Offer、待补反馈；文案明确“不用于历史绩效”。

- [ ] **Step 5: 跑前端专项和四门禁并提交**

Run: `cd frontend && npm test && npm run lint && npm run typecheck && npm run build`

Commit: `fix: preserve dashboard data truth`.

## Task 6: CORS、BOSS、URL 脱敏与构建卫生

**Files:**
- Create: `backend/app/config_validation.py`
- Modify: `backend/app/__init__.py`
- Modify: `backend/app/config.py`
- Modify: `backend/run.py`
- Modify: `backend/scripts/check_pilot_readiness.py`
- Modify: `backend/.env.example`
- Modify: `backend/lightweight-pilot.env.example`
- Modify: `frontend/package.json`
- Modify: `frontend/Dockerfile`
- Modify: `.gitignore`
- Create: `backend/tests/test_config_validation.py`

- [ ] **Step 1: 写 CORS 与脱敏 RED 测试**

```python
@pytest.mark.parametrize("origin", ["*", "null", "ftp://x", "https://x/path"])
def test_production_rejects_unsafe_cors_origin(origin): ...

def test_database_url_display_redacts_credentials():
    assert safe_database_label("mysql+pymysql://u:p@db/x?token=s") == "mysql+pymysql://db/x"
```

再断言未设置 `BOSS_CLI_AUTO_INSTALL` 时为 false。

- [ ] **Step 2: 运行 RED**

Run: `python3 -m pytest backend/tests/test_config_validation.py -q`

- [ ] **Step 3: 实现共享校验**

`validate_cors_origins()` 只接受无 path/query/fragment 的 http(s) origin；生产启动与 `check_pilot_readiness.py` 共用。`safe_database_label()` 只返回 dialect/host/database。

- [ ] **Step 4: 默认关闭运行时 BOSS 安装**

Config 默认 false；示例环境保持 false。固定 CLI 缺失时返回受控错误，不执行网络安装。

- [ ] **Step 5: 固定前端构建契约与 Git 排除**

Docker 使用 `npm ci`；`package.json.engines.node` 写 `>=20.19.0 <21 || >=22.12.0`；`.gitignore` 增加 `.workbuddy/`、`outputs/`。

- [ ] **Step 6: GREEN 并提交**

Run: `python3 -m pytest backend/tests/test_config_validation.py backend/tests/test_deployment_artifacts.py -q && cd frontend && npm ci && npm run build`

Commit: `fix: harden runtime configuration`.

## Task 7: 文档真源收口

**Files:**
- Modify: `README.md`
- Modify: `RUNNING.md`
- Modify: `DEPLOYMENT.md`
- Modify: `docs/README.md`
- Modify: `docs/01_PRD.md`
- Modify: `docs/03_BI看板设计.md`
- Modify: `docs/06_试点上线检查清单.md`
- Modify: `docs/07_上线部署前关键清单_给AI执行.md`
- Modify: `docs/08_Libra_SIT发布路线.md`
- Modify: `docs/SDD-智聘招聘系统-v1.0.md`
- Modify: `docs/10_demand_id迁移与回滚手册.md`

- [ ] 更新状态：代码源候选与已部署 SIT 分开，不能把 push 描述成发布。
- [ ] 明确生产 app factory 不改 schema、空库 bootstrap 开关和 `/api/health` 只做 liveness。
- [ ] BI 删除个人绩效口径，改为团队/专员当前工作盘子和 Demand 下钻。
- [ ] 记录 cleanup/restore 支持边界，MySQL 自动 confirm 继续 fail closed。
- [ ] 统一 Python 3.11–3.13、推荐/容器 3.12；前端 dist 不提交。
- [ ] 明确 OA/Consul、技术栈大版本升级和剩余 P1 不属于本轮。
- [ ] 运行 `rg -n '个人绩效|同一 Job.*一个|create_all|Python 3\.9|提交 frontend/dist'`，逐条判断并消除误导。
- [ ] 提交：`docs: align premerge P0 closeout guidance`。

## Task 8: 全量验证、审查与 fast-forward 推送

**Files:** 本轮全部已修改文件，不新增范围。

- [ ] `python3 -m pytest backend/tests base_agent/tests -q`
- [ ] 在临时 Python 3.12 环境安装 `backend/requirements.txt` 并跑同一套测试。
- [ ] `cd frontend && npm ci && npm test && npm run lint && npm run typecheck && npm run build && npm audit --audit-level=moderate`
- [ ] 跑 schema、恢复、BI、并发专项的显式命令并保存退出码/数量。
- [ ] `git diff --check`、`git status --short`、`git log --oneline ee231f4..HEAD`、逐提交 diff 审查。
- [ ] 使用代码审查子任务检查正确性、权限、数据损坏和文档一致性；修复后重跑受影响测试。
- [ ] 重新执行 `git ls-remote git@git.ymdd.tech:cfpd/zhipin-mvp.git refs/heads/test`。
- [ ] 仅当远端仍等于 `ee231f4` 且全部门禁通过时执行：`git push git@git.ymdd.tech:cfpd/zhipin-mvp.git HEAD:test`。
- [ ] 推送后再次 `ls-remote` 验证远端 SHA 等于本地 HEAD；不启动 Libra/SIT。
