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
