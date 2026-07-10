# Demand-scoped Recruitment P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans`, `test-driven-development`, and `verification-before-completion`. Execute in isolated worktree `codex/demand-scoped-p0`; do not modify the dirty `codex/p0-control-hardening` checkout.

**Goal:** 把职位模板与具体招聘需求拆开，令候选人流程、面试、Offer、HC、审计和 BI 以 `demand_id` 为事实归属，并完成一期需求工作台、简历阅读和试点入口收口。

**Architecture:** 保持 React + Flask 模块化单体。`RecruitmentDemand` 是业务聚合根；API 只做参数与响应，领域不变量进入 services；兼容期 demand/job 双写，匹配继续 job-scoped；迁移使用版本 ledger 和独立 backfill，不在应用多 worker 启动时做复杂 DDL。

**Tech Stack:** Flask 3.1, SQLAlchemy 2.0, pytest, Alembic, React 18, TypeScript, Vite 8, Node source-contract tests.

## 执行状态（2026-07-10）

- Phase 1–7 的 P0 代码和对应 PRD/SDD/BI/试点文档已在隔离工作区 `codex/demand-scoped-p0` 实施，尚未提交、合并或发布。
- 当前验证基线：backend `259 passed`、base_agent `6 passed`，前端 test/typecheck/lint/build 全部通过。
- SQLite Expand → audit → dry-run/apply backfill → verify → downgrade/upgrade 链路已验证；严格 cutover 仍为 **NO-GO**，须先补齐 Strict revision、B 类历史需求审批创建、Notification/UploadBatch 对账、真实 MySQL/PostgreSQL 迁移/恢复演练，并移除生产 worker 启动时的 `create_all`/兼容 ALTER。
- 以下 checklist 保留为文件级实施与发布证据清单；未有真实环境证据的项目不因本地测试通过而自动勾选。

---

## Phase 0 — Protect baseline and freeze scope

### Task 0.1: Record audit and supersede conflicting assumption

**Files:**
- Create: `docs/superpowers/specs/2026-07-10-demand-scoped-recruitment-design.md`
- Create: `docs/superpowers/plans/2026-07-10-demand-scoped-recruitment-p0.md`
- Modify later: `docs/README.md`

- [ ] Confirm original checkout remains unchanged with `git -C /Users/yenns/Desktop/智聘 status --short`.
- [ ] In the isolated worktree, run baseline backend and frontend gates.
- [ ] Mark the previous “one open Demand per Job” spec as superseded in `docs/README.md`; do not delete historical files.
- [ ] Keep all unrelated security/OA/deployment WIP outside this branch.

**Verification:**

```bash
python3 -m pytest backend/tests base_agent/tests -q
cd frontend && npm test && npm run lint && npm run typecheck
```

Expected baseline: backend 195 passed; frontend commands exit 0.

## Phase 1 — Expand schema and make migration observable

### Task 1.1: Add failing model contract tests

**Files:**
- Create: `backend/tests/test_demand_scope_models.py`
- Modify: `backend/tests/test_schema_compatibility.py`

- [ ] Test `RecruitmentDemand` snapshots, owner/creator, close metadata and indexes.
- [ ] Test `Candidate.current_demand_id` and `CandidateDemandFlow` unique relationship.
- [ ] Test nullable `demand_id` on Pipeline/Interview/Assignment/Feedback/Offer/Disposition/Event/Notification/UploadBatch.
- [ ] Test `InterviewAssignment.round_sequence/is_primary` and `InterviewFeedback.assignment_id`.
- [ ] Test `transferred` is a valid terminal stage distinct from `rejected`.
- [ ] Run tests and confirm RED due to missing columns/models.

### Task 1.2: Minimal additive model implementation

**Files:**
- Modify: `backend/app/models.py`

- [ ] Add `CandidateDemandFlow` and additive columns only.
- [ ] Keep `Match.job_id` unchanged.
- [ ] Add cross-engine-safe indexes and uniqueness; no partial indexes.
- [ ] Run Phase 1 model tests GREEN.

