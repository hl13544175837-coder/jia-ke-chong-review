# -*- coding: utf-8 -*-
"""
智聘·招聘管理系统 —— LangGraph 驱动的 ReAct 招聘智能体。

设计要点：
- 用 LangGraph 的 StateGraph 手搓 ReAct 循环（agent 决策 → tools 执行 → 回到 agent）。
- LLM 调用复用 base_agent/llm_client.py 的 LLMClient（DeepSeek，OpenAI 兼容接口），
  不自己写 HTTP，也不引入 langchain-openai。
- 决策步用 chat_messages 的 json_object 模式（让模型输出结构化动作）；
  最终答案步用 chat_stream 流式产出 token，前端可见“思考→调用工具→看到数据→流式回答”。
- 所有工具内部直接查 SQLAlchemy model 或复用现有 service，需在 Flask app context 内运行。
"""
from __future__ import annotations

import sys
import json
import logging
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, TypedDict

# --- 复用 base_agent 的 LLMClient（DeepSeek）-----------------------------------
BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))
from llm_client import LLMClient, route_model  # noqa: E402

# --- LangGraph 编排 -----------------------------------------------------------
from langgraph.graph import StateGraph, START, END  # noqa: E402

# --- 现有模块（model / service）-----------------------------------------------
from .. import db  # noqa: E402
from ..models import (  # noqa: E402
    Candidate,
    CandidateTag,
    Event,
    Job,
    Interview,
    PipelineStage,
    RecruitmentDemand,
    User,
)
from .match_service import MatchService  # noqa: E402
from ..api.access import (  # noqa: E402
    actor_org_id,
    can_access_candidate,
    can_manage_job,
    can_read_job,
    job_is_active,
    visible_candidate_query,
    visible_job_query,
)
from .demand_context_service import (  # noqa: E402
    DemandContextError,
    can_read_demand,
    resolve_demand_context,
    visible_demand_query,
)
from .pipeline_service import normalize_pipeline_stage, pipeline_counts  # noqa: E402

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 5  # ReAct 步数上限，防止无限循环


def _scoped_candidate_query(user_id=None, role=None):
    if user_id and role:
        return visible_candidate_query(user_id, role)
    return Candidate.query


def _agent_current_stage_counts(demand_id=None, user_id=None, role=None):
    """统计当前 Demand 流程的最新阶段。

    不再按 job_id 聚合：同一职位模板可以对应多个独立 Demand，
    而候选人转需后的历史流程也不应重复计入「当前概览」。
    """
    org_id = actor_org_id(user_id)
    if demand_id is not None:
        try:
            demand = resolve_demand_context(org_id=org_id, demand_id=demand_id)
        except DemandContextError:
            return {}
        if not can_read_demand(user_id, role, org_id, demand):
            return {}
        return pipeline_counts(demand)

    latest = (
        db.session.query(
            PipelineStage.candidate_id.label("candidate_id"),
            PipelineStage.demand_id.label("demand_id"),
            db.func.max(PipelineStage.id).label("max_id"),
        )
        .filter(
            PipelineStage.org_id == org_id,
            PipelineStage.demand_id.isnot(None),
        )
        .group_by(PipelineStage.candidate_id, PipelineStage.demand_id)
        .subquery()
    )
    rows = (
        db.session.query(PipelineStage.stage, db.func.count(PipelineStage.id))
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .filter(
            Candidate.org_id == org_id,
            Candidate.deleted_at.is_(None),
            Candidate.current_demand_id == PipelineStage.demand_id,
            PipelineStage.demand_id.in_(
                visible_demand_query(user_id, role, org_id).with_entities(
                    RecruitmentDemand.id
                )
            ),
        )
    )
    rows = rows.filter(Candidate.id.in_(
        _scoped_candidate_query(user_id, role).with_entities(Candidate.id)
    ))
    counts = {}
    for stage, count in rows.group_by(PipelineStage.stage).all():
        normalized = normalize_pipeline_stage(stage)
        counts[normalized] = counts.get(normalized, 0) + count
    return counts


# =============================================================================
# 1) 工具实现（每个工具内部查现有 model / service，返回可 JSON 序列化的 dict/list）
# =============================================================================
def _tool_list_candidates(limit: int = 20, **_) -> Dict[str, Any]:
    """候选人列表摘要。"""
    try:
        limit = int(limit) if limit else 20
    except (TypeError, ValueError):
        limit = 20
    user_id = _.get("_user_id")
    role = _.get("_role")
    rows = _scoped_candidate_query(user_id, role).order_by(Candidate.id).limit(limit).all()
    items = [{
        "id": c.id,
        "name_masked": c.name_masked,
        "tag_count": len(c.tags),
    } for c in rows]
    return {"count": len(items), "candidates": items}


