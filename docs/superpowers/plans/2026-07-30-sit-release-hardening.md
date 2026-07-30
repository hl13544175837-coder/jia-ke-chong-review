# Test/SIT Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the local CFPD Test baseline into a secure, traceable, repeatable release candidate without publishing it or changing Mock data.

**Architecture:** Keep the existing React/Vite frontend and Flask backend. Add small release-focused boundaries: pinned dependency audit tooling, a Test/SIT configuration profile, non-secret build metadata, and one repository-level release gate that only orchestrates existing checks.

**Tech Stack:** React 19, Vite 8, TypeScript, Flask 3.1, Pytest, Alembic, npm audit, pip-audit, POSIX shell, Docker/Make.

---

## File map

- `readdy-frontend/package.json`, `readdy-frontend/package-lock.json`: patched JavaScript dependencies.
- `scripts/check-frontend-audit.mjs`: fail on every high-severity npm advisory except the single reviewed RSC-only exception.
- `backend/requirements-audit.txt`: pinned audit-only Python tool; not included in the runtime image.
- `backend/scripts/check_pilot_readiness.py`: shared production and Test/SIT configuration checks.
- `backend/tests/test_config_validation.py`: behavior tests for the Test/SIT profile and redaction.
- `backend/app/build_info.py`: one owner for non-secret backend build metadata.
- `backend/app/__init__.py`: expose build metadata through `/actuator/info`; leave liveness unchanged.
- `backend/tests/test_healthcheck.py`: build-info response contract.
- `readdy-frontend/src/config/buildInfo.ts`: one owner for frontend build metadata and display formatting.
- `readdy-frontend/src/pages/login/page.tsx`: low-noise Test/RC version display.
- `readdy-frontend/tests/build-info-contract.test.mjs`: frontend metadata and login display contract.
- `readdy-frontend/Dockerfile`, `backend/Dockerfile`, `Makefile`: inject the same version/channel/time into both images.
- `scripts/check-sit-release.sh`: one release-candidate gate; no dependency mutation, Git commit, push, migration, or data cleanup.
- `backend/tests/test_deployment_artifacts.py`: packaging and release-gate contracts.
- `AGENTS.md`, `README.md`, `RUNNING.md`, `DEPLOYMENT.md`, `docs/README.md`, `docs/06_试点上线检查清单.md`, `docs/07_上线部署前关键清单_给AI执行.md`, `docs/08_Libra_SIT发布路线.md`, `docs/12_5190真实上线改造矩阵.md`: current-source documentation corrections only.

### Task 1: Remove JavaScript high-severity audit findings

**Files:**
- Modify: `readdy-frontend/package.json`
- Modify: `readdy-frontend/package-lock.json`

- [ ] **Step 1: Record the current failing audit**

Run:

```bash
cd readdy-frontend
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

Expected: non-zero results identifying the React Router runtime chain and the ESLint/minimatch development chain.

- [ ] **Step 2: Apply compatible dependency updates**

Use the current stable Router and the current ESLint major so historical
runtime and tooling advisories are fixed:

```bash
cd readdy-frontend
npm install --save-exact react-router-dom@7.18.2
npm install --save-dev eslint@^10.8.0 @eslint/js@^10.0.1 eslint-plugin-react-hooks@^7.1.1
```

React Hooks 7 enables compiler-oriented lint rules that would require a broad
behavioral refactor. Preserve the previous lint contract in
`readdy-frontend/eslint.config.ts` during this security-only upgrade:

```typescript
'react-hooks/set-state-in-effect': 'off',
'react-hooks/refs': 'off',
'react-hooks/purity': 'off',
```

Review `package.json` and `package-lock.json`; do not accept a Node engine
change outside the existing supported range. Code search must show BrowserRouter
usage and no RSC router, Server Action or server-side Router handler.

- [ ] **Step 3: Verify audits are green**

Run:

```bash
cd readdy-frontend
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

