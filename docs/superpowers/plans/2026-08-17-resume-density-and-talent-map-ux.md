# 简历高密度与人才地图用户体验优化实施计划

> 执行要求：严格按 TDD 先写失败测试，再写最小实现；完成后必须通过合同测试、类型检查、构建、测试环境真实页面检查。

## 目标

1. 将所有复用 `StructuredResumeView` 的简历详情改为顶部高密度画像 + 完整工作/项目经历。
2. 修复人才地图非当前公司进度统计错误。
3. 压缩人才地图首屏导航层级，让公司、部门、岗位和人才进度更快进入视野。
4. 改善人才地图首次使用空状态，让用户能直接完成第一家公司创建。

## 约束

- 不改后端接口、数据结构、权限和候选人流程。
- 不截断工作经历、项目经历或长文本。
- 不提交 `.superpowers/brainstorm/` 下的本地预览文件。
- 推送前确认 CI 超时保护仍在，并完成本地全量校验。

### Task 1：用合同测试固定简历高密度结构

**Files:**
- Modify: `readdy-frontend/tests/structured-resume-work-history.test.mjs`
- Test: `readdy-frontend/tests/structured-resume-work-history.test.mjs`

**Steps:**

1. 将旧的三列概览宫格断言替换为顶部 `resume-profile-strip` 断言。
2. 增加教育与基础信息位于长经历之前、工作经历使用整行时间线、项目经历完整展示且无截断样式的断言。
3. 运行单测并确认因新结构尚未实现而失败。

### Task 2：实现简历顶部画像与完整履历

**Files:**
- Modify: `readdy-frontend/src/components/candidates/StructuredResumeView.tsx`
- Modify: `readdy-frontend/src/components/candidates/resumePresentation.ts`
- Test: `readdy-frontend/tests/structured-resume-work-history.test.mjs`

**Steps:**

1. 将基础信息、教育、求职目标、概况、技能和证书集中为紧凑信息带，空值不占位。
2. 工作经历改为带时间轴视觉的整行连续记录，公司、岗位和任职时间合并展示。
3. 项目经历改为响应式双列完整内容，小屏单列，不使用 `truncate`、`line-clamp` 或固定高度。
4. 保留其他字段和原简历核对提示，减少嵌套卡片和内边距。
5. 运行简历专项测试并确认通过。

### Task 3：用测试复现人才地图跨公司统计错误

**Files:**
- Modify: `readdy-frontend/src/pages/talent-map/organization.ts`
- Add: `readdy-frontend/tests/talent-map-presentation.test.mjs`
- Modify: `readdy-frontend/src/pages/talent-map/page.tsx`

**Steps:**

1. 为“按公司 ID 统计人才总数、已确认、沟通中和待联系”写纯函数测试。
2. 使用至少两家公司的人才数据，验证每家公司互不串数。
3. 增加页面合同断言：公司进度必须基于全部人才，不得基于当前公司 `companyPeople`。
4. 运行专项测试并确认失败原因与现有错误一致。

### Task 4：修复统计并压缩人才地图首屏

**Files:**
- Modify: `readdy-frontend/src/pages/talent-map/organization.ts`
- Modify: `readdy-frontend/src/pages/talent-map/page.tsx`
- Test: `readdy-frontend/tests/talent-map-presentation.test.mjs`

**Steps:**

1. 实现并使用按公司统计的纯函数，修复非当前公司 `0/0` 错误。
2. 空状态改为三步业务引导，并在空状态内提供“新增第一家公司”主按钮。
3. 将公司切换、当前公司摘要、操作按钮、状态说明和人才搜索合并为紧凑工作区头部。
4. 将部门和岗位从双层大卡片改为紧凑部门区块 + 岗位行；保留状态、人数和查看人才入口。
5. 运行人才地图专项测试并确认通过。

### Task 5：回归验证所有复用入口

**Files:**
- Verify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryDetail.tsx`
- Verify: `readdy-frontend/src/pages/interviews/components/RecruiterInterviewDetailDrawer.tsx`
- Verify: `readdy-frontend/src/pages/interviewer/interviews/components/InterviewerInterviewDetailDrawer.tsx`
- Verify: `readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx`
- Verify: `readdy-frontend/src/pages/jobs/components/DemandCandidateResumeDetail.tsx`

**Steps:**

1. 运行 `npm --prefix readdy-frontend run test:contract`。
2. 运行 lint、类型检查和生产构建。
3. 本地启动前端，用十年经历测试数据检查完整内容和首屏密度。
4. 用招聘专员角色检查人才地图空状态及有数据布局；确认控制台无新增错误。

### Task 6：提交、推送、构建、发布和线上验证

**Files:**
- Verify: `.gitlab-ci.yml`
- Verify: `readdy-frontend/Dockerfile.ci-browser`
- Verify: `scripts/ci-build-browser-image.sh`

**Steps:**

1. 检查 diff、未跟踪文件和 CI 超时保护，确认不会把本地预览文件推送。
2. 提交到本地 `test` 分支并推送公司 GitLab 的 `test` 分支。
3. 监控 4 个流水线任务直到全部成功；失败则查看日志、修复并重新推送。
4. 在 Libra 发布新的前端测试包到 Sit 环境。
5. 用 ego-browser 验证测试环境的简历库、面试角色简历详情和人才地图；记录提交、流水线、包号和发布时间。