def _tool_get_candidate(candidate_id: int, **_) -> Dict[str, Any]:
    """单个候选人详情，含技能标签。"""
    user_id = _.get("_user_id")
    role = _.get("_role")
    if user_id and role and not can_access_candidate(user_id, role, int(candidate_id)):
        return {"error": "Forbidden"}
    c = db.session.get(Candidate, int(candidate_id))
    if not c:
        return {"error": f"候选人 {candidate_id} 不存在"}
    tags = [{"tag": t.tag, "score": t.score} for t in c.tags]
    return {
        "id": c.id,
        "name_masked": c.name_masked,
        "email_masked": c.email_masked,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "tags": tags,
    }


def _tool_list_jobs(limit: int = 20, **_) -> Dict[str, Any]:
    """岗位列表。"""
    try:
        limit = int(limit) if limit else 20
    except (TypeError, ValueError):
        limit = 20
    user_id = _.get("_user_id")
    role = _.get("_role")
    rows = visible_job_query(user_id, role).order_by(Job.id).limit(limit).all()
    items = [{"id": j.id, "title": j.title, "status": j.status} for j in rows]
    return {"count": len(items), "jobs": items}


def _tool_match_candidates_for_job(job_id: int, **_) -> Dict[str, Any]:
    """给某岗位匹配候选人排名（计算匹配分，不持久化）。"""
    job = db.session.get(Job, int(job_id))
    if not job:
        return {"error": f"岗位 {job_id} 不存在"}
    if not can_read_job(_.get("_user_id"), _.get("_role"), job):
        return {"error": "Forbidden"}
    # 使用纯计算模式（不写入 DB），rank_for_job(..., persist=False)
    from .match_service import MatchService as MS
    ranked = MS().rank_for_job_readonly(
        int(job_id),
        top_n=10,
        candidate_query=_scoped_candidate_query(_.get("_user_id"), _.get("_role")),
    )
    return {"job_id": int(job_id), "job_title": job.title, "ranking": ranked}


def _tool_get_pipeline(demand_id: int = None, job_id: int = None, **_) -> Dict[str, Any]:
    """某一次招聘需求的流程概览；job_id 仅作唯一 Demand 兼容参数。"""
    user_id = _.get("_user_id")
    role = _.get("_role")
    org_id = actor_org_id(user_id)
    try:
        demand = resolve_demand_context(
            org_id=org_id,
            demand_id=demand_id,
            job_id=job_id,
        )
    except DemandContextError as error:
        return error.as_payload()
    if not can_read_demand(user_id, role, org_id, demand):
        return {"error": "Forbidden"}
    return {
        "demand_id": demand.id,
        "job_id": demand.job_id,
        "pipeline": pipeline_counts(demand),
    }


def _tool_get_bi_overview(demand_id: int = None, **_) -> Dict[str, Any]:
    """单个招聘需求的进度、卡点和当前责任协同视图。"""
    from .bi_service import build_demand_operational_metrics

    user_id = _.get("_user_id")
    role = _.get("_role")
    org_id = actor_org_id(user_id)
    try:
        demand = resolve_demand_context(
            org_id=org_id,
            demand_id=demand_id,
        )
    except DemandContextError as error:
        return error.as_payload()
    if not can_read_demand(user_id, role, org_id, demand):
        return {"error": "Forbidden"}
    return build_demand_operational_metrics(demand)


def _tool_count_summary(**_) -> Dict[str, Any]:
    """系统概览数字：候选人/岗位/面试总数 + 各流程阶段人数。"""
    user_id = _.get("_user_id")
    role = _.get("_role")
    org_id = actor_org_id(user_id)
    scoped_candidates = _scoped_candidate_query(user_id, role)
    scoped_interviews = Interview.query.filter(Interview.org_id == org_id)
    if role not in {"manager", "admin"}:
        scoped_interviews = scoped_interviews.filter(
            Interview.demand_id.in_(
                visible_demand_query(user_id, role, org_id).with_entities(
                    RecruitmentDemand.id
                )
            ),
            Interview.candidate_id.in_(
                scoped_candidates.with_entities(Candidate.id)
            ),
        )
    return {
        "candidate_count": scoped_candidates.count(),
        "job_count": visible_job_query(user_id, role).count(),
        "demand_count": visible_demand_query(
            user_id,
            role,
            org_id,
        ).count(),
        "interview_count": scoped_interviews.count(),
        "stage_counts": _agent_current_stage_counts(
            user_id=user_id,
            role=role,
        ),
    }