Expected: the full and runtime audits report only
`GHSA-qwww-vcr4-c8h2`. This upstream advisory affects RSC action processing;
the repository must continue to have no RSC entrypoint. Task 5 adds the strict
machine-readable checker that allows only this one reviewed advisory and fails
on every other high-severity result.

- [ ] **Step 4: Verify frontend compatibility**

Run:

```bash
cd readdy-frontend
node --test tests/*.test.mjs
npm run type-check
npm run lint
npm run build
```

Expected: every command exits 0; BrowserRouter navigation remains unchanged.

- [ ] **Step 5: Commit the dependency fix**

```bash
git add docs/superpowers/specs/2026-07-30-sit-release-hardening-design.md docs/superpowers/plans/2026-07-30-sit-release-hardening.md readdy-frontend/package.json readdy-frontend/package-lock.json readdy-frontend/eslint.config.ts
git commit -m "fix: patch frontend dependency vulnerabilities"
```

### Task 2: Add reproducible Python dependency auditing

**Files:**
- Create: `backend/requirements-audit.txt`
- Modify: `backend/tests/test_deployment_artifacts.py`
- Modify: `.gitignore` only if the audit tool produces an unignored local artifact.

- [ ] **Step 1: Write a failing packaging contract**

Add a test that requires an audit-only requirements file and prevents it from entering `backend/Dockerfile`:

```python
def test_python_dependency_audit_is_pinned_and_not_in_runtime_image():
    audit_requirements = (ROOT / "backend" / "requirements-audit.txt").read_text(encoding="utf-8")
    dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")

    assert audit_requirements.strip() == "pip-audit==2.10.1"
    assert "requirements-audit.txt" not in dockerfile
```

- [ ] **Step 2: Run the test and verify red**

Run:

```bash
./.venv/bin/python -m pytest backend/tests/test_deployment_artifacts.py::test_python_dependency_audit_is_pinned_and_not_in_runtime_image -q
```

Expected: FAIL because `backend/requirements-audit.txt` does not exist.

- [ ] **Step 3: Add the pinned audit tool file**

Create `backend/requirements-audit.txt` containing exactly:

```text
pip-audit==2.10.1
```

- [ ] **Step 4: Install the local audit tool and run it**

Run:

```bash
./.venv/bin/python -m pip install -r backend/requirements-audit.txt
./.venv/bin/python -m pip_audit -r backend/requirements.txt
```

Expected: the tool runs reproducibly. If it reports a dependency vulnerability, update only the affected direct pin in `backend/requirements.txt`, then run the full backend suite before committing.

- [ ] **Step 5: Verify and commit**

Run:

```bash
./.venv/bin/python -m pytest backend/tests/test_deployment_artifacts.py -q
```

Then:

```bash
git add backend/requirements-audit.txt backend/requirements.txt backend/tests/test_deployment_artifacts.py
git commit -m "test: add reproducible Python dependency audit"
```

### Task 3: Add a Test/SIT readiness profile

**Files:**
- Modify: `backend/scripts/check_pilot_readiness.py`
- Modify: `backend/tests/test_config_validation.py`
- Modify: `backend/sit-team-trial.env.example` only if a checked key is missing or contradictory.

- [ ] **Step 1: Write failing Test/SIT profile tests**

Add tests for a safe Test/SIT configuration and for the highest-risk failures:

```python
def _safe_sit_values():
    return {
        "JWT_SECRET": "s" * 48,
        "JWT_EXPIRY_HOURS": "8",
        "FLASK_DEBUG": "false",
        "ALLOW_INSECURE_SIT_STARTUP": "true",
        "DATABASE_URL": "mysql+pymysql://user:secret@db.internal:3306/zhipin_test",
        "CORS_ORIGINS": "https://test-zhipin.yimidida.com",
        "SECURITY_HEADERS_ENABLED": "true",
        "RATE_LIMIT_ENABLED": "true",
        "RATE_LIMIT_LOGIN": "10",
        "RATE_LIMIT_AGENT_CHAT": "20",
        "RATE_LIMIT_RESUME_UPLOAD": "8",
        "BACKUP_DIR": "/var/lib/zhipin/backups",
        "UPLOAD_FOLDER": "/var/lib/zhipin/uploads",
        "LOCAL_SCHEMA_COMPAT": "false",
        "AUTO_MIGRATE_DATABASE": "true",
        "ALLOW_EMPTY_DATABASE_BOOTSTRAP": "true",
        "ALLOW_PUBLIC_REGISTRATION": "false",
        "BOSS_CLI_AUTO_INSTALL": "false",
        "RESUME_AI_ENABLED": "false",
        "AUTH_DISABLED": "true",
        "AUTH_GATEWAY_USER_ROLE": "recruiter",
        "AUTH_GATEWAY_ROLE_MAP": "EMP_HR:recruiter,EMP_INTERVIEWER:interviewer",
        "FIELD_ENCRYPTION_KEY": Fernet.generate_key().decode("ascii"),
    }


def test_sit_profile_accepts_safe_small_team_configuration(tmp_path):
    checks = run_checks(
        _safe_sit_values(), ROOT, tmp_path / ".env", profile="sit-team"
    )
    assert [check.name for check in checks if not check.ok] == []


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("RESUME_AI_ENABLED", "true"),
        ("ALLOW_PUBLIC_REGISTRATION", "true"),
        ("SECURITY_HEADERS_ENABLED", "false"),
        ("AUTH_GATEWAY_USER_ROLE", "admin"),
        ("JWT_SECRET", "REPLACE_WITH_32_PLUS_RANDOM_CHARACTERS"),
    ],
)
def test_sit_profile_rejects_dangerous_or_placeholder_values(tmp_path, key, value):
    values = _safe_sit_values()
    values[key] = value
    checks = run_checks(values, ROOT, tmp_path / ".env", profile="sit-team")
    assert any(check.name == key and not check.ok for check in checks)
```

Import `Fernet` from `cryptography.fernet`; the safe configuration must have zero failures.

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
./.venv/bin/python -m pytest backend/tests/test_config_validation.py -q
```

Expected: FAIL because `run_checks` does not accept `profile`.

- [ ] **Step 3: Implement explicit profile rules**

Extend the public function without changing its existing callers:

```python
def run_checks(values, project_root, env_file, *, profile="production"):
    if profile not in {"production", "sit-team"}:
        raise ValueError(f"unsupported readiness profile: {profile}")
    is_sit_team = profile == "sit-team"
    # Reuse shared checks, with explicit Test/SIT expectations for AI,
    # registration, role fallback, startup migration and placeholders.
```

Add CLI support:

```python
parser.add_argument(
    "--profile",
    choices=("production", "sit-team"),
    default="production",
)
```

The Test/SIT profile must require:

- MySQL/PostgreSQL and persistent absolute upload/backup paths.
- strong JWT and valid Fernet keys without printing them.
- `RESUME_AI_ENABLED=false`.
- `ALLOW_PUBLIC_REGISTRATION=false`.
- `SECURITY_HEADERS_ENABLED=true` and `RATE_LIMIT_ENABLED=true`.
- `AUTH_GATEWAY_USER_ROLE=recruiter` and a parseable role map.
- no `REPLACE_*` values.

- [ ] **Step 4: Run profile tests and CLI smoke checks**

Run:

```bash
./.venv/bin/python -m pytest backend/tests/test_config_validation.py -q
./.venv/bin/python backend/scripts/check_pilot_readiness.py --profile sit-team --env-file backend/sit-team-trial.env.example
```

Expected: tests pass; the example file exits non-zero because it intentionally contains deployment placeholders, without printing secret values.

- [ ] **Step 5: Commit the profile**

```bash
git add backend/scripts/check_pilot_readiness.py backend/tests/test_config_validation.py backend/sit-team-trial.env.example
git commit -m "feat: validate small-team SIT configuration"
```

### Task 4: Add non-secret build identity

**Files:**
- Create: `backend/app/build_info.py`
- Modify: `backend/app/__init__.py`
- Modify: `backend/tests/test_healthcheck.py`
- Create: `readdy-frontend/src/config/buildInfo.ts`
- Modify: `readdy-frontend/src/pages/login/page.tsx`
- Create: `readdy-frontend/tests/build-info-contract.test.mjs`
- Modify: `readdy-frontend/Dockerfile`
- Modify: `backend/Dockerfile`
- Modify: `Makefile`
- Modify: `backend/tests/test_deployment_artifacts.py`

- [ ] **Step 1: Write failing backend and frontend contracts**

Backend response contract:

```python
def test_actuator_info_exposes_non_secret_build_identity(client, monkeypatch):
    response = client.get("/actuator/info")
    payload = response.get_json()["app"]
    assert payload["version"]
    assert payload["channel"]
    assert payload["schema"] == "20260730_13"
    assert "secret" not in str(payload).lower()
    assert "database" not in str(payload).lower()
