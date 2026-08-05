# Test/SIT Stability Debt Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变业务行为的前提下，修复发布门禁不一致和关键模块边界技术债，形成可重复验证并可直接推送到 CFPD `test` 的稳定候选。

**Architecture:** 保持 React + Flask 模块化单体。前端把候选人工作台的静态展示依赖和上传状态从总控制器中分离，并把需求候选人详情拆成独立组件；后端把权限策略从 API 层下沉到服务层，并把候选人只读模型从路由文件分离。每个重构先增加边界测试，再保持公开接口和用户行为不变。

**Tech Stack:** React 19、TypeScript 5.8、Vite 8、Playwright、Flask 3.1、SQLAlchemy 2、Pytest、Bash、GitLab CI。

---

## 文件结构

新增文件及职责：

- `backend/app/services/access_policy.py`：权限和可见范围唯一 owner，供 API、AI 服务和简历服务共同调用。
- `backend/app/services/candidate_library_read_service.py`：候选人列表的搜索、筛选辅助、阶段上下文和返回结构组装。
- `readdy-frontend/src/features/candidates/library/useCandidateResumeUpload.ts`：简历上传、重复版本处理和单文件重试状态。
- `readdy-frontend/src/pages/jobs/components/DemandCandidateResumeDetail.tsx`：需求候选人抽屉内的统一候选人详情内容。

继续保留但收窄职责：

- `backend/app/api/access.py`：向现有 API 提供兼容导出，不再拥有权限实现。
- `backend/app/api/candidates.py`：只保留请求参数、查询编排、权限入口和响应。
- `readdy-frontend/src/features/candidates/library/useCandidateLibraryController.tsx`：组合数据、筛选、详情、上传和业务动作，不再向视图传递图标或组件实现。
- `readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx`：需求候选人选择和批量动作，不再内嵌完整详情视图。

## Task 1：修正发布门禁的过期实现

**Files:**
- Modify: `backend/tests/test_deployment_artifacts.py`
- Modify: `readdy-frontend/tests/bundle-budget-contract.test.mjs`
- Modify: `scripts/check-sit-release.sh`

- [ ] **Step 1：先写门禁契约红灯**

在 `test_sit_release_gate_runs_required_checks_without_mutating_release_state` 中把前端测试入口约束为项目唯一脚本，并约束构建时间不能写死：

```python
assert "npm run test:contract" in release_gate
assert 'BUILD_TIME="${BUILD_TIME:-' in release_gate
assert 'BUILD_TIME="2026-07-30T00:00:00Z"' not in release_gate
assert "node --test tests/*.test.mjs" not in release_gate
```

在 `bundle-budget-contract.test.mjs` 中补充：

```js
assert.match(source, /npm run test:contract/);
assert.doesNotMatch(source, /BUILD_TIME="2026-07-30T00:00:00Z"/);
```

