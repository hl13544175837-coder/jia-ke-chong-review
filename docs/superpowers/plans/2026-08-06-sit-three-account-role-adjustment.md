# SIT Three-Account Role Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Test/SIT 的 `100001` 配置为招聘专员，将 `100000` 和 `100002` 配置为两个相互隔离的面试官账号。

**Architecture:** 继续使用现有的“PGS 工作台菜单 + 前后端工号角色映射 + 后端 RBAC”权限链。同一份工号映射同时注入前端构建和后端运行环境，不改业务代码或数据表。

**Tech Stack:** CFPD GitLab `test`、Libra CI/CD、PGS 菜单授权、React/Vite `VITE_GATEWAY_ROLE_MAP`、Flask `AUTH_GATEWAY_ROLE_MAP`、Tabbit/ego-browser

---

### Task 1: 核对当前 Test/SIT 配置和发布源

**Files:**
- Read: `AGENTS.md`
- Read: `docs/08_Libra_SIT发布路线.md`
- Read: `docs/superpowers/specs/2026-08-06-sit-three-account-role-adjustment-design.md`
- Modify: none

- [ ] **Step 1: 确认 CFPD `test` 远程基线**

Run:

```bash
git ls-remote https://git.ymdd.tech/cfpd/zhipin-mvp.git refs/heads/test
git status --short --branch
```

Expected: 远程为 CFPD `test`；工作区仅保留已知的无关未跟踪文件，不覆盖它们。

- [ ] **Step 2: 在 Tabbit 的独立任务空间打开 Libra 与 PGS**

Use `ego-browser` task space `sit-three-account-roles`. Observe first with `snapshotText()` and identify the current `test` pipeline, `zhipin-server`/`zhipin-frontend` build variables, deployment logs, and the PGS “智聘 → 工作台” role markers. Do not mutate any field in this step.

Expected: 记录当前前后端角色映射和三个工号的 PGS 工作台标记；如页面需要人工登录或验证码，交还控制权并等待用户完成。

### Task 2: 同步三个工号的前后端角色映射

**Files:**
- Modify: Libra/Test `zhipin-server` runtime variable `AUTH_GATEWAY_ROLE_MAP`
- Modify: Libra/Test `zhipin-frontend` build variable `VITE_GATEWAY_ROLE_MAP`
- Modify: Libra/Test `zhipin-server` runtime variable `AUTH_GATEWAY_USER_ROLE`
- Test: `backend/tests/test_gateway_trial_roles.py`

- [ ] **Step 1: 保留现有其他角色映射并预览合并结果**

Set the three target entries to:

```env
AUTH_GATEWAY_USER_ROLE=recruiter
AUTH_GATEWAY_ROLE_MAP=100001:recruiter,100000:interviewer,100002:interviewer
VITE_GATEWAY_ROLE_MAP=100001:recruiter,100000:interviewer,100002:interviewer
```

If the current maps contain other valid employees, merge these three entries into the existing comma-separated list instead of replacing unrelated entries. Each target employee code must appear exactly once.

Expected: 预览值中 `100001` 仅对应 `recruiter`，`100000` 和 `100002` 仅对应 `interviewer`，其他工号映射不变。

- [ ] **Step 2: 保存前后端配置**

Save both variables only after the preview is correct. Re-open or read back the saved values immediately.

Expected: Libra/Test 保存值与预览值完全一致，不存在只改前端或只改后端的半完成状态。

- [ ] **Step 3: 运行现有角色映射回归测试**

Run:

```bash
cd backend
../.venv/bin/pytest -q tests/test_gateway_trial_roles.py
```

Expected: all tests pass with zero failures.

### Task 3: 对齐 PGS 工作台授权

**Files:**
- Modify: PGS `100001` workbench marker
- Modify: PGS `100000` workbench marker
- Modify: PGS `100002` workbench marker
- Test: PGS saved assignment readback

- [ ] **Step 1: 配置招聘专员工作台**

For employee `100001`, keep exactly one role workbench marker:

```text
dashboard_recruiter
```

Remove `dashboard_interviewer`, `dashboard_manager`, `dashboard_admin`, and `dashboard_hr_director` only if any of them are currently assigned to this same employee.

Expected: PGS readback shows exactly `dashboard_recruiter` for `100001`.

- [ ] **Step 2: 配置两个面试官工作台**

For employees `100000` and `100002`, keep exactly one role workbench marker each:

```text
dashboard_interviewer
```

