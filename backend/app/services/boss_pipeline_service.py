# -*- coding: utf-8 -*-
"""BOSS 直聘收件箱候选人导入服务。

历史实现曾把「收件箱拉取 → 批量导入候选人库 → AI 简历初筛」
串成一条流水线。P0 期间 BOSS 不是试点入口，更不能绕过 Demand 语义：
- BossService：boss-cli 招聘端封装（简历下载）。
- Candidate / UploadBatch 模型。

设计约束（与产品确认）：
- 简历来源 = 已沟通收件箱（inbox），导入存完整 Markdown 原文 + 解析出的基础字段。
- 节流 = 限量 + 间隔（默认 1.5s/条），命中 rate_limited 立即停止，已成功的保留。
- 携带 ``target_job_id`` 的自动入池不再执行；必须经显式 Demand 入口。
- BOSS AI 初筛在 P0 直接 fail closed，不写 Interview，不改主流程。
- 面试安排 = 初筛后由用户在系统「面试安排」流程内创建（POST /interview/assignments），
  不再向 BOSS 直聘发面试邀请（该动作依赖短效 __zp_stoken__，云端无法稳定持有）。

所有写库方法需在 Flask app context 内调用。
"""
from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import current_app
from runtime_paths import DEFAULT_UPLOAD_FOLDER

from .. import db
from ..models import (
    Candidate,
    UploadBatch,
)
from .boss_service import BossService
from .interview_service import PreScreenService
logger = logging.getLogger(__name__)

BOSS_SOURCE_CHANNEL = "boss直聘"
# 单次批量导入硬上限，防止误触发拉取过多触发风控
MAX_IMPORT_LIMIT = 50
# 每条简历下载之间的间隔（秒），降低风控概率
DEFAULT_INTERVAL_SEC = 1.5


def _safe_str(value: Any, max_len: int = 200) -> str:
    s = str(value or "").strip()
    return s[:max_len]


def _safe_markdown_basename(value: Any, fallback: str = "candidate") -> str:
    name = re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "").strip())
    name = name.strip("._-")[:48]
    return name or fallback


def _extract_basic_fields(md_text: str) -> Dict[str, Optional[str]]:
    """从简历 Markdown 粗解析基础字段（姓名/手机/邮箱），仅用于列表展示。

    完整原文已存 raw_file_path，这里只做轻量提取，解析失败不影响导入。
    """
    name = None
    # 取首个一级/二级标题作为姓名候选
    m = re.search(r"^#{1,2}\s*(.+)$", md_text, re.MULTILINE)
    if m:
        name = m.group(1).strip()[:100]
    email_m = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", md_text)
    phone_m = re.search(r"(?<!\d)(1[3-9]\d{9})(?!\d)", md_text)
    return {
        "name": name,
        "email": email_m.group(0)[:100] if email_m else None,
        "phone": phone_m.group(1) if phone_m else None,
    }