def _is_search_quota_or_credential_leak(text: str) -> bool:
    """Detect non-search responses that expose credentials or setup prompts."""
    if not text:
        return False
    low = text.lower()
    signals = (
        "quota_exhausted",
        "quota is exhausted",
        "daily_free_quota",
        "recharge",
        "api key:",
        "api_key:",
        "apikey",
        "password:",
        "username:",
        "console:",
        "registration_status",
        "add the api key",
        "mcp config",
    )
    return any(signal in low for signal in signals)


_CRED_PATTERNS = [
    re.compile(r"\b(?:as_sk|sk|pk|api|key|token)[-_][A-Za-z0-9]{12,}\b", re.I),
    re.compile(r"(?im)^\s*(?:api[_ ]?key|username|password|console)\s*[:=].*$"),
]


def _sanitize_search_text(text: str) -> str:
    """Redact credential-looking content before search output reaches AI/UI."""
    if not text:
        return text
    cleaned = text
    for pattern in _CRED_PATTERNS:
        cleaned = pattern.sub("[已脱敏]", cleaned)
    return cleaned


def _sanitize_search_payload(payload: Any) -> Any:
    """Recursively redact credential-looking strings in structured search output."""
    if isinstance(payload, str):
        return _sanitize_search_text(payload)
    if isinstance(payload, list):
        return [_sanitize_search_payload(item) for item in payload]
    if isinstance(payload, dict):
        return {key: _sanitize_search_payload(value) for key, value in payload.items()}
    return payload


def _tool_web_search(query: str = "", max_results: int = 5, **_) -> Dict[str, Any]:
    """联网搜索：调用 anysearch CLI 获取实时网络信息（薪资行情/技能趋势/公司背景等）。

    通过 subprocess 调 anysearch_cli.py，匿名访问无需 Key。CLI 路径可用环境变量
    ANYSEARCH_CLI 覆盖；默认指向用户 .claude/skills/anysearch。网络不通时返回明确提示。
    """
    import os
    import subprocess
    import shlex

    query = (query or "").strip()
    if not query:
        return {"error": "搜索关键词不能为空"}
    try:
        max_results = max(1, min(int(max_results or 5), 10))
    except (TypeError, ValueError):
        max_results = 5

    # CLI 路径：env 覆盖 > 默认用户目录
    cli = os.getenv("ANYSEARCH_CLI")
    if not cli:
        default_cli = Path(os.path.expanduser("~")) / ".claude" / "skills" / "anysearch" / "scripts" / "anysearch_cli.py"
        cli = str(default_cli)
    if not Path(cli).exists():
        return {"error": "联网搜索未配置（anysearch CLI 不存在），请设置 ANYSEARCH_CLI 环境变量"}

    cmd = [sys.executable, cli, "search", query, "--max_results", str(max_results)]
    try:
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=45, env=env,
            encoding="utf-8", errors="ignore",
        )
        out = (proc.stdout or "").strip()
        err = (proc.stderr or "").strip()
        if not out:
            msg = err or "无输出"
            if "Connection" in msg or "Timeout" in msg or "timed out" in msg:
                return {"error": "联网搜索服务暂时不可达（网络问题），请稍后重试"}
            return {"error": f"搜索失败：{_sanitize_search_text(msg)[:200]}"}
        if _is_search_quota_or_credential_leak(out):
            return {"error": "联网搜索服务当前不可用（额度已用尽或需重新配置），请稍后重试或改用系统内数据回答"}
        # CLI 可能返回 JSON 或 Markdown；尝试 JSON，失败则原样返回文本
        try:
            parsed = json.loads(out)
            return {"query": query, "results": _sanitize_search_payload(parsed)}
        except Exception:
            return {"query": query, "results_text": _sanitize_search_text(out)[:4000]}
    except subprocess.TimeoutExpired:
        return {"error": "联网搜索超时（45s），请稍后重试"}
    except Exception as e:
        logger.exception("web_search 失败")
        return {"error": f"联网搜索执行失败：{e}"}


