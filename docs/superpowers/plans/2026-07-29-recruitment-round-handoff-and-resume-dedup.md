# Recruitment Round Handoff and Resume Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让二面面试官真实承接一面信息，阻止重复简历生成第二份候选人档案，并在现有页面中给出一致、可读的结果反馈。

**Architecture:** 保留 React + Flask + SQLAlchemy 模块化单体。面试权限继续由 assignment/Demand/RBAC 决定；简历去重进入现有上传链路；候选人历程继续复用现有 journey API 和共享组件。

**Tech Stack:** Python 3、Flask、SQLAlchemy、Alembic、pytest、React、TypeScript、Tailwind CSS、Node contract tests。

---

### Task 1: 二面承接一面信息回归

**Files:**
- Create: `backend/tests/test_interview_round_handoff.py`
- Modify: `backend/seed_dev.py`
- Modify: `RUNNING.md`

- [ ] 写真实 HR、一面账号、二面账号、无关账号的端到端测试。
- [ ] 先运行测试，确认当前能力是否已存在；如测试失败，只修改后端 owner 规则，不在前端绕过。
- [ ] 增加 `interviewer02@mvp.local` 试用账号，并在 seed 中提供可用于二面承接的一组数据。
- [ ] 运行 `python3 -m pytest tests/test_interview_round_handoff.py -q`，要求全部通过。

### Task 2: 重复简历后端拦截

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/api/resume.py`
- Modify: `backend/app/services/candidate_library_service.py`
- Create: `backend/migrations/versions/20260729_11_candidate_resume_fingerprint.py`
- Create: `backend/tests/test_resume_upload_duplicate_blocking.py`
- Modify: `backend/tests/test_pilot_recruitment_schema.py`

- [ ] 先写相同文件重复上传、手机号一致、邮箱一致和同名不同人的失败测试。
- [ ] 运行测试，确认当前实现会创建重复候选人。
- [ ] 增加 `Candidate.resume_sha256` 和普通组织索引。
- [ ] 上传落盘前计算哈希并查询已有活动候选人；命中时返回 duplicate，不调用解析器。
- [ ] 解析后复用 `candidate_identity_keys` 检查完整手机号/邮箱；命中时清理本次候选人、标签和文件。
- [ ] 记录 `resume.upload.duplicate_blocked` 审计事件。
- [ ] 运行 `python3 -m pytest tests/test_resume_upload_duplicate_blocking.py tests/test_lightweight_pilot_guards.py -q`。

### Task 3: 重复结果前端呈现

**Files:**
- Modify: `readdy-frontend/src/features/candidates/types.ts`
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx`
- Create: `frontend/tests/readdy_resume_duplicate_import_contract.test.mjs`

- [ ] 先写契约测试，要求 duplicate 状态、明确失败文案、已有候选人入口和批量统计。
- [ ] 运行测试确认失败。
- [ ] 扩展上传结果类型并分别统计成功、重复、其他失败。
- [ ] 重复项显示“导入失败：系统中已存在重复简历”、匹配依据和已有候选人名称。
- [ ] 运行新增契约测试、typecheck 和 lint。

### Task 4: 候选人历程与界面规范收口

**Files:**
- Modify: `readdy-frontend/src/components/candidates/CandidateJourneySummary.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/dashboard/page.tsx`
- Modify: `frontend/tests/recruitment_candidate_journey_visibility.test.mjs`
- Modify: `frontend/tests/readdy_mysql_pilot_business_ui_contract.test.mjs`
- Modify: `frontend/tests/readdy_mysql_pilot_role_navigation_contract.test.mjs`

- [ ] 先写契约测试，要求一面/二面节点、结果图标、只读提示和统一页面名称。
- [ ] 运行测试确认失败。
- [ ] 在共享历程组件中用现有 Tailwind token 统一状态、图标、文字层级。
- [ ] 统一面试官工作台与导航、筛选页标题。
- [ ] 运行相关契约测试、typecheck、lint 和 build。

### Task 5: 完整回归与文档同步

**Files:**
- Modify: `docs/01_PRD.md`
- Modify: `docs/SDD-智聘招聘系统-v1.0.md`
- Modify: `docs/13_试点业务流程与研发接口交接.md`
- Modify: `RUNNING.md`

- [ ] 同步二面承接权限、重复简历结果、第二面试官账号和验收步骤。
- [ ] 运行后端相关测试和完整 pytest；如环境依赖失败，单独列出与本改动无关的失败证据。
- [ ] 运行前端 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。
- [ ] 运行 `git diff --check`，确认没有格式问题。
- [ ] 按需求逐项核对：二面读取一面、无关账号拒绝、重复文件阻止、手机号/邮箱重复阻止、同名不误判、统一历程组件、统一页面文案。