- [ ] **Step 2：确认契约按预期失败**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_deployment_artifacts.py::test_sit_release_gate_runs_required_checks_without_mutating_release_state -q
cd readdy-frontend && node --test tests/bundle-budget-contract.test.mjs
```

Expected：两处都因旧脚本仍使用 `node --test` 和固定日期而失败。

- [ ] **Step 3：统一脚本入口和构建身份**

把 `scripts/check-sit-release.sh` 顶部改为：

```bash
BUILD_VERSION="${BUILD_VERSION:-$(git -C "$PROJECT_DIR" rev-parse --short=12 HEAD)}"
BUILD_TIME="${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
```

把前端契约步骤改为：

```bash
run_step "前端契约测试" bash -c 'cd "$1" && npm run test:contract' _ "$FRONTEND_DIR"
```

把放行摘要中的历史功能清单改为稳定口径：

```bash
printf '范围：Test/SIT 内部试用代码候选；产品能力和业务口径以当前真源文档为准。\n'
```

- [ ] **Step 4：验证脚本和契约**

Run:

```bash
bash -n scripts/check-sit-release.sh
.venv/bin/python -m pytest backend/tests/test_deployment_artifacts.py::test_sit_release_gate_runs_required_checks_without_mutating_release_state -q
cd readdy-frontend && node --test tests/bundle-budget-contract.test.mjs
```

Expected：全部通过。

- [ ] **Step 5：提交门禁修复**

```bash
git add backend/tests/test_deployment_artifacts.py readdy-frontend/tests/bundle-budget-contract.test.mjs scripts/check-sit-release.sh
git commit -m "fix: align test release verification"
```

## Task 2：消除服务层反向依赖 API 层

**Files:**
- Create: `backend/app/services/access_policy.py`
- Modify: `backend/app/api/access.py`
- Modify: `backend/app/services/agent_service.py`
- Modify: `backend/app/services/resumes/file_service.py`
- Modify: `backend/app/services/resumes/parse_service.py`
- Modify: `backend/app/services/resumes/version_service.py`
- Modify: `backend/tests/test_maintainability_boundaries.py`
- Test: `backend/tests/test_access_control_hardening.py`
- Test: `backend/tests/test_business_review_resume_access.py`
- Test: `backend/tests/test_production_org_access_hardening.py`

- [ ] **Step 1：增加架构边界红灯**

在 `backend/tests/test_maintainability_boundaries.py` 增加：

```python
def test_services_do_not_import_api_layer():
    service_root = ROOT / "backend/app/services"
    offenders = []
    for path in service_root.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        if "api.access" in source or "from ..api" in source or "from ...api" in source:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_access_policy_has_a_service_owner_and_api_is_only_a_facade():
    policy = _read("backend/app/services/access_policy.py")
    facade = _read("backend/app/api/access.py")
    assert "def can_access_candidate" in policy
    assert "def visible_candidate_query" in policy
    assert "from ..services.access_policy import" in facade
    assert _line_count("backend/app/api/access.py") < 40
```

- [ ] **Step 2：确认服务层反向依赖被检测到**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_maintainability_boundaries.py::test_services_do_not_import_api_layer backend/tests/test_maintainability_boundaries.py::test_access_policy_has_a_service_owner_and_api_is_only_a_facade -q
```

Expected：失败并列出 `agent_service.py` 和三个简历服务。

- [ ] **Step 3：建立权限策略服务**

把原 `backend/app/api/access.py` 中以下公开函数原样移动到 `backend/app/services/access_policy.py`，仅把相对导入改成服务层位置：

```python
actor_org_id
same_org
active_candidate_query
assigned_candidate_ids_for_interviewer
interviewer_has_assignment
interviewer_has_business_review
visible_candidate_query
visible_job_query
can_read_job
can_access_candidate
can_manage_job
job_is_active
```

`backend/app/api/access.py` 只保留显式兼容导出：

```python
from ..services.access_policy import (
    active_candidate_query,
    actor_org_id,
    assigned_candidate_ids_for_interviewer,
    can_access_candidate,
    can_manage_job,
    can_read_job,
    interviewer_has_assignment,
    interviewer_has_business_review,
    job_is_active,
    same_org,
    visible_candidate_query,
    visible_job_query,
)

__all__ = [name for name in globals() if not name.startswith("_")]
```

- [ ] **Step 4：让服务直接依赖权限 owner**

把四个服务文件中的 `api.access` 导入改为同层服务导入：

```python
# agent_service.py
from .access_policy import (
    actor_org_id,
    can_access_candidate,
    can_manage_job,
    can_read_job,
    job_is_active,
    visible_candidate_query,
    visible_job_query,
)

# services/resumes/*.py
from ..access_policy import can_access_candidate, same_org
```

- [ ] **Step 5：运行权限与架构测试**

Run:

```bash
.venv/bin/python -m pytest \
  backend/tests/test_maintainability_boundaries.py \
  backend/tests/test_access_control_hardening.py \
  backend/tests/test_business_review_resume_access.py \
  backend/tests/test_production_org_access_hardening.py -q
```

Expected：全部通过，权限返回行为无变化。

- [ ] **Step 6：提交权限边界治理**

```bash
git add backend/app/services/access_policy.py backend/app/api/access.py backend/app/services/agent_service.py backend/app/services/resumes/file_service.py backend/app/services/resumes/parse_service.py backend/app/services/resumes/version_service.py backend/tests/test_maintainability_boundaries.py
git commit -m "refactor: move access policy to service layer"
```

## Task 3：去除候选人控制器中的视图依赖包

