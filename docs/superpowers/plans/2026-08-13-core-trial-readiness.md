# 核心招聘流程小范围试用收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 `test` 候选收口到少量同事可使用真实数据连续完成招聘需求、简历入库、候选人流程、面试、Offer 和看板的程度。

**Architecture:** 保持 React/Vite 前端、Flask/SQLAlchemy 后端和现有状态机不变。新增一个严格但关闭 AI 的 `internal-trial` 就绪档位、一条覆盖六模块的后端闭环测试，并扩大现有五角色浏览器冒烟范围；任何基线故障都先由失败测试复现，再做最小修复。

**Tech Stack:** Python 3.12、Flask、SQLAlchemy、Pytest、React 19、TypeScript、Vite、Node Test Runner、Playwright、GitLab CI。

---

## 执行边界

- 只在分支 `codex/core-trial-readiness-20260813` 和 worktree `.worktrees/core-trial-readiness-20260813` 工作。
- 不修改主目录中的 `test` 工作区，不触碰公司真实数据库和真实附件。
- AI 简历解析、AI 助手、BOSS、OA、外部通知和外部日历不作为放行条件。
- 不重写状态机、不新增业务页面、不进行无关重构。
- P0/P1 必须有可重复失败证据；若基线和新增闭环均通过，不为“看起来更完善”修改业务代码。
- 完成后只推送独立分支，未经用户确认不合并回 `test`。

## 文件结构

**新增：**

- `backend/internal-trial.env.example`：真实数据内部试用的配置模板，关闭 AI 但启用严格持久化与运行保护。
- `backend/tests/test_core_trial_workflow.py`：六模块单事务边界外的完整 API 闭环测试。
- `docs/verification/2026-08-13-core-trial-readiness/README.md`：基线、修复、浏览器演练和最终门禁证据。

**修改：**

- `backend/scripts/check_pilot_readiness.py`：增加 `internal-trial` 就绪档位。
- `backend/tests/test_pilot_readiness.py`：锁定新档位的严格项和 AI 关闭语义。
- `readdy-frontend/e2e/core-role-smoke.spec.ts`：覆盖招聘专员六个核心页面及经理看板。
- `.gitlab-ci.yml`：把核心闭环加入关键业务 job，保持公司旧版 GitLab 兼容。
- `backend/tests/test_deployment_artifacts.py`：锁定 CI 必须执行核心闭环且不得重新引入 `workflow.auto_cancel`。
- `docs/15_同事小范围试用说明.md`：改为真实数据内部试用口径，明确 AI/外部系统非放行项。
- `docs/16_本地同事试用验收清单.md`：补齐六模块操作顺序和非破坏性检查。

---

### Task 1：建立隔离依赖与干净基线

**Files:**

- Create: `docs/verification/2026-08-13-core-trial-readiness/README.md`
- Verify: entire repository

- [ ] **Step 1: 复用主项目依赖但不复用运行数据**

在 worktree 根目录创建被 Git 忽略的 `.venv` 符号链接，指向主项目 `.venv`；在 `readdy-frontend/` 创建被 Git 忽略的 `node_modules` 符号链接，指向主项目依赖目录。不得链接 `runtime/`、数据库、uploads 或 backups。

- [ ] **Step 2: 运行后端与 Agent 全量基线**

Run:

```bash
.venv/bin/python -m pytest backend/tests base_agent/tests -q
```

Expected: 全部 PASS。若失败，记录准确测试名和堆栈；只有与六模块或发布门禁相关的 P0/P1 才进入本轮修复。

- [ ] **Step 3: 运行前端全量基线**

Run:

```bash
cd readdy-frontend
npm run test:contract
npm run type-check
npm run lint
npm run build
```

Expected: 契约测试全部通过、TypeScript 无错误、Lint 0 warning、生产构建成功。

- [ ] **Step 4: 运行数据库与发布静态门禁**

Run:

```bash
cd backend && ../.venv/bin/alembic heads
cd .. && git diff --check
make -n build PKG_TAG=RC PKG_VERSION=core-trial-baseline
```

Expected: 唯一迁移 head 为 `20260811_18`；Git 差异无空白错误；RC 前后端镜像命令可生成。

- [ ] **Step 5: 写入基线证据并提交**

证据文件必须记录提交 SHA、每条命令、通过/失败数量、P0/P1/P2 分类和“未连接公司真实数据库”。

```bash
git add docs/verification/2026-08-13-core-trial-readiness/README.md
git commit -m "docs: record core trial baseline"
```

---

### Task 2：新增真实数据内部试用配置档位

**Files:**

- Create: `backend/internal-trial.env.example`
- Modify: `backend/scripts/check_pilot_readiness.py`
- Modify: `backend/tests/test_pilot_readiness.py`

- [ ] **Step 1: 写失败测试，定义 `internal-trial`**

新增测试构造可写的持久 uploads/backup 目录与 MySQL URL，并断言：

```python
checks = run_checks(values, project_root, env_file, profile="internal-trial")
failed = {item.name for item in checks if not item.ok}
assert failed == set()
```

