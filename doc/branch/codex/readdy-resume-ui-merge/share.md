# 分支协作记录 — codex/readdy-resume-ui-merge

## 2026-07-25

### 工作摘要
将 PDF/DOCX 简历解析统一为图片→视觉模型管线，删除原文本提取+LLM双次调用的复杂路径。

### 关键变更
- **新增** `base_agent/document_to_image.py` — PDF(PyMuPDF) 和 DOCX(PIL 渲染) 转图片 data URI
- **修改** `base_agent/image_resume_parser.py` — 新增 `parse_document()` 多页文档解析
- **修改** `base_agent/resume_parser.py` — `parse_resume()` 中 PDF/DOCX 统一走视觉管线

## 2026-07-26

### 工作摘要
将确认入职收敛为已接受 Offer 的唯一入口，防止普通 Pipeline 推进、阶段修正与遗留前端控件绕过 Offer 生命周期造成流程、HC 和已入职页事实分裂。

### 关键变更
- `pipeline_service.py`：公共推进拒绝 `onboarded`；Offer 确认入职在同一事务写入 Offer、流程、Flow 与审计。
- `pipeline.py`：两个通用推进接口提前返回 `409 offer_onboard_action_required`。
- Kanban、候选人详情和遗留 Pipeline 控件：移除直接入职，Offer 阶段统一引导到 Offer 管理。
- 相关回归、流程与 BI 口径已同步；定向后端测试与前端类型、静态、构建、契约测试通过。
- 关联 Issue：#26；完整前端和后端回归的既有基线阻断分别记录为 #27、#28。

### 招聘负责人和列表筛选修复
- 招聘专员可获取且只能获取本人作为招聘负责人，创建需求时负责人下拉保持可操作并自动选中唯一选项。
- 候选人库新增学历、技能、招聘阶段、最低技能分等分页前服务端筛选，并为候选人和 Offer 表头补充可键盘关闭的筛选浮层。
- 后端相关 16 个用例、前端类型检查、静态检查、生产构建及排除既有阻断后的 119 个测试文件均通过。
- 关联 Issue：#29；既有全量回归阻断继续由 #27、#28、#30 及 #31 跟踪。

### 5190 迁移修正
- 开发起点为 `f48e433`，实现入口限定为 `readdy-frontend`；旧版 `frontend/src` 未改。
- 候选人多维筛选、后端授权的招聘负责人选择和 Offer 五组列筛选已迁移到 5190；城市与来源支持自由输入和常用建议。
- 类型检查、Lint、生产构建、三项定向契约和后端 16 个回归用例通过；Readdy 契约 24/26 通过，剩余两项由 #27、#30 跟踪。

### 公司人才库闭环
- 关联 Issue：#32。
- 候选人列表补回后端当前阶段和兼容旧结构的学历/经历，修复 Offer 阶段候选人无法选择。
- 5190 上传 Demand 改为选填，新增公司人才库、个人收藏、岗位匹配后加入流程及淘汰后带原因重新启用。
- 新增按完整手机号/邮箱的精确查重；manager/admin 仅可合并无业务历史的重复档案，业务历史不自动迁移。
- 新增 `candidate_favorites`、`candidate_merges`，Alembic head 更新为 `20260726_09`；候选人/Offer 定向测试 22 项、迁移测试 56 项、前端类型/Lint/构建和两项静态契约均通过。
- 5190 已返回新构建资源并包含人才库、收藏、查重合并和加入流程入口。Windows 全量后端回归为 542 通过、19 项平台相关失败，失败项均依赖 Linux shell/Make、POSIX 权限、`/tmp` 或本机缺失的 `mysqldump`。