### Task 1.3: Add versioned migration and dry-run audit

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/alembic.ini`
- Create: `backend/migrations/env.py`
- Create: `backend/migrations/script.py.mako`
- Create: `backend/migrations/versions/20260710_01_expand_demand_scope.py`
- Create: `backend/scripts/audit_demand_scope.py`
- Create: `backend/scripts/backfill_demand_scope.py`
- Create: `backend/scripts/verify_demand_scope.py`
- Create: `backend/tests/test_demand_scope_migration.py`

- [ ] RED: fixture DBs for zero Demand, one Demand, multiple unambiguous and multiple ambiguous Demand.
- [ ] Implement audit categories A-E and JSON/CSV-safe report objects.
- [ ] Implement idempotent backfill that applies only approved mappings; default is dry-run.
- [ ] Verify every migrated fact maps once and `job_id == demand.job_id`.
- [ ] Add schema revision check; do not run Alembic upgrade from each app worker.
- [ ] GREEN on SQLite file DB; document MySQL/PostgreSQL integration as release gate if not locally available.

**Verification:**

```bash
python3 -m pytest backend/tests/test_demand_scope_models.py backend/tests/test_schema_compatibility.py backend/tests/test_demand_scope_migration.py -q
```

## Phase 2 — Demand aggregate, permissions, list and idempotent creation

### Task 2.1: Demand context and access services

**Files:**
- Create: `backend/app/services/demand_context_service.py`
- Create: `backend/app/services/demand_service.py`
- Modify: `backend/app/api/access.py`
- Create: `backend/tests/test_demand_scope_permissions.py`

- [ ] RED: same Job has two active Demands with different owners; each recruiter sees/manages only their Demand.
- [ ] RED: Job template owner does not gain process access to all linked Demands.
- [ ] Implement `resolve_demand`, same-org/job consistency, unique legacy resolver and `demand_id_required` 409.
- [ ] Implement visible/manage demand queries used by all downstream APIs.

### Task 2.2: Demand CRUD and list contract

**Files:**
- Modify: `backend/app/api/demands.py`
- Modify: `backend/tests/test_demand_management.py`
- Modify: `backend/app/middleware/events.py`

- [ ] Replace old test that rejects a second open Demand with test proving two Demands under one Job remain independent.
- [ ] RED required fields: Job/JD, department, city, HC, requested date, hiring manager, recruiter owner, target date.
- [ ] RED list: status tabs, keyword/department/city/owner filters, pagination, `created_at desc` default.
- [ ] RED idempotency: same key/body returns original 201 response; key reused with changed body returns 409.
- [ ] Remove Job close/restore/owner synchronization.
- [ ] Demand owner transfer updates active flows/current candidate owners only and writes demand-indexed Event.
- [ ] Return `completion_suggested` from demand metrics without auto-closing.

**Verification:**

```bash
python3 -m pytest backend/tests/test_demand_management.py backend/tests/test_demand_scope_permissions.py backend/tests/test_idempotency_keys.py -q
```

## Phase 3 — Candidate flow, atomic transfer, Offer and HC

### Task 3.1: Pipeline domain service

**Files:**
- Create: `backend/app/services/pipeline_service.py`
- Modify: `backend/app/api/pipeline.py`
- Modify: `backend/app/api/candidates.py`
- Modify: `backend/app/api/jobs.py`
- Modify: `backend/app/api/resume.py`
- Modify: `backend/app/services/boss_pipeline_service.py`
- Modify: `backend/seed_dev.py`
- Create: `backend/tests/test_demand_pipeline_isolation.py`
- Modify: `backend/tests/test_pipeline_rounds.py`
- Modify: `backend/tests/test_candidate_journey.py`
- Modify: `backend/tests/test_job_match_batch_pipeline.py`

- [ ] RED: two active Demands under one Job have isolated boards/history/Offer/metrics.
- [ ] RED: candidate cannot join a second active Demand; candidate row lock is used.
- [ ] RED transfer transaction: source latest stage `transferred`, target `pending`, owner follows target, no disposition/rejection increment.
- [ ] RED failure halfway rolls back all source/target/current-pointer changes.
- [ ] RED onboarded reaches HC and returns suggestion while Demand remains active.
- [ ] Implement demand-scoped read/write routes and compatibility wrappers.
- [ ] Hidden BOSS/job-only automatic pipeline writes fail closed until a Demand is supplied.
- [ ] Keep matching and JD comparison job-scoped.

**Verification:**

```bash
python3 -m pytest backend/tests/test_demand_pipeline_isolation.py backend/tests/test_pipeline_rounds.py backend/tests/test_candidate_journey.py backend/tests/test_job_match_batch_pipeline.py -q
```

## Phase 4 — Interview rounds and AI safety

### Task 4.1: Interview workflow service

**Files:**
- Create: `backend/app/services/interview_workflow_service.py`
- Modify: `backend/app/services/interview_service.py`
- Modify: `backend/app/api/interview.py`
- Modify: `backend/tests/test_interview_loop.py`
- Modify: `backend/tests/test_workflow_enhancements.py`
- Modify: `backend/tests/test_mvp_interview_pipeline_simplification.py`
- Create: `backend/tests/test_demand_interview_rounds.py`

- [ ] RED: all interview records are demand-scoped and cannot cross owners/orgs.
- [ ] RED: one active primary interviewer per demand/candidate/round sequence.
- [ ] RED: assistant feedback does not complete round; primary feedback returns `round_completed=true`.
- [ ] RED: no feedback changes PipelineStage; only HR/manager/admin may advance/reject.
- [ ] Implement assignment/feedback linkage, notification `demand_id`, and demand deep links.

### Task 4.2: Remove AI workflow writes

**Files:**
- Modify: `backend/app/services/agent_service.py`
- Modify: `backend/app/api/agent.py`
- Modify: `backend/tests/test_agent_pipeline_stage_contract.py`
- Modify: `backend/tests/test_access_control_hardening.py`

- [ ] RED: AI pre-screen pass/fail saves report but PipelineStage count is unchanged.
- [ ] RED: agent tool catalogue does not expose automatic reject/Offer/reassign/move tools.
- [ ] Keep parse/match/summarize/suggest tools; demand-scoped read tools enforce RBAC.
- [ ] Reuse the same BI service rather than duplicate a second AI BI definition.

**Verification:**

```bash
python3 -m pytest backend/tests/test_demand_interview_rounds.py backend/tests/test_interview_loop.py backend/tests/test_workflow_enhancements.py backend/tests/test_agent_pipeline_stage_contract.py backend/tests/test_access_control_hardening.py -q
```

## Phase 5 — Audit and operational BI

### Task 5.1: Demand-indexed audit

**Files:**
- Modify: `backend/app/middleware/events.py`
- Modify: `backend/app/api/admin.py`
- Modify: `backend/tests/test_audit_trail_pilot.py`

- [ ] RED: create/transfer/reassign/pause/cancel/close/interview/Offer events carry queryable demand_id.
- [ ] RED: historical actors do not change after owner transfer.
- [ ] Add audit query filter by demand; keep Event as the single audit truth.

### Task 5.2: One demand-scoped BI service

**Files:**
- Create: `backend/app/services/bi_service.py`
- Modify: `backend/app/api/bi.py`
- Modify: `backend/app/services/agent_service.py`
- Modify: `backend/tests/test_bi_metrics.py`
- Create: `backend/tests/test_demand_bi_isolation.py`

- [ ] RED: funnel, stage age, outstanding feedback, Offer, HC and owner accountability do not mix sibling Demands.
- [ ] RED: `transferred` is reported separately from rejection.
- [ ] RED: owner metrics reflect current responsibility; label and docs explicitly say operational collaboration, not performance.
- [ ] Add `/api/bi/demand/:demand_id`; legacy job view is explicitly aggregate or returns 409 when single-demand semantics are requested.

**Verification:**

```bash
python3 -m pytest backend/tests/test_audit_trail_pilot.py backend/tests/test_bi_metrics.py backend/tests/test_demand_bi_isolation.py -q
```

## Phase 6 — Trial navigation and Demand workspace

### Task 6.1: Hide unavailable entry points

**Files:**
- Modify: `frontend/src/app/featureRegistry.ts`
- Modify: `frontend/src/components/recruitment/RecruitmentManagementTabs.tsx`
- Modify: `frontend/src/features/demands/index.ts`
- Modify: `frontend/src/lib/nav.ts`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/tests/feature_registry.test.mjs`
- Modify: `frontend/tests/talent_map_workspace.test.mjs`
- Modify: `frontend/tests/product_navigation_fit.test.mjs`
- Create: `frontend/tests/pilot_feature_visibility.test.mjs`