class BossPipelineService:
    """BOSS 招聘闭环编排。"""

    def __init__(self, boss: Optional[BossService] = None, prescreen: Optional[PreScreenService] = None):
        self.boss = boss or BossService()
        self._prescreen = prescreen

    @property
    def prescreen(self) -> PreScreenService:
        if self._prescreen is None:
            self._prescreen = PreScreenService()
        return self._prescreen

    # ── 工具：原文落盘 ────────────────────────────────────
    def _save_markdown(self, owner_hr_id: int, geek_id: str, md_text: str) -> Optional[str]:
        """把简历 Markdown 写入 UPLOAD_FOLDER/boss/<uid>/<geek>.md，返回路径。失败返回 None。"""
        try:
            base = current_app.config.get("UPLOAD_FOLDER") or str(DEFAULT_UPLOAD_FOLDER)
            folder = Path(base) / "boss" / str(owner_hr_id)
            folder.mkdir(parents=True, exist_ok=True)
            safe = _safe_markdown_basename(geek_id)
            folder_resolved = folder.resolve()
            fpath = (folder / f"{safe}.md").resolve()
            if folder_resolved not in fpath.parents:
                raise ValueError("BOSS resume markdown path escaped upload folder")
            fpath.write_text(md_text, encoding="utf-8")
            return str(fpath)
        except Exception:  # noqa: BLE001
            logger.exception("保存 BOSS 简历原文失败 geek_id=%s", geek_id)
            return None

    def _existing_geek_ids(self, owner_hr_id: int) -> set:
        """该用户已导入的 BOSS geek_id 集合，用于去重。"""
        rows = (
            db.session.query(Candidate.resume_json)
            .filter(Candidate.owner_hr_id == owner_hr_id)
            .all()
        )
        ids = set()
        for (rj,) in rows:
            if isinstance(rj, dict):
                gid = (rj.get("boss") or {}).get("geek_id")
                if gid:
                    ids.add(gid)
        return ids

    # ── 1) 批量导入 ───────────────────────────────────────
    def batch_import(
        self,
        owner_hr_id: int,
        items: List[Dict[str, Any]],
        cookies_override: str,
        *,
        target_job_id: Optional[int] = None,
        boss_job: Optional[str] = None,
        limit: int = 20,
        interval_sec: float = DEFAULT_INTERVAL_SEC,
    ) -> Dict[str, Any]:
        """批量下载并导入候选人简历（限量+间隔+去重+入库）。

        items: [{geek_id, name?, security_id?, friend_id?, job?}]，至少含 geek_id。
        - target_job_id：旧客户端参数；P0 携带时直接 fail closed，不自动入池。
        - boss_job：BOSS 侧 encryptJobId，下载简历时透传 --job（缺省取 item.job）。
        - 命中 rate_limited 立即停止，已成功记录保留；返回逐条结果与统计。
        """
        try:
            limit = max(1, min(int(limit), MAX_IMPORT_LIMIT))
        except (TypeError, ValueError):
            limit = 20
        try:
            interval_sec = max(0.0, float(interval_sec))
        except (TypeError, ValueError):
            interval_sec = DEFAULT_INTERVAL_SEC

        if not items:
            return {"ok": False, "data": None,
                    "error": {"code": "invalid_params", "message": "items 不能为空"}}

        # BOSS 是隐藏的实验能力。P0 不接受只有 job_id 的流程写入，
        # 防止服务被其他入口直接调用时绕过 API 层。
        if target_job_id is not None:
            return {
                "ok": False,
                "data": None,
                "error": {
                    "code": "demand_id_required",
                    "message": "BOSS 导入不能按职位模板自动入池，请在候选人库中明确选择招聘需求。",
                },
            }

        # 一个导入批次
        batch = UploadBatch(
            owner_hr_id=owner_hr_id,
            source_channel=BOSS_SOURCE_CHANNEL,
            target_job_id=target_job_id,
            note="BOSS 收件箱批量导入",
        )
        db.session.add(batch)
        db.session.flush()

        existing = self._existing_geek_ids(owner_hr_id)
        results: List[Dict[str, Any]] = []
        imported = skipped = failed = 0
        stopped_reason = None

        for idx, item in enumerate(items[:limit]):
            geek_id = _safe_str(item.get("geek_id"), 64)
            name_hint = _safe_str(item.get("name"), 100)
            if not geek_id:
                failed += 1
                results.append({"geek_id": "", "name": name_hint, "status": "error",
                                "reason": "缺少 geek_id"})
                continue
            if geek_id in existing:
                skipped += 1
                results.append({"geek_id": geek_id, "name": name_hint, "status": "skipped",
                                "reason": "已导入，跳过"})
                continue

            # 节流：非首条之间等待
            if idx > 0 and interval_sec > 0:
                time.sleep(interval_sec)

            dl = self.boss.recruiter_resume_download(
                encrypt_geek_id=geek_id,
                job=_safe_str(item.get("job") or boss_job, 64) or None,
                security_id=_safe_str(item.get("security_id"), 80) or None,
                cookies_override=cookies_override,
            )
            if not dl.get("ok"):
                err = dl.get("error") or {}
                code = err.get("code", "unknown_error")
                results.append({"geek_id": geek_id, "name": name_hint, "status": "error",
                                "reason": err.get("message", "下载失败"), "code": code})
                failed += 1
                if code == "rate_limited":
                    stopped_reason = "rate_limited"
                    break  # 命中风控，立即停止
                continue

            md_text = dl.get("data") or ""
            if not isinstance(md_text, str):
                md_text = str(md_text)
            basics = _extract_basic_fields(md_text)
            display_name = name_hint or basics.get("name") or f"BOSS候选人{geek_id[:8]}"
            fpath = self._save_markdown(owner_hr_id, geek_id, md_text)

            candidate = Candidate(
                owner_hr_id=owner_hr_id,
                upload_batch_id=batch.id,
                name_masked=display_name[:100],
                email_masked=basics.get("email"),
                phone_masked=basics.get("phone"),
                resume_json={
                    "source": "boss",
                    "raw_markdown": md_text,
                    "boss": {
                        "geek_id": geek_id,
                        "security_id": _safe_str(item.get("security_id"), 80) or None,
                        "friend_id": item.get("friend_id"),
                        "job": _safe_str(item.get("job") or boss_job, 64) or None,
                    },
                },
                raw_file_path=fpath,
                parse_status="ok",
            )
            db.session.add(candidate)
            db.session.flush()
            existing.add(geek_id)

            imported += 1
            results.append({"geek_id": geek_id, "name": display_name, "status": "ok",
                            "candidate_id": candidate.id,
                            "target_job_id": target_job_id})

        db.session.commit()
        return {
            "ok": True,
            "data": {
                "batch_id": batch.id,
                "imported": imported,
                "skipped": skipped,
                "failed": failed,
                "stopped_reason": stopped_reason,
                "results": results,
            },
            "error": None,
        }

    # ── 2) AI 简历初筛 ────────────────────────────────────
    def ai_screen(
        self,
        owner_hr_id: int,
        candidate_ids: List[int],
        job_id: int,
    ) -> Dict[str, Any]:
        """P0 不开放 BOSS AI 初筛写入。

        该旧入口只接受 ``job_id``，无法保证 Interview 归属具体 Demand；
        而且 AI 不能改写主流程。因此服务层也 fail closed，避免绕过
        隐藏的前端入口或 API 路由直接调用。
        """
        return {
            "ok": False,
            "data": None,
            "error": {
                "code": "feature_not_available",
                "message": "BOSS AI 初筛在 P0 未开放，请使用招聘需求下的匹配分析。",
            },
        }
