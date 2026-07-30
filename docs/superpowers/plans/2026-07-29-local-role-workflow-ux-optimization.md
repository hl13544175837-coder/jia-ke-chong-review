# 本地多角色招聘闭环优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只依赖本地前端、本地后端和 `runtime/zhipin-demo.db`，打通招聘专员、一面面试官、二面面试官的完整协作流程，并完成效率与界面统一优化。

**Architecture:** 继续使用现有 Flask + SQLite + React 架构，不增加外部服务。第一批先解决账号、权限和跨轮次接力；第二批利用现有面试、通知和评价数据提高处理效率；第三批只做非破坏性的数据提示和界面收口。所有数据库改动必须先备份，所有功能必须先写失败测试，再写最小实现。

**Tech Stack:** Python 3.11、Flask、SQLAlchemy、SQLite、pytest、React 19、TypeScript、Vite、Tailwind CSS、Node test runner。

## 执行状态（2026-07-30）

| 批次 | 状态 | 已完成验证 |
|---|---|---|
| 第一批 | 已完成 | 本地账号、二面改派、所属面试官确认、跨轮评价隔离；独立 Agent 复审通过 |
| 第二批 | 已完成 | 本地提醒、结构化评价、轮次双端绑定、单条快捷安排；独立 Agent 复审通过 |
| 第三批 | 已完成 | 详情三页签、只读重复提示、标题/页签/登录文案统一；独立 Agent 复审通过 |
| 最终回归 | 已完成 | 后端 626 项、前端 32 项、类型/代码规范/构建、数据库完整性、三角色 Tabbit 验收全部通过；最终独立复审无阻断问题 |

---

## 1. 执行边界

| 项目 | 本计划规定 |
|---|---|
| 允许使用 | 本地 Flask 接口、本地 React 前端、本地 SQLite、本地登录桥 |
| 明确不接 | 企业微信、公司统一权限、短信、邮件、远端通知、外部日历 |
| 当前数据库 | `runtime/zhipin-demo.db` |
| 数据库备份 | `runtime/backups/zhipin-demo.pre-local-role-workflow.db` |
| 当前前端 | `readdy-frontend`，端口 5190 |
| 当前后端 | `backend`，端口 5010 |
| 当前登录桥 | `scripts/local-oauth-bridge.mjs`，端口 5100 |
| 禁止操作 | `git reset`、`git checkout`、`git stash`、清理未提交改动、运行旧 `frontend` |
| 危险命令 | 严禁对当前数据库运行 `backend/seed_dev.py`，该脚本会先清空现有演示数据 |
| 提交规则 | 当前工作区已有用户改动，不执行 `git add .`；每批通过后只列出建议提交文件，是否提交由用户确认 |

## 2. 不改崩的总闸门

每一批都必须同时满足以下条件，才能进入下一批：

- [x] 本批新增测试全部通过。
- [x] 后端全量测试全部通过。
- [x] 前端类型检查、代码规范检查、生产构建全部通过。
- [x] `git diff --check` 无报错。
- [x] SQLite `pragma integrity_check` 返回 `ok`。
- [x] 5010、5100、5190 服务仍来自当前项目目录。
- [x] Tabbit 中招聘专员、一面、二面各走一遍本批关键路径。
- [x] 未启动旧 `frontend`，未出现 `/private/tmp/zhipin-*` 进程。

以下任一情况出现时立即停止，不继续下一项：

- 数据库备份失败或完整性检查失败。
- 账号脚本检测到非 SQLite 数据库。
- 二面任务的原面试官、轮次或任务 ID 与预期不一致。
- 任一面试官能查看或修改不属于自己的当前轮任务。
- 一面评价被二面修改，或二面未提交评价就看到一面的文字结论。
- 全量测试、构建或登录链路失败。

## 3. 文件职责地图

| 文件 | 职责 |
|---|---|
| `backend/app/services/local_trial_account_service.py` | 只在本地 SQLite 中补齐缺失的试用账号 |
| `backend/scripts/ensure_local_trial_accounts.py` | 提供默认只预览、显式 `--apply` 才写入的账号命令 |
| `backend/app/api/interview.py` | 本地面试确认、评价读写和权限入口 |
| `backend/app/services/interview_management_service.py` | 面试状态变化、站内通知和事件记录 |
| `backend/app/services/interview_workflow_service.py` | 评价校验、更新和审计记录 |
| `backend/app/api/candidates.py` | 按角色返回跨轮次招聘过程，并控制历史评价可见性 |
| `readdy-frontend/src/features/interviews/api.ts` | 前端面试接口封装 |
| `readdy-frontend/src/features/interviews/types.ts` | 面试任务、评价和可见性类型 |
| `readdy-frontend/src/features/interviews/localReminders.ts` | 纯前端计算即将开始、已超时和待评价提醒 |
| `readdy-frontend/src/pages/interviewer/dashboard/page.tsx` | 面试官本地工作台和提醒入口 |
| `readdy-frontend/src/pages/interviewer/interviews/page.tsx` | 面试官任务列表和详情编排 |
| `readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx` | 结构化面试评价表单 |
| `readdy-frontend/src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx` | 拆分后的面试详情页签与固定操作区 |
| `readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx` | 招聘专员安排面试和轮次联动 |
| `readdy-frontend/src/pages/dashboard/page.tsx` | 招聘专员快捷安排入口 |
| `readdy-frontend/src/pages/candidates/page.tsx` | 疑似重复和本地演示数据筛选 |
| `readdy-frontend/src/pages/login/page.tsx` | “智聘”品牌和中文错误提示 |