```

Frontend source contract:

```javascript
test('Test 登录页显示低干扰版本身份证', () => {
  assert.match(buildInfoSource, /VITE_BUILD_VERSION/);
  assert.match(buildInfoSource, /VITE_BUILD_CHANNEL/);
  assert.match(loginSource, /formatBuildLabel/);
});
```

Packaging contract must require `BUILD_VERSION`, `BUILD_CHANNEL`, and `BUILD_TIME` build arguments in both Dockerfiles and the Makefile dry run.

- [ ] **Step 2: Run contracts and verify red**

Run:

```bash
./.venv/bin/python -m pytest backend/tests/test_healthcheck.py backend/tests/test_deployment_artifacts.py -q
cd readdy-frontend && node --test tests/build-info-contract.test.mjs
```

Expected: FAIL because build identity files and build arguments do not exist.

- [ ] **Step 3: Implement backend build identity**

Create one immutable, non-secret mapping:

```python
import os

EXPECTED_SCHEMA_REVISION = "20260730_13"


def public_build_info():
    return {
        "name": "zhipin-server",
        "description": "智聘 · AI 招聘管理系统",
        "version": os.environ.get("BUILD_VERSION", "local").strip() or "local",
        "channel": os.environ.get("BUILD_CHANNEL", "local").strip() or "local",
        "build_time": os.environ.get("BUILD_TIME", "unknown").strip() or "unknown",
        "schema": EXPECTED_SCHEMA_REVISION,
    }
```

Use it only in `/actuator/info`; keep `/api/health` unchanged.

- [ ] **Step 4: Implement frontend build identity**

Create:

```typescript
export const buildInfo = {
  version: (import.meta.env.VITE_BUILD_VERSION || 'local').trim() || 'local',
  channel: (import.meta.env.VITE_BUILD_CHANNEL || 'local').trim() || 'local',
  buildTime: (import.meta.env.VITE_BUILD_TIME || 'unknown').trim() || 'unknown',
};

export const formatBuildLabel = () =>
  `${buildInfo.channel === 'RC' ? 'Test RC' : buildInfo.channel} · ${buildInfo.version}`;