# =============================================================================
# 2) 工具注册表：name / description（给模型看）/ params（参数说明）/ execute
# =============================================================================
_TOOL_DEFS: List[Dict[str, Any]] = [
    {
        "name": "list_candidates",
        "description": "查询候选人列表摘要（id、脱敏姓名、技能标签数）。可选参数 limit 限制条数。",
        "params": {"limit": "int，可选，默认20"},
        "execute": _tool_list_candidates,
    },
    {
        "name": "get_candidate",
        "description": "查询单个候选人详情，含全部技能标签及评分。",
        "params": {"candidate_id": "int，必填，候选人ID"},
        "execute": _tool_get_candidate,
    },
    {
        "name": "list_jobs",
        "description": "查询岗位列表（id、标题title、状态status）。可选参数 limit。",
        "params": {"limit": "int，可选，默认20"},
        "execute": _tool_list_jobs,
    },
    {
        "name": "match_candidates_for_job",
        "description": "为指定岗位匹配并排名候选人，返回 score、命中标签 matched_tags、缺失标签 missing_tags。",
        "params": {"job_id": "int，必填，岗位ID"},
        "execute": _tool_match_candidates_for_job,
    },
    {
        "name": "get_pipeline",
        "description": "查询某一次招聘需求的流程概览，按阶段统计人数；不会混合同职位的其他需求。",
        "params": {
            "demand_id": "int，优先，招聘需求ID",
            "job_id": "int，兼容参数，仅该职位只有一个需求时可用",
        },
        "execute": _tool_get_pipeline,
    },
    {
        "name": "get_bi_overview",
        "description": "查询某一招聘需求的进度、卡点、待补面试反馈、Offer、HC 和当前协同责任；不用于绩效。",
        "params": {"demand_id": "int，必填，招聘需求ID"},
        "execute": _tool_get_bi_overview,
    },
    {
        "name": "count_summary",
        "description": "系统概览数字：候选人总数、岗位总数、面试总数、各流程阶段人数。无参数。",
        "params": {},
        "execute": _tool_count_summary,
    },
    {
        "name": "web_search",
        "description": "联网搜索实时网络信息（如市场薪资行情、技能趋势、公司背景、行业动态等系统内查不到的外部信息）。当用户问题需要系统数据库之外的最新信息时使用。",
        "params": {"query": "str，必填，搜索关键词", "max_results": "int，可选，结果条数1-10，默认5"},
        "execute": _tool_web_search,
    },
]

# 工具名 -> 定义 的快速索引
_TOOL_MAP: Dict[str, Dict[str, Any]] = {t["name"]: t for t in _TOOL_DEFS}

# 对外暴露的工具元信息（仅 name + description + params，供前端展示/system prompt 拼装）
TOOLS: List[Dict[str, Any]] = [
    {"name": t["name"], "description": t["description"], "params": t["params"]}
    for t in _TOOL_DEFS
]


# =============================================================================
# 2b) 匹配工具：AI 只能提议运行匹配，经用户确认后执行
# =============================================================================
def _write_run_match(job_id: int = None, actor_id: int = None,
                     actor_role: str = None, commit: bool = True, **_) -> Dict[str, Any]:
    """为岗位运行候选人匹配并持久化结果。"""
    from ..middleware.events import record_event
    if not job_id:
        return {"error": "缺少 job_id"}
    job = db.session.get(Job, int(job_id))
    if not job:
        return {"error": f"岗位 {job_id} 不存在"}
    if not can_manage_job(actor_id, actor_role, job):
        return {"error": "Forbidden"}
    if not job_is_active(job):
        return {"error": "岗位已关闭，请先恢复在招后再运行匹配"}
    ranked = MatchService().rank_for_job(
        int(job_id),
        top_n=10,
        candidate_query=_scoped_candidate_query(actor_id, actor_role),
        commit=commit,
    )
    record_event("match.run", entity_id=int(job_id), entity_type="job",
                 payload={"count": len(ranked)}, commit=commit)
    return {"job_id": int(job_id), "job_title": job.title, "ranking": ranked}


# 一期唯一允许的可确认写操作是「运行匹配」。
# 候选人流程、淘汰、Offer、负责人和需求状态均不对 AI 暴露工具。
_WRITE_TOOL_DEFS: List[Dict[str, Any]] = [
    {
        "name": "run_match",
        "description": "为指定岗位运行候选人智能匹配，计算排名并持久化匹配结果。",
        "params": {"job_id": "int，必填，岗位ID"},
        "rbac": ("recruiter", "manager", "admin"),
        "execute": _write_run_match,
        "summary": lambda a: f"为岗位 #{a.get('job_id', '?')} 运行候选人匹配",
    },
]

_WRITE_TOOL_MAP: Dict[str, Dict[str, Any]] = {t["name"]: t for t in _WRITE_TOOL_DEFS}

# 写工具元信息（供前端展示 + system prompt）
WRITE_TOOLS: List[Dict[str, Any]] = [
    {"name": t["name"], "description": t["description"], "params": t["params"],
     "rbac": list(t["rbac"]), "write": True}
    for t in _WRITE_TOOL_DEFS
]