**Files:**
- Modify: `readdy-frontend/tests/frontend-maintainability-contract.test.mjs`
- Modify: `readdy-frontend/src/features/candidates/library/useCandidateLibraryController.tsx`
- Modify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryFilters.tsx`
- Modify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryTable.tsx`
- Modify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryBulkActions.tsx`
- Modify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryPagination.tsx`
- Modify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryDetail.tsx`
- Modify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryOverlays.tsx`

- [ ] **Step 1：增加控制器职责红灯**

在候选人可维护性测试中增加：

```js
const controller = read('src/features/candidates/library/useCandidateLibraryController.tsx');
for (const leakedViewDependency of [
  'PageHeader,',
  'CandidateDetailDrawer,',
  'PushToReviewerModal,',
  'AlertCircle,',
  'LoaderCircle,',
]) {
  assert.doesNotMatch(controller, new RegExp(`\\n\\s{4}${leakedViewDependency}`));
}
assert.ok(lineCount('src/features/candidates/library/useCandidateLibraryController.tsx') < 900);
```

- [ ] **Step 2：确认旧控制器失败**

Run:

```bash
cd readdy-frontend && node --test tests/frontend-maintainability-contract.test.mjs
```

Expected：控制器仍返回图标和组件，测试失败。

- [ ] **Step 3：组件自行导入展示依赖**

每个展示组件直接导入自己使用的图标、公共组件和展示常量。例如 `CandidateLibraryFilters.tsx`：

```tsx
import { ArrowLeft, BriefcaseBusiness, GitMerge, RefreshCw, RotateCcw, Search, Upload } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import { candidateScopeTabs, isParseStatus } from '@/features/candidates/library';
```

`CandidateLibraryTable.tsx`、`CandidateLibraryDetail.tsx`、`CandidateLibraryOverlays.tsx` 同样只导入自身使用的图标和组件。`parseStatusMeta`、`stageLabels` 等展示常量导出到现有 `readdy-frontend/src/features/candidates/library.ts`，视图从该模块读取。

- [ ] **Step 4：收窄控制器返回值**

从控制器删除所有图标、React 组件和纯展示常量的导入及返回项；只返回：

```ts
return {
  role,
  showToast,
  // 查询、筛选、加载状态
  // 选中项和详情状态
  // 上传与业务动作状态
  // 由控制器创建的事件处理函数
} as const;
```

- [ ] **Step 5：运行前端结构和编译检查**

Run:

```bash
cd readdy-frontend
node --test tests/frontend-maintainability-contract.test.mjs tests/module-boundaries.test.mjs
npm run type-check
npm run lint
```

Expected：全部通过，页面展示无类型变化。

- [ ] **Step 6：提交前端依赖收口**

```bash
git add readdy-frontend/tests/frontend-maintainability-contract.test.mjs readdy-frontend/src/features/candidates/library.ts readdy-frontend/src/features/candidates/library/useCandidateLibraryController.tsx readdy-frontend/src/features/candidates/components/library
git commit -m "refactor: narrow candidate controller boundary"
```

## Task 4：拆出候选人上传状态机

**Files:**
- Create: `readdy-frontend/src/features/candidates/library/useCandidateResumeUpload.ts`
- Modify: `readdy-frontend/src/features/candidates/library/useCandidateLibraryController.tsx`
- Modify: `readdy-frontend/tests/frontend-maintainability-contract.test.mjs`
- Test: `readdy-frontend/e2e/candidate-detail-scroll.spec.ts`

- [ ] **Step 1：增加上传 hook 边界红灯**

```js
read('src/features/candidates/library/useCandidateResumeUpload.ts');
assert.match(controller, /useCandidateResumeUpload/);
assert.ok(
  lineCount('src/features/candidates/library/useCandidateLibraryController.tsx') < 700,
  '候选人控制器应只负责组合，上传流程必须独立',
);
```

- [ ] **Step 2：确认文件缺失导致失败**

Run:

```bash
cd readdy-frontend && node --test tests/frontend-maintainability-contract.test.mjs
```

Expected：因上传 hook 不存在而失败。

- [ ] **Step 3：定义上传 hook 接口**