- [ ] RED: BOSS and Talent Map absent from trial nav; Job Profile not top-level; OA remains absent.
- [ ] Add server-backed BI readiness/empty-state rule; do not invent a temporary global flag.
- [ ] Keep deep routes only where required for backward-compatible bookmarks; show a clear unavailable state rather than a dead page.

### Task 6.2: Demand list, create and detail

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/features/demands/api.ts`
- Modify: `frontend/src/features/demands/types.ts`
- Modify: `frontend/src/features/demands/routes.tsx`
- Modify: `frontend/src/features/demands/pages/DemandsPage.tsx`
- Create: `frontend/src/features/demands/pages/DemandDetailPage.tsx`
- Create: `frontend/src/features/demands/components/DemandForm.tsx`
- Create: `frontend/src/features/demands/components/DemandFilters.tsx`
- Create: `frontend/src/features/demands/components/DemandTable.tsx`
- Modify: `frontend/src/components/ui/Input.tsx`
- Modify: `frontend/src/pages/PipelinePage.tsx`
- Modify: `frontend/tests/demand_management.test.mjs`
- Create: `frontend/tests/demand_workspace.test.mjs`

- [ ] RED: table, status categories, filters, pagination and newest-first query.
- [ ] RED: eight required labels show red star, browser/field errors are accessible, backend errors map to fields.
- [ ] RED: first click synchronously disables create; request carries idempotency key.
- [ ] RED: 201 navigates to `/demands/:id`; stage numbers deep-link with demand + stage.
- [ ] Detail page shows facts, owner, HC, progress, blockers, actions and candidate drilldown.
- [ ] Empty/loading/error/no-option states explain the next action.

**Verification:**

```bash
cd frontend
npm test
npm run typecheck
```

## Phase 7 — Full-width resume truth view

### Task 7.1: Secure original resume endpoint

**Files:**
- Modify: `backend/app/api/candidates.py`
- Modify: `backend/app/api/resume.py`
- Modify: `backend/tests/test_candidate_library.py`
- Modify: `backend/tests/test_production_org_access_hardening.py`

- [ ] RED: authorized users can preview/download original file with safe filename/MIME; unauthorized org/role receives 404/403.
- [ ] RED: deleted/missing/out-of-root paths fail closed and are audited.
- [ ] Return metadata/preview URL without exposing local filesystem path.

### Task 7.2: Three-tab candidate reader

**Files:**
- Modify: `frontend/src/features/candidates/types.ts`
- Modify: `frontend/src/features/candidates/api.ts`
- Modify: `frontend/src/features/candidates/pages/CandidateProfilePage.tsx`
- Create: `frontend/src/features/candidates/components/OriginalResumeViewer.tsx`
- Create: `frontend/src/features/candidates/components/StructuredResumeView.tsx`
- Create: `frontend/src/features/candidates/components/CandidateMatchAnalysis.tsx`
- Modify: `frontend/tests/candidate_profile_judgement_card.test.mjs`
- Modify: `frontend/tests/candidate_profile_lightweight_pipeline_actions.test.mjs`
- Create: `frontend/tests/candidate_resume_workspace.test.mjs`

- [ ] RED: top tabs are Original Resume / Structured Profile / Match Analysis; Original is default truth.
- [ ] RED: no permanent three-column/left rail; AI/match panel can collapse.
- [ ] RED: parse failure still allows original resume; missing original shows a clear recovery path.
- [ ] Preserve limited HR actions without crowding the reading surface.

## Phase 8 — Documentation, release gates and final verification

### Task 8.1: Sync truth-source documents

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
- Create: `docs/adr/0002-demand-scoped-recruiting-flow.md`
- Create: `docs/10_demand_id迁移与回滚手册.md`

- [ ] PRD records all 16 approved rules and P0/P1 boundary.
- [ ] SDD records model/API/services/compatibility and AI write prohibition.
- [ ] BI defines demand keys, transferred exclusion and operational-not-performance language.
- [ ] Pilot checklist covers four roles, empty/error/reverse paths, owner/data attribution and original resume truth.
- [ ] Deployment docs define Alembic one-shot job, MySQL restore gate, cutover marker and post-cutover rollback limit.
- [ ] Docs map distinguishes original checkout, implementation branch, CFPD remote test SHA and actually deployed SIT assets.

### Task 8.2: Full gates

```bash
python3 -m pytest backend/tests base_agent/tests -q
cd frontend && npm test && npm run lint && npm run typecheck && npm run build
cd .. && python3 backend/scripts/verify_demand_scope.py --database <local-fixture>
git diff --check
git status --short
```

- [ ] Inspect diff for accidental changes outside listed files.
- [ ] Run TDD red/green evidence per task; do not infer from final green only.
- [ ] Verify original dirty checkout status is unchanged.
- [ ] Do not publish SIT automatically. Before release, record CFPD SHA, Libra CommitID, schema revision, backfill report, backup/restore proof, backend version and frontend asset hash.
- [ ] P1 print/archive stays documented only; no implementation in this branch.

## Release and rollback checkpoints

| Checkpoint | Can old code run? | Rollback |
|---|---|---|
| Expand only | Yes | Revert app; leave additive schema |
| Backfill + dual-write | Yes, if no parallel sibling Demand facts | Revert compatible app; preserve new data |
| Parallel Demands enabled | No | Forward-fix, or stop writes and restore full pre-cutover snapshot |
| Contract/drop legacy fields | No | Separate future release; not part of P0 |

## Explicitly excluded

- Talent map implementation
- BOSS/58/猎聘 channel integration
- OA/enterprise login automation
- Visual workflow builder or configurable ATS engine
- Formal performance ranking
- Print/archive implementation (P1)
