#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""简历解析模块 — PDF/DOCX/图片统一走视觉模型管线。"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from document_to_image import document_to_image_data_uris
from image_resume_parser import IMAGE_RESUME_EXTENSIONS, ImageResumeVisionParser


class ResumeParser:
    """简历解析器 — 所有格式统一转图片 → 视觉模型。"""

    def __init__(self, image_parser: Optional[ImageResumeVisionParser] = None):
        self._image_parser = image_parser

    def parse_resume(self, file_path: str) -> Dict[str, Any]:
        extension = Path(file_path).suffix.lower().lstrip(".")
        logging.info("开始解析简历，格式: %s", extension or "未知")

        vision = self._image_parser or ImageResumeVisionParser()

        if extension in IMAGE_RESUME_EXTENSIONS:
            image_result = vision.parse(file_path)
            return {
                "extracted_info": image_result.extracted_info,
                "skills": image_result.skills,
                "upload_date": datetime.now().isoformat(),
                "parse_method": "vision",
            }

        # PDF / DOCX → 逐页转图片 → 视觉模型解析
        data_uris = document_to_image_data_uris(Path(file_path))
        logging.info("文档共 %d 页，逐页送入视觉模型", len(data_uris))
        image_result = vision.parse_document(data_uris)
        return {
            "extracted_info": image_result.extracted_info,
            "skills": image_result.skills,
            "upload_date": datetime.now().isoformat(),
            "parse_method": "vision",
        }