```ts
interface CandidateResumeUploadOptions {
  initialOpen: boolean;
  initialDemandId: number | '';
  demandFilter: number | '';
  activeDemands: RecruitmentDemand[];
  candidates: CandidateListItem[];
  loadCandidates: () => Promise<void>;
  openCandidateDetail: (candidate: CandidateListItem) => void;
  showToast: (message: string) => void;
}

export function useCandidateResumeUpload(options: CandidateResumeUploadOptions) {
  // 原控制器 uploadOpen 至 retrySingleUploadFile 的状态和动作原样迁入。
  // API 调用、提示文字、重复文件指纹和失败文件保留规则不变。
  return {
    uploadOpen,
    setUploadOpen,
    uploadDemandId,
    setUploadDemandId,
    uploadSourceChannel,
    setUploadSourceChannel,
    uploadNote,
    setUploadNote,
    uploadFiles,
    setUploadFiles,
    uploadRowActions,
    uploadResponse,
    uploadError,
    uploadSubmitting,
    uploadDragOver,
    setUploadDragOver,
    uploadInputRef,
    openUploadDialog,
    handleUploadFileSelect,
    handleUploadDrop,
    submitUpload,
    openExistingCandidateFromUpload,
    openConfirmationCandidateFromUpload,
    sourceFileForUploadResult,
    keepExistingResumeVersion,
    replaceDuplicateAsCurrentVersion,
    retrySingleUploadFile,
  } as const;
}
```

- [ ] **Step 4：控制器改为组合上传 hook**

```ts
const upload = useCandidateResumeUpload({
  initialOpen: Boolean(navState?.openUpload),
  initialDemandId: navState?.demandId ?? requestedDemandId ?? '',
  demandFilter,
  activeDemands,
  candidates: candidateResponse.candidates,
  loadCandidates,
  openCandidateDetail,
  showToast,
});

return { /* 原业务状态与动作 */, ...upload } as const;
```

保留控制器中的导航状态消费 effect，调用 `upload.setUploadOpen(true)` 后执行 `consumeNavigationState()`。

- [ ] **Step 5：验证上传边界和候选人核心行为**

Run:

```bash
cd readdy-frontend
node --test tests/frontend-maintainability-contract.test.mjs tests/resume-workflow-contract.test.mjs
npm run type-check
npm run lint
```

Expected：全部通过，控制器少于 700 行。

- [ ] **Step 6：提交上传状态拆分**

```bash
git add readdy-frontend/src/features/candidates/library/useCandidateResumeUpload.ts readdy-frontend/src/features/candidates/library/useCandidateLibraryController.tsx readdy-frontend/tests/frontend-maintainability-contract.test.mjs
git commit -m "refactor: isolate candidate resume upload state"
```

## Task 5：拆出需求候选人详情视图

**Files:**
- Create: `readdy-frontend/src/pages/jobs/components/DemandCandidateResumeDetail.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx`
- Modify: `readdy-frontend/tests/frontend-maintainability-contract.test.mjs`
- Modify: `readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs`

- [ ] **Step 1：增加详情组件边界红灯**

```js
const demandResumeDetail = read('src/pages/jobs/components/DemandCandidateResumeDetail.tsx');
assert.match(demandResumeDetail, /CandidateDetailWorkspace/);
assert.match(demandResumeDetail, /CandidateFeedbackTimeline/);
assert.match(demandResumeDetail, /ResumeRecoveryPanel/);
assert.match(drawer, /DemandCandidateResumeDetail/);
assert.ok(lineCount('src/pages/jobs/components/DemandCandidateDrawer.tsx') < 575);
```

- [ ] **Step 2：确认旧抽屉因文件缺失失败**

Run:

```bash
cd readdy-frontend && node --test tests/frontend-maintainability-contract.test.mjs tests/recruitment-ui-unification-contract.test.mjs
```

Expected：新详情组件不存在，测试失败。

- [ ] **Step 3：提取完整详情组件**

定义明确 props，不在新组件中重新请求列表：

```ts
interface DemandCandidateResumeDetailProps {
  candidate: CandidateListItem;
  demand: RecruitmentDemand;
  match?: CandidateMatchResult;
  tab: CandidateDetailTab;
  onTabChange: (tab: CandidateDetailTab) => void;
  detail: CandidateResumeDetail | null;
  journey: CandidateJourney | null;
  loading: boolean;
  error: string;
  journeyLoading: boolean;
  journeyError: string;
  fileAction: 'preview' | 'download' | null;
  fileError: string;
  onDetailUpdated: (detail: CandidateResumeDetail) => void;
  onPreview: () => void;
  onDownload: () => void;
  onClose: () => void;
}
```

