# 分支协作记录 — codex/readdy-resume-ui-merge

## 2026-07-25

### 工作摘要
将 PDF/DOCX 简历解析统一为图片→视觉模型管线，删除原文本提取+LLM双次调用的复杂路径。

### 关键变更
- **新增** `base_agent/document_to_image.py` — PDF(PyMuPDF) 和 DOCX(PIL 渲染) 转图片 data URI
- **修改** `base_agent/image_resume_parser.py` — 新增 `parse_document()` 多页文档解析
- **修改** `base_agent/resume_parser.py` — `parse_resume()` 中 PDF/DOCX 统一走视觉管线