```

Render `formatBuildLabel()` beside the existing internal-use footer without changing login behavior.

- [ ] **Step 5: Inject identical metadata into both images**

Add Make defaults:

```make
BUILD_VERSION ?= $(shell git rev-parse --short=12 HEAD)
BUILD_TIME ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
override BUILD_CHANNEL := $(PKG_TAG)
```

Pass `BUILD_VERSION`, `BUILD_CHANNEL`, and `BUILD_TIME` to both Docker builds. Map them to `VITE_BUILD_*` during the frontend build and to runtime `ENV` values in the backend image.

- [ ] **Step 6: Verify metadata contracts and existing behavior**

Run:

```bash
./.venv/bin/python -m pytest backend/tests/test_healthcheck.py backend/tests/test_deployment_artifacts.py -q
cd readdy-frontend
node --test tests/build-info-contract.test.mjs tests/login-copy-contract.test.mjs
npm run type-check
npm run build
```

Expected: all commands exit 0; the login form remains usable and metadata contains no secrets.

- [ ] **Step 7: Commit build identity**

```bash
git add Makefile backend/Dockerfile backend/app/__init__.py backend/app/build_info.py backend/tests/test_healthcheck.py backend/tests/test_deployment_artifacts.py readdy-frontend/Dockerfile readdy-frontend/src/config/buildInfo.ts readdy-frontend/src/pages/login/page.tsx readdy-frontend/tests/build-info-contract.test.mjs
git commit -m "feat: expose traceable SIT build identity"
```

### Task 5: Add one repository-level release gate

**Files:**
- Create: `scripts/check-frontend-audit.mjs`
- Create: `scripts/check-sit-release.sh`
- Modify: `backend/tests/test_deployment_artifacts.py`

- [ ] **Step 1: Write a failing release-gate contract**

Require the script to be strict, non-mutating, and complete:

```python
def test_sit_release_gate_runs_required_checks_without_mutating_release_state():
    script = (ROOT / "scripts" / "check-sit-release.sh").read_text(encoding="utf-8")
    assert "set -euo pipefail" in script
    for required in [
        "pytest backend/tests base_agent/tests",
        "node --test tests/*.test.mjs",
        "npm run type-check",
        "npm run lint",
        "npm run build",
        "npm audit",
        "pip_audit",
        "alembic heads",
        "git diff --check",
        "make -n build",
    ]:
        assert required in script
    for forbidden in ["git push", "git commit", "alembic upgrade", "npm audit fix", "rm -rf"]:
        assert forbidden not in script
```

Also require `scripts/check-frontend-audit.mjs` to execute `npm audit --json`,
collect all high/critical advisory IDs, allow only
`GHSA-qwww-vcr4-c8h2`, verify the frontend source contains no RSC entrypoint,
print that exception explicitly, and exit non-zero for any additional ID.

- [ ] **Step 2: Run the contract and verify red**

Run:

```bash
./.venv/bin/python -m pytest backend/tests/test_deployment_artifacts.py::test_sit_release_gate_runs_required_checks_without_mutating_release_state -q
```

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement the strict gate**

Start the script with:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON_BIN="$PROJECT_DIR/.venv/bin/python"
EXPECTED_SCHEMA="20260730_13"
```

Add a `run_step` helper that prints a short Chinese stage label and then executes the supplied command. The gate must:

1. fail with installation guidance when `.venv`, `node_modules`, or `pip_audit` is missing;
2. run backend tests and frontend tests/checks;
3. run npm runtime and full high-severity audits plus Python audit;
4. require exactly one Alembic head equal to `20260730_13`;
5. run `git diff --check` and fail if tracked paths match real `.env`, database, backup, upload, or runtime artifact patterns;
6. dry-run the RC Make build with the current short SHA and a fixed check timestamp;
7. print the local commit, schema, AI-disabled scope, Mock-retained scope, and “未推送/未发布” limitation.

It must not install, fix, migrate, delete, commit, push, or publish anything.

- [ ] **Step 4: Verify the contract and shell syntax**

Run:

```bash
bash -n scripts/check-sit-release.sh
./.venv/bin/python -m pytest backend/tests/test_deployment_artifacts.py -q
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the release gate**

```bash
git add scripts/check-sit-release.sh backend/tests/test_deployment_artifacts.py
git commit -m "chore: add unified SIT release gate"
```

### Task 6: Align current documentation with the actual release candidate

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `RUNNING.md`
- Modify: `DEPLOYMENT.md`
- Modify: `docs/README.md`
- Modify: `docs/06_试点上线检查清单.md`
- Modify: `docs/07_上线部署前关键清单_给AI执行.md`
- Modify: `docs/08_Libra_SIT发布路线.md`
- Modify: `docs/12_5190真实上线改造矩阵.md`

- [ ] **Step 1: Capture stale current-source references**

Run:

```bash
rg -n '20260729_11|frontend/' AGENTS.md README.md RUNNING.md DEPLOYMENT.md docs/README.md docs/06_试点上线检查清单.md docs/07_上线部署前关键清单_给AI执行.md docs/08_Libra_SIT发布路线.md docs/12_5190真实上线改造矩阵.md
```

Expected: current-source references still point at the deleted frontend or old schema head.

- [ ] **Step 2: Correct only current truth**

Apply these exact rules:

- active frontend source/build output is `readdy-frontend/` and `readdy-frontend/out/`;
- expected Alembic head is `20260730_13`;
- Test/SIT resume AI is disabled and manual completion is the supported recovery path;
- Mock data is explicitly retained in this release and therefore Test acceptance is not proof that every page is production data;
- local completion, CFPD push, Libra build, and SIT deployment remain separate states;
- current release verification uses `scripts/check-sit-release.sh` plus company-environment checks after publication;
- historical commit narratives remain labeled history rather than being rewritten as current evidence.

- [ ] **Step 3: Verify documentation consistency**

Run targeted scans that permit explicitly historical references but reject current instructions using the old path/head. Also run:

```bash
git diff --check
./.venv/bin/python -m pytest backend/tests/test_deployment_artifacts.py -q
```

Expected: current commands and architecture descriptions use the active frontend and current schema.

- [ ] **Step 4: Commit documentation**

```bash
git add AGENTS.md README.md RUNNING.md DEPLOYMENT.md docs/README.md docs/06_试点上线检查清单.md docs/07_上线部署前关键清单_给AI执行.md docs/08_Libra_SIT发布路线.md docs/12_5190真实上线改造矩阵.md
git commit -m "docs: align SIT release instructions with current code"
```

### Task 7: Run final regression and produce the local handoff

**Files:**
- Modify only files required by reproducible failures discovered in Tasks 1-6.
- Do not modify Mock data or company-environment values.

- [ ] **Step 1: Run focused recovery-path regressions**

Run:

```bash
./.venv/bin/python -m pytest backend/tests/test_resume_ai_disabled_trial.py backend/tests/test_resume_recovery_workflow.py backend/tests/test_idempotency_keys.py backend/tests/test_auth_security.py -q
cd readdy-frontend
node --test tests/resume-ai-disabled-trial.test.mjs tests/resume-recovery-contract.test.mjs tests/login-copy-contract.test.mjs
```

Expected: all pass. Only fix a failure when it is reproducible on the approved baseline and within the approved scope.

- [ ] **Step 2: Run the unified release gate**

Run:

```bash
./scripts/check-sit-release.sh
```

Expected: exit 0 with backend, frontend, audits, schema, Git, packaging, version and limitation summaries all green.

- [ ] **Step 3: Verify repository scope**

Run:

```bash
git status --short --branch
git diff --check
git log --oneline refs/remotes/cfpd/test..HEAD
git diff --stat refs/remotes/cfpd/test..HEAD
```

Expected: only the design, plan and approved hardening changes exist on `codex/sit-release-hardening`; no Mock cleanup, runtime data, remote push or deployment artifact is present.

- [ ] **Step 4: Create a final local verification commit only if Task 7 required scoped fixes**

Stage only the exact files changed for reproducible failures, then:

```bash
git commit -m "fix: close SIT release verification gaps"
```

If no scoped fixes were required, do not create an empty commit.

- [ ] **Step 5: Deliver the local release-candidate report**

Report in plain Chinese:

- what changed and why it reduces hidden defects;
- exact backend/frontend test totals;
- npm and Python audit results;
- current branch and commit list;
- one-command gate usage;
- Mock retained, AI disabled, local data untouched;
- no push and no Libra/SIT deployment;
- company information still required only for the later environment phase.