---

# 第一批：打通本地多角色闭环

## Task 1：冻结基线并备份数据库

**Files:**
- Verify: `runtime/zhipin-demo.db`
- Create at execution time: `runtime/backups/zhipin-demo.pre-local-role-workflow.db`

- [x] **Step 1：确认基准和未提交改动仍在**

Run:

```bash
cd "/Users/yenns/Documents/新版招聘/zhipin-mvp"
git rev-parse HEAD
git status --short
```

Expected:

```text
872c8bd979ac26a8c387e187c4d650b677047f57
```

`git status --short` 可以非空，但必须保存输出作为执行前清单。

- [x] **Step 2：使用 SQLite 在线备份，不直接复制正在使用的数据库文件**

Run:

```bash
cd "/Users/yenns/Documents/新版招聘/zhipin-mvp"
mkdir -p runtime/backups
sqlite3 runtime/zhipin-demo.db ".backup 'runtime/backups/zhipin-demo.pre-local-role-workflow.db'"
sqlite3 runtime/zhipin-demo.db "pragma integrity_check;"
sqlite3 runtime/backups/zhipin-demo.pre-local-role-workflow.db "pragma integrity_check;"
```

Expected:

```text
ok
ok
```

- [x] **Step 3：记录当前关键数据，不写数据库**

Run:

```bash
sqlite3 -header -column runtime/zhipin-demo.db "select id,name,email,role,is_active from users where role='interviewer' order by id;"
sqlite3 -header -column runtime/zhipin-demo.db "select id,candidate_id,demand_id,round,round_sequence,interviewer_id,status,scheduled_at from interview_assignments where round_sequence >= 2 order by id;"
```

Expected: 当前只存在 `interviewer01@mvp.local`，当前二面任务为第 2 轮。若结果发生变化，后续改派命令必须使用新的实际任务 ID，不能照抄旧值。