Remove `dashboard_recruiter`, `dashboard_manager`, `dashboard_admin`, and `dashboard_hr_director` only if any of them are currently assigned to either target employee.

Expected: PGS readback shows exactly `dashboard_interviewer` for both employees.

### Task 4: 构建并发布同一批前后端 Test/SIT 版本

**Files:**
- Modify: CFPD GitLab `test` branch by pushing only the reviewed documentation commit if a new pipeline trigger is required
- Modify: Libra `zhipin-server` and `zhipin-frontend` test pipeline/deployment state
- Test: `scripts/check-sit-release.sh`

- [ ] **Step 1: 确认推送范围**

Run:

```bash
git log --oneline cfpd/test..HEAD
git diff --stat cfpd/test..HEAD
```

Expected: only the reviewed role-adjustment design/plan documentation commits are ahead; no unrelated untracked files are staged or pushed.

- [ ] **Step 2: 如需新 pipeline，推送到公司唯一发布源**

Run only when Libra requires a new `test` commit to rebuild the frontend with the new build variable:

```bash
git push https://git.ymdd.tech/cfpd/zhipin-mvp.git HEAD:test
git ls-remote https://git.ymdd.tech/cfpd/zhipin-mvp.git refs/heads/test
```

Expected: remote `test` SHA equals local `HEAD`. If the remote changed meanwhile, stop and rebase/merge safely before any push; never force-push.

- [ ] **Step 3: 构建并发布前后端**

In Libra, select `test`, build both `zhipin-server` and `zhipin-frontend` with the role maps from Task 2, and follow `docs/08_Libra_SIT发布路线.md`. Check deployment logs before any manual K8S bind to avoid publishing the same RC twice.

Expected: both modules use the same pipeline commit/batch, deployment succeeds, and K8S reports healthy instances.

- [ ] **Step 4: 验证发布版本**

Run the repository release gate against the documented Test/SIT URL and the current CFPD `test` commit:

```bash
ROLE_CHANGE_COMMIT="$(git ls-remote https://git.ymdd.tech/cfpd/zhipin-mvp.git refs/heads/test | awk '{print $1}')"
EXPECTED_COMMIT="$ROLE_CHANGE_COMMIT" SIT_BASE_URL=https://test-zhipin.yimidida.com ./scripts/check-sit-release.sh
```

Expected: command exits 0; backend build info, frontend asset, database migration head, and remote CFPD `test` commit all match the deployed batch.

### Task 5: 验收一个招聘专员和两个面试官

**Files:**
- Create: `docs/verification/2026-08-06-sit-three-account-role-adjustment/README.md`
- Create: `docs/verification/2026-08-06-sit-three-account-role-adjustment/*.png` only for non-sensitive screenshots needed as evidence
- Test: live Test/SIT `/api/auth/me` and role-specific pages

- [ ] **Step 1: 验证三个账号的后端真实角色**

Log in as each employee in the Tabbit task space and inspect `/api/auth/me`:

```text
100001  -> recruiter
100000  -> interviewer
100002  -> interviewer
```

Expected: HTTP 200 and the exact role above for each account. Do not record authentication tokens or personal data in screenshots or documents.

- [ ] **Step 2: 验证页面入口**

Expected:

```text
100001  -> /dashboard
100000  -> /interviewer/dashboard
100002  -> /interviewer/dashboard
```

The recruiter must not be presented as an interviewer; the interviewers must not see recruiter-only workflow controls.

- [ ] **Step 3: 验证两名面试官任务隔离**

Using `100001`, assign one distinct Test/SIT interview task to `100000` and another to `100002`. Log in as each interviewer and confirm they can access only their own assignment and cannot submit or edit the other interviewer's feedback.

Expected: own task succeeds; cross-account task access is absent or returns 403; no real candidate data is used.

- [ ] **Step 4: 写入验收记录**

Create `docs/verification/2026-08-06-sit-three-account-role-adjustment/README.md` with the heading `SIT 三账号角色调整验收`. Record the full SHA returned by `git ls-remote`, the Libra pipeline identifier, both deployed RC values, the three account/role/route results, the own-task and cross-account access results, and the Asia/Shanghai verification timestamp returned by `TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S %Z'`.

Expected: every recorded value is the actual live result; every line is backed by command output or an inspected page.

- [ ] **Step 5: 运行最终文档与工作区检查**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors; only this task's plan/evidence files and the pre-existing unrelated untracked verification directory appear.