def get_agent_architecture_dashboard() -> Dict[str, Any]:
    """Admin-facing read-only description of the AI assistant prompt and powers."""
    return {
        "title": "AI 提示词与后端架构看板",
        "purpose": "给管理员查看 AI 助手的系统提示词、可调用工具、写操作边界与后端接入方式。",
        "system_prompt": _build_decision_system_prompt([]),
        "read_tools": TOOLS,
        "write_tools": WRITE_TOOLS,
        "architecture": [
            {
                "name": "前端 AI 助手页",
                "description": "展示对话、思考过程、工具调用结果；遇到写操作时展示确认卡片。",
                "files": ["frontend/src/pages/AgentPage.tsx", "frontend/src/lib/agent.ts"],
            },
            {
                "name": "后端智能体入口",
                "description": "提供工具列表、流式对话、用户确认后的写操作执行接口。",
                "files": ["backend/app/api/agent.py"],
            },
            {
                "name": "智能体编排与工具",
                "description": "用 ReAct 流程决定调用查询工具、提议运行匹配，工具内部通过 SQLAlchemy 访问招聘数据库。",
                "files": ["backend/app/services/agent_service.py"],
            },
            {
                "name": "数据库层",
                "description": "AI 助手不直接写 SQL，而是通过固定工具读取 Candidate、Job、Interview、PipelineStage 等模型。",
                "files": ["backend/app/models.py"],
            },
        ],
        "permission_model": {
            "database_access": True,
            "read_tools_available_to_authenticated_users": False,
            "read_scope_note": (
                "AI 助手后端入口仅允许招聘专员、经理和管理员访问；"
                "面试官即使直接请求 /api/agent/* 也会返回 403。"
                "查询工具继续按当前登录用户角色与候选人归属过滤；"
                "团队 BI 工具只允许经理和管理员使用，招聘专员不能通过 AI 助手绕过 BI 页面权限。"
            ),
            "write_requires_confirmation": True,
            "write_scope_note": (
                "AI 仅可提议运行匹配；用户点击确认后，"
                "/api/agent/execute 再按匹配工具 RBAC 执行。"
            ),
            "cannot_do": [
                "不能代替 HR 推进或淘汰候选人",
                "不能自动发放 Offer、转派负责人或关闭招聘需求",
                "不能创建招聘需求或安排面试任务",
                "不能修改代码或前端页面",
                "不能修改数据库表结构",
                "不能管理用户账号",
                "不能删除候选人、岗位或面试记录",
                "不能执行未注册的任意后端函数",
            ],
        },
        "safeguards": [
            "AI 助手入口需要登录 token，并限制为招聘专员、经理、管理员",
            "运行匹配先生成确认卡片，用户确认后才执行",
            "匹配工具有角色白名单",
            "ReAct 最多迭代 5 步，避免无限循环调用工具",
            "所有工具固定注册，AI 不能临时创造新工具",
        ],
        "recommended_next_steps": [
            "把管理员看板标注为只读审计页",
            "给 AI 助手查询行为增加审计日志",
            "如未来开放给面试官，单独做只看已分配候选人的面试官专用 AI 助手",
        ],
    }


def execute_write_tool(
    name: str,
    args: Dict[str, Any],
    user_id: int,
    role: str,
    commit: bool = True,
) -> Dict[str, Any]:
    """在请求上下文内执行写工具（供 /api/agent/execute 调用）。做 RBAC 校验。"""
    tool = _WRITE_TOOL_MAP.get(name)
    clean_args = dict(args or {})
    if not tool:
        result = {"ok": False, "error": "未知写工具"}
        _record_agent_write_event(user_id, "unknown", clean_args, result, commit=commit)
        return result
    if role not in tool["rbac"]:
        result = {"ok": False, "error": f"当前角色「{role}」无权执行此操作"}
        _record_agent_write_event(user_id, name, clean_args, result, commit=commit)
        return result
    try:
        clean_args["actor_id"] = user_id
        clean_args["actor_role"] = role
        clean_args["commit"] = commit
        result = tool["execute"](**clean_args)
        if isinstance(result, dict) and result.get("error"):
            db.session.rollback()
            wrapped = {"ok": False, "error": result["error"]}
            _record_agent_write_event(user_id, name, args or {}, wrapped, commit=commit)
            return wrapped
        wrapped = {"ok": True, "result": result}
        _record_agent_write_event(user_id, name, args or {}, wrapped, commit=commit)
        return wrapped
    except Exception as e:
        logger.error("写工具 %s 执行失败", name)
        db.session.rollback()
        if not commit:
            raise
        wrapped = {"ok": False, "error": "执行失败，请稍后重试"}
        _record_agent_write_event(user_id, name, args or {}, wrapped, commit=True)
        return wrapped