- [x] **Step 4：跑执行前基线测试**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_interview_round_handoff.py tests/test_interview_feedback_editing.py tests/test_notifications.py tests/test_mvp_trial_accounts.py
cd ../readdy-frontend
node --test tests/*.test.mjs
npm run type-check
```

Expected: 全部通过。若基线本身失败，先报告现状，不把失败混进本计划开发。

## Task 2：安全补齐本地面试官02账号

**Files:**
- Create: `backend/app/services/local_trial_account_service.py`
- Create: `backend/scripts/ensure_local_trial_accounts.py`
- Create: `backend/tests/test_local_trial_account_sync.py`
- Modify: `RUNNING.md`

- [x] **Step 1：先写账号同步失败测试**

在 `backend/tests/test_local_trial_account_sync.py` 写入：

```python
import pytest

from app import db
from app.models import User
from app.services import local_trial_account_service as account_service
from app.services.local_trial_account_service import ensure_local_interviewer02


def test_local_account_sync_is_dry_run_and_idempotent(app):
    with app.app_context():
        assert User.query.filter_by(email="interviewer02@mvp.local").one_or_none() is None
        preview = ensure_local_interviewer02(apply=False)
        assert preview == {"action": "create", "email": "interviewer02@mvp.local"}
        assert User.query.filter_by(email="interviewer02@mvp.local").one_or_none() is None

        created = ensure_local_interviewer02(apply=True)
        assert created["action"] == "created"
        user = User.query.filter_by(email="interviewer02@mvp.local").one()
        assert user.role == "interviewer"
        assert user.is_active is True

        repeated = ensure_local_interviewer02(apply=True)
        assert repeated == {"action": "unchanged", "email": "interviewer02@mvp.local"}
        assert User.query.filter_by(email="interviewer02@mvp.local").count() == 1


def test_local_account_sync_refuses_non_sqlite(app, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(account_service, "_database_dialect_name", lambda: "mysql")
        with pytest.raises(RuntimeError, match="只允许本地 SQLite"):
            ensure_local_interviewer02(apply=True)
```

- [x] **Step 2：运行测试确认失败**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_local_trial_account_sync.py
```

Expected: FAIL，原因是 `local_trial_account_service` 尚不存在。

- [x] **Step 3：实现只新增、不覆盖的账号服务**

在 `backend/app/services/local_trial_account_service.py` 写入：

```python
import bcrypt

from .. import db
from ..models import User


LOCAL_EMAIL = "interviewer02@mvp.local"


def _database_dialect_name():
    return db.engine.dialect.name


def ensure_local_interviewer02(*, apply=False):
    if _database_dialect_name() != "sqlite":
        raise RuntimeError("只允许本地 SQLite 执行试用账号同步")

    existing = User.query.filter_by(email=LOCAL_EMAIL).one_or_none()
    if existing is not None:
        if existing.role != "interviewer" or not existing.is_active:
            raise RuntimeError("面试官02已存在但角色或启用状态不正确，请人工核对")
        return {"action": "unchanged", "email": LOCAL_EMAIL}

    if not apply:
        return {"action": "create", "email": LOCAL_EMAIL}

    password_hash = bcrypt.hashpw(b"Zhipin2026", bcrypt.gensalt()).decode()
    db.session.add(User(
        org_id=1,
        name="面试官02",
        email=LOCAL_EMAIL,
        role="interviewer",
        department="业务部门",
        password_hash=password_hash,
        is_active=True,
    ))
    db.session.commit()
    return {"action": "created", "email": LOCAL_EMAIL}
```

关键规则：已有账号绝不改密码、绝不改角色；发现冲突直接停止。

- [x] **Step 4：实现默认只预览的命令**

`backend/scripts/ensure_local_trial_accounts.py` 必须提供 `--apply` 开关，默认调用：

```python
result = ensure_local_interviewer02(apply=args.apply)
print(json.dumps(result, ensure_ascii=False))
```

不带 `--apply` 时不得写数据库。

- [x] **Step 5：运行测试并预览当前数据库变化**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_local_trial_account_sync.py tests/test_mvp_trial_accounts.py
DATABASE_URL="sqlite:////Users/yenns/Documents/新版招聘/zhipin-mvp/runtime/zhipin-demo.db" ../.venv/bin/python scripts/ensure_local_trial_accounts.py
```

Expected:

```text
{"action": "create", "email": "interviewer02@mvp.local"}
```

- [x] **Step 6：按用户已授权的整批执行指令写入本地数据库并立即复核**

确认后才运行：

```bash
DATABASE_URL="sqlite:////Users/yenns/Documents/新版招聘/zhipin-mvp/runtime/zhipin-demo.db" ../.venv/bin/python scripts/ensure_local_trial_accounts.py --apply
```

Expected: `created`；再次运行必须返回 `unchanged`。

## Task 3：使用现有本地页面把二面改派给面试官02

**Files:**
- Verify only: `backend/app/api/interview.py`
- Verify only: `backend/app/services/interview_management_service.py`
- Test: `backend/tests/test_interview_round_handoff.py`

本任务不新增改派脚本，也不直接写 SQL。账号补齐后，继续使用现有“调整面试安排”页面和现有 PATCH 接口，让权限校验、事件日志和站内通知保持同一条业务链路。

- [x] **Step 1：先确认现有跨轮次测试已经覆盖不同面试官**

`backend/tests/test_interview_round_handoff.py` 必须保留以下断言：

```python
second_tasks = client.get("/api/interview/assignments", headers=_auth(second_token))
assert second_tasks.status_code == 200
assert [item["id"] for item in second_tasks.get_json()] == [second_assignment_id]

first_tasks = client.get("/api/interview/assignments", headers=_auth(first_token))
assert second_assignment_id not in [item["id"] for item in first_tasks.get_json()]
```

- [x] **Step 2：运行现有权限测试**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_interview_round_handoff.py tests/test_interview_management_contract.py
```

Expected: 全部通过，证明现有接口支持把不同轮次分给不同面试官。

- [x] **Step 3：改派前只读核对当前二面任务**

Run:

```bash
sqlite3 -header -column ../runtime/zhipin-demo.db "select ia.id,ia.candidate_id,ia.demand_id,ia.round_sequence,ia.interviewer_id,u.email,ia.status,ia.scheduled_at,ia.location from interview_assignments ia join users u on u.id=ia.interviewer_id where ia.round_sequence=2 order by ia.id;"
```

Expected: 明确看到需要改派的任务、原面试官、时间和地点。若存在多条二面任务，只处理用户指定的一条。

- [x] **Step 4：在 Tabbit 中打开该任务的“调整安排”**

先核对候选人、岗位、第 2 轮、原时间和地点，只把面试官从面试官01改为面试官02；不改时间、不改地点、不取消任务。

- [x] **Step 5：按用户已授权的整批执行指令保存，并立即核对任务信息**

用户确认后才点击“保存安排”。保存后立即执行：

```bash
sqlite3 -header -column ../runtime/zhipin-demo.db "select ia.id,ia.round_sequence,u.email,ia.status,ia.scheduled_at,ia.location from interview_assignments ia join users u on u.id=ia.interviewer_id where ia.id=15;"
```

Expected: 指定任务为第 2 轮、面试官为 `interviewer02@mvp.local`，时间、地点和状态与保存前一致。若实际任务 ID 不是 15，必须使用 Step 3 查到的真实 ID。

## Task 4：允许所属面试官确认“已面试”并立即评价

**Files:**
- Modify: `backend/app/api/interview.py`
- Modify: `backend/app/services/interview_management_service.py`
- Modify: `backend/tests/test_interview_round_handoff.py`
- Modify: `backend/tests/test_interview_feedback_editing.py`
- Modify: `readdy-frontend/src/features/interviews/api.ts`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/page.tsx`
- Create: `readdy-frontend/tests/interviewer-self-confirm-contract.test.mjs`

- [x] **Step 1：先改现有跨轮次测试验证所属面试官权限**

在 `test_second_round_interviewer_reads_first_round_feedback_but_cannot_edit_it` 中，现有变量 `first_assignment_id`、`first_token`、`unrelated_token` 已经创建完成。把招聘专员确认改成以下顺序：

```python
unrelated_conducted = client.post(
    f"/api/interview/assignments/{first_assignment_id}/mark-conducted",
    headers=_auth(unrelated_token),
)
assert unrelated_conducted.status_code == 403

conducted = client.post(
    f"/api/interview/assignments/{first_assignment_id}/mark-conducted",
    headers=_auth(first_token),
)
assert conducted.status_code == 200
assert conducted.get_json()["status"] == "awaiting_feedback"
```

在 `backend/tests/test_interview_management_contract.py` 保留招聘专员确认成功的原测试；在 `backend/tests/test_interview_feedback_editing.py` 新增一个未来时间任务，所属面试官调用同一接口必须返回：

```python
assert response.status_code == 409
assert response.get_json()["code"] == "interview_not_started"
```

- [x] **Step 2：运行测试确认面试官当前得到 403**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_interview_round_handoff.py tests/test_interview_feedback_editing.py
```

Expected: 新增的“所属面试官确认”测试失败，其余原测试通过。

- [x] **Step 3：最小化放开现有接口，不新增第二套状态逻辑**

`mark_assignment_conducted()` 的权限规则改为：

```python
if g.role == "interviewer":
    assignment = InterviewAssignment.query.filter_by(
        id=assignment_id,
        org_id=g.org_id,
        interviewer_id=g.user_id,
    ).one_or_none()
    if assignment is None:
        return jsonify({"error": "Forbidden"}), 403
elif g.role in {"recruiter", "manager", "admin"}:
    assignment, error = _load_managed_assignment(assignment_id)
    if error is not None:
        return error
else:
    return jsonify({"error": "Forbidden"}), 403
```

继续调用现有 `mark_interview_conducted()`，复用“面试时间已开始”“已有反馈”“重复调用”等保护。

- [x] **Step 4：在面试官页面增加明确按钮**

仅当任务属于当前面试官、状态为 `scheduled` 且面试时间已开始时显示：

```tsx
<button type="button" onClick={() => void confirmAndStartFeedback(item)}>
  确认已面试并填写评价
</button>
```

`confirmAndStartFeedback` 必须先调用 `interviewsApi.markConducted(item.id)`，成功后刷新任务，再打开该任务评价弹窗；失败时保留任务状态并显示中文错误。

- [x] **Step 5：运行前后端相关测试**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_interview_round_handoff.py tests/test_interview_feedback_editing.py tests/test_interview_management_contract.py
cd ../readdy-frontend
node --test tests/interviewer-self-confirm-contract.test.mjs
npm run type-check
```

Expected: 全部通过。

## Task 5：二面提交前隐藏一面文字结论

**Files:**
- Modify: `backend/app/api/candidates.py`
- Modify: `backend/tests/test_interview_round_handoff.py`
- Modify: `readdy-frontend/src/features/candidates/types.ts`
- Modify: `readdy-frontend/src/components/candidates/CandidateJourneySummary.tsx`
- Create: `readdy-frontend/tests/round-feedback-visibility-contract.test.mjs`

- [x] **Step 1：先改写跨轮次测试为新规则**

先把现有测试重命名为 `test_second_round_feedback_is_locked_until_own_feedback_and_first_round_is_read_only`，再将创建二面任务后的第一次招聘过程请求命名为 `journey_before`。二面未提交前断言：

```python
rounds = journey_before.get_json()["interview_rounds"]
assert rounds[0]["feedback"] is None
assert rounds[0]["feedback_locked"] is True
```

随后把二面任务时间改到当前时间之前，使用 Task 4 放开的所属面试官确认接口改为待评价，再提交二面评价：

```python
with app.app_context():
    stored_second = db.session.get(InterviewAssignment, second_assignment_id)
    stored_second.scheduled_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=1)
    db.session.commit()

second_conducted = client.post(
    f"/api/interview/assignments/{second_assignment_id}/mark-conducted",
    headers=_auth(second_token),
)
assert second_conducted.status_code == 200

second_feedback = client.post(
    "/api/interview/feedback",
    headers=_auth(second_token),
    json={
        "assignment_id": second_assignment_id,
        "satisfaction": "satisfied",
        "note": "二面独立评价完成",
    },
)
assert second_feedback.status_code == 201

journey_after = client.get(
    f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
    headers=_auth(second_token),
)
```

二面提交自己的评价后断言：

```python
rounds = journey_after.get_json()["interview_rounds"]
assert rounds[0]["feedback"]["note"] == "一面通过：沟通清晰，建议进入二面"
assert rounds[0]["feedback_locked"] is False
```

招聘专员始终能看到全部评价，无关面试官仍返回 403。

- [x] **Step 2：运行测试确认旧行为失败**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_interview_round_handoff.py
```

Expected: 二面提交前仍能看到一面文字，因此新测试失败。

- [x] **Step 3：在招聘过程接口按当前角色脱敏**

面试官查看时，先找到自己在该候选人和需求下的当前轮任务；如果当前轮尚无反馈，则对更早轮次返回：

```python
{
    **round_payload,
    "feedback": None,
    "feedback_locked": True,
}
```

只隐藏评价内容，不隐藏轮次、时间、面试官和完成状态。招聘专员、经理、管理员不脱敏。

- [x] **Step 4：前端显示锁定说明**

```tsx
{item.feedback_locked && (
  <p className="mt-1 text-xs text-foreground-400">
    提交本轮评价后可查看此前面试结论
  </p>
)}
```

不得显示一面满意度、备注、优势或顾虑。

- [x] **Step 5：运行本批测试**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_interview_round_handoff.py tests/test_candidate_journey.py tests/test_interview_feedback_editing.py
cd ../readdy-frontend
node --test tests/round-feedback-visibility-contract.test.mjs tests/interviewer-self-confirm-contract.test.mjs
npm run type-check
```

Expected: 全部通过。

## 第一批验收闸门

| 角色 | 必须验证的结果 |
|---|---|
| 招聘专员 | 能看到面试官01和面试官02，能把二面分给面试官02 |
| 面试官01 | 只能看到自己的一面任务，面试开始后可确认并评价 |
| 面试官02 | 能登录，只看到自己的二面任务 |
| 二面评价前 | 看得到一面已完成，但看不到一面的文字结论 |
| 二面评价后 | 能只读查看一面结论，不能修改一面评价 |
| 数据库 | 备份存在，完整性为 `ok`，没有重复账号 |

---

# 第二批：提高本地处理效率

## Task 6：增加纯本地站内提醒

**Files:**
- Create: `readdy-frontend/src/features/interviews/localReminders.ts`
- Modify: `readdy-frontend/src/pages/interviewer/dashboard/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/page.tsx`
- Create: `readdy-frontend/tests/local-interview-reminders-contract.test.mjs`

- [x] **Step 1：先写提醒分类契约测试**

测试要求源码明确包含三个互斥分类：

```text
即将开始：未来 0 至 120 分钟
已超时待确认：已过开始时间且状态仍为 scheduled
待提交评价：状态为 awaiting_feedback 且未提交反馈
```

- [x] **Step 2：实现纯函数，不创建数据库通知**

`localReminders.ts` 导出：

```ts
import type { InterviewAssignment } from './types';

export type LocalInterviewReminderKind = 'starting_soon' | 'needs_confirmation' | 'needs_feedback';

export function localReminderKind(item: InterviewAssignment, now = new Date()): LocalInterviewReminderKind | null {
  if (item.feedback_submitted) return null;
  if (item.status === 'awaiting_feedback') return 'needs_feedback';
  if (!item.scheduled_at || item.status !== 'scheduled') return null;
  const minutes = (new Date(item.scheduled_at).getTime() - now.getTime()) / 60_000;
  if (minutes < 0) return 'needs_confirmation';
  if (minutes <= 120) return 'starting_soon';
  return null;
}
```

该函数只计算当前任务，不写 Notification 表，因此刷新页面不会产生重复提醒。

- [x] **Step 3：工作台按紧急程度排序**

顺序固定为：待评价、已超时待确认、两小时内开始、其他面试。每个提醒直接跳到具体 `assignment`，不只跳到列表。

没有紧急提醒时显示“当前没有需要立即处理的面试”，加载失败时保留刷新按钮，不能把接口错误显示成 0 条任务。

- [x] **Step 4：运行测试**

Run:

```bash
cd readdy-frontend
node --test tests/local-interview-reminders-contract.test.mjs
npm run type-check
npm run lint
```

Expected: 全部通过。

## Task 7：把评价升级成结构化评价

**Files:**
- Modify: `backend/app/services/interview_workflow_service.py`
- Modify: `backend/app/api/interview.py`
- Modify: `backend/tests/test_interview_feedback_editing.py`
- Modify: `readdy-frontend/src/features/interviews/types.ts`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx`
- Create: `readdy-frontend/tests/structured-interview-feedback-contract.test.mjs`

- [x] **Step 1：先写后端评价校验测试**

完整输入：

```python
payload = {
    "assignment_id": assignment_id,
    "satisfaction": "satisfied",
    "job_match": "high",
    "recommendation": "next_round",
    "strengths": "Python 基础扎实，表达清楚",
    "concerns": "分布式项目经验需要二面确认",
    "note": "建议进入二面",
}
```

断言 `strengths`、`concerns` 写入已有列，`job_match`、`recommendation` 写入已有 `evaluation_json`，不新增数据库字段。

校验规则：满意时优势必填；不满意时顾虑必填；待定时备注必填；所有文本最多 1000 字。

- [x] **Step 2：运行测试确认当前接口未保存完整字段**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_interview_feedback_editing.py
```

Expected: 新增结构化字段断言失败。

- [x] **Step 3：扩展评价归一化和审计**

统一返回：

```python
{
    "satisfaction": satisfaction,
    "job_match": job_match,
    "recommendation": recommendation,
    "strengths": strengths,
    "concerns": concerns,
    "note": note,
}
```

更新评价时，事件 `interview.feedback_updated` 的 `before` 和 `after` 必须包含全部六个字段，保证修改可追踪。

- [x] **Step 4：升级前端评价弹窗**

表单顺序固定为：满意程度、岗位匹配、建议结论、优势、顾虑、补充备注。提交按钮只有在对应必填规则满足后才可用。

- [x] **Step 5：运行相关测试**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_interview_feedback_editing.py tests/test_interview_round_handoff.py
cd ../readdy-frontend
node --test tests/structured-interview-feedback-contract.test.mjs
npm run type-check
```

Expected: 全部通过，旧评价仍能显示和修改。

## Task 8：面试名称和第几轮自动绑定

**Files:**
- Modify: `readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx`
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Create: `readdy-frontend/tests/interview-round-binding-contract.test.mjs`
- Modify: `backend/tests/test_demand_interview_rounds.py`

- [x] **Step 1：先写前后端规则测试**

固定映射：

```ts
const fixedRoundSequence = {
  round_1: 1,
  round_2: 2,
  round_3: 3,
} as const;
```

一面、二面、终面不再允许手工输入冲突的数字；技术面、业务面、HR面和加面继续使用后端计算出的下一轮序号。

- [x] **Step 2：移除可编辑的“第几轮”输入框**

表单只显示只读说明：

```tsx
<p className="mt-2 h-10 rounded-lg bg-background-50 px-3 py-2 text-sm text-foreground-600">
  第 {roundSequence} 轮
</p>
```

当用户选择 `round_2` 时同步设为 2；编辑已有任务时继续使用原值，不重写历史轮次。

- [x] **Step 3：运行测试**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_demand_interview_rounds.py
cd ../readdy-frontend
node --test tests/interview-round-binding-contract.test.mjs
npm run type-check
```

Expected: 全部通过。

## Task 9：招聘专员快捷安排减少一次点击

**Files:**
- Modify: `readdy-frontend/src/pages/dashboard/page.tsx`
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Create: `readdy-frontend/tests/dashboard-direct-schedule-contract.test.mjs`

- [x] **Step 1：先写跳转契约测试**

规则必须是：待安排任务只有一条时自动打开该任务表单；多于一条时保留筛选列表让用户选择；零条时显示“当前没有待安排面试”。

- [x] **Step 2：增加一次性深链保护**

`interviews/page.tsx` 使用 `useRef` 记录已处理的 URL，避免每次刷新重复打开：

```ts
const handledQuickSchedule = useRef('');
const quickKey = `${searchParams.get('from')}:${searchParams.get('status')}`;
if (quickKey === 'dashboard:unassigned' && rows.length === 1 && handledQuickSchedule.current !== quickKey) {
  handledQuickSchedule.current = quickKey;
  openSchedule(rows[0]);
}
```

- [x] **Step 3：运行测试和构建**

Run:

```bash
cd readdy-frontend
node --test tests/dashboard-direct-schedule-contract.test.mjs
npm run type-check
npm run build
```

Expected: 全部通过。

## 第二批验收闸门

| 场景 | 必须验证的结果 |
|---|---|
| 即将开始 | 两小时内任务排在工作台前面 |
| 已超时 | 面试官能直接确认并进入评价 |
| 结构化评价 | 必填规则明确，旧评价不报错 |
| 轮次 | 二面永远显示第2轮，不再出现矛盾组合 |
| 快捷安排 | 单条任务直接弹窗，多条任务仍由用户选择 |

---

# 第三批：收口详情、数据提示和视觉规范

## Task 10：把面试详情拆成三个页签并固定操作区

**Files:**
- Create: `readdy-frontend/src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/page.tsx`
- Create: `readdy-frontend/tests/interviewer-detail-tabs-contract.test.mjs`

- [x] **Step 1：先写结构契约测试**

详情必须只有三个页签：`面试信息`、`候选人简历`、`历史评价`；底部固定区域必须包含当前任务状态和评价按钮。

- [x] **Step 2：从大页面拆出独立组件**

组件接口固定为：

```ts
interface InterviewerInterviewDetailDrawerProps {
  assignment: InterviewAssignment;
  demand: RecruitmentDemand | null;
  resume: CandidateResumeDetail | null;
  journey: CandidateJourney | null;
  feedback: InterviewFeedback | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onStartFeedback: () => void;
}
```

页签切换不重新请求数据；关闭后再次打开允许重新加载最新数据。

加载中显示骨架或加载文案；接口失败显示原错误和“重新加载”；没有原版简历时继续显示结构化信息提示；没有历史评价时显示明确空状态。

- [x] **Step 3：增加固定底部操作区**

操作区始终可见，按钮文案只允许：`面试尚未开始`、`确认已面试并填写评价`、`填写评价`、`修改评价`。

- [x] **Step 4：检查键盘和可访问性**

页签使用 `role="tablist"`、`role="tab"`、`aria-selected`；抽屉关闭按钮有中文 `aria-label`；Escape 可关闭未保存的详情，不关闭正在保存的评价。

- [x] **Step 5：运行测试**

Run:

```bash
cd readdy-frontend
node --test tests/interviewer-detail-tabs-contract.test.mjs
npm run type-check
npm run lint
```

Expected: 全部通过。

## Task 11：只提示疑似重复，不自动合并或删除

**Files:**
- Modify: `backend/app/api/candidates.py`
- Modify: `backend/tests/test_candidate_library.py`
- Modify: `readdy-frontend/src/features/candidates/types.ts`
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Create: `readdy-frontend/tests/candidate-data-hygiene-contract.test.mjs`

- [x] **Step 1：先写非破坏性测试**

接口为候选人增加：

```json
{
  "identical_resume_count": 3,
  "same_name_count": 3,
  "is_local_demo_record": true
}
```

`identical_resume_count` 只按非空 `resume_sha256` 统计；`same_name_count` 只作提示，不能作为自动合并依据。

- [x] **Step 2：本地演示标记只在本地模式生效**

仅当 `LOCAL_SCHEMA_COMPAT=true` 时，根据现有本地演示命名规则返回 `is_local_demo_record=true`；非本地模式固定返回 false。

- [x] **Step 3：前端增加两个提示和一个筛选**

```text
相同文件 3 条：高可信重复提示
同名 3 条：低可信提示
隐藏本地演示数据：仅过滤显示，不删除记录
```

本任务严禁调用删除、合并、覆盖接口。

开启“隐藏本地演示数据”后如果列表为空，显示“当前筛选条件下没有候选人”和“显示全部数据”按钮，不能显示成接口加载失败。

- [x] **Step 4：运行测试并核对记录数不变**

Run:

```bash
before=$(sqlite3 runtime/zhipin-demo.db "select count(*) from candidates where deleted_at is null;")
cd backend
../.venv/bin/pytest -q tests/test_candidate_library.py
cd ../readdy-frontend
node --test tests/candidate-data-hygiene-contract.test.mjs
npm run type-check
cd ..
after=$(sqlite3 runtime/zhipin-demo.db "select count(*) from candidates where deleted_at is null;")
test "$before" = "$after"
```

Expected: 测试通过，前后候选人数量完全一致。

## Task 12：统一面试官页面标题、页签和登录文案

**Files:**
- Modify: `readdy-frontend/src/pages/interviewer/dashboard/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/jobs/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/page.tsx`
- Modify: `readdy-frontend/src/pages/login/page.tsx`
- Modify: `readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx`
- Modify: `readdy-frontend/tests/ui-consistency-contract.test.mjs`
- Create: `readdy-frontend/tests/login-copy-contract.test.mjs`

- [x] **Step 1：先扩展统一性测试**

所有面试官主页面必须使用 `PageHeader`；状态页签必须使用 `WorkspaceTabs`；禁止再次出现独立的 `text-xl font-bold` 主标题。

- [x] **Step 2：统一品牌和中文错误**

登录页所有 `TalentFlow` 改为 `智聘`。登录错误映射固定为：

```ts
const loginErrorCopy = (message: string) => {
  if (/invalid credentials/i.test(message)) return '账号或密码错误';
  if (/network|fetch/i.test(message)) return '本地登录服务暂不可用，请确认服务已启动';
  return message || '登录失败，请重试';
};
```

- [x] **Step 3：移除看起来像未完成产品的外部接口文案**

安排面试说明改为：

```text
保存后会创建本地站内日程和待办。
```

不再在主流程中展示“企业微信日历仍待接入”。

- [x] **Step 4：运行前端全套检查**

Run:

```bash
cd readdy-frontend
node --test tests/*.test.mjs
npm run type-check
npm run lint
npm run build
```

Expected: 全部通过；只允许 Vite 现有的大包体积警告，不能有类型或代码规范错误。

## Task 13：三批最终回归与本地交付记录

**Files:**
- Modify: `RUNNING.md`
- Create: `docs/14_本地多角色招聘闭环验收记录.md`

- [x] **Step 1：运行后端全量测试**

Run:

```bash
cd backend
../.venv/bin/pytest -q
```

Expected: 0 failed。

- [x] **Step 2：运行前端全量检查**

Run:

```bash
cd ../readdy-frontend
node --test tests/*.test.mjs
npm run type-check
npm run lint
npm run build
```

Expected: 0 failed。

- [x] **Step 3：检查数据库与代码差异**

Run:

```bash
cd ..
sqlite3 runtime/zhipin-demo.db "pragma integrity_check;"
git diff --check
git status --short
```

Expected: 数据库返回 `ok`，`git diff --check` 无输出，用户原有未提交改动仍保留。

- [x] **Step 4：只在 Tabbit 做角色验收**

按以下顺序登录并记录截图：

```text
hr01：安排一面给面试官01，安排二面给面试官02
interviewer01：确认一面完成并提交结构化评价
interviewer02：提交二面评价前看不到一面文字；提交后可只读查看
hr01：查看两轮结果并决定下一步
```

验收时不提交淘汰、Offer、删除、合并等会改变候选人最终结果的操作。

- [x] **Step 5：检查服务和错误版本**

Run:

```bash
lsof -nP -iTCP:5010 -sTCP:LISTEN
lsof -nP -iTCP:5100 -sTCP:LISTEN
lsof -nP -iTCP:5190 -sTCP:LISTEN
for port in 5173 5175 5191 5001 5002; do lsof -nP -iTCP:$port -sTCP:LISTEN || true; done
ps ax -o pid=,command= | rg '/private/tmp/([z]hipin-|[^ ]*([j]ia-ke-chong|[j]iakechong))' || true
```

Expected: 当前招聘系统只使用 5010、5100、5190；旧端口和 `/private/tmp` 招聘系统无输出。

- [x] **Step 6：形成验收记录**

`docs/14_本地多角色招聘闭环验收记录.md` 必须记录：执行日期、数据库备份、测试数量、三角色截图、未完成项、已知风险、实际改动文件清单。

---

## 4. 风险矩阵

| 风险 | 等级 | 控制办法 |
|---|---|---|
| 补账号误覆盖现有账号 | 中 | 只新增；冲突立即停止；不重置密码 |
| 二面改派错误 | 中 | 先查指定任务，再在 Tabbit 只改面试官，保存前用户确认，保存后立即查库 |
| 面试官提前确认 | 中 | 继续使用后端“面试时间已开始”校验 |
| 越权查看其他面试官任务 | 高 | 后端按 `org_id + interviewer_id` 双重过滤并写 403 测试 |
| 二面被一面结论影响 | 中 | 二面提交前由后端脱敏，不只靠前端隐藏 |
| 新评价破坏旧评价 | 中 | 复用已有数据库列和 JSON，不做数据库迁移 |
| 页面重构导致按钮消失 | 中 | 先写页面契约测试，固定底部操作区 |
| 重复数据处理错误 | 高 | 本计划只提示、不自动合并、不删除 |
| 外部接口不可用 | 低 | 本计划不调用任何外部业务接口 |
| 当前未提交改动被覆盖 | 高 | 只改明确文件，使用 `apply_patch`，不 reset/checkout/stash，不 `git add .` |

## 5. 回退方案

| 发生情况 | 回退办法 | 限制 |
|---|---|---|
| 面试官02刚创建就发现错误 | 确认该账号没有任务、通知和评价后，只删除这一条新账号 | 有任何关联记录时禁止删除 |
| 二面刚改派就发现选错人 | 立即在同一“调整安排”页面改回原面试官，并核对时间、地点不变 | 必须记录原面试官 ID |
| 页面改动导致功能失败 | 使用 `apply_patch` 逐文件撤销本批改动 | 禁止使用 checkout/reset 覆盖用户原改动 |
| 数据库完整性失败 | 立即停止全部服务，不继续操作当前库 | 不自动覆盖数据库 |
| 必须恢复整库 | 用户明确确认且备份后没有新增业务操作时，才使用 SQLite 备份恢复 | 会丢失备份之后的全部数据，属于最后手段 |

整库恢复前必须再次备份故障库，并向用户说明会丢失哪些数据。恢复后重新运行 `pragma integrity_check`、数据库版本检查和三角色登录验收。

## 6. 建议执行节奏

| 批次 | 预计内容 | 进入下一批的条件 |
|---|---|---|
| 第一批 | 账号、二面分配、面试确认、评价可见性 | 三角色本地闭环通过，后端全量测试通过 |
| 第二批 | 站内提醒、结构化评价、轮次联动、快捷安排 | 核心效率功能通过，前后端全量检查通过 |
| 第三批 | 详情页签、重复提示、演示过滤、标题和文案 | Tabbit 完整验收和数据库完整性检查通过 |

每批完成后由执行 Agent 自验，再由独立 Agent 审查；通过后自动继续下一批。只有出现数据库完整性失败、权限泄漏或无法安全回退等高风险问题时才停止。任何一批都不自动扩大到外部接口或生产部署。
