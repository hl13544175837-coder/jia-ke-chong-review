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