`values` 必须包含 `ALLOW_INSECURE_SIT_STARTUP=false`、`RESUME_AI_ENABLED=false`、`SECURITY_HEADERS_ENABLED=true`、`RATE_LIMIT_ENABLED=true`、`ALLOW_PUBLIC_REGISTRATION=false`、`AUTO_MIGRATE_DATABASE=false`、`ALLOW_EMPTY_DATABASE_BOOTSTRAP=false`、`AUTH_DISABLED=true`、默认角色 `recruiter` 和合法工号角色映射。AI 合规确认与隐私说明地址留空仍应通过；把数据库改成 SQLite、打开公开注册、使用临时 uploads 或打开 AI 时分别失败。

- [ ] **Step 2: 验证测试先失败**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_pilot_readiness.py -q
```

Expected: FAIL，原因是 `internal-trial` 尚未被支持。

- [ ] **Step 3: 最小实现新档位**

`run_checks` 接受 `production`、`sit-team`、`internal-trial`。`internal-trial` 复用 production 的数据库、CORS、安全头、限流、关闭注册、持久目录、关闭自动迁移和固定加密 key 要求；额外要求 `RESUME_AI_ENABLED=false`、`AUTH_DISABLED=true`、`AUTH_GATEWAY_USER_ROLE=recruiter` 和合法 `AUTH_GATEWAY_ROLE_MAP`。只有 AI 被启用时才要求 AI 合规确认和隐私说明地址。

- [ ] **Step 4: 增加可复制配置模板**

模板使用占位 MySQL/PostgreSQL URL、持久 uploads/backup 路径、强密钥占位、公司域名 CORS、关闭 AI、关闭公开注册、启用安全头与限流，并明确真实 `.env` 不得提交。

- [ ] **Step 5: 验证并提交**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_pilot_readiness.py backend/tests/test_pilot_hardening.py -q
```

Expected: 全部 PASS。

```bash
git add backend/internal-trial.env.example backend/scripts/check_pilot_readiness.py backend/tests/test_pilot_readiness.py
git commit -m "feat: add strict internal trial readiness profile"
```

---

### Task 3：建立六模块后端闭环验收

**Files:**

- Create: `backend/tests/test_core_trial_workflow.py`
- Modify only if the new test exposes a defect: the smallest responsible file under `backend/app/`

- [ ] **Step 1: 写完整闭环测试**

测试使用隔离数据库创建 recruiter、manager、interviewer，然后按顺序执行：

1. `POST /api/demands` 创建 1 HC 的真实 Demand。
2. 在 `RESUME_AI_ENABLED=false` 下上传 PDF，确认原件保留并返回人工补录提示。
3. `PATCH /api/resume/{candidate_id}/profile` 补录姓名、联系方式、经历和技能。
4. 确认候选人已进入该 Demand 的 `pending`，重复推进只保留一条当前阶段。
5. 推进到 `interview`，创建面试安排，重复安排返回同一任务。
6. 招聘专员确认面试已进行，面试官提交结构化反馈，反馈本身不自动推进流程。
7. 招聘专员推进到 `offer`，保存、提交 Offer；manager 审批；recruiter 发送、登记接受并入职。
8. Demand 明细、流程看板和 `/api/bi/overview` 同时显示 1 个 onboarded，Offer 历史顺序完整。
9. 审计中存在 demand、resume、pipeline、interview、offer 对应事件。