把原 `resumeCandidate && <DetailDrawerShell>` 内的标题、三个页签、恢复面板、原件预览下载和底部关闭按钮原样迁入该组件，CSS 类名和文案不变。

- [ ] **Step 4：抽屉只负责传递状态和动作**

```tsx
{resumeCandidate && (
  <DemandCandidateResumeDetail
    candidate={resumeCandidate}
    demand={demand}
    match={matches.get(resumeCandidate.id)}
    tab={resumeTab}
    onTabChange={setResumeTab}
    detail={resumeDetail}
    journey={resumeJourney}
    loading={resumeLoading}
    error={resumeError}
    journeyLoading={resumeJourneyLoading}
    journeyError={resumeJourneyError}
    fileAction={resumeFileAction}
    fileError={resumeFileError}
    onDetailUpdated={handleResumeDetailUpdated}
    onPreview={() => void openOriginalResume('preview')}
    onDownload={() => void openOriginalResume('download')}
    onClose={() => setResumeCandidate(null)}
  />
)}
```

- [ ] **Step 5：运行详情和编译检查**

Run:

```bash
cd readdy-frontend
node --test tests/frontend-maintainability-contract.test.mjs tests/recruitment-ui-unification-contract.test.mjs tests/overlay-lifecycle-contract.test.mjs
npm run type-check
npm run lint
```

Expected：全部通过，抽屉少于 575 行。

- [ ] **Step 6：提交需求候选人详情拆分**

```bash
git add readdy-frontend/src/pages/jobs/components/DemandCandidateResumeDetail.tsx readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx readdy-frontend/tests/frontend-maintainability-contract.test.mjs readdy-frontend/tests/recruitment-ui-unification-contract.test.mjs
git commit -m "refactor: split demand candidate resume detail"
```

## Task 6：把候选人只读模型移出 API 路由

**Files:**
- Create: `backend/app/services/candidate_library_read_service.py`
- Modify: `backend/app/api/candidates.py`
- Modify: `backend/app/api/candidate_actions.py`
- Modify: `backend/app/api/candidate_admin.py`
- Modify: `backend/app/api/candidate_journey.py`
- Modify: `backend/tests/test_maintainability_boundaries.py`
- Test: `backend/tests/test_candidate_library.py`
- Test: `backend/tests/test_candidate_search_pagination.py`

- [ ] **Step 1：增加候选人路由边界红灯**

```python
def test_candidate_api_delegates_read_model_to_service():
    route = _read("backend/app/api/candidates.py")
    service = _read("backend/app/services/candidate_library_read_service.py")
    assert "from ..services.candidate_library_read_service import" in route
    assert "def candidate_library_payload" in service
    assert "def candidate_search_blob" in service
    assert _line_count("backend/app/api/candidates.py") < 450
    assert _line_count("backend/app/services/candidate_library_read_service.py") < 700
```

- [ ] **Step 2：确认旧路由失败**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_maintainability_boundaries.py::test_candidate_api_delegates_read_model_to_service -q
```

Expected：只读服务不存在，测试失败。

- [ ] **Step 3：移动只读模型函数**

把 `candidates.py` 中以下常量和函数移动到 `candidate_library_read_service.py`，去掉前导下划线并保持函数体不变：

```text
COMMON_CITIES, CITY_FIELD_KEYS, CITY_LABEL_PATTERN, POSITION_FIELD_KEYS
resume_info_for_read_model, normalize_city_value, walk_resume_values
candidate_search_blob, candidate_intent_city, candidate_desired_position
latest_experience_for_read_model, education_summary_for_read_model
candidate_education_text, demand_summary, public_parse_error
candidate_library_item, candidate_stage_context_by_ids, candidate_stage_context
active_candidate_condition, latest_candidate_stage_subquery
candidate_pipeline_facts, candidate_favorite_ids
normalized_candidate_name, is_local_demo_candidate_name
candidate_data_hygiene_by_id, candidate_library_payload
candidate_source_payload, dedupe_non_empty, decision_summary
```

如果函数名与 `candidate_library_service.py` 已有公开函数冲突，使用上面带 `for_read_model` 的名字，避免模糊导入。

把 `_export_count_for_actor` 改为不读取 Flask 全局变量的服务函数：

```python
def export_count_for_actor(*, org_id, user_id, window=timedelta(minutes=10)):
    cutoff = utc_now() - window
    return Event.query.filter(
        Event.org_id == org_id,
        Event.actor_id == user_id,
        Event.action == "candidate.exported",
        Event.ts >= cutoff,
    ).count()
