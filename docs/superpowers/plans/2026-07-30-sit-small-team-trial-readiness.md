# Test Small-Team Trial Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CFPD Test deployment safe for a small group of company-account testers to run every recruitment workflow except resume model parsing.

**Architecture:** Add one shared, least-privilege employee-code role-map format to the frontend and backend, and add an explicit backend switch that stores uploaded resumes without invoking the model. Keep all behavior behind environment configuration, reuse the existing manual resume editor, and harden release packaging so local artifacts are not staged or sent to Docker.

**Tech Stack:** Flask, SQLAlchemy, React, TypeScript, Vite, Node test runner, Pytest, Docker, GitLab CI/Libra.

---

### Task 1: Company employee-code role mapping

**Files:**
- Create: `backend/app/services/gateway_role_service.py`
- Create: `backend/tests/test_gateway_trial_roles.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/middleware/auth.py`
- Create: `readdy-frontend/src/auth/gatewayRoles.ts`
- Modify: `readdy-frontend/src/auth/companyAuth.tsx`
- Create: `readdy-frontend/tests/company-gateway-role-map.test.mjs`

- [ ] **Step 1: Write backend failing tests** for parsing `EMP001:admin,EMP002:interviewer`, rejecting unknown roles, falling back to `recruiter`, and synchronizing only explicitly mapped gateway users.
- [ ] **Step 2: Run** `../.venv/bin/python -m pytest tests/test_gateway_trial_roles.py -q` and verify failure because the role service does not exist.
- [ ] **Step 3: Implement** `parse_gateway_role_map(raw)` and `resolve_gateway_role(emp_code, raw, fallback='recruiter')` with the five existing roles and case-insensitive employee codes.
- [ ] **Step 4: Wire backend config and middleware** so `AUTH_GATEWAY_ROLE_MAP` controls explicit roles and `AUTH_GATEWAY_USER_ROLE` defaults to `recruiter`; JWT/GA behavior remains unchanged.
- [ ] **Step 5: Run backend tests** and verify they pass.
- [ ] **Step 6: Write frontend failing contract tests** requiring a shared parser, mapped-role priority, and recruiter fallback.
- [ ] **Step 7: Run** `node --test tests/company-gateway-role-map.test.mjs` and verify the expected contract failure.
- [ ] **Step 8: Implement frontend role parsing** and use `gateway role -> employee map -> recruiter fallback` in `companyAuth.tsx`.
- [ ] **Step 9: Run the frontend contract test** and verify it passes.

### Task 2: Explicitly disabled resume model with manual recovery

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/api/resume.py`
- Modify: `backend/app/services/resume_service.py`
- Create: `backend/tests/test_resume_ai_disabled_trial.py`
- Modify: `readdy-frontend/src/pages/candidates/components/ResumeRecoveryPanel.tsx`
- Create: `readdy-frontend/tests/resume-ai-disabled-trial.test.mjs`

- [ ] **Step 1: Write a failing backend upload test** with `RESUME_AI_ENABLED=false` that asserts the parser is not called, the raw file and candidate remain stored, `parse_status='failed'`, and the response tells the user to manually complete the profile.
- [ ] **Step 2: Run** `../.venv/bin/python -m pytest tests/test_resume_ai_disabled_trial.py -q` and verify it fails because the parser is still called.
- [ ] **Step 3: Add the configuration flag** with default `true` and a single stable Chinese message for the disabled state.
- [ ] **Step 4: Implement the minimal upload branch** that uses the existing failed-candidate/manual-edit path without invoking the parser or retrying.
- [ ] **Step 5: Run backend tests** and verify they pass.
- [ ] **Step 6: Write a failing frontend contract test** requiring the disabled-state message and the existing manual-edit action.
- [ ] **Step 7: Update the existing recovery panel copy** without adding a page or new workflow state.
- [ ] **Step 8: Run the frontend contract test** and verify it passes.

### Task 3: Test environment and release packaging

**Files:**
- Create: `backend/sit-team-trial.env.example`
- Modify: `readdy-frontend/Dockerfile`
- Modify: `Makefile`
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Modify: `backend/tests/test_deployment_artifacts.py`
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1: Add failing deployment tests** asserting recruiter-safe frontend defaults, injectable frontend role map, the small-team SIT template, `RESUME_AI_ENABLED=false`, persistent path examples, and ignored local artifacts.
- [ ] **Step 2: Run** `../.venv/bin/python -m pytest tests/test_deployment_artifacts.py -q` and verify the new assertions fail.
- [ ] **Step 3: Add the Test template** with sample employee codes, persistent MySQL/uploads placeholders, fixed-secret placeholders, RC safety settings, and no model API keys.
- [ ] **Step 4: Add Docker build arguments** for `VITE_DEFAULT_ROLE=recruiter` and `VITE_GATEWAY_ROLE_MAP`, and pass them from the Makefile without changing image names.
- [ ] **Step 5: Ignore local artifacts** in Git and Docker contexts without deleting existing files.
- [ ] **Step 6: Update deployment documentation** to migration head `20260730_13`, CFPD `test`, API-triggered pipeline, database backup, single-instance migration, role-map setup, and the manual resume path.
- [ ] **Step 7: Run deployment tests** and verify they pass.

### Task 4: Full verification and release-scope report

**Files:**
- Verify all modified files from Tasks 1-3.

- [ ] **Step 1: Run backend full suite** with `../.venv/bin/python -m pytest -q` from `backend` and require zero failures.
- [ ] **Step 2: Run frontend tests** with `node --test tests/*.test.mjs` and require zero failures.
- [ ] **Step 3: Run frontend type-check, lint, and build** using `npm run type-check`, `npm run lint`, and `npm run build`.
- [ ] **Step 4: Run release checks** using `git diff --check`, secret-pattern filename scan, Alembic head inspection, and `make -n build PKG_TAG=RC PKG_VERSION=trial-check`.
- [ ] **Step 5: Report the exact release file list**, files intentionally excluded, current CFPD Test SHA, target commit contents, remaining environment values, and risks.
- [ ] **Step 6: Do not commit or push** until the user reviews the release scope and explicitly approves those actions.