def _record_agent_write_event(
    user_id: int,
    tool_name: str,
    args: Dict[str, Any],
    result: Dict[str, Any],
    commit: bool = True,
) -> None:
    from ..middleware.events import record_event

    target_ids = {
        key: args.get(key)
        for key in (
            "candidate_id", "demand_id", "job_id", "interview_id", "feedback_id",
            "user_id", "owner_id", "org_id",
        )
        if isinstance(args, dict) and args.get(key) is not None
    }
    error = result.get("error")
    ok = bool(result.get("ok"))
    record_event(
        action="agent.write",
        entity_type="agent_tool",
        entity_id=(
            target_ids.get("candidate_id")
            or target_ids.get("demand_id")
            or target_ids.get("job_id")
        ),
        demand_id=target_ids.get("demand_id"),
        payload={
            "tool": tool_name,
            "target_ids": target_ids,
            "ok": ok,
            "error": str(error)[:240] if error else None,
        },
        result="success" if ok else "failure",
        failure_reason=str(error)[:240] if error else None,
        source="ai",
        severity="info" if ok else "warning",
        commit=commit,
    )


# =============================================================================
# 3) LangGraph State 定义
# =============================================================================
class AgentState(TypedDict, total=False):
    messages: List[Dict[str, str]]      # 用户对话历史（role/content）
    tool_results: List[Dict[str, Any]]  # 已执行工具的结果累积
    iterations: int                     # 已迭代步数
    user_id: int
    role: str
    final: str                          # 决策为 final 时模型给的回答（非流式兜底）
    # 内部传递：当前 agent 节点的决策结果
    _decision: Dict[str, Any]
    # 事件回调：把过程事件推给 run_stream 的消费者
    _events: List[Dict[str, Any]]


# =============================================================================
# 4) ReAct 决策 prompt 构造
# =============================================================================
def _build_tools_desc() -> str:
    """把工具列表拼成给模型看的描述文本。"""
    lines = []
    for t in _TOOL_DEFS:
        params = json.dumps(t["params"], ensure_ascii=False) if t["params"] else "无参数"
        lines.append(f"- {t['name']}: {t['description']} 参数: {params}")
    return "\n".join(lines)


def _build_write_tools_desc() -> str:
    """把写操作工具拼成给模型看的描述文本。"""
    lines = []
    for t in _WRITE_TOOL_DEFS:
        params = json.dumps(t["params"], ensure_ascii=False) if t["params"] else "无参数"
        lines.append(f"- {t['name']}: {t['description']} 参数: {params}")
    return "\n".join(lines)


def _build_decision_system_prompt(tool_results: List[Dict[str, Any]]) -> str:
    """构造 ReAct 决策步的 system prompt（要求 JSON 输出）。"""
    tools_desc = _build_tools_desc()
    write_desc = _build_write_tools_desc()
    if tool_results:
        results_text = json.dumps(tool_results, ensure_ascii=False)
    else:
        results_text = "（暂无，尚未调用任何工具）"
    return (
        "你是「智聘·招聘管理系统」的 AI 助手。"
        "你的价值是减少阅读、整理和比较成本，不是替人做招聘决策。\n\n"
        "业务边界：\n"
        "- Job 只是可复用的职位 / JD 模板；Demand 才是部门、城市、HC、负责人、流程、面试、Offer、审计和 BI 的业务归属。\n"
        "- 除职位标准匹配外，先解析 demand_id，再由 Demand 得到 job_id；不得按 job_id 混合多个 Demand，也不得猜测用户指的是哪个 Demand。\n"
        "- 你只负责解析、匹配、总结和建议；匹配结果是辅助信息，不是录用决定。\n"
        "- 你不得创建招聘需求，不得推进或淘汰候选人，不得安排面试任务。\n"
        "- 你不得发放 Offer、转派负责人或更改招聘需求状态。\n"
        "- 业务事实与 AI 推断必须分开陈述；信息不足时明确说不确定。\n"
        "- 只能在当前用户的 RBAC 和组织数据范围内工作，不得猜测或绕过权限。\n\n"
        "你采用 ReAct 模式：每一步都必须用 JSON 格式回复，决定下一步动作。\n\n"
        f"【查询工具】（只读，可直接调用）：\n{tools_desc}\n\n"
        f"【匹配工具】（会保存匹配结果，必须经用户确认）：\n{write_desc}\n\n"
        f"已获得的工具结果：\n{results_text}\n\n"
        "决策规则：\n"
        "1. 若需要查询数据，输出 action=\"tool\"，tool 填查询工具名，args 填参数。\n"
        "2. 仅可提议运行匹配：先用查询工具确认岗位 ID，再输出 "
        "action=\"propose_write\"、tool=\"run_match\"和完整 args。系统展示确认卡片，"
        "用户确认后才真正执行；你不得假装已执行。\n"
        "3. 对于匹配以外的业务写操作，说明必须由有权限的人在业务页面完成，"
        "不得输出 propose_write。\n"
        "4. 若信息足够直接回答（或匹配已提议），输出 action=\"final\"，answer 给简洁中文回答。\n"
        "5. 不要重复调用已得到结果的同名同参工具。\n\n"
        "你必须只输出一个 JSON 对象（不要带 markdown 代码块），格式之一：\n"
        '{"thought": "思考", "action": "tool", "tool": "查询工具名", "args": {...}}\n'
        '{"thought": "思考", "action": "propose_write", "tool": "写工具名", "args": {...}}\n'
        '{"thought": "思考", "action": "final", "answer": "中文回答"}\n'
    )