```

- [ ] **Step 4：路由改为显式导入**

`candidates.py` 仅保留 `parse_candidate_date_arg`（因为它直接读取 Flask request）和 `list_candidates`，从新服务显式导入其使用的函数：

```python
from ..services.candidate_library_read_service import (
    active_candidate_condition,
    candidate_education_text,
    candidate_intent_city,
    candidate_library_payload,
    candidate_search_blob,
    latest_candidate_stage_subquery,
    normalize_city_value,
)
```

列表路由中的调用只改函数名，不改过滤顺序、分页上限、权限检查、排序和响应字段。

同时移除三个注册路由模块对 `.candidates` 的函数内反向导入，改成从服务层显式导入。`candidate_admin.py` 的调用改为：

```python
export_count_10m = export_count_for_actor(org_id=g.org_id, user_id=g.user_id) + 1
```

- [ ] **Step 5：运行候选人全链路测试**

Run:

```bash
.venv/bin/python -m pytest \
  backend/tests/test_maintainability_boundaries.py \
  backend/tests/test_candidate_library.py \
  backend/tests/test_candidate_search_pagination.py \
  backend/tests/test_candidate_journey.py \
  backend/tests/test_access_control_hardening.py -q
```

Expected：全部通过，分页总数、筛选和权限行为不变。

- [ ] **Step 6：提交候选人读模型拆分**

```bash
git add backend/app/services/candidate_library_read_service.py backend/app/api/candidates.py backend/app/api/candidate_actions.py backend/app/api/candidate_admin.py backend/app/api/candidate_journey.py backend/tests/test_maintainability_boundaries.py
git commit -m "refactor: isolate candidate library read model"
```

## Task 7：补足五角色浏览器稳定性证据

**Files:**
- Modify: `readdy-frontend/e2e/core-role-smoke.spec.ts`
- Modify: `readdy-frontend/e2e/candidate-detail-scroll.spec.ts`
- Modify: `.gitlab-ci.yml` only if local and CI commands differ after verification

- [ ] **Step 1：扩展角色用例到核心页面**

为 `roleCases` 增加 `corePath` 和 `coreLandmark`：

```ts
const roleCases = [
  { role: 'recruiter', home: '/dashboard', expectedNavigation: '简历库', corePath: '/candidates', coreLandmark: '简历库' },
  { role: 'manager', home: '/dashboard', expectedNavigation: '需求审批', corePath: '/jobs', coreLandmark: '招聘需求' },
  { role: 'interviewer', home: '/interviewer/dashboard', expectedNavigation: '我的面试', corePath: '/interviewer/interviews', coreLandmark: '我的面试' },
  { role: 'director', home: '/director/cockpit', expectedNavigation: '管理驾驶舱', corePath: '/director/cockpit', coreLandmark: '管理驾驶舱' },
  { role: 'admin', home: '/dashboard', expectedNavigation: '系统设置', corePath: '/settings/users', coreLandmark: '用户管理' },
] as const;
```

登录和首页断言后访问 `corePath`，断言页面包含对应标题或可访问名称，并继续断言不存在“页面加载失败”。

- [ ] **Step 2：启动本地隔离环境**

Run:

```bash
READDY_AUTH_MODE=local ./scripts/start-isolated-demo.sh
./scripts/check-isolated-demo.sh
```

Expected：5010、5100、5190 三个服务可访问。

- [ ] **Step 3：运行五角色和详情浏览器冒烟**

Run:

```bash
cd readdy-frontend
E2E_BASE_URL=http://127.0.0.1:5190 E2E_PASSWORD=Zhipin2026 \
  npx playwright test e2e/core-role-smoke.spec.ts e2e/candidate-detail-scroll.spec.ts --project=chromium