- [ ] **Step 2: 运行测试并识别真实缺口**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_core_trial_workflow.py -q
```

Expected: 若现有实现完整则 PASS；若失败，失败点就是 P0/P1 复现证据。

- [ ] **Step 3: 对每个失败执行红绿循环**

一次只处理一个失败：保留失败断言，定位最小负责函数，修改后先重跑该测试，再跑该模块现有测试。禁止为通过测试绕过权限、审计、幂等或状态机。

- [ ] **Step 4: 运行六模块相关回归**

Run:

```bash
.venv/bin/python -m pytest -q \
  backend/tests/test_core_trial_workflow.py \
  backend/tests/test_demand_management.py \
  backend/tests/test_resume_ai_disabled_trial.py \
  backend/tests/test_lightweight_pilot_guards.py \
  backend/tests/test_interview_management_contract.py \
  backend/tests/test_offer_lifecycle.py \
  backend/tests/test_bi_operational_overview.py
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/tests/test_core_trial_workflow.py backend/app
git diff --cached --name-only
git commit -m "test: cover core recruitment trial workflow"
```

若没有修改 `backend/app`，只暂存新测试文件。

---

### Task 4：扩大核心页面和角色浏览器冒烟

**Files:**

- Modify: `readdy-frontend/e2e/core-role-smoke.spec.ts`
- Modify only if reproduced: the smallest responsible file under `readdy-frontend/src/`

- [ ] **Step 1: 增加核心页面冒烟用例**

招聘专员登录后依次访问以下页面并断言地址、主标题、无“页面加载失败”：

```ts
const recruiterCorePages = [
  ['/jobs', '招聘需求'],
  ['/candidates', '简历库'],
  ['/kanban', '招聘进度'],
  ['/interviews', '面试管理'],
  ['/offers', 'Offer 管理'],
] as const;
```

经理额外访问 `/kanban` 和 `/analytics`，面试官、总监、管理员保留现有权限负路径。每次页面切换后检查不存在残留 `dialog`，页面 body 可继续滚动。

- [ ] **Step 2: 运行隔离浏览器冒烟**

Run:

```bash
bash scripts/run-isolated-browser-smoke.sh
```

Expected: 五角色和核心页面全部 PASS，脚本清理临时数据库和进程。

- [ ] **Step 3: 修复真实页面故障**

若失败，先保留 Playwright 失败步骤和截图，再为可下沉逻辑增加最小 Node 契约测试；只修改导致失败的页面/API 适配，不做视觉重构。修复后重跑失败用例和完整冒烟。

- [ ] **Step 4: 提交**

```bash
git add readdy-frontend/e2e/core-role-smoke.spec.ts readdy-frontend/src readdy-frontend/tests
git diff --cached --name-only
git commit -m "test: expand core trial browser smoke"
```

若没有修改生产代码，只暂存 E2E 文件。

---

### Task 5：把闭环门禁接入 CI 并更新试用说明

**Files:**

- Modify: `.gitlab-ci.yml`
- Modify: `backend/tests/test_deployment_artifacts.py`
- Modify: `docs/15_同事小范围试用说明.md`
- Modify: `docs/16_本地同事试用验收清单.md`

- [ ] **Step 1: 写 CI 失败测试**

在部署产物测试中断言 `backendCriticalBusiness` 明确包含 `backend/tests/test_core_trial_workflow.py`，并继续断言 `.gitlab-ci.yml` 不包含公司旧 GitLab 不支持的 `workflow:` 与 `auto_cancel:`。

- [ ] **Step 2: 验证测试先失败**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_deployment_artifacts.py::test_gitlab_pipeline_runs_core_trial_workflow -q
```

Expected: FAIL，提示 CI 尚未执行新闭环测试。

- [ ] **Step 3: 最小修改 CI**

只在 `backendCriticalBusiness` 的 pytest 文件清单加入 `backend/tests/test_core_trial_workflow.py`。不引入新 stage、`workflow.auto_cancel`、额外 Runner tag 或重复安装步骤。

- [ ] **Step 4: 更新同事试用说明和人工验收清单**

文档明确：允许授权同事使用真实数据；试用前由负责人确认备份与部署就绪；推荐顺序为需求 → 简历 → 流程 → 面试 → Offer → 看板；AI 和外部系统不作为放行项；删除、撤回、恢复和转派只对明确目标执行；问题反馈记录账号、Demand 编号、候选人 ID、步骤和截图，不在反馈群粘贴完整简历。

- [ ] **Step 5: 验证并提交**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_deployment_artifacts.py -q
git diff --check
```

Expected: 全部 PASS，GitLab 兼容性断言仍通过。

```bash
git add .gitlab-ci.yml backend/tests/test_deployment_artifacts.py docs/15_同事小范围试用说明.md docs/16_本地同事试用验收清单.md
git commit -m "ci: gate core internal trial workflow"
```

---

### Task 6：全量验证、证据收口和独立分支交付

**Files:**

- Update: `docs/verification/2026-08-13-core-trial-readiness/README.md`
- Verify: entire repository

- [ ] **Step 1: 运行后端和 Agent 全量测试**

```bash
.venv/bin/python -m pytest backend/tests base_agent/tests -q
```

Expected: 0 failures。

- [ ] **Step 2: 运行前端完整门禁**

```bash
cd readdy-frontend
npm run test:contract
npm run type-check
npm run lint
npm run build
```

Expected: 全部通过，构建成功。

- [ ] **Step 3: 运行隔离五角色浏览器冒烟**

```bash
cd ..
bash scripts/run-isolated-browser-smoke.sh
```

Expected: 六模块页面与五角色权限冒烟全部通过，临时服务全部退出。

- [ ] **Step 4: 运行发布门禁**

```bash
./scripts/check-sit-release.sh
```

Expected: 后端、前端、依赖安全、迁移、构建参数和 Git 清洁度通过；没有 `SIT_ENV_FILE` 时明确声明未冒充公司环境实值验收。

- [ ] **Step 5: 更新证据并做最终提交**

记录最终 SHA、测试数量、构建结果、浏览器结果、P0/P1 剩余数量、非放行能力和未连接公司真实数据库的边界。

```bash
git add docs/verification/2026-08-13-core-trial-readiness/README.md
git commit -m "docs: record core trial readiness evidence"
git status --short --branch
```

- [ ] **Step 6: 推送独立分支**

推送前再次确认流水线配置兼容、依赖安装有超时、构建 job 有超时，且本地全量门禁最新一轮通过。然后仅推送：

```bash
git push -u cfpd codex/core-trial-readiness-20260813
```

不合并到 `test`，向用户交付分支名、提交清单、验证证据和剩余风险。