def _safe_parse_json(text: str) -> Dict[str, Any]:
    """容错解析模型输出的 JSON（去除可能的 ```json 包裹）。"""
    s = (text or "").strip()
    if s.startswith("```"):
        # 去掉 ```json ... ``` 包裹
        s = s.strip("`")
        if s.lower().startswith("json"):
            s = s[4:]
        s = s.strip()
    try:
        return json.loads(s)
    except Exception:
        # 尝试截取第一个 { 到最后一个 }
        start, end = s.find("{"), s.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(s[start:end + 1])
            except Exception:
                pass
    return {"action": "final", "answer": s or "抱歉，我暂时无法处理这个请求。"}


# =============================================================================
# 5) RecruitingAgent：构建 LLMClient + 编译 LangGraph
# =============================================================================
class RecruitingAgent:
    def __init__(self) -> None:
        self.client = LLMClient()
        # 决策步用 think（开思考，结构化推理更稳）；最终回答用 pro（高质量流式输出）
        self.decision_route = route_model("think")
        self.answer_route = route_model("pro")
        self.graph = self._build_graph()

    # ----- LangGraph 节点：agent 决策 -----------------------------------------
    def _agent_node(self, state: AgentState) -> AgentState:
        """决策节点：喂对话历史+工具描述+已有工具结果，用 json 模式让模型选动作。"""
        system_prompt = _build_decision_system_prompt(state.get("tool_results", []))
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(state.get("messages", []))

        try:
            raw = self.client.chat_messages(
                messages,
                response_format={"type": "json_object"},
                model=self.decision_route["model"],
                thinking=self.decision_route["thinking"],
            )
            decision = _safe_parse_json(raw)
        except Exception as e:
            logger.exception("决策节点 LLM 调用失败")
            decision = {"action": "final", "answer": f"决策失败：{e}"}

        events = state.setdefault("_events", [])
        thought = decision.get("thought")
        if thought:
            events.append({"type": "thought", "text": thought})

        # 写操作：AI 只「提议」，发确认事件并结束循环，由前端确认后调 /agent/execute 执行
        if decision.get("action") == "propose_write":
            wt_name = decision.get("tool")
            wt_args = decision.get("args") or {}
            wt_def = _WRITE_TOOL_MAP.get(wt_name)
            if wt_def:
                try:
                    summary = wt_def["summary"](wt_args)
                except Exception:
                    summary = f"执行 {wt_name}"
                events.append({
                    "type": "confirm_required",
                    "tool": wt_name,
                    "args": wt_args,
                    "summary": summary,
                })
            else:
                # 未知写工具，降级为普通回答
                decision = {"action": "final",
                            "answer": f"抱歉，我不能执行未知操作「{wt_name}」。"}

        state["_decision"] = decision
        state["iterations"] = state.get("iterations", 0) + 1
        return state

    # ----- LangGraph 节点：tools 执行 -----------------------------------------
    def _tools_node(self, state: AgentState) -> AgentState:
        """执行节点：根据决策里的 tool+args 调用工具函数，结果存入 state。"""
        decision = state.get("_decision", {})
        tool_name = decision.get("tool")
        args = decision.get("args") or {}
        events = state.setdefault("_events", [])

        events.append({"type": "tool_call", "tool": tool_name, "args": args})

        tool_def = _TOOL_MAP.get(tool_name)
        if not tool_def:
            result: Any = {"error": f"未知工具：{tool_name}"}
        else:
            try:
                if isinstance(args, dict):
                    clean_args = dict(args)
                    clean_args["_user_id"] = state.get("user_id")
                    clean_args["_role"] = state.get("role")
                    result = tool_def["execute"](**clean_args)
                else:
                    result = tool_def["execute"]()
            except Exception as e:
                logger.exception("工具 %s 执行失败", tool_name)
                result = {"error": f"工具执行失败：{e}"}

        events.append({"type": "tool_result", "tool": tool_name, "result": result})
        state.setdefault("tool_results", []).append({
            "tool": tool_name, "args": args, "result": result,
        })
        return state

    # ----- 条件边：决定 agent 之后去哪 ----------------------------------------
    def _route_after_agent(self, state: AgentState) -> str:
        """action=tool 且未超步数 → tools；否则 → END。"""
        decision = state.get("_decision", {})
        if state.get("iterations", 0) >= MAX_ITERATIONS:
            return "end"
        if decision.get("action") == "tool" and decision.get("tool"):
            return "tools"
        return "end"

    # ----- 编译图 -------------------------------------------------------------
    def _build_graph(self):
        sg = StateGraph(AgentState)
        sg.add_node("agent", self._agent_node)
        sg.add_node("tools", self._tools_node)
        sg.add_edge(START, "agent")
        sg.add_conditional_edges(
            "agent",
            self._route_after_agent,
            {"tools": "tools", "end": END},
        )
        sg.add_edge("tools", "agent")  # 工具执行完回到决策节点继续 ReAct
        return sg.compile()

    # ----- 最终答案：用 chat_stream 流式产出 token ----------------------------
    def _stream_final_answer(self, messages: List[Dict[str, str]],
                             tool_results: List[Dict[str, Any]]):
        """生成器：基于工具结果，用 chat_stream 流式生成最终中文答案。

        逐 token yield {"type":"token","text":...}，
        结束时通过 StopIteration.value 返回完整答案文本。
        """
        if tool_results:
            data_text = json.dumps(tool_results, ensure_ascii=False)
        else:
            data_text = "（无工具数据，直接根据常识回答）"
        sys_prompt = (
            "你是「智聘·招聘管理系统」的 AI 助手。下面是为回答用户问题而查询到的系统数据，"
            "请基于这些真实数据，用简洁、专业、友好的中文回答用户。不要编造数据中没有的信息。\n\n"
            f"查询到的数据：\n{data_text}"
        )
        answer_messages = [{"role": "system", "content": sys_prompt}]
        answer_messages.extend(messages)

        full: List[str] = []
        try:
            # pro 路由（开思考），高质量流式输出
            for ev in self.client.chat_stream(
                answer_messages,
                model=self.answer_route["model"],
                thinking=self.answer_route["thinking"],
            ):
                if ev.get("type") == "content":
                    piece = ev.get("text", "")
                    full.append(piece)
                    yield {"type": "token", "text": piece}
                # reasoning 事件不作为答案展示，此处略过
        except Exception as e:
            logger.exception("最终答案流式生成失败")
            msg = f"（生成回答时出错：{e}）"
            full.append(msg)
            yield {"type": "token", "text": msg}
        return "".join(full)

    # ----- 对外接口：流式运行 -------------------------------------------------
    def run_stream(
        self,
        user_message: str,
        history: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[int] = None,
        role: Optional[str] = None,
    ):
        """
        生成器，yield SSE 事件 dict：
          {"type":"thought","text":...}                  # agent 思考
          {"type":"tool_call","tool":...,"args":...}      # 决定调用工具
          {"type":"tool_result","tool":...,"result":...}  # 工具返回
          {"type":"token","text":...}                     # 最终答案流式 token
          {"type":"done","answer":...}                    # 结束
        """
        messages: List[Dict[str, str]] = list(history or [])
        messages.append({"role": "user", "content": user_message})

        init_state: AgentState = {
            "messages": messages,
            "tool_results": [],
            "iterations": 0,
            "user_id": user_id,
            "role": role,
            "_events": [],
        }

        # 跑 LangGraph：StateGraph 编排 agent<->tools 循环直到 END。
        # stream_mode="values" 逐节点拿到完整状态快照，从而把过程事件实时吐给前端。
        emitted = 0
        final_state: AgentState = init_state
        try:
            for chunk in self.graph.stream(init_state, stream_mode="values"):
                final_state = chunk
                events = chunk.get("_events", [])
                # 把本轮新产生的事件依次 yield 出去（已发送的不重复）
                while emitted < len(events):
                    yield events[emitted]
                    emitted += 1
        except Exception as e:
            logger.exception("LangGraph 执行失败")
            yield {"type": "done", "answer": f"执行出错：{e}"}
            return

        # 最终答案：用 chat_stream 流式产出 token（_stream_final_answer 是子生成器）
        tool_results = final_state.get("tool_results", [])
        answer_text = yield from self._stream_final_answer(messages, tool_results)

        yield {"type": "done", "answer": answer_text}