```

Expected：6 项冒烟全部通过；浏览器由 Playwright 管理，不改变用户默认 Tabbit 浏览器。

- [ ] **Step 4：关闭本轮启动的隔离环境**

Run:

```bash
./scripts/stop-isolated-demo.sh
```

Expected：三个项目进程停止，本地数据库和上传目录保留。

- [ ] **Step 5：提交浏览器证据增强**

```bash
git add readdy-frontend/e2e/core-role-smoke.spec.ts readdy-frontend/e2e/candidate-detail-scroll.spec.ts
git commit -m "test: strengthen role browser smoke coverage"
```

只有在 CI 实际命令与本地验证不一致时才修改 `.gitlab-ci.yml`，否则不制造无意义 diff。

## Task 8：同步真源文档并完成全量交付

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `RUNNING.md` only if commands changed
- Modify: `DEPLOYMENT.md` only if release instructions changed

- [ ] **Step 1：更新当前状态**

`README.md` 和 `docs/README.md` 使用同一口径：

```text
当前代码基线：以 `git log -1` 和远程 `cfpd/test` 为准。
统一本地门禁：`./scripts/check-sit-release.sh`。
浏览器冒烟：Playwright Chromium，不修改用户默认浏览器。
Test/SIT 只允许可丢弃测试数据，简历 AI 继续关闭。
```

删除或改写 `docs/README.md` 中旧分支 `codex/technical-debt-decoupling-20260804`、旧 SHA `d5801f53` 和“当前本地候选未推送”的过期描述。

- [ ] **Step 2：运行分层全量测试**

Run:

```bash
.venv/bin/python -m pytest backend/tests base_agent/tests -q
cd readdy-frontend && npm run test:contract && npm run type-check && npm run lint && npm run build
cd .. && node scripts/check-frontend-bundle-budget.mjs
.venv/bin/python -m pip_audit --local --strict
cd backend && ../.venv/bin/alembic heads
```

Expected：后端和前端测试全绿，构建成功，无新依赖漏洞，唯一迁移头为 `20260804_14`。

- [ ] **Step 3：检查任务 diff 并提交文档**

Run:

```bash
git diff --check
git status --short
git diff --stat cfpd/test...HEAD
```

只暂存本轮文档：

```bash
git add README.md docs/README.md
git add RUNNING.md DEPLOYMENT.md  # 仅当这两个文件本轮确实发生变化
git commit -m "docs: sync test stability handoff"
```

不得暂存 `docs/verification/2026-08-04-requirements-summary/`。

- [ ] **Step 4：在干净提交树运行统一门禁**

创建临时 worktree 指向最终提交，并复用只读依赖目录：

```bash
VERIFY_DIR="$(mktemp -d /tmp/zhipin-verify.XXXXXX)"
git worktree add --detach "$VERIFY_DIR" HEAD
ln -s "$PWD/.venv" "$VERIFY_DIR/.venv"
ln -s "$PWD/readdy-frontend/node_modules" "$VERIFY_DIR/readdy-frontend/node_modules"
(cd "$VERIFY_DIR" && ./scripts/check-sit-release.sh)
git worktree remove "$VERIFY_DIR"
```

Expected：脚本返回 0；原工作区的用户截图不影响干净提交树验证。

- [ ] **Step 5：推送前复核远程没有前进**

Run:

```bash
git fetch cfpd test
git rev-list --left-right --count HEAD...cfpd/test
```

Expected：输出 `N 0`，即本地只领先、远程没有独有提交。若第二个数字不为 0，先执行 `git rebase cfpd/test`，重新运行受影响测试和干净门禁；禁止强推。

- [ ] **Step 6：推送公司 GitLab test 并核对 SHA**

Run:

```bash
git push cfpd HEAD:test
git ls-remote cfpd refs/heads/test
git rev-parse HEAD
```

Expected：远程 `refs/heads/test` SHA 与本地 `HEAD` 完全一致。

- [ ] **Step 7：最终状态检查**

Run:

```bash
git status --short --branch
git log -8 --oneline
```

Expected：`test...cfpd/test` 不领先不落后；仅保留任务开始前已有的未跟踪验收截图。
